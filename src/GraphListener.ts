import {
  DocumentReference,
  FirestoreError,
  Query,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { GraphDocumentSnapshot, GraphQuery } from './types';
import {
  makeGraphDocumentSnapshot,
  makeGraphQueryDocumentSnapshot,
} from './converter';
import { getObjectLogger, insert } from './utils';
import { GraphQueryListener } from './GraphQueryListener';
import { Logger } from 'loglevel';

export interface GraphListener {
  ref: any;
  query: any;
  loading: boolean;

  /**
   * クエリに更新があるかどうかを返す
   */
  updateQuery(newQuery: GraphQuery<any>, dryRun: boolean): boolean;

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
  logger: Logger;

  constructor(
    ref: DocumentReference,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.logger = getObjectLogger(this, ref.path);
    this.loading = true;
    this.isSnapshotInitialized = false;
    this.ref = ref;
    this.query = query;
    this.queryListener = undefined;

    const onUpdate = (result: any) => {
      this.logger.debug('onUpdate', result);
      this.loading = false;
      handleUpdate(result);
    };

    this.logger.debug('init', (ref as any).path);

    this.listenerUnsubscriber = onSnapshot(ref, (rawSnapshot) => {
      const snapshot = makeGraphDocumentSnapshot(rawSnapshot);
      this.logger.debug('onSnapshot', snapshot);
      if (this.queryListener) {
        if (snapshot.exist) {
          this.queryListener.updateSnapshot(snapshot, false);
          onUpdate(this.queryListener.result);
        } else {
          onUpdate(undefined);
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

  updateQuery(newQuery: any, dryRun: boolean): boolean {
    this.logger.debug('updateQuery', newQuery, dryRun);
    if (!dryRun) {
      this.query = newQuery;
    }
    if (this.queryListener) {
      return this.queryListener.updateQuery(newQuery, dryRun);
    } else {
      return false;
    }
  }

  unsubscribe(): void {
    this.logger.debug('unsubscribe');
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
  logger: Logger;

  constructor(
    ref: Query,
    query: any,
    handleUpdate: (result: any) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.logger = getObjectLogger(this, (ref as any).path);
    this.loading = true;
    this.ref = ref;
    this.query = query;
    this.result = [];
    this.queryListeners = {};

    const onUpdate = () => {
      this.logger.debug('onUpdate');

      // FIXME: initializedではなくloadingを見るべきでは?
      this.logger.debug(
        `${
          Object.values(this.queryListeners).filter(
            (queryListener) => queryListener.isQueryInitialized
          ).length
        }/${this.result.length} initialized`
      );

      if (
        Object.keys(this.queryListeners).length === this.result.length &&
        Object.values(this.queryListeners).every(
          (queryListener) => queryListener.isQueryInitialized
        )
      ) {
        this.logger.debug('updated');
        this.loading = false;
        handleUpdate(this.result);
      }
    };

    const onUpdateWithResult = (
      path: string,
      result: GraphDocumentSnapshot<any>
    ) => {
      this.logger.debug('onUpdateWithResult', path, result);
      const docIndex = this.result.findIndex((res) => res.ref.path === path);
      if (docIndex === -1) {
        this.logger.debug('path not found, skip update.', this.result, path);
        return;
      }

      this.result[docIndex] = result;
      this.result = [...this.result];

      onUpdate();
    };

    this.logger.debug('init', (ref as any).path);

    this.listenerUnsubscriber = onSnapshot(ref, (querySnapshot) => {
      this.logger.debug('onSnapshot', querySnapshot);

      // set result
      for (const docChange of querySnapshot.docChanges()) {
        const snapshot = makeGraphQueryDocumentSnapshot(docChange.doc);
        switch (docChange.type) {
          case 'added': {
            this.result = insert(this.result, snapshot, docChange.newIndex);
            break;
          }
          case 'removed':
            this.result.splice(docChange.oldIndex, 1);
            break;
          case 'modified':
            if (docChange.oldIndex !== docChange.newIndex) {
              const temp = this.result.splice(docChange.oldIndex, 1)[0];
              this.result = insert(this.result, temp, docChange.newIndex);
            }
            break;
        }
      }

      // update snapshot
      for (const docChange of querySnapshot.docChanges()) {
        this.logger.debug('docChange', docChange.type);
        const snapshot = makeGraphQueryDocumentSnapshot(docChange.doc);
        switch (docChange.type) {
          case 'added': {
            this.queryListeners[docChange.doc.ref.path] =
              new GraphQueryListener(snapshot, query, (result) =>
                onUpdateWithResult(docChange.doc.ref.path, result)
              );
            break;
          }
          case 'removed':
            this.queryListeners[docChange.doc.ref.path].unsubscribe();
            break;
          case 'modified':
            this.queryListeners[docChange.doc.ref.path].updateSnapshot(
              snapshot,
              false
            );
            onUpdateWithResult(
              docChange.doc.ref.path,
              this.queryListeners[docChange.doc.ref.path].result
            );
            break;
        }
      }
      onUpdate();
    });
  }

  updateQuery(newQuery: any, dryRun: boolean): boolean {
    this.logger.debug('updateQuery', newQuery, dryRun);
    if (!dryRun) {
      this.query = newQuery;
    }
    if (this.queryListeners) {
      const hasUpdate = Object.values(this.queryListeners).some(
        (queryListener) => queryListener.updateQuery(newQuery, dryRun)
      );
      if (dryRun) return hasUpdate;
      if (hasUpdate) {
        this.loading = true;
      }
      return hasUpdate;
    } else {
      return false;
    }
  }

  unsubscribe(): void {
    this.logger.debug('unsubscribe');
    if (this.queryListeners) {
      Object.values(this.queryListeners).forEach((queryListener) =>
        queryListener.unsubscribe()
      );
    }
    this.listenerUnsubscriber();
  }
}
