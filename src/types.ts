import {
  CollectionReference,
  DocumentReference,
  QuerySnapshot,
  DocumentData,
  Query,
  SnapshotMetadata,
} from 'firebase/firestore';
import { PickOptional, SelectiveOptional, Expand } from './utils';

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

export type WithCollectionMetadata<T extends DocumentData> =
  CollectionMetadata<T> & GraphQueryDocumentSnapshot<T>[];

export type AnyReference = DocumentReference | Query;

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
export type GraphQuery<T extends DocumentData> =
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
      [K in string]: unknown | [AnyReference, unknown, boolean];
    })
  // extra fieldのみのクエリ
  | ({ [K in keyof T]?: never } & {
      [K in string]: unknown | [AnyReference, unknown, boolean];
    })
  // ドキュメントを引数にとってクエリを返す関数
  | ((data: GraphDocumentSnapshot<T>) => GraphQuery<T>);

type GraphQueryQueryType<T, Q extends GraphQuery<T>> = Q extends (
  ...args: any
) => any
  ? ReturnType<Q>
  : Q;

type RequiredGraphQuery<Q> = Q extends (...args: any) => any ? Q : Required<Q>;

export type JoinedDataInner<
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
            | JoinedData<
                T[K],
                RequiredGraphQuery<GraphQueryQueryType<T, Q>[K]>,
                false
              >
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
    >]: GraphQueryQueryType<T, Q>[K] extends
      | [infer Ref, infer UQuery, infer GuaranteedToExist]
      | undefined
      ? GuaranteedToExist extends boolean
        ? Ref extends AnyReference
          ? UQuery extends Function
            ? UQuery extends GraphQuery<RefToDoc<Ref>>
              ? JoinedData<Ref, UQuery, GuaranteedToExist>
              : never
            : Required<UQuery> extends GraphQuery<RefToDoc<Ref>>
            ? JoinedData<Ref, Required<UQuery>, GuaranteedToExist>
            : never
          : never
        : never
      : never;
  },
  keyof PickOptional<T> | keyof PickOptional<GraphQueryQueryType<T, Q>>
>;

export type RefToDoc<R extends AnyReference> = R extends
  | DocumentReference<infer D>
  | undefined
  ? D
  : R extends Query<infer D> | undefined
  ? D
  : never;

export type JoinedData<
  R extends AnyReference,
  Q extends GraphQuery<RefToDoc<R>>,
  GuaranteedToExist extends boolean
> = R extends DocumentReference<infer U>
  ? Q extends GraphQuery<U>
    ? {} extends Omit<JoinedDataInner<U, Q>, keyof U>
      ? true extends GuaranteedToExist
        ? GraphQueryDocumentSnapshot<U>
        : GraphDocumentSnapshot<U>
      : (true extends GuaranteedToExist
          ? GraphQueryDocumentSnapshot<U>
          : GraphDocumentSnapshot<U>) & {
          data: Expand<Omit<JoinedDataInner<U, Q>, keyof U>>;
        }
    : never
  : R extends CollectionReference<infer U>
  ? Q extends GraphQuery<U>
    ? {} extends Omit<JoinedDataInner<U, Q>, keyof U>
      ? WithCollectionMetadata<U>
      : (GraphQueryDocumentSnapshot<U> & {
          data: Expand<Omit<JoinedDataInner<U, Q>, keyof U>>;
        })[] &
          CollectionMetadata<U>
    : never
  : never;
