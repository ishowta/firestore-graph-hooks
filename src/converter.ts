import {
  DocumentReference,
  DocumentSnapshot,
  Query,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  GraphDocumentSnapshot,
  GraphQuery,
  GraphQueryDocumentSnapshot,
} from "./types";

export const makeGraphQueryDocumentSnapshot = <T>(
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

export const makeGraphDocumentSnapshot = <T>(
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

export const makeSubQuery = (
  snapshot: GraphQueryDocumentSnapshot<any>,
  subQueryKey: string,
  subQueryFactory: any
): {
  type: "external" | "extension";
  ref: DocumentReference | Query;
  query: GraphQuery<any>;
} => {
  // フィールドがオプショナルフィールドである場合、実態が無いので拡張フィールドなのか外部キーなのかの区別がつかない。
  // 仕方がないので拡張キーは`[ref, query]`の形式であるとしてそれで判断する
  // documentKeys.includes(subSubQueryKey) &&
  const type = Array.isArray(subQueryFactory) ? "extension" : "external";
  switch (type) {
    case "external":
      return {
        type: "external",
        ref: snapshot.data[subQueryKey],
        query: subQueryFactory,
      };
    case "extension":
      return {
        type: "extension",
        ref: subQueryFactory[0],
        query: subQueryFactory[1],
      };
  }
};
