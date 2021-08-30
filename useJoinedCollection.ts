import { useEffect, useState } from 'react'
import { DocRef, Snapshot } from 'src/shared/api/firebase'
import FirebaseFirestoreTypes from 'src/shared/api/firebase/FirebaseFirestoreTypes'
import { logDebug, logWarning } from '../utils/log'

export type ExistSnapshot<T> = Omit<Snapshot<T>, 'data'> & {
  exists: true
  data: (options?: FirebaseFirestoreTypes.SnapshotOptions | undefined) => T
}

function exists<T>(snapshot: Snapshot<T>): snapshot is ExistSnapshot<T> {
  return snapshot.exists
}

type MergeTuple<T extends Object[]> = T extends []
  ? {}
  : T extends [infer U, ...(infer V)]
  ? V extends Object[] | []
    ? U & MergeTuple<V>
    : never
  : T extends (infer U)[]
  ? U extends Object
    ? U
    : never
  : never

type TempDocumentSnapshots<T extends FirebaseFirestoreTypes.DocumentData[]> = {
  [P in keyof T]: Snapshot<T[P]>
}

type DocumentSnapshots<T extends FirebaseFirestoreTypes.DocumentData[]> = {
  [P in keyof T]: ExistSnapshot<T[P]>
}

type Selectors<
  Base extends FirebaseFirestoreTypes.DocumentData,
  T extends FirebaseFirestoreTypes.DocumentData[]
> = {
  [P in keyof T]: (
    doc: FirebaseFirestoreTypes.QueryDocumentSnapshot<Base>
  ) => DocRef<T[P]>
}

type JoinedSingleSnapshot<
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends FirebaseFirestoreTypes.DocumentData
> = {
  baseSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot<Base>
  joinedSnapshot: ExistSnapshot<Joined>
  data: Base & Joined
}

export type JoinedMultiSnapshot<
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends FirebaseFirestoreTypes.DocumentData[]
> = {
  baseSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot<Base>
  joinedSnapshots: DocumentSnapshots<Joined>
  data: MergeTuple<[Base, ...Joined]>
}

export type JoinedSnapshot<
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends
    | FirebaseFirestoreTypes.DocumentData
    | FirebaseFirestoreTypes.DocumentData[]
> = Joined extends FirebaseFirestoreTypes.DocumentData[]
  ? JoinedMultiSnapshot<Base, Joined>
  : JoinedSingleSnapshot<Base, Joined>

const onJoinedSingleSnapshot = <
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends FirebaseFirestoreTypes.DocumentData
>(
  baseQuery: FirebaseFirestoreTypes.Query<Base>,
  selector: (
    doc: FirebaseFirestoreTypes.QueryDocumentSnapshot<Base>
  ) => DocRef<Joined>,
  onNext: (snapshot: JoinedSingleSnapshot<Base, Joined>[]) => void,
  onError: (error: FirebaseFirestoreTypes.FirestoreError) => void,
  merge?: (
    snapshots: Omit<JoinedSingleSnapshot<Base, Joined>, 'data'>
  ) => JoinedSingleSnapshot<Base, Joined>['data']
) => {
  //console.log('single join', baseQuery)
  let docsData: {
    path: string
    unsub?: () => void
    result?: Omit<JoinedSingleSnapshot<Base, Joined>, 'joinedSnapshot'> & {
      joinedSnapshot: Snapshot<Joined>
    }
    exists?: boolean
  }[] = []
  let docsSize: number | undefined
  const unsub = baseQuery.onSnapshot(
    async (snapshot) => {
      //console.log('snap', snapshot)
      docsSize = snapshot.size
      if (snapshot.empty) {
        onNext([])
      }
      snapshot.docChanges().map((change) => {
        switch (change.type) {
          case 'added':
          case 'modified': {
            const docRef = selector(change.doc)
            let docData = docsData.find(
              (docData) => docData.path === change.doc.ref.path
            )
            if (docData == null) {
              docsData.push({ path: change.doc.ref.path })
              docData = docsData[docsData.length - 1]
            }
            //console.log('add/mod docdata', docData, docRef)
            docData.unsub?.()
            docData.unsub = docRef.onSnapshot(
              (snapshot) => {
                if (!docData) {
                  throw new Error('Failed to unsubscribe snapshot listener')
                }
                if (!snapshot.exists) {
                  docData.exists = false
                }
                docData.result = {
                  baseSnapshot: change.doc,
                  joinedSnapshot: snapshot as ExistSnapshot<Joined>,
                  data: merge
                    ? merge({
                        baseSnapshot: change.doc,
                        joinedSnapshot: snapshot as ExistSnapshot<Joined>,
                      })
                    : {
                        ...snapshot.data()!,
                        ...change.doc.data(),
                      },
                }

                //console.log('fetch join', snapshot, docData)

                if (
                  docsData.length === docsSize &&
                  docsData.every((docData) => docData.result)
                ) {
                  //console.log('fire onnext')
                  onNext(
                    docsData
                      .filter(
                        (docData) =>
                          docData.exists == null || docData.exists === true
                      )
                      .map(
                        (docData) =>
                          docData.result as JoinedSingleSnapshot<Base, Joined>
                      )
                  )
                }
              },
              (error) => {
                //console.log('joined error', docData, docRef)
                onError && onError(error)
              }
            )
            break
          }

          case 'removed': {
            const docDataIndex = docsData.findIndex(
              (docData) => docData.path === change.doc.ref.path
            )
            if (docDataIndex != null) {
              docsData[docDataIndex].unsub?.()
              docsData.splice(docDataIndex, 1)
              onNext(
                docsData
                  .filter(
                    (docData) =>
                      docData.exists == null || docData.exists === true
                  )
                  .map(
                    (docData) =>
                      docData.result as JoinedSingleSnapshot<Base, Joined>
                  )
              )
            }

            break
          }
        }
      })
    },
    (error) => {
      //console.log('base error', baseQuery)
      onError && onError(error)
    }
  )
  return () => {
    docsData.forEach((docData) => docData.unsub?.())
    unsub()
  }
}

