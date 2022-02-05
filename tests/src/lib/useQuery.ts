import {
  CollectionReference,
  DocumentReference,
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
  FirestoreError,
  Query,
  queryEqual,
  onSnapshot,
  QueryDocumentSnapshot,
  SnapshotOptions,
  SnapshotMetadata,
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
 * 得られるDocumentに付属するメタデータ
 *
 * TODO: DocumentSnapshotの`data()`を呼んで展開してしまうので平らにしても問題ないはず
 */
export type DocumentMetadata<T> = {
  __snapshot__: DocumentSnapshot<T>;
  __ref__: DocumentReference<T>;
  __id__: ID;
};

/**
 * 得られるCollectionに付属するメタデータ
 */
export type CollectionMetadata<T> = {
  __snapshot__: QuerySnapshot<T>;
};

export type WithMetadata<T extends DocumentData> = DocumentMetadata<T> & T;

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
    }) & { [K in string]: unknown })
  // extra fieldのみのクエリ
  | ({ [K in keyof T]?: never } & { [K in string]: unknown })
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

class GraphCollectionQueryListener {
  ref: Query;
  subQuery: any;
  listener: any;
  result: any;
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
    this.result = {};
    this.subQueryListenersCollection = {};

    const update = () => {
      handleUpdate(this.result);
    };

    this.listener = onSnapshot(ref, (snapshot) => {
      for (const docChange of snapshot.docChanges()) {
        switch (docChange.type) {
          case "added": {
            const graphDocumentSnapshot = makeGraphQueryDocumentSnapshot(
              docChange.doc
            );
            const documentKeys = Object.keys(graphDocumentSnapshot.data);
            this.result[docChange.doc.ref.path] = {
              snapshot: graphDocumentSnapshot,
            };
            const subQueryListeners: Record<string, GraphQueryListener> = {};
            const subQuery =
              typeof this.subQuery === "function"
                ? this.subQuery(graphDocumentSnapshot)
                : this.subQuery;
            for (const [subSubQueryKey, subSubQuery] of Object.entries(
              subQuery
            ) as [any, any]) {
              if (documentKeys.includes(subSubQueryKey)) {
                // 外部キー
                subQueryListeners[subSubQueryKey] =
                  new GraphCollectionQueryListener(
                    graphDocumentSnapshot.data[subSubQueryKey],
                    subSubQuery,
                    (result: any) => {
                      this.result[docChange.doc.ref.path]["result"] = result;
                      update();
                    },
                    () => {}
                  );
              } else {
                // 拡張キー
                subQueryListeners[subSubQueryKey] =
                  new GraphCollectionQueryListener(
                    subSubQuery[0],
                    subSubQuery[1],
                    (result: any) => {
                      this.result[docChange.doc.ref.path]["result"] = result;
                      update();
                    },
                    () => {}
                  );
              }
            }
            this.subQueryListenersCollection[docChange.doc.ref.path] =
              subQueryListeners;
            break;
          }
          case "removed":
            break;
          case "modified":
            break;
        }
      }
    });
  }

  updateQuery(newRef: any, newQuery: any): boolean {
    throw new Error("unimplemented");
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
  const [value, setValue] = useState<JoinedData<Ref, Q>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError>();
  const listener = useRef<GraphCollectionQueryListener>();

  if (listener.current === undefined) {
    if (ref instanceof Query) {
      listener.current = new GraphCollectionQueryListener(
        ref,
        query,
        (result) => {
          setValue(result);
          setLoading(false);
        },
        () => {
          setError(error);
        }
      );
    }
  } else {
    listener.current.updateQuery(ref, query);
  }

  return [value, loading, error];
}

export function field<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q] {
  return {} as any;
}
