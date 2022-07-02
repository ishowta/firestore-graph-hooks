import {
  DocumentReference,
  QuerySnapshot,
  Query,
  SnapshotMetadata,
  CollectionReference,
} from 'firebase/firestore';
import { PickOptional, SelectiveOptional, Expand } from './utils';

export type DocumentData = Record<string, unknown>;

export type GraphDocumentSnapshotWhenExist<T extends DocumentData> = {
  data: T;
  exist: true;
  id: string;
  ref: DocumentReference<T>;
  metadata: SnapshotMetadata;
};

export type GraphDocumentSnapshotWhenNotExist<T extends DocumentData> = {
  data: undefined;
  exist: false;
  id: string;
  ref: DocumentReference<T>;
  metadata: SnapshotMetadata;
};

export type GraphQueryDocumentSnapshot<T extends DocumentData> =
  GraphDocumentSnapshotWhenExist<T>;

export type GraphQueryDocumentSnapshotWithQueryResult<
  T extends DocumentData,
  QueryResult
> = GraphDocumentSnapshotWhenExist<T> & {
  data: QueryResult;
};

export type GraphDocumentSnapshot<T extends DocumentData> =
  | GraphDocumentSnapshotWhenExist<T>
  | GraphDocumentSnapshotWhenNotExist<T>;

export type GraphDocumentSnapshotWithQueryResult<
  T extends DocumentData,
  QueryResult
> =
  | (GraphDocumentSnapshotWhenExist<T> & {
      data: QueryResult;
    })
  | GraphDocumentSnapshotWhenNotExist<T>;

/**
 * Firestore ID
 */
export type ID = string & {};

export type CollectionMetadata<T extends DocumentData> = {
  __snapshot__: QuerySnapshot<T>;
};

export type WithCollectionMetadata<T extends DocumentData> =
  CollectionMetadata<T> & GraphQueryDocumentSnapshot<T>[];

export type AnyReference<T extends DocumentData> =
  | DocumentReference<T>
  | Query<T>;

export type RefToDoc<Ref extends AnyReference<DocumentData>> = Ref extends
  | DocumentReference<infer Doc>
  | CollectionReference<infer Doc>
  | Query<infer Doc>
  ? Doc extends DocumentData
    ? Doc
    : never
  : never;

/**
 * Pickup key of ref value field from document type
 *
 * For compatibility with the original firestore document types,
 * only fields of the form `${string}Ref` can be used.
 */
type PickRefField<T extends DocumentData> = keyof T extends infer K
  ? K extends `${string}Ref`
    ? NonNullable<T[K]> extends AnyReference<DocumentData>
      ? K
      : never
    : never
  : never;

/**
 * Query type
 *
 * Using unknown type as a compromise.
 * Maybe we need negate types and existential types to type correctly
 */
export type GraphQuery<T extends DocumentData> =
  // Ref field included query
  | (({
      [K in PickRefField<T>]?: NonNullable<T[K]> extends
        | DocumentReference<infer U>
        | CollectionReference<infer U>
        | Query<infer U>
        ? U extends DocumentData
          ? GraphQuery<U> | GraphQueryGenerator<NonNullable<T[K]>>
          : never
        : never;
    } & {
      [K in Exclude<keyof T, PickRefField<T>>]?: never;
    }) & {
      [K in string]: unknown | GraphQueryExtensionField;
    })
  // Only extra field query
  | ({ [K in keyof T]?: never } & {
      [K in string]: unknown | GraphQueryExtensionField;
    });

export type GraphQueryExtensionField = [
  AnyReference<Record<string, unknown>> | null | undefined,
  GraphQuery<DocumentData> | GraphQueryGenerator<AnyReference<DocumentData>>,
  boolean
];

export type GraphQueryGenerator<Ref extends AnyReference<DocumentData>> =
  Ref extends DocumentReference<infer T>
    ? T extends DocumentData
      ? (data: GraphDocumentSnapshot<T>) => GraphQuery<T>
      : never
    : Ref extends CollectionReference<infer T> | Query<infer T>
    ? T extends DocumentData
      ? (data: GraphQueryDocumentSnapshot<T>) => GraphQuery<T>
      : never
    : never;

export type AnyGraphQueryGenerator<T extends DocumentData> =
  GraphQueryGenerator<AnyReference<T>>;

export type GetQueryType<
  T extends DocumentData,
  Q extends GraphQuery<T> | AnyGraphQueryGenerator<T>
