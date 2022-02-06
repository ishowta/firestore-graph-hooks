import {
  CollectionReference,
  DocumentReference,
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
  FirestoreError,
  Query,
  queryEqual,
  QueryDocumentSnapshot,
  SnapshotOptions,
  SnapshotMetadata,
  onSnapshot,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { PickOptional, SelectiveOptional } from "./helper";
import { Expand } from "../helper";

export type GraphQueryDocumentSnapshot<T extends DocumentData> = {
  data: T;
  exist: true;
  id: string;
  ref: DocumentReference<T>;
  metadata: SnapshotMetadata;
};

export type GraphDocumentSnapshot<T extends DocumentData> =
  | GraphQueryDocumentSnapshot<T>
  | {
      data: undefined;
      exist: false;
      id: string;
      ref: DocumentReference<T>;
      metadata: SnapshotMetadata;
    };

/**
 * FirestoreのID
 */
export type ID = string & {};

/**
 * 得られるCollectionに付属するメタデータ
 */
export type CollectionMetadata<T> = {
  __snapshot__: QuerySnapshot<T>;
};

export type WithMetadata<T extends DocumentData> = GraphDocumentSnapshot<T>;

export type WithCollectionMetadata<T extends DocumentData> =
  CollectionMetadata<T> & WithMetadata<T>[];

type AnyReference = DocumentReference | Query;
type AnySnapshot = DocumentSnapshot | QuerySnapshot;

/**
 * ドキュメントのフィールドからリファレンスのフィールドのみを取り出す
 *
 * 元のドキュメントとの互換性を保つため`${string}Ref`の形のフィールドのみ使えるようにする
 */
type PickRefField<T extends DocumentData> = keyof {
  [K in keyof T as K extends `${string}Ref` ? K : never]: NonNullable<
    T[K]
  > extends AnyReference
    ? K
    : never;
};

/**
 * クエリの型
 *
 * TODO: 否定形や存在型が無いのでextra fieldを`unknown`にしてしまっているが他に方法は無い？
 */
type GraphQuery<T extends DocumentData> =
  // ref fieldを含んだクエリ（extra fieldも入れられる）
  | (({
      [K in PickRefField<T>]?: NonNullable<T[K]> extends
        | DocumentReference<infer U>
        | CollectionReference<infer U>
        ? U extends DocumentData
          ? GraphQuery<U>
          : never
        : never;
    } & {
      [K in Exclude<keyof T, PickRefField<T>>]?: never;
    }) & {
      [K in string]: unknown | [AnyReference, unknown];
    })
  // extra fieldのみのクエリ
  | ({ [K in keyof T]?: never } & {
      [K in string]: unknown | [AnyReference, unknown];
    })
  // ドキュメントを引数にとってクエリを返す関数
  | ((data: WithMetadata<T>) => GraphQuery<T>);

type GraphQueryQueryType<T, Q extends GraphQuery<T>> = Q extends (
  ...args: any
) => any
  ? ReturnType<Q>
  : Q;

type RequiredGraphQuery<Q> = Q extends (...args: any) => any ? Q : Required<Q>;

type JoinedDataInner<
  T extends DocumentData,
  Q extends GraphQuery<T>
> = SelectiveOptional<
  {
    /**
     * ドキュメントのもともとのフィールド
     */
    [K in Exclude<keyof T, keyof GraphQueryQueryType<T, Q>>]: T[K];
  } & {
    /**
     * クエリで指定されたリファレンスフィールド
     */
    [K in keyof T &
      keyof GraphQueryQueryType<T, Q> as K extends `${infer OriginalK}Ref`
      ? OriginalK
      : K]: RefToDoc<NonNullable<T[K]>> extends DocumentData
      ? RequiredGraphQuery<GraphQueryQueryType<T, Q>[K]> extends GraphQuery<
          RefToDoc<NonNullable<T[K]>>
        >
        ?
            | JoinedData<T[K], RequiredGraphQuery<GraphQueryQueryType<T, Q>[K]>>
            | (null extends T[K] ? null : never)
        : never
      : never;
  } & {
    /**
     * クエリで追加されたエクストラフィールド
     */
    [K in Exclude<
      keyof GraphQueryQueryType<T, Q>,
      keyof T
    >]: GraphQueryQueryType<T, Q>[K] extends [infer Ref, infer UQuery]
      ? Ref extends AnyReference
        ? Required<UQuery> extends GraphQuery<RefToDoc<Ref>>
          ? JoinedData<Ref, Required<UQuery>>
          : never
        : never
      : never;
  },
  keyof PickOptional<T> | keyof PickOptional<GraphQueryQueryType<T, Q>>
>;

type RefToDoc<R extends AnyReference> = R extends
  | DocumentReference<infer D>
  | undefined
  ? D
  : R extends Query<infer D> | undefined
  ? D
  : never;

type JoinedData<
  R extends AnyReference,
  Q extends GraphQuery<RefToDoc<R>>
> = R extends DocumentReference<infer U>
  ? Q extends GraphQuery<U>
    ? {} extends Omit<JoinedDataInner<U, Q>, keyof U>
      ? WithMetadata<U>
      : WithMetadata<U> & Expand<Omit<JoinedDataInner<U, Q>, keyof U>>
    : never
  : R extends CollectionReference<infer U>
  ? Q extends GraphQuery<U>
    ? {} extends Omit<JoinedDataInner<U, Q>, keyof U>
      ? WithCollectionMetadata<U>
      : (WithMetadata<U> & Expand<Omit<JoinedDataInner<U, Q>, keyof U>>)[] &
          CollectionMetadata<U>
    : never
  : never;

export function useRootQuery<Ref = {}, Q extends GraphQuery<{}> = {}>(
  _query: Q
): [Expand<JoinedDataInner<{}, Q>> | undefined, boolean, Error | undefined] {
  const [value, setValue] = useState<Expand<JoinedDataInner<{}, Q>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError>();

  useEffect(() => {
    const query: any = _query;
    const result: any = {};
    const allKey: string[] = Object.keys(query);
    const allListener: Record<string, any> = {};
    for (const key of allKey) {
      const subQuery = query[key];
      allListener[key] = subQuery(
        (subResult: any) => {
          result[key] = subResult;
          if (Object.keys(result).length === allKey.length) {
            if (loading) setLoading(false);
            setValue(result);
          }
        },
        (error: FirestoreError) => {
          setError(error);
        }
      );
    }
  }, []);

  return [value, loading, error];
}

const makeGraphQueryDocumentSnapshot = <T>(
  snapshot: QueryDocumentSnapshot<T>
): GraphQueryDocumentSnapshot<T> => {
  return {
    exist: true,
    data: snapshot.data(),
    id: snapshot.id,
    ref: snapshot.ref,
    metadata: snapshot.metadata,
  };
};

const makeGraphDocumentSnapshot = <T>(
  snapshot: DocumentSnapshot<T>
): GraphDocumentSnapshot<T> => {
  if (snapshot.exists()) {
    return {
      exist: true,
      data: snapshot.data(),
      id: snapshot.id,
      ref: snapshot.ref,
      metadata: snapshot.metadata,
    };
  } else {
    return {
      exist: false,
      data: undefined,
      id: snapshot.id,
      ref: snapshot.ref,
      metadata: snapshot.metadata,
    } as GraphDocumentSnapshot<T>;
  }
};

const insert = <T>(arr: T[], value: T, index: number): T[] => {
  return arr
    .slice(0, index)
    .concat([value])
    .concat(arr.slice(index, arr.length));
};

const detectQueryType = (key: string, query: any): "external" | "extension" => {
  // フィールドがオプショナルフィールドである場合、実態が無いので拡張フィールドなのか外部キーなのかの区別がつかない。
  // 仕方がないので拡張キーは`[ref, query]`の形式であるとしてそれで判断する
  // documentKeys.includes(subSubQueryKey) &&
  return Array.isArray(query) ? "extension" : "external";
};

class GraphDocumentQueryListener {
  ref: DocumentReference;
  listener: any;
  query: any;
  queryListeners: Record<string, Record<string, GraphQueryListener>>;
  result: GraphDocumentSnapshot<any> | undefined;
  loading: boolean;
  subQueryLoaded: Record<string, boolean>;

  constructor(
    ref: DocumentReference,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.loading = true;
    this.ref = ref;
    this.query = query;
    this.queryListeners = {};
    this.result = undefined;
    this.subQueryLoaded = {};

    const update = () => {
      handleUpdate(this.result);
    };

    const checkUpdate = () => {
      console.log("loadedlist", this.subQueryLoaded);
      if (Object.values(this.subQueryLoaded).every((res) => res)) {
        console.log("update", ref, query);
        update();
      }
    };

    console.log(`set onSnapshot ${(ref as any).path}`);
    let initialized = false;
    this.listener = onSnapshot(ref, (snapshot) => {
      const docChange = initialized
        ? snapshot.exists()
          ? ({
              type: "modified",
              doc: snapshot,
            } as const)
          : ({
              type: "removed",
              doc: snapshot,
            } as const)
        : snapshot.exists()
        ? ({
            type: "added",
            doc: snapshot,
          } as const)
        : ({
            type: "notExists",
            doc: snapshot,
          } as const);
      initialized = true;
      console.log(docChange.type);
      switch (docChange.type) {
        case "added": {
          const graphDocumentSnapshot = makeGraphQueryDocumentSnapshot(
            docChange.doc
          );
          const documentKeys = Object.keys(graphDocumentSnapshot.data);
          const query =
            typeof this.query === "function"
              ? this.query(graphDocumentSnapshot)
              : this.query;
          this.result = graphDocumentSnapshot;
          this.subQueryLoaded = {};
          for (const [subSubQueryKey, subSubQuery] of Object.entries(query) as [
            any,
            any
          ]) {
            console.log(
              "queryType",
              detectQueryType(subSubQueryKey, subSubQuery),
              subSubQueryKey,
              subSubQuery
            );
            switch (detectQueryType(subSubQueryKey, subSubQuery)) {
              case "external": {
                const subQueryRef = graphDocumentSnapshot.data[subSubQueryKey];
                if (subQueryRef != null) {
                  this.subQueryLoaded[subSubQueryKey] = false;
                }
                break;
              }
              case "extension": {
                this.subQueryLoaded[subSubQueryKey] = false;
                break;
              }
            }
          }
          console.log("loadedList:=", this.subQueryLoaded);
          const queryListeners: Record<string, GraphQueryListener> = {};
          for (const [subQueryKey, subQuery] of Object.entries(query) as [
            any,
            any
          ]) {
            const subQueryRef = graphDocumentSnapshot.data[subQueryKey];
            switch (detectQueryType(subQueryKey, subQuery)) {
              case "external": {
                console.log("external", subQuery, subQueryRef);
                if (subQueryRef == null) {
                  continue;
                }
                if (
                  !(
                    subQueryRef instanceof DocumentReference ||
                    subQueryRef instanceof Query
                  )
                ) {
                  throw new Error(
                    `Unreachable. Expect ref, get ${subQueryRef}.`
                  );
                }
                // 外部キー
                const subQueryKeyName = (() => {
                  if ((subQueryKey as string).endsWith("Ref")) {
                    return (subQueryKey as string).substring(
                      0,
                      (subQueryKey as string).length - 3
                    );
                  } else {
                    throw new Error(
                      "Unexpected. field key without endsWith `Ref` is not suppoerted"
                    );
                  }
                })();
                if (subQueryRef instanceof Query) {
                  queryListeners[subQueryKey] =
                    new GraphCollectionQueryListener(
                      subQueryRef,
                      subQuery,
                      (result: any) => {
                        this.result!["data"][subQueryKeyName] = result;
                        this.subQueryLoaded[subQueryKey] = true;
                        checkUpdate();
                      },
                      () => {}
                    );
                } else if (subQueryRef instanceof DocumentReference) {
                  queryListeners[subQueryKey] = new GraphDocumentQueryListener(
                    subQueryRef,
                    subQuery,
                    (result: any) => {
                      this.result!["data"][subQueryKeyName] = result;
                      this.subQueryLoaded[subQueryKey] = true;
                      checkUpdate();
                    },
                    () => {}
                  );
                }
                break;
              }
              case "extension": {
                // 拡張キー
                const extensionRef = subQuery[0];
                const extensionQuery = subQuery[1];

                if (extensionRef instanceof Query) {
                  console.log("extension", subQuery);
                  queryListeners[subQueryKey] =
                    new GraphCollectionQueryListener(
                      extensionRef,
                      extensionQuery,
                      (result: any) => {
                        this.result!["data"][subQueryKey] = result;
                        this.subQueryLoaded[subQueryKey] = true;
                        checkUpdate();
                      },
                      () => {}
                    );
                } else if (extensionRef instanceof DocumentReference) {
                  console.log("extension", subQuery);
                  queryListeners[subQueryKey] = new GraphDocumentQueryListener(
                    extensionRef,
                    extensionQuery,
                    (result: any) => {
                      this.result!["data"][subQueryKey] = result;
                      this.subQueryLoaded[subQueryKey] = true;
                      checkUpdate();
                    },
                    () => {}
                  );
                }

                break;
              }
            }
          }
          this.queryListeners[docChange.doc.ref.path] = queryListeners;
          break;
        }
        case "removed":
          // TODO
          break;
        case "modified":
          // TODO
          break;
        case "notExists":
          // TODO
          break;
      }
      checkUpdate();
    });
  }

  updateQuery(newRef: any, newQuery: any): boolean {
    return false;
  }
}

class GraphCollectionQueryListener {
  ref: Query;
  listener: any;
  query: any;
  queryListenersCollection: Record<string, Record<string, GraphQueryListener>>;
  result: GraphDocumentSnapshot<any>[];
  loading: boolean;
  subQueryLoadedList: Record<string, boolean>[];

  constructor(
    ref: Query,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.loading = true;
    this.ref = ref;
    this.query = query;
    this.result = [];
    this.subQueryLoadedList = [];
    this.queryListenersCollection = {};

    const update = () => {
      handleUpdate(this.result);
    };

    const checkUpdate = () => {
      console.log("loadedlist", this.subQueryLoadedList);
      if (
        this.subQueryLoadedList.every((subSubQueryLoaded) =>
          Object.values(subSubQueryLoaded).every((res: any) => res)
        )
      ) {
        console.log("update", ref, query);
        update();
      }
    };

    console.log(`set onSnapshot ${(ref as any).path}`);
    this.listener = onSnapshot(ref, (snapshot) => {
      for (const docChange of snapshot.docChanges()) {
        console.log(docChange.type);
        switch (docChange.type) {
          case "added": {
            const graphDocumentSnapshot = makeGraphQueryDocumentSnapshot(
              docChange.doc
            );
            const documentKeys = Object.keys(graphDocumentSnapshot.data);
            const query =
              typeof this.query === "function"
                ? this.query(graphDocumentSnapshot)
                : this.query;
            this.result = insert(
              this.result,
              graphDocumentSnapshot,
              docChange.newIndex
            );
            this.subQueryLoadedList = insert(
              this.subQueryLoadedList,
              {},
              docChange.newIndex
            );
            for (const [subQueryKey, subQuery] of Object.entries(query) as [
              any,
              any
            ]) {
              console.log(
                "queryType",
                detectQueryType(subQueryKey, subQuery),
                subQueryKey,
                subQuery
              );
              switch (detectQueryType(subQueryKey, subQuery)) {
                case "external": {
                  const subQueryRef = graphDocumentSnapshot.data[subQueryKey];
                  if (subQueryRef != null) {
                    this.subQueryLoadedList[docChange.newIndex][subQueryKey] =
                      false;
                  }
                  break;
                }
                case "extension": {
                  this.subQueryLoadedList[docChange.newIndex][subQueryKey] =
                    false;
                  break;
                }
              }
            }
            console.log("loadedList:=", this.subQueryLoadedList);
            const queryListeners: Record<string, GraphQueryListener> = {};
            for (const [subQueryKey, subQuery] of Object.entries(query) as [
              any,
              any
            ]) {
              const subQueryRef = graphDocumentSnapshot.data[subQueryKey];
              switch (detectQueryType(subQueryKey, subQuery)) {
                case "external": {
                  console.log("external", subQuery, subQueryRef);
                  if (subQueryRef == null) {
                    continue;
                  }
                  if (
                    !(
                      subQueryRef instanceof DocumentReference ||
                      subQueryRef instanceof Query
                    )
                  ) {
                    throw new Error(
                      `Unreachable. Expect ref, get ${subQueryRef}.`
                    );
                  }
                  // 外部キー
                  const subQueryKeyName = (() => {
                    if ((subQueryKey as string).endsWith("Ref")) {
                      return (subQueryKey as string).substring(
                        0,
                        (subQueryKey as string).length - 3
                      );
                    } else {
                      throw new Error(
                        "Unexpected. field key without endsWith `Ref` is not suppoerted"
                      );
                    }
                  })();
                  if (subQueryRef instanceof Query) {
                    queryListeners[subQueryKey] =
                      new GraphCollectionQueryListener(
                        subQueryRef,
                        subQuery,
                        (result: any) => {
                          const index = this.result.findIndex(
                            (res) => res.ref.path === docChange.doc.ref.path
                          );
                          if (index !== -1) {
                            this.result[index]["data"][subQueryKeyName] =
                              result;
                            this.subQueryLoadedList[index][subQueryKey] = true;
                            checkUpdate();
                          }
                        },
                        () => {}
                      );
                  } else if (subQueryRef instanceof DocumentReference) {
                    queryListeners[subQueryKey] =
                      new GraphDocumentQueryListener(
                        subQueryRef,
                        subQuery,
                        (result: any) => {
                          const index = this.result.findIndex(
                            (res) => res.ref.path === docChange.doc.ref.path
                          );
                          if (index !== -1) {
                            this.result[index]["data"][subQueryKeyName] =
                              result;
                            this.subQueryLoadedList[index][subQueryKey] = true;
                            checkUpdate();
                          }
                        },
                        () => {}
                      );
                  }
                  break;
                }
                case "extension": {
                  // 拡張キー
                  const extensionRef = subQuery[0];
                  const extensionQuery = subQuery[1];

                  if (extensionRef instanceof Query) {
                    console.log("extension", subQuery);
                    queryListeners[subQueryKey] =
                      new GraphCollectionQueryListener(
                        extensionRef,
                        extensionQuery,
                        (result: any) => {
                          const index = this.result.findIndex(
                            (res) => res.ref.path === docChange.doc.ref.path
                          );
                          if (index !== -1) {
                            this.result[index]["data"][subQueryKey] = result;
                            this.subQueryLoadedList[index][subQueryKey] = true;
                            checkUpdate();
                          }
                        },
                        () => {}
                      );
                  } else if (extensionRef instanceof DocumentReference) {
                    console.log("extension", subQuery);
                    queryListeners[subQueryKey] =
                      new GraphDocumentQueryListener(
                        extensionRef,
                        extensionQuery,
                        (result: any) => {
                          const index = this.result.findIndex(
                            (res) => res.ref.path === docChange.doc.ref.path
                          );
                          if (index !== -1) {
                            this.result[index]["data"][subQueryKey] = result;
                            this.subQueryLoadedList[index][subQueryKey] = true;
                            checkUpdate();
                          }
                        },
                        () => {}
                      );
                  }

                  break;
                }
              }
            }
            this.queryListenersCollection[docChange.doc.ref.path] =
              queryListeners;
            break;
          }
          case "removed":
            // TODO
            break;
          case "modified":
            // TODO
            break;
        }
      }
      checkUpdate();
    });
  }

  updateQuery(newRef: any, newQuery: any): boolean {
    return false;
  }
}

type GraphQueryListener =
  | GraphDocumentQueryListener
  | GraphCollectionQueryListener;

export function useQuery<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(
  ref: Ref,
  query: Q
): [JoinedData<Ref, Q> | undefined, boolean, Error | undefined] {
  const [{ value, loading }, setResult] = useState<{
    value: JoinedData<Ref, Q> | undefined;
    loading: boolean;
  }>({
    value: undefined,
    loading: true,
  });
  const [error, setError] = useState<FirestoreError>();
  const listener = useRef<GraphCollectionQueryListener>();

  useEffect(() => {
    if (ref instanceof Query) {
      listener.current = new GraphCollectionQueryListener(
        ref,
        query,
        (result) => {
          setResult({ value: result, loading: false });
        },
        () => {
          setError(error);
        }
      );
    }
  }, []);

  // update query and determine loading state
  const immediateLoading = useMemo(() => {
    if (listener.current?.updateQuery(ref, query)) {
      setResult(({ value }) => ({ value, loading: true }));
      return true;
    }
    return loading;
  }, [ref, query]);

  return [value, immediateLoading, error];
}

export function field<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q] {
  return [ref, query];
}
