import {
  CollectionReference,
  DocumentReference,
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { PickOptional, SelectiveOptional } from "./helper";
import { RequiredPrimitive } from "./tests/helper";

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

/**
 * Queryを書くときに参照する計算途中の中間データ
 */
export type Data<T extends DocumentData> = T & DocumentMetadata<T>;

type AnyReference =
  | DocumentReference<DocumentData>
  | CollectionReference<DocumentData>;

/**
 * ドキュメントのフィールドからリファレンスのフィールドのみを取り出す
 */
type PickRefField<T extends DocumentData> = {
  [K in keyof T]: RequiredPrimitive<T[K]> extends AnyReference ? K : never;
}[keyof T];

/**
 * クエリの型
 */
type GraphQuery<T extends DocumentData> =
  | ({
      [K in PickRefField<T>]?: T[K] extends
        | (DocumentReference<infer U> | CollectionReference<infer U>)
        | undefined
        ? U extends DocumentData
          ? GraphQuery<U>
          : never
        : never;
    } & {
      // we need negated type https://github.com/microsoft/TypeScript/pull/29317#issuecomment-452973876
      // [K in not PickRefField<T>]?: ...
      [K in string]?:
        | [AnyReference, Record<string, unknown>]
        // rerフィールドの場合でもこちらと混ぜる必要があるためこれが必要
        | Record<string, unknown>;
    })
  | ((data: Data<T>) => GraphQuery<T>);

type GraphQueryQueryType<T, Q extends GraphQuery<T>> = Q extends (
  ...args: any
) => any
  ? ReturnType<Q>
  : Q;

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
      ? Required<GraphQueryQueryType<T, Q>[K]> extends GraphQuery<
          RefToDoc<NonNullable<T[K]>>
        >
        ?
            | JoinedData<T[K], Required<GraphQueryQueryType<T, Q>[K]>>
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
> &
  DocumentMetadata<T>;

type RefToDoc<R extends AnyReference> = R extends
  | DocumentReference<infer D>
  | undefined
  ? D
  : R extends CollectionReference<infer D> | undefined
  ? D
  : never;

type JoinedData<
  R extends AnyReference,
  Q extends GraphQuery<RefToDoc<R>>
> = R extends DocumentReference<infer U>
  ? Q extends GraphQuery<U>
    ? JoinedDataInner<U, Q>
    : never
  : R extends CollectionReference<infer U>
  ? Q extends GraphQuery<U>
    ? JoinedDataInner<U, Q>[] & CollectionMetadata<U>
    : never
  : never;

export declare function _useJoinedQuery<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [JoinedData<Ref, Q>, boolean, Error];

export declare function extraField<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q];
