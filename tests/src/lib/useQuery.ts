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
  Unsubscribe,
  refEqual,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { PickOptional, SelectiveOptional } from "./helper";
import { Expand } from "../helper";
import { union } from "lodash-es";

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

class GraphQueryListener {
  currentSnapshot: GraphDocumentSnapshot<any>;
  queryFactory: GraphQuery<any>;
  result: GraphDocumentSnapshot<any> | undefined;
  subQueryListeners: Record<string, GraphListener>;
  isQueryInitialized: boolean;
  handleUpdate: (result: any) => void;

  constructor(
    snapshot: GraphDocumentSnapshot<any>,
    queryFactory: GraphQuery<any>,
    handleUpdate: (result: any) => void
  ) {
    this.currentSnapshot = snapshot;
    this.queryFactory = queryFactory;
    this.subQueryListeners = {};
    this.isQueryInitialized = false;
    this.handleUpdate = handleUpdate;

    const query = this.makeQuery(snapshot);
    this.result = snapshot;
    for (const [subQueryKey, subQuery] of Object.entries(query) as [any, any]) {
      if (subQueryKey in snapshot.data) {
        this.createSubQueryListener(snapshot, subQueryKey, subQuery);
      }
    }
  }

  onUpdate() {
    if (
      Object.values(this.subQueryListeners).every(
        (subQueryListener) => subQueryListener.loading
      )
    ) {
      this.isQueryInitialized = true;
      this.handleUpdate(this.result);
    }
  }

  makeQuery(snapshot: GraphDocumentSnapshot<any>) {
    return typeof this.queryFactory === "function"
      ? this.queryFactory(snapshot)
      : this.queryFactory;
  }

  createSubQueryListener(
    snapshot: GraphDocumentSnapshot<any>,
    subQueryKey: string,
    subQuery: any
  ) {
    switch (detectQueryType(subQueryKey, subQuery)) {
      case "external": {
        const subQueryRef = snapshot.data[subQueryKey];
        console.log("external", subQuery, subQueryRef);
        if (subQueryRef == null) {
          return;
        }
        if (
          !(
            subQueryRef instanceof DocumentReference ||
            subQueryRef instanceof Query
          )
        ) {
          throw new Error(`Unreachable. Expect ref, get ${subQueryRef}.`);
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
              "Unexpected. field key without endsWith `Ref` is not supported"
            );
          }
        })();

        this.subQueryListeners[subQueryKey] = makeGraphListener(
          subQueryRef,
          subQuery,
          (result: any) => {
            this.result!["data"][subQueryKeyName] = result;
            this.onUpdate();
          },
          () => {}
        );

