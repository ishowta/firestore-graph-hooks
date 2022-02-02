import {
  CollectionReference,
  DocumentReference,
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { PickOptional, SelectiveOptional } from "./helper";
import { Expand } from "./tests/helper";

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

type AnyReference =
  | DocumentReference<DocumentData>
  | CollectionReference<DocumentData>;

export type RefKeyword = "Ref";

/**
 * ドキュメントのフィールドからリファレンスのフィールドのみを取り出す
 *
 * 元のドキュメントとの互換性を保つため`${string}(Ref|_ref)`の形のフィールドのみ使えるようにする
 */
type PickRefField<T extends DocumentData> = keyof {
  [K in keyof T as K extends `${string}${RefKeyword}` ? K : never]: NonNullable<
    T[K]
  > extends AnyReference
    ? K
    : never;
};

type RemoveRefSuffix<K> = K extends string
  ? K extends `${infer S}${RefKeyword}`
    ? S
    : K
  : never;

type AddRefSuffix<K> = K extends string ? `${K}${RefKeyword}` : never;

/**
 * クエリの型
 *
 * TODO: 否定形や存在型が無いのでextra fieldを`unknown`にしてしまっているが他に方法は無い？
 */
type GraphQuery<T extends DocumentData> =
  // ref fieldを含んだクエリ（extra fieldも入れられる）
  | (({
      [K in RemoveRefSuffix<PickRefField<T>>]?: NonNullable<
        T[AddRefSuffix<K>]
      > extends DocumentReference<infer U> | CollectionReference<infer U>
        ? U extends DocumentData
          ? GraphQuery<U>
          : never
        : never;
    } & {
      [K in Exclude<
        keyof T,
        PickRefField<T> | RemoveRefSuffix<PickRefField<T>>
      >]?: never;
    }) & { [K in string]: unknown })
  // extra fieldのみのクエリ
  | ({ [K in keyof T | RemoveRefSuffix<keyof T>]?: never } & {
      [K in string]: unknown;
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
    [K in keyof T]: T[K];
  } & {
    /**
     * クエリで指定されたリファレンスフィールド
     */
    [K in RemoveRefSuffix<keyof T> &
      keyof GraphQueryQueryType<T, Q>]: AddRefSuffix<K> extends infer OriginalK
      ? OriginalK extends keyof T
        ? RefToDoc<NonNullable<T[OriginalK]>> extends DocumentData
          ? RequiredGraphQuery<GraphQueryQueryType<T, Q>[K]> extends GraphQuery<
              RefToDoc<NonNullable<T[OriginalK]>>
            >
            ?
                | JoinedData<
                    T[OriginalK],
                    RequiredGraphQuery<GraphQueryQueryType<T, Q>[K]>
                  >
                | (null extends T[OriginalK] ? null : never)
            : never
          : never
        : never
      : never;
  } & {
    /**
     * クエリで追加されたエクストラフィールド
     */
    [K in Exclude<
      keyof GraphQueryQueryType<T, Q>,
      RemoveRefSuffix<keyof T>
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
  : R extends CollectionReference<infer D> | undefined
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

export declare function useJoinedQuery<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [JoinedData<Ref, Q>, boolean, Error];
export declare function useJoinedQuery<Q extends GraphQuery<{}>>(
  query: Q
): [Expand<JoinedDataInner<{}, Q>>, boolean, Error];

export declare function field<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q];
