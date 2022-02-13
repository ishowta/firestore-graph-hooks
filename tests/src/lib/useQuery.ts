import {
  DocumentReference,
  FirestoreError,
  Query,
  queryEqual,
  refEqual,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { Expand } from "../helper";
import { GraphListener, makeGraphListener } from "./GraphListener";
import {
  AnyReference,
  GraphQuery,
  JoinedData,
  JoinedDataInner,
  RefToDoc,
} from "./types";

// ! old and not work
function useRootQuery<Ref = {}, Q extends GraphQuery<{}> = {}>(
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
    createListener();
  }, []);

  // update query and determine loading state
  const currentRef = useRef(ref);
  const immediateLoading = useMemo(() => {
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
      if (listener.current?.updateQuery(query)) {
        // query changed
        setResult(({ value }) => ({ value, loading: true }));
        return true;
      } else {
        // query not changed
        return loading;
      }
    } else {
      // ref changed
      if (listener.current) {
        listener.current.unsubscribe();
        createListener();
      }
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
