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
      [K in string]: GraphQuery<DocumentData> | [AnyReference, unknown];
    })
  // extra fieldのみのクエリ
  | ({ [K in keyof T]?: never } & {
      [K in string]: GraphQuery<DocumentData> | [AnyReference, unknown];
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

class GraphCollectionQueryListener {
  ref: Query;
  subQuery: any;
  listener: any;
  result: GraphDocumentSnapshot<any>[];
  subSubQueryLoadedList: Record<string, boolean>[];
  subQueryListenersCollection: Record<
    string,
    Record<string, GraphQueryListener>
  >;
  loading: boolean;

  constructor(
    ref: Query,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.loading = true;
    this.ref = ref;
    this.subQuery = query;
    this.result = [];
    this.subSubQueryLoadedList = [];
    this.subQueryListenersCollection = {};

    const update = () => {
      handleUpdate(this.result);
    };

    const checkUpdate = () => {
      console.log("loadedlist", this.subSubQueryLoadedList);
      if (
        this.subSubQueryLoadedList.every((subSubQueryLoaded) =>
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
            const subQuery =
              typeof this.subQuery === "function"
                ? this.subQuery(graphDocumentSnapshot)
                : this.subQuery;
            this.result = insert(
              this.result,
              graphDocumentSnapshot,
              docChange.newIndex
            );
            this.subSubQueryLoadedList = insert(
              this.subSubQueryLoadedList,
              {},
              docChange.newIndex
            );
            for (const [subSubQueryKey, subSubQuery] of Object.entries(
              subQuery
            ) as [any, any]) {
              console.log(
                "queryType",
                detectQueryType(subSubQueryKey, subSubQuery),
                subSubQueryKey,
                subSubQuery
              );
              switch (detectQueryType(subSubQueryKey, subSubQuery)) {
                case "external": {
                  const subSubQueryRef =
                    graphDocumentSnapshot.data[subSubQueryKey];
                  if (subSubQueryRef != null) {
                    this.subSubQueryLoadedList[docChange.newIndex][
                      subSubQueryKey
                    ] = false;
                  }
                  break;
                }
                case "extension": {
                  this.subSubQueryLoadedList[docChange.newIndex][
                    subSubQueryKey
                  ] = false;
                  break;
                }
              }
            }
            console.log("loadedList:=", this.subSubQueryLoadedList);
            const subQueryListeners: Record<string, GraphQueryListener> = {};
            for (const [subSubQueryKey, subSubQuery] of Object.entries(
              subQuery
            ) as [any, any]) {
              const subSubQueryRef = graphDocumentSnapshot.data[subSubQueryKey];
              switch (detectQueryType(subSubQueryKey, subSubQuery)) {
                case "external": {
                  console.log("external", subSubQuery, subSubQueryRef);
                  if (subSubQueryRef == null) {
                    continue;
                  }
                  if (
                    !(
                      subSubQueryRef instanceof DocumentReference ||
                      subSubQueryRef instanceof Query
                    )
                  ) {
                    throw new Error(
                      `Unreachable. Expect ref, get ${subSubQueryRef}.`
                    );
                  }
                  // 外部キー
                  if (subSubQueryRef instanceof Query) {
                    subQueryListeners[subSubQueryKey] =
                      new GraphCollectionQueryListener(
                        subSubQueryRef,
                        subSubQuery,
                        (result: any) => {
                          const index = this.result.findIndex(
                            (res) => res.ref.path === docChange.doc.ref.path
                          );
                          if (index !== -1) {
                            this.result[index]["data"][subSubQueryKey] = result;
                            this.subSubQueryLoadedList[index][subSubQueryKey] =
                              true;
                            checkUpdate();
                          }
                        },
                        () => {}
                      );
                  } else {
                    // TODO
                    throw new Error("!unimplemented");
                  }
                  break;
                }
                case "extension": {
                  // 拡張キー
                  console.log("extension", subSubQuery);
                  subQueryListeners[subSubQueryKey] =
                    new GraphCollectionQueryListener(
                      subSubQuery[0],
                      subSubQuery[1],
                      (result: any) => {
                        const index = this.result.findIndex(
                          (res) => res.ref.path === docChange.doc.ref.path
                        );
                        if (index !== -1) {
                          this.result[index]["data"][subSubQueryKey] = result;
                          this.subSubQueryLoadedList[index][subSubQueryKey] =
                            true;
                          checkUpdate();
                        }
                      },
                      () => {}
                    );
                  break;
                }
              }
            }
            this.subQueryListenersCollection[docChange.doc.ref.path] =
              subQueryListeners;
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
  //| GraphDocumentQueryListener
  GraphCollectionQueryListener;

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