const onJoinedMultiSnapshot = <
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends [
    FirebaseFirestoreTypes.DocumentData,
    ...FirebaseFirestoreTypes.DocumentData[]
  ]
>(
  baseQuery: FirebaseFirestoreTypes.Query<Base>,
  selectors: Selectors<Base, Joined>,
  onNext: (snapshot: JoinedMultiSnapshot<Base, Joined>[]) => void,
  onError: (error: FirebaseFirestoreTypes.FirestoreError) => void,
  merge?: (
    snapshots: Omit<JoinedMultiSnapshot<Base, Joined>, 'data'>
  ) => JoinedMultiSnapshot<Base, Joined>['data']
) => {
  //console.log('multi join', baseQuery)
  let docsData: {
    path: string
    recursiveUnsubscriber: (() => void)[]
    tempSnapshots: Partial<TempDocumentSnapshots<Joined>>
    result?: Omit<JoinedMultiSnapshot<Base, Joined>, 'joinedSnapshots'> & {
      joinedSnapshots: TempDocumentSnapshots<Joined>
    }
    exists?: boolean
  }[] = []
  let docsSize: number | undefined
  let joinSize = selectors.length
  const unsub = baseQuery.onSnapshot(
    async (snapshot) => {
      docsSize = snapshot.size
      if (snapshot.empty) {
        onNext([])
      }
      snapshot.docChanges().map((change) => {
        switch (change.type) {
          case 'added':
          case 'modified': {
            const docRefs = selectors.map((selector) => selector(change.doc))

            let docData = docsData.find(
              (docData) => docData.path === change.doc.ref.path
            )
            if (docData == null) {
              docsData.push({
                path: change.doc.ref.path,
                tempSnapshots: new Array(joinSize).fill(undefined) as Partial<
                  TempDocumentSnapshots<Joined>
                >,
                recursiveUnsubscriber: [],
              })
              docData = docsData[docsData.length - 1]
            }
            //console.log('mul: add/mod docdata', docData)
            docData.recursiveUnsubscriber.forEach((unsub) => unsub())
            docData.recursiveUnsubscriber = docRefs.map((docRef, docRefIndex) =>
              docRef.onSnapshot(
                (snapshot) => {
                  if (!docData) {
                    throw new Error('Failed to unsubscribe snapshot listener')
                  }
                  if (!snapshot.exists) {
                    docData.exists = false
                  }
                  docData.tempSnapshots[docRefIndex] = snapshot
                  /*console.log(
                      'mul: fetch join',
                      docRefIndex,
                      snapshot,
                      docData
                    )*/
                  if (
                    docData.tempSnapshots.every((snapshot) => snapshot != null)
                  ) {
                    const resultSnapshots = docData.tempSnapshots as TempDocumentSnapshots<
                      Joined
                    >
                    docData.result = {
                      baseSnapshot: change.doc,
                      joinedSnapshots: resultSnapshots,
                      data:
                        merge && docData.exists // 存在しないデータは返らないので、マージ関数に渡したくない。あまりキレイなコードではないのであとでリファクタリングする
                          ? merge({
                              baseSnapshot: change.doc,
                              joinedSnapshots: resultSnapshots as DocumentSnapshots<
                                Joined
                              >,
                            })
                          : ({
                              ...resultSnapshots
                                .map((snapshot) => snapshot.data())
                                .reverse()
                                .reduce(
                                  (merged, snapshot) => ({
                                    ...merged,
                                    ...snapshot,
                                  }),
                                  {}
                                ),
                              ...change.doc.data(),
                            } as JoinedMultiSnapshot<Base, Joined>['data']),
                    }
                    //console.log('mul: complete result', docRefIndex, docData)

                    if (
                      docsData.length === docsSize &&
                      docsData.every((docData) => docData.result)
                    ) {
                      //console.log('mul: fire onnext')
                      onNext(
                        docsData
                          .filter(
                            (docData) =>
                              docData.exists == null || docData.exists === true
                          )
                          .map(
                            (docData) =>
                              docData.result as JoinedMultiSnapshot<
                                Base,
                                Joined
                              >
                          )
                      )
                    }
                  }
                },
                (error) => {
                  onError && onError(error)
                }
              )
            )

            break
          }

          case 'removed': {
            let docDataIndex = docsData.findIndex(
              (docData) => docData.path === change.doc.ref.path
            )
            /*console.log(
              'mul: removed',
              docsData.map((doc) => doc.id),
              change.doc.ref.id,
              docDataIndex
            )*/
            if (docDataIndex !== -1) {
              docsData[docDataIndex].recursiveUnsubscriber.forEach((unsub) =>
                unsub()
              )
              docsData.splice(docDataIndex, 1)
              onNext(
                docsData
                  .filter(
                    (docData) =>
                      docData.exists == null || docData.exists === true
                  )
                  .map(
                    (docData) =>
                      docData.result as JoinedMultiSnapshot<Base, Joined>
                  )
              )
            }

            break
          }
        }
      })
    },
    (error) => onError && onError(error)
  )
  return () => {
    docsData.forEach((docData) =>
      docData.recursiveUnsubscriber.forEach((unsub) => unsub())
    )
    unsub()
  }
}

