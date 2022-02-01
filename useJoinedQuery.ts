import {
  CollectionReference,
  DocumentReference,
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
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

/**
 * ドキュメントのフィールドからリファレンスのフィールドのみを取り出す
 */
type PickRefField<T extends DocumentData> = {
  [K in keyof T & string]: RequiredPrimitive<T[K]> extends
    | DocumentReference<DocumentData>
    | CollectionReference<DocumentData>
    ? K
    : never;
}[keyof T & string];

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
      [K in string]?:
        | [
            DocumentReference<DocumentData> | CollectionReference<DocumentData>,
            Record<string, unknown>
          ]
        | Record<string, unknown>;
    })
  | ((data: Data<T>) => GraphQuery<T>);

type GraphQueryQueryType<T, Q extends GraphQuery<T>> = Q extends (
  ...args: any
) => any
  ? ReturnType<Q>
  : Q;

type JoinedDataInner<T extends DocumentData, Q extends GraphQuery<T>> = {
  [K in keyof T as K extends `${infer OriginalK}Ref`
    ? OriginalK
    : K]: K extends keyof GraphQueryQueryType<T, Q>
    ? RefToDoc<T[K]> extends DocumentData
      ? Required<GraphQueryQueryType<T, Q>[K]> extends GraphQuery<
          RefToDoc<T[K]>
        >
        ? JoinedData<T[K], Required<GraphQueryQueryType<T, Q>[K]>>
        : never
      : never
    : T[K];
} & {
  [K in keyof GraphQueryQueryType<T, Q> as K extends `${infer OriginalK}Ref`
    ? OriginalK
    : K]: K extends keyof T
    ? unknown
    : GraphQueryQueryType<T, Q>[K] extends [infer Ref, infer UQuery]
    ? Ref extends
        | DocumentReference<DocumentData>
        | CollectionReference<DocumentData>
      ? Required<UQuery> extends GraphQuery<RefToDoc<Ref>>
        ? JoinedData<Ref, Required<UQuery>>
        : never
      : never
    : never;
} & DocumentMetadata<T>;

type RefToDoc<
  R extends DocumentReference<DocumentData> | CollectionReference<DocumentData>
> = R extends DocumentReference<infer D> | undefined
  ? D
  : R extends CollectionReference<infer D> | undefined
  ? D
  : never;

type JoinedData<
  R extends DocumentReference<DocumentData> | CollectionReference<DocumentData>,
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
  Ref extends
    | DocumentReference<DocumentData>
    | CollectionReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [JoinedData<Ref, Q>, boolean, Error];

export declare function extraField<
  Ref extends
    | DocumentReference<DocumentData>
    | CollectionReference<DocumentData>,
  Q extends GraphQuery<
    Ref extends DocumentReference<infer U>
      ? U
      : Ref extends CollectionReference<infer U>
      ? U
      : never
  >
>(ref: Ref, query: Q): [Ref, Q];