> = Q extends GraphQuery<T>
  ? Q
  : Q extends AnyGraphQueryGenerator<T>
  ? ReturnType<Q> extends GraphQuery<T>
    ? ReturnType<Q>
    : never
  : never;

export type GraphQueryResult<
  T extends DocumentData,
  Q extends GraphQuery<T> | AnyGraphQueryGenerator<T>
> = SelectiveOptional<
  {
    /**
     * ドキュメントのもともとのフィールド
     */
    [K in Exclude<keyof T, keyof GetQueryType<T, Q>>]: T[K];
  } & {
    /**
     * クエリで指定されたリファレンスフィールド
     */
    [K in keyof T &
      keyof GetQueryType<T, Q> as K extends `${infer OriginalK}Ref`
      ? OriginalK
      : never]: T[K] extends infer SubQueryRef
      ? GetQueryType<T, Q>[K] extends infer SubQuery
        ? SubQueryRef extends DocumentReference<infer U>
          ? U extends DocumentData
            ? SubQuery extends
                | GraphQuery<U>
                | GraphQueryGenerator<DocumentReference<U>>
              ? GraphSnapshotQueryResult<
                  U,
                  DocumentReference<U>,
                  SubQuery,
                  false
                >
              : never
            : never
          : SubQueryRef extends CollectionReference<infer U> | Query<infer U>
          ? U extends DocumentData
            ? SubQuery extends GraphQuery<U> | GraphQueryGenerator<Query<U>>
              ? GraphSnapshotQueryResult<U, Query<U>, SubQuery, false>
              : never
            : never
          : never
        : never
      : never;
  } & {
    /**
     * クエリで追加されたエクストラフィールド
     */
    [K in Exclude<keyof GetQueryType<T, Q>, keyof T>]: GetQueryType<
      T,
      Q
    >[K] extends [infer SubQueryRef, infer SubQuery, infer GuaranteedToExist]
      ?
          | (undefined extends SubQueryRef ? undefined : never)
          | (GuaranteedToExist extends boolean
              ? NonNullable<SubQueryRef> extends DocumentReference<infer U>
                ? U extends DocumentData
                  ? SubQuery extends
                      | GraphQuery<U>
                      | GraphQueryGenerator<DocumentReference<U>>
                    ? GraphSnapshotQueryResult<
                        U,
                        DocumentReference<U>,
                        SubQuery,
                        GuaranteedToExist
                      >
                    : never
                  : never
                : NonNullable<SubQueryRef> extends
                    | CollectionReference<infer U>
                    | Query<infer U>
                ? U extends DocumentData
                  ? SubQuery extends
                      | GraphQuery<U>
                      | GraphQueryGenerator<Query<U>>
                    ? GraphSnapshotQueryResult<
                        U,
                        Query<U>,
                        SubQuery,
                        GuaranteedToExist
                      >
                    : never
                  : never
                : never
              : never)
      : never;
  },
  keyof PickOptional<T> | keyof PickOptional<GetQueryType<T, Q>>
>;

export type GraphSnapshotQueryResult<
  T extends DocumentData,
  Ref extends AnyReference<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>,
  GuaranteedToExist extends boolean
> = Ref extends DocumentReference<T>
  ? GraphDocumentSnapshotQueryResult<T, Q, GuaranteedToExist>
  : Ref extends Query<T>
  ? GraphQuerySnapshotQueryResult<T, Ref, Q>
  : never;

export type GraphDocumentSnapshotQueryResult<
  T extends DocumentData,
  Q extends GraphQuery<T> | AnyGraphQueryGenerator<T>,
  GuaranteedToExist extends boolean
> = true extends GuaranteedToExist
  ? GraphQueryDocumentSnapshotWithQueryResult<
      T,
      Expand<Omit<Expand<GraphQueryResult<T, Q>>, keyof T>>
    >
  : GraphDocumentSnapshotWithQueryResult<
      T,
      Expand<Omit<Expand<GraphQueryResult<T, Q>>, keyof T>>
    >;

export type GraphQuerySnapshotQueryResult<
  T extends DocumentData,
  Ref extends Query<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
> = (GraphQueryDocumentSnapshot<T> & {
  data: Expand<Omit<Expand<GraphQueryResult<T, Q>>, keyof T>>;
})[] &
  CollectionMetadata<T>;