        break;
      }
      case "extension": {
        // 拡張キー
        const extensionRef = subQuery[0];
        const extensionQuery = subQuery[1];

        console.log("extension", subQuery);

        this.subQueryListeners[subQueryKey] = makeGraphListener(
          extensionRef,
          extensionQuery,
          (result: any) => {
            this.result!["data"][subQueryKey] = result;
            this.onUpdate();
          },
          () => {}
        );

        break;
      }
    }
  }

  updateSubQueryListener(
    subQueryKey: string,
    prevSnapshot: GraphDocumentSnapshot<any>,
    prevSubQueryFactory: any,
    newSnapshot: GraphDocumentSnapshot<any>,
    newSubQueryFactory: any
  ): boolean {
    // compare ref
    if (
      detectQueryType(subQueryKey, prevSubQueryFactory) !==
      detectQueryType(subQueryKey, newSubQueryFactory)
    ) {
      throw new Error("Unexpected Error. query type does not match");
    }

    let prevSubQueryRef: DocumentReference | Query;
    let prevSubQuery: any;
    let newSubQueryRef: DocumentReference | Query;
    let newSubQuery: any;

    switch (detectQueryType(subQueryKey, newSubQueryFactory)) {
      case "external": {
        prevSubQueryRef = prevSnapshot.data[subQueryKey];
        prevSubQuery = prevSubQueryFactory;
        newSubQueryRef = newSnapshot.data[subQueryKey];
        newSubQuery = newSubQueryFactory;
        console.log("external", newSubQuery, newSubQueryRef);
        break;
      }
      case "extension": {
        prevSubQueryRef = prevSubQueryFactory[0];
        prevSubQuery = prevSubQueryFactory[1];
        newSubQueryRef = newSubQueryFactory[0];
        newSubQuery = newSubQueryFactory[1];
        console.log("extension", newSubQuery, newSubQueryRef);
        break;
      }
    }

    if (prevSubQueryRef == null && newSubQueryRef == null) {
      // ref not exist ever
      return false;
    } else if (prevSubQueryRef != null && newSubQueryRef == null) {
      // ref removed
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      return true;
    } else if (prevSubQueryRef == null && newSubQueryRef != null) {
      // ref created
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery);
      return true;
    } else if (
      (prevSubQueryRef instanceof DocumentReference &&
        newSubQueryRef instanceof Query) ||
      (prevSubQueryRef instanceof Query &&
        newSubQueryRef instanceof DocumentReference)
    ) {
      // ref type changed
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery);
      return true;
    } else if (
      (prevSubQueryRef instanceof DocumentReference &&
        newSubQueryRef instanceof DocumentReference &&
        !refEqual(prevSubQueryRef, newSubQueryRef)) ||
      (prevSubQueryRef instanceof Query &&
        newSubQueryRef instanceof Query &&
        !queryEqual(prevSubQueryRef, newSubQueryRef))
    ) {
      // ref changed
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery);
      return true;
    } else {
      // ref not changed
      return this.subQueryListeners[subQueryKey].updateQuery(newSubQuery);
    }
  }

  updateSnapshot(newSnapshot: GraphDocumentSnapshot<any>) {
    return this.update(newSnapshot, this.queryFactory);
  }

  updateQuery(newQueryFactory: GraphQuery<any>) {
    return this.update(this.currentSnapshot, newQueryFactory);
  }

  update(
    newSnapshot: GraphDocumentSnapshot<any>,
    newQueryFactory: GraphQuery<any>
  ): boolean {
    console.log("modified");
    let hasUpdate = false;
    const prevSnapshot = this.currentSnapshot;
    const prevQuery = this.makeQuery(this.currentSnapshot);
    this.currentSnapshot = newSnapshot;
    this.queryFactory = newQueryFactory;
    const newQuery = this.makeQuery(this.currentSnapshot);

    // - calc snapshot diff
    //   - update result
    //   - calc query diff for each snapshot diff
    //     - update subQuery
    const prevSnapshotKeys = Object.keys(prevSnapshot);
    const newSnapshotKeys = Object.keys(newSnapshot);
    for (const snapshotKey of union(prevSnapshotKeys, newSnapshotKeys)) {
      if (
        snapshotKey in prevSnapshotKeys &&
        !(snapshotKey in newSnapshotKeys)
      ) {
        // key removed
        hasUpdate = true;
        if (this.result && snapshotKey in this.result["data"]) {
          delete this.result["data"][snapshotKey];
        }
        if (this.subQueryListeners && snapshotKey in this.subQueryListeners) {
          this.subQueryListeners[snapshotKey].unsubscribe();
          delete this.subQueryListeners[snapshotKey];
        }
      }
      if (
        !(snapshotKey in prevSnapshotKeys) &&
        snapshotKey in newSnapshotKeys
      ) {
        // key created
        hasUpdate = true;
        if (this.result) {
          this.result["data"][snapshotKey] = newSnapshot.data[snapshotKey];
        }
        if (snapshotKey in newQuery) {
          this.createSubQueryListener(newSnapshot, snapshotKey, newQuery);
        }
      }
      if (snapshotKey in prevSnapshotKeys && snapshotKey in newSnapshotKeys) {
        // key not changed
        if (this.result) {
          this.result["data"][snapshotKey] = newSnapshot.data[snapshotKey];
        }
        if (!(snapshotKey in prevQuery) && !(snapshotKey in newQuery)) {
          // subQuery not exist
        }
        if (snapshotKey in prevQuery && !(snapshotKey in newQuery)) {
          // subQuery removed
          hasUpdate = true;
          this.subQueryListeners[snapshotKey].unsubscribe();
          delete this.subQueryListeners[snapshotKey];
        }
        if (!(snapshotKey in prevQuery) && snapshotKey in newQuery) {
          // subQuery created
          hasUpdate = true;
          this.createSubQueryListener(newSnapshot, snapshotKey, newQuery);
        }
        if (snapshotKey in prevQuery && snapshotKey in newQuery) {
          // subQuery may modified
          const subQueryHasUpdate = this.updateSubQueryListener(
            snapshotKey,
            prevSnapshot,
            prevQuery,
            newSnapshot,
            newQuery
          );
          if (subQueryHasUpdate) {
            hasUpdate = true;
          }
        }
      }
    }
    return hasUpdate;
  }

  unsubscribe() {
    Object.values(this.subQueryListeners).forEach((queryListener) =>
      queryListener.unsubscribe()
    );
  }
}

interface GraphListener {
  ref: any;
  query: any;
  loading: boolean;

  /**
   * クエリを投げ、更新があるかどうかを返す
   */
  updateQuery(newQuery: any): boolean;

  /**
   * サブクエリの購読を止める
   */
  unsubscribe(): void;
}

const makeGraphListener = (
  ref: DocumentReference | Query,
  query: any,
  handleUpdate: (result: any) => void,
  handleError: (error: FirestoreError) => void
): GraphListener => {
  if (ref instanceof Query) {
    return new GraphCollectionListener(ref, query, handleUpdate, handleError);
  } else {
    return new GraphDocumentListener(ref, query, handleUpdate, handleError);
  }
};

class GraphDocumentListener implements GraphListener {
  ref: DocumentReference;
  listenerUnsubscriber: Unsubscribe;
  query: any;
  queryListener: GraphQueryListener | undefined;
  loading: boolean;
  isSnapshotInitialized: boolean;

