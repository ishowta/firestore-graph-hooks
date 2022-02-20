import {
  DocumentReference,
  QuerySnapshot,
  Query,
  SnapshotMetadata,
  CollectionReference,
} from 'firebase/firestore';
import { PickOptional, SelectiveOptional, Expand } from './utils';

export type DocumentData = Record<string, unknown>;

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

export type GetQueryType<
  Ref extends AnyReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>> | GraphQueryGenerator<Ref>
> = Q extends GraphQuery<RefToDoc<Ref>>
  ? Q
  : Q extends GraphQueryGenerator<Ref>
  ? ReturnType<Q> extends GraphQuery<RefToDoc<Ref>>
    ? ReturnType<Q>
    : never
  : never;

export type GraphQueryResult<
  Ref extends AnyReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>> | GraphQueryGenerator<Ref>
> = Ref extends
  | DocumentReference<infer T>
  | CollectionReference<infer T>
  | Query<infer T>
  ? T extends DocumentData
    ? SelectiveOptional<
        {
          /**
           * ドキュメントのもともとのフィールド
           */
          [K in Exclude<keyof T, keyof GetQueryType<Ref, Q>>]: T[K];
        } & {
          /**
           * クエリで指定されたリファレンスフィールド
           */
          [K in keyof T &
            keyof GetQueryType<Ref, Q> as K extends `${infer OriginalK}Ref`
            ? OriginalK
            : never]: T[K] extends infer SubQueryRef
            ? GetQueryType<Ref, Q>[K] extends infer SubQuery
              ? SubQueryRef extends DocumentReference<infer U>
                ? U extends DocumentData
                  ? SubQuery extends
                      | GraphQuery<U>
                      | GraphQueryGenerator<DocumentReference<U>>
                    ? GraphSnapshotQueryResult<
                        DocumentReference<U>,
                        SubQuery,
                        false
                      >
                    : never
                  : never
                : SubQueryRef extends
                    | CollectionReference<infer U>
                    | Query<infer U>
                ? U extends DocumentData
                  ? SubQuery extends
                      | GraphQuery<U>
                      | GraphQueryGenerator<Query<U>>
                    ? GraphSnapshotQueryResult<Query<U>, SubQuery, false>
                    : never
                  : never
                : never
              : never
            : never;
        } & {
          /**
           * クエリで追加されたエクストラフィールド
           */
          [K in Exclude<keyof GetQueryType<Ref, Q>, keyof T>]: GetQueryType<
            Ref,
            Q
          >[K] extends [
            infer SubQueryRef,
            infer SubQuery,
            infer GuaranteedToExist
          ]
            ? GuaranteedToExist extends boolean
              ? NonNullable<SubQueryRef> extends DocumentReference<infer U>
                ? U extends DocumentData
                  ? SubQuery extends
                      | GraphQuery<U>
                      | GraphQueryGenerator<DocumentReference<U>>
                    ? GraphSnapshotQueryResult<
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
                        Query<U>,
                        SubQuery,
                        GuaranteedToExist
                      >
                    : never
                  : never
                : never
              : never
            : never;
        },
        keyof PickOptional<T> | keyof PickOptional<GetQueryType<Ref, Q>>
      >
    : never
  : never;

export type GraphSnapshotQueryResult<
  Ref extends AnyReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>> | GraphQueryGenerator<Ref>,
  GuaranteedToExist extends boolean
> = Ref extends
  | DocumentReference<infer T>
  | CollectionReference<infer T>
  | Query<infer T>
  ? T extends DocumentData
    ? Ref extends DocumentReference<DocumentData>
      ? {} extends Omit<GraphQueryResult<Ref, Q>, keyof T>
        ? true extends GuaranteedToExist
          ? GraphQueryDocumentSnapshot<T>
          : GraphDocumentSnapshot<T>
        : (true extends GuaranteedToExist
            ? GraphQueryDocumentSnapshot<T>
            : GraphDocumentSnapshot<T>) & {
            data: Expand<Omit<GraphQueryResult<Ref, Q>, keyof T>>;
          }
      : Ref extends Query<DocumentData>
      ? {} extends Omit<GraphQueryResult<Ref, Q>, keyof T>
        ? WithCollectionMetadata<T>
        : (GraphQueryDocumentSnapshot<T> & {
            data: Expand<Omit<GraphQueryResult<Ref, Q>, keyof T>>;
          })[] &
            CollectionMetadata<T>
      : never
    : never
  : never;
