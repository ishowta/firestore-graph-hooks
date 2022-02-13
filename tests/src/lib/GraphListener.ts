import {
  DocumentReference,
  FirestoreError,
  Query,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { GraphDocumentSnapshot, GraphQuery } from "./types";
import {
  makeGraphDocumentSnapshot,
  makeGraphQueryDocumentSnapshot,
} from "./converter";
import { insert } from "./utils";
import { GraphQueryListener } from "./GraphQueryListener";

export interface GraphListener {
  ref: any;
  query: any;
  loading: boolean;

  /**
   * クエリを投げ、更新があるかどうかを返す
   */
  updateQuery(newQuery: GraphQuery<any>): boolean;

  /**
   * サブクエリの購読を止める
   */
  unsubscribe(): void;
}

export const makeGraphListener = (
  ref: DocumentReference | Query,
  query: any,
  handleUpdate: (result: any) => void,
  handleError: (error: FirestoreError) => void
): GraphListener => {
  if (ref instanceof Query) {
    return new GraphCollectionListener(ref, query, handleUpdate, handleError);
  } else {
    return new GraphDocumentListener(ref, query, handleUpdate, handleError);
  }
};

export class GraphDocumentListener implements GraphListener {
  ref: DocumentReference;
  listenerUnsubscriber: Unsubscribe;
  query: any;
  queryListener: GraphQueryListener | undefined;
  loading: boolean;
  isSnapshotInitialized: boolean;

  constructor(
    ref: DocumentReference,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.loading = true;
    this.isSnapshotInitialized = false;
    this.ref = ref;
    this.query = query;
    this.queryListener = undefined;

    const onUpdate = (result: any) => {
      this.loading = false;
      handleUpdate(result);
    };

    console.log(`set onSnapshot ${(ref as any).path}`);
    this.listenerUnsubscriber = onSnapshot(ref, (rawSnapshot) => {
      const snapshot = makeGraphDocumentSnapshot(rawSnapshot);
      if (this.queryListener) {
        if (snapshot.exist) {
          this.queryListener.updateSnapshot(snapshot);
        } else {
          this.queryListener.unsubscribe();
        }
      } else {
        if (snapshot.exist) {
          this.queryListener = new GraphQueryListener(
            snapshot,
            query,
            onUpdate
          );
        } else {
          onUpdate(undefined);
          this.loading = false;
        }
      }
      this.isSnapshotInitialized = true;
    });
  }

  updateQuery(newQuery: any): boolean {
    this.query = newQuery;
    if (this.queryListener) {
      const hasUpdate = this.queryListener.updateQuery(newQuery);
      if (hasUpdate) {
        this.loading = true;
      }
      return hasUpdate;
    } else {
      return false;
    }
  }

  unsubscribe(): void {
    if (this.queryListener) {
      this.queryListener.unsubscribe();
    }
    this.listenerUnsubscriber();
  }
}

export class GraphCollectionListener implements GraphListener {
  ref: Query;
  listenerUnsubscriber: Unsubscribe;
  query: any;
  queryListeners: Record<string, GraphQueryListener>;
  result: GraphDocumentSnapshot<any>[];
  loading: boolean;

  constructor(
    ref: Query,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.loading = true;
    this.ref = ref;
    this.query = query;
    this.result = [];
    this.queryListeners = {};

    const onUpdate = (path: string, result: GraphDocumentSnapshot<any>) => {
      const docIndex = this.result.findIndex((res) => res.ref.path === path);
      if (docIndex === -1) {
        return;
      }

      this.result[docIndex]["data"] = result;

      if (
        Object.values(this.queryListeners).every(
          (queryListener) => queryListener.isQueryInitialized
        )
      ) {
        console.log("update", ref, query);
        this.loading = false;
        handleUpdate(this.result);
      }
    };

    console.log(`set onSnapshot ${(ref as any).path}`);
    this.listenerUnsubscriber = onSnapshot(ref, (querySnapshot) => {
      for (const docChange of querySnapshot.docChanges()) {
        console.log(docChange.type);
        const snapshot = makeGraphQueryDocumentSnapshot(docChange.doc);
        switch (docChange.type) {
          case "added": {
            this.queryListeners[docChange.doc.ref.path] =
              new GraphQueryListener(snapshot, query, (result) =>
                onUpdate(docChange.doc.ref.path, result)
              );
            this.result = insert(this.result, snapshot, docChange.newIndex);
            break;
          }
          case "removed":
            this.queryListeners[docChange.doc.ref.path].unsubscribe();
            break;
          case "modified":
            this.queryListeners[docChange.doc.ref.path].updateSnapshot(
              snapshot
            );
            break;
        }
      }
    });
  }

  updateQuery(newQuery: any): boolean {
    this.query = newQuery;
    if (this.queryListeners) {
      const hasUpdate = Object.values(this.queryListeners).some(
        (queryListener) => queryListener.updateQuery(newQuery)
      );
      if (hasUpdate) {
        this.loading = true;
      }
      return hasUpdate;
    } else {
      return false;
    }
  }

  unsubscribe(): void {
    if (this.queryListeners) {
      Object.values(this.queryListeners).forEach((queryListener) =>
        queryListener.unsubscribe()
      );
    }
    this.listenerUnsubscriber();
  }
}
