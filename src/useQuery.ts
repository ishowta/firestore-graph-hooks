import { FirestoreError } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Expand } from './utils';
import { GraphQueryListener } from './GraphQueryListener';
import {
  AnyReference,
  GraphQuery,
  JoinedData,
  JoinedDataInner,
  RefToDoc,
} from './types';
import { getLogger } from 'loglevel';

const logger = getLogger('useQuery');

export function useRootQuery<Q extends GraphQuery<{}>>(
  query: Q
): [Expand<JoinedDataInner<{}, Q>> | undefined, boolean, Error | undefined] {
  const [value, setValue] = useState<Expand<JoinedDataInner<{}, Q>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError>();
  const rootListener = useRef<GraphQueryListener>();

  useEffect(() => {
    rootListener.current = new GraphQueryListener(
      { data: {}, id: '', ref: { path: '' } } as any,
      query,
      (result) => {
        logger.debug('onUpdate', result);
        setValue(result.data);
        setLoading(false);
      }
    );
    return () => {
      rootListener.current?.unsubscribe();
    };
  }, []);

  // dry run update query and get has loading
  const immediateLoading = useMemo(() => {
    if (!loading && rootListener.current) {
      return rootListener.current.updateQuery(query, true);
    }
    return loading;
  }, [query]);

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

export function useQuery<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(
  ref: Ref | undefined,
  query: Q
): [JoinedData<Ref, Q, false> | undefined, boolean, Error | undefined] {
  const [value, loading, error] = useRootQuery({
    base: field(ref, query),
  });

  return [value?.base, loading, error];
}

export function field<
  Ref extends AnyReference | undefined,
  Q extends GraphQuery<RefToDoc<NonNullable<Ref>>>,
  GuaranteedToExist extends boolean = false
>(
  ref: Ref,
  query: Q,
  guaranteedToExist?: GuaranteedToExist
): never extends Ref // FIXME: ?????
  ? [Ref, Q, GuaranteedToExist]
  : never {
  return [ref, query, (guaranteedToExist ?? false) as any]; // 妥協 具体的な型を指定されなければ矛盾は発生しない
}