/**
 * コレクションから、各ドキュメントのref属性又はcustomSelectorを通して得られたrefを読んでjoinを行う
 *
 * アイテムが追加もしくは削除されたときに更新される。
 *
 * join先のデータが変更されても更新されない。
 * @param baseQuery
 * @param selector
 * @param onNext
 * @param onError
 * @param merge
 * @returns joinされたドキュメントのリスト
 */
export const onJoinedSnapshot = <
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends
    | FirebaseFirestoreTypes.DocumentData
    | FirebaseFirestoreTypes.DocumentData[]
>(
  baseQuery: FirebaseFirestoreTypes.Query<Base>,
  selector: Joined extends FirebaseFirestoreTypes.DocumentData[]
    ? Selectors<Base, Joined>
    : (
        doc: FirebaseFirestoreTypes.QueryDocumentSnapshot<Base>
      ) => DocRef<Joined>,
  onNext: (snapshot: JoinedSnapshot<Base, Joined>[]) => void,
  onError: (error: FirebaseFirestoreTypes.FirestoreError) => void,
  merge?: (
    snapshots: Omit<JoinedSnapshot<Base, Joined>, 'data'>
  ) => JoinedSnapshot<Base, Joined>['data']
) => {
  if (Array.isArray(selector)) {
    return onJoinedMultiSnapshot(
      baseQuery,
      selector as any,
      onNext as any,
      onError,
      merge as any
    )
  } else {
    return onJoinedSingleSnapshot(
      baseQuery,
      selector as any,
      onNext as any,
      onError,
      merge as any
    )
  }
}

export const useJoinedCollection = <
  Base extends FirebaseFirestoreTypes.DocumentData,
  Joined extends
    | FirebaseFirestoreTypes.DocumentData
    | FirebaseFirestoreTypes.DocumentData[]
>(
  baseQuery: FirebaseFirestoreTypes.Query<Base> | undefined,
  selector: Joined extends FirebaseFirestoreTypes.DocumentData[]
    ? Selectors<Base, Joined>
    : (
        doc: FirebaseFirestoreTypes.QueryDocumentSnapshot<Base>
      ) => DocRef<Joined>,
  merge?: (
    snapshots: Omit<JoinedSnapshot<Base, Joined>, 'data'>
  ) => JoinedSnapshot<Base, Joined>['data']
): [
  JoinedSnapshot<Base, Joined>[] | undefined,
  boolean,
  FirebaseFirestoreTypes.FirestoreError | undefined
] => {
  const [value, setValue] = useState<JoinedSnapshot<Base, Joined>[]>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<FirebaseFirestoreTypes.FirestoreError>()

  useEffect(() => {
    setLoading(true)
    if (baseQuery) {
      const unsub = onJoinedSnapshot(
        baseQuery,
        selector,
        (snapshot) => {
          setLoading(false)
          setValue(snapshot)
        },
        (error) => {
          setError(error)
          logWarning('useJoinedCollectionError:', error, baseQuery)
        },
        merge
      )
      return () => {
        unsub()
        setValue([])
      }
    }
  }, [baseQuery])

  return [value, loading, error]
}

