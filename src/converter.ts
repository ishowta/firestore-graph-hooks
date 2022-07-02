import { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  AnyReference,
  DocumentData,
  GetQueryType,
  GraphDocumentSnapshot,
  GraphQuery,
  GraphQueryDocumentSnapshot,
  GraphQueryExtensionField,
  GraphQueryGenerator,
} from './types';

export const makeGraphQueryDocumentSnapshot = <T extends DocumentData>(
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

export const makeGraphDocumentSnapshot = <T extends DocumentData>(
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

export type SubQueryData<T extends DocumentData, Ref extends AnyReference<T>> =
  | {
      type: 'external';
      key: `${string}Ref`;
      ref: AnyReference<T> | null | undefined;
      query: GraphQuery<T> | GraphQueryGenerator<Ref>;
    }
  | {
      type: 'extension';
      key: string;
      ref: AnyReference<T> | undefined;
      query: GraphQuery<T> | GraphQueryGenerator<Ref>;
    };

export const makeQuery = <
  T extends DocumentData,
  Ref extends AnyReference<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
>(
  snapshot: GraphQueryDocumentSnapshot<T>,
  queryGenerator: Q
) => {
  return (
    typeof queryGenerator === 'function'
      ? queryGenerator(snapshot)
      : queryGenerator
  ) as GetQueryType<T, Ref, Q>;
};

export const isQueryKey = (
  snapshotKey: string
): snapshotKey is `${string}Ref` => {
  return snapshotKey.endsWith('Ref');
};

export const makeSubQuery = <
  T extends DocumentData,
  U extends DocumentData,
  URef extends AnyReference<U>,
  Q extends GraphQuery<U> | GraphQueryGenerator<URef> | GraphQueryExtensionField
>(
  snapshot: GraphQueryDocumentSnapshot<T>,
  subQueryKey: string,
  rawSubQuery: Q
): SubQueryData<U, URef> => {
  // フィールドがオプショナルフィールドである場合、実態が無いので拡張フィールドなのか外部キーなのかの区別がつかない。
  // 仕方がないので拡張キーは`[ref, query]`の形式であるとしてそれで判断する
  // documentKeys.includes(subSubQueryKey) &&
  const type = Array.isArray(rawSubQuery) ? 'extension' : 'external';
  switch (type) {
    case 'external': {
      const query = rawSubQuery as GraphQuery<U> | GraphQueryGenerator<URef>;
      if (isQueryKey(subQueryKey)) {
        return {
          key: subQueryKey,
          type: 'external',
          ref: snapshot.data[subQueryKey] as AnyReference<U> | null | undefined,
          query: query,
        };
      } else {
        throw new Error('Required Ref');
      }
    }

    case 'extension': {
      const [ref, query] = rawSubQuery as GraphQueryExtensionField;
      return {
        key: subQueryKey,
        type: 'extension',
        ref: ref as AnyReference<U>,
        query: query as GraphQuery<U>,
      };
    }
  }
};
