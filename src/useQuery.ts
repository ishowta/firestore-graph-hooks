import {
  CollectionReference,
  DocumentReference,
  FirestoreError,
  Query,
  refEqual,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Expand } from './utils';
import { GraphQueryListener } from './GraphQueryListener';
import {
  AnyReference,
  DocumentData,
  GraphQuery,
  GraphSnapshotQueryResult,
  GraphQueryResult,
  RefToDoc,
  GraphQueryGenerator,
  GraphQueryDocumentSnapshot,
} from './types';
import { getLogger } from 'loglevel';

export type {
  GraphQuery,
  GraphQueryGenerator,
  GraphQueryResult,
  GraphDocumentSnapshot,
  GraphQueryDocumentSnapshot,
  GraphSnapshotQueryResult,
} from './types';

const logger = getLogger('useQuery');

type Root = {};

export function useRootQuery<Q extends GraphQuery<Root>>(
  query: Q
): [Expand<GraphQueryResult<Root, Q>> | undefined, boolean, Error | undefined] {
  const [value, setValue] = useState<Expand<GraphQueryResult<Root, Q>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError>();
  const rootListener =
    useRef<GraphQueryListener<Root, DocumentReference<Root>, Q>>();

  /**
   * initialize rootListener {@link GraphQueryListener}
   */
  useEffect(() => {
    rootListener.current = new GraphQueryListener(
      {
        data: {},
        id: '',
        ref: { path: '' },
      } as GraphQueryDocumentSnapshot<Root>,
      query,
      (result) => {
        logger.debug('onUpdate', result);
        setValue(
          () => result.data as unknown as Expand<GraphQueryResult<Root, Q>> // FIXME: typing
        );
        setLoading(false);
      },
      (error) => {
        setError(error);
      }
    );
    return () => {
      rootListener.current?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * dry run {@link rootListener.current.updateQuery update query} when query may changed, and get has loading
   */
  const immediateLoading = useMemo(() => {
    if (!loading && rootListener.current) {
      return rootListener.current.updateQuery(query, true);
    }
    return loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /**
   * watch query updates
   */
  useEffect(() => {
    if (rootListener.current) {
      if (rootListener.current.updateQuery(query, false)) {
        logger.debug('queryChanged');
        setLoading(true);
      }
    }
  }, [query]);

  return [value, immediateLoading, error];
}

export type UseQueryResult<
  Ref extends AnyReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>> | GraphQueryGenerator<Ref>,
  GuaranteedToExist extends boolean
> = Ref extends
  | DocumentReference<infer T>
  | CollectionReference<infer T>
  | Query<infer T>
  ? T extends DocumentData
    ? GraphSnapshotQueryResult<T, Ref, Q, GuaranteedToExist>
    : never
  : never;

export function useQuery<
  Ref extends AnyReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>> | GraphQueryGenerator<Ref>
>(
  ref: Ref | undefined,
  query: Q
): [UseQueryResult<Ref, Q, false> | undefined, boolean, Error | undefined] {
  // Memorize ref
  // eslint-disable-next-line no-var
  const [_ref, _setRef] = useState(ref);
  useEffect(() => {
    if (ref == null || _ref == null || !refEqual(ref as any, _ref as any)) {
      _setRef(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  // Memorize rootQuery
  const rootQuery = useMemo(() => {
    return {
      base: field(_ref, query),
    };
  }, [query, _ref]);

  const [value, loading, error] = useRootQuery(rootQuery);

  const immediateLoading = useMemo(() => {
    if (!loading) {
      return ref == null || _ref == null || refEqual(ref as any, _ref as any);
    }
    return loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, loading]);

  return [value?.base, immediateLoading, error];
}

export function field<
  Ref extends AnyReference<DocumentData>,
  Q extends GraphQuery<RefToDoc<Ref>> | GraphQueryGenerator<Ref>,
  GuaranteedToExist extends boolean = false
>(
  ref: Ref | undefined,
  query: Q,
  guaranteedToExist?: GuaranteedToExist
): [Ref | undefined, Q, GuaranteedToExist] {
  return [ref, query, (guaranteedToExist ?? false) as GuaranteedToExist]; // Compromise. No contradiction unless a type is specified
}
