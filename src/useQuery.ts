import {
  DocumentReference,
  FirestoreError,
  Query,
  queryEqual,
  refEqual,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { Expand } from "./utils";
import { GraphListener, makeGraphListener } from "./GraphListener";
import {
  AnyReference,
  GraphQuery,
  JoinedData,
  JoinedDataInner,
  RefToDoc,
} from "./types";
import loglevel, { getLogger } from "loglevel";
import { apply, reg } from "loglevel-plugin-prefix";

reg(loglevel);
apply(loglevel, {
  format(level, name, timestamp) {
    return `[${timestamp}] ${level} ${name}:`;
  },
});
const logger = getLogger("useQuery");

// ! old and not work
export function useRootQuery<Ref = {}, Q extends GraphQuery<{}> = {}>(
  _query: Q
): [Expand<JoinedDataInner<{}, Q>> | undefined, boolean, Error | undefined] {
  const [value, setValue] = useState<Expand<JoinedDataInner<{}, Q>>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError>();

  useEffect(() => {
    const query: any = _query;
    const result: any = {};
    const allKey: string[] = Object.keys(query);
    const allListener: Record<string, any> = {};
    for (const key of allKey) {
      const subQuery = query[key];
      allListener[key] = subQuery(
        (subResult: any) => {
          result[key] = subResult;
          if (Object.keys(result).length === allKey.length) {
            if (loading) setLoading(false);
            setValue(result);
          }
        },
        (error: FirestoreError) => {
          setError(error);
        }
      );
    }
  }, []);

  return [value, loading, error];
}

export function useQuery<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(
  ref: Ref,
  query: Q
): [JoinedData<Ref, Q> | undefined, boolean, Error | undefined] {
  const [{ value, loading }, setResult] = useState<{
    value: JoinedData<Ref, Q> | undefined;
    loading: boolean;
  }>({
    value: undefined,
    loading: true,
  });
  const [error, setError] = useState<FirestoreError>();
  const listener = useRef<GraphListener>();

  const createListener = () => {
    logger.debug("createListener", ref, query);
    listener.current = makeGraphListener(
      ref,
      query,
      (result) => {
        setResult({ value: result, loading: false });
      },
      () => {
        setError(error);
      }
    );
  };

  useEffect(() => {
    logger.debug("init listener");
    createListener();
  }, []);

  // check update query and determine loading state
  const currentRef = useRef(ref);
  const immediateLoading = useMemo(() => {
    if (listener.current == null) {
      return true;
    }
    logger.debug("check update query");
    const prevRef = currentRef.current;
    currentRef.current = ref;
    if (
      (prevRef instanceof DocumentReference &&
        ref instanceof DocumentReference &&
        refEqual(prevRef, ref)) ||
      (prevRef instanceof Query &&
        ref instanceof Query &&
        queryEqual(prevRef, ref))
    ) {
      // ref not changed
      logger.debug("ref not changed");
      if (listener.current.updateQuery(query)) {
        // query changed
        logger.debug("query changed");
        setResult(({ value }) => ({ value, loading: true }));
        return true;
      } else {
        // query not changed
        logger.debug("query not changed");
        return loading;
      }
    } else {
      // ref changed
      logger.debug("ref changed");
      listener.current.unsubscribe();
      createListener();
      return true;
    }
  }, [ref, query]);

  return [value, immediateLoading, error];
}

export function field<
  Ref extends AnyReference,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [Ref, Q] {
  return [ref, query];
}
