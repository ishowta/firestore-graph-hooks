import {
  DocumentReference,
  FirestoreError,
  Query,
  queryEqual,
  refEqual,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Expand } from './utils';
import { GraphListener, makeGraphListener } from './GraphListener';
import { GraphQueryListener } from './GraphQueryListener';
import {
  AnyReference,
  GraphQuery,
  GraphQueryDocumentSnapshot,
  JoinedData,
  JoinedDataInner,
  RefToDoc,
} from './types';
import loglevel, { getLogger } from 'loglevel';
import { apply, reg } from 'loglevel-plugin-prefix';

reg(loglevel);
apply(loglevel, {
  format(level, name, timestamp) {
    return `[${timestamp}] ${level} ${name}:`;
  },
});
const logger = getLogger('useQuery');

export function useRootQuery<Ref = {}, Q extends GraphQuery<{}> = {}>(
  query: Q
): [Expand<JoinedDataInner<{}, Q>> | undefined, boolean, Error | undefined] {
  const [value, setValue] = useState<Expand<JoinedDataInner<{}, Q>>>();
  const [error, setError] = useState<FirestoreError>();
  const rootListener = useRef<GraphQueryListener>();

  useEffect(() => {
    rootListener.current = new GraphQueryListener(
      { data: {}, id: '', ref: { path: '' } } as any,
      query,
      (result) => {
        logger.debug('onUpdate', result);
        setValue(result.data);
      }
    );
    return () => {
      rootListener.current?.unsubscribe();
    };
  }, []);

  const loading = useMemo(() => {
    if (rootListener.current) {
      return rootListener.current.updateQuery(query);
    }
    return true;
  }, [query]);

  return [value, loading, error];
}

export function useQuery<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(
  ref: Ref | undefined,
  query: Q
): [JoinedData<Ref, Q> | undefined, boolean, Error | undefined] {
  const [value, loading, error] = useRootQuery({
    base: ref ? field(ref, query) : undefined,
  });

  return [value?.base, loading, error];
}

export function field<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q] {
  return [ref, query];
}