  constructor(
    ref: DocumentReference,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.loading = true;
    this.isSnapshotInitialized = false;
    this.ref = ref;
    this.query = query;
    this.queryListener = undefined;

    const onUpdate = (result: any) => {
      this.loading = false;
      handleUpdate(result);
    };

    console.log(`set onSnapshot ${(ref as any).path}`);
    this.listenerUnsubscriber = onSnapshot(ref, (rawSnapshot) => {
      const snapshot = makeGraphDocumentSnapshot(rawSnapshot);
      if (this.queryListener) {
        if (snapshot.exist) {
          this.queryListener.updateSnapshot(snapshot);
        } else {
          this.queryListener.unsubscribe();
        }
      } else {
        if (snapshot.exist) {
          this.queryListener = new GraphQueryListener(
            snapshot,
            query,
            onUpdate
          );
        } else {
          onUpdate(undefined);
          this.loading = false;
        }
      }
      this.isSnapshotInitialized = true;
    });
  }

  updateQuery(newQuery: any): boolean {
    this.query = newQuery;
    if (this.queryListener) {
      const hasUpdate = this.queryListener.updateQuery(newQuery);
      if (hasUpdate) {
        this.loading = true;
      }
      return hasUpdate;
    } else {
      return false;
    }
  }

  unsubscribe(): void {
    if (this.queryListener) {
      this.queryListener.unsubscribe();
    }
    this.listenerUnsubscriber();
  }
}

class GraphCollectionListener implements GraphListener {
  ref: Query;
  listenerUnsubscriber: Unsubscribe;
  query: any;
  queryListeners: Record<string, GraphQueryListener>;
  result: GraphDocumentSnapshot<any>[];
  loading: boolean;

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
    this.queryListeners = {};

    const onUpdate = (path: string, result: GraphDocumentSnapshot<any>) => {
      const docIndex = this.result.findIndex((res) => res.ref.path === path);
      if (docIndex === -1) {
        return;
      }

      this.result[docIndex]["data"] = result;

      if (
        Object.values(this.queryListeners).every(
          (queryListener) => queryListener.isQueryInitialized
        )
      ) {
        console.log("update", ref, query);
        this.loading = false;
        handleUpdate(this.result);
      }
    };

    console.log(`set onSnapshot ${(ref as any).path}`);
    this.listenerUnsubscriber = onSnapshot(ref, (querySnapshot) => {
      for (const docChange of querySnapshot.docChanges()) {
        console.log(docChange.type);
        const snapshot = makeGraphQueryDocumentSnapshot(docChange.doc);
        switch (docChange.type) {
          case "added": {
            this.queryListeners[docChange.doc.ref.path] =
              new GraphQueryListener(snapshot, query, (result) =>
                onUpdate(docChange.doc.ref.path, result)
              );
            this.result = insert(this.result, snapshot, docChange.newIndex);
            break;
          }
          case "removed":
            this.queryListeners[docChange.doc.ref.path].unsubscribe();
            break;
          case "modified":
            this.queryListeners[docChange.doc.ref.path].updateSnapshot(
              snapshot
            );
            break;
        }
      }
    });
  }

  updateQuery(newQuery: any): boolean {
    this.query = newQuery;
    if (this.queryListeners) {
      const hasUpdate = Object.values(this.queryListeners).some(
        (queryListener) => queryListener.updateQuery(newQuery)
      );
      if (hasUpdate) {
        this.loading = true;
      }
      return hasUpdate;
    } else {
      return false;
    }
  }

  unsubscribe(): void {
    if (this.queryListeners) {
      Object.values(this.queryListeners).forEach((queryListener) =>
        queryListener.unsubscribe()
      );
    }
    this.listenerUnsubscriber();
  }
}

// ! old not work
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
  const listener = useRef<GraphListener>();

  const createListener = () => {
    listener.current = makeGraphListener(
      ref,
      query,
      (result) => {
        setResult({ value: result, loading: false });
      },
      () => {
        setError(error);
      }
    );
  };

  useEffect(() => {
    createListener();
  }, []);

  // update query and determine loading state
  const currentRef = useRef(ref);
  const immediateLoading = useMemo(() => {
    const prevRef = currentRef.current;
    currentRef.current = ref;
    if (
      (prevRef instanceof DocumentReference &&
        ref instanceof DocumentReference &&
        refEqual(prevRef, ref)) ||
      (prevRef instanceof Query &&
        ref instanceof Query &&
        queryEqual(prevRef, ref))
    ) {
      // ref not changed
      if (listener.current?.updateQuery(query)) {
        // query changed
        setResult(({ value }) => ({ value, loading: true }));
        return true;
      } else {
        // query not changed
        return loading;
      }
    } else {
      // ref changed
      if (listener.current) {
        listener.current.unsubscribe();
        createListener();
      }
      return true;
    }
  }, [ref, query]);

  return [value, immediateLoading, error];
}

export function field<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q] {
  return [ref, query];
}
