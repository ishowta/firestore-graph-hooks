import {
  DocumentReference,
  FirestoreError,
  Query,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import {
  AnyReference,
  DocumentData,
  GraphDocumentSnapshotQueryResult,
  GraphQuery,
  GraphQueryDocumentSnapshot,
  GraphQueryGenerator,
  GraphQuerySnapshotQueryResult,
  GraphSnapshotQueryResult,
} from './types';
import {
  makeGraphDocumentSnapshot,
  makeGraphQueryDocumentSnapshot,
} from './converter';
import { getObjectLogger, insert } from './utils';
import {
  GraphQueryListener,
  GraphQueryListenerOutput,
} from './GraphQueryListener';
import { Logger } from 'loglevel';

export interface GraphListener<
  T extends DocumentData,
  Ref extends AnyReference<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
> {
  ref: Ref;
  query: GraphQuery<T>;
  loading: boolean;

  /**
   * クエリに更新があるかどうかを返す
   */
  updateQuery(newQuery: Q, dryRun: boolean): boolean;

  /**
   * サブクエリの購読を止める
   */
  unsubscribe(): void;
}

export const makeGraphListener = <
  T extends DocumentData,
  Ref extends AnyReference<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
>(
  ref: Ref,
  queryGenerator: Q,
  handleUpdate: (
    result: GraphSnapshotQueryResult<T, Ref, Q, false> | undefined
  ) => void,
  handleError: (error: FirestoreError) => void
): GraphListener<T, DocumentReference<T> | Query<T>, Q> => {
  if (ref instanceof Query) {
    return new GraphCollectionListener<T, Query<T>, Q>(
      ref as Query<T>,
      queryGenerator,
      handleUpdate as (
        result: GraphSnapshotQueryResult<T, Query<T>, Q, false> | undefined
      ) => void,
      handleError
    );
  } else if (ref instanceof DocumentReference) {
    return new GraphDocumentListener<T, DocumentReference<T>, Q>(
      ref as DocumentReference<T>,
      queryGenerator,
      handleUpdate as (
        result:
          | GraphSnapshotQueryResult<T, DocumentReference<T>, Q, false>
          | undefined
      ) => void,
      handleError
    );
  } else {
    throw new Error('Unreachable');
  }
};

export class GraphDocumentListener<
  T extends DocumentData,
  Ref extends DocumentReference<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
> implements GraphListener<T, Ref, Q>
{
  ref: Ref;
  listenerUnsubscriber: Unsubscribe;
  query: Q;
  queryListener: GraphQueryListener<T, Ref, Q> | undefined;
  loading: boolean;
  isSnapshotInitialized: boolean;
  logger: Logger;

  constructor(
    ref: Ref,
    query: Q,
    handleUpdate: (
      result: GraphDocumentSnapshotQueryResult<T, Q, false>
    ) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.logger = getObjectLogger(this, (ref as any).path);
    this.loading = true;
    this.isSnapshotInitialized = false;
    this.ref = ref;
    this.query = query;
    this.queryListener = undefined;

    const onUpdate = (
      result: GraphDocumentSnapshotQueryResult<T, Q, false>
    ) => {
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
          onUpdate(this.queryListener.result as any);
        } else {
          onUpdate(snapshot);
        }
      } else {
        if (snapshot.exist) {
          this.queryListener = new GraphQueryListener(
            snapshot,
            query,
            onUpdate,
            handleError
          );
        } else {
          onUpdate(snapshot);
          this.loading = false;
        }
      }
      this.isSnapshotInitialized = true;
    });
  }

  updateQuery(newQuery: Q, dryRun: boolean): boolean {
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

export class GraphCollectionListener<
  T extends DocumentData,
  Ref extends Query<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
> implements GraphListener<T, Ref, Q>
{
  ref: Ref;
  listenerUnsubscriber: Unsubscribe;
  query: Q;
  queryListeners: Record<string, GraphQueryListener<T, Ref, Q>>;
  result: GraphQueryDocumentSnapshot<T>[]; // GraphQueryListenerOutput<T, Ref, Q>[]; // GraphSnapshotQueryResult<T, Ref, Q, false>
  loading: boolean;
  logger: Logger;

  constructor(
    ref: Ref,
    query: Q,
    handleUpdate: (result: GraphQuerySnapshotQueryResult<T, Ref, Q>) => void,
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

      this.logger.debug(
        `${
          Object.values(this.queryListeners).filter(
            (queryListener) => queryListener.isQueryInitialized
          ).length
        }/${this.result.length} initialized`
      );

      if (this.isCompletedQueryResult(this.result)) {
        this.logger.debug('updated');
        this.loading = false;
        handleUpdate(this.result);
      }
    };

    const onUpdateWithResult = (
      path: string,
      result: GraphQueryListenerOutput<T, Q>
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
              new GraphQueryListener(
                snapshot,
                query,
                (result) => onUpdateWithResult(docChange.doc.ref.path, result),
                handleError
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
              this.queryListeners[docChange.doc.ref.path].result as any
            );
            break;
        }
      }
      onUpdate();
    });
  }

  // FIXME: initializedではなくloadingを見ないといけない
  private isCompletedQueryResult(
    result: GraphQueryDocumentSnapshot<T>[]
  ): result is GraphQuerySnapshotQueryResult<T, Ref, Q> {
    return (
      Object.keys(this.queryListeners).length === result.length &&
      Object.values(this.queryListeners).every(
        (queryListener) => queryListener.isQueryInitialized
      )
    );
  }

  updateQuery(newQuery: Q, dryRun: boolean): boolean {
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
