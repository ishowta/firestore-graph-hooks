import {
  DocumentData,
  DocumentReference,
  FirestoreError,
  Query,
  queryEqual,
  refEqual,
} from 'firebase/firestore';
import { union } from 'lodash-es';
import {
  AnyGraphQueryGenerator,
  AnyReference,
  GetQueryType,
  GraphDocumentSnapshotQueryResult,
  GraphQuery,
  GraphQueryDocumentSnapshot,
  GraphQueryExtensionField,
  GraphQueryGenerator,
  GraphQueryResult,
} from './types';
import { isQueryKey, makeQuery, makeSubQuery, SubQueryData } from './converter';
import { GraphListener, makeGraphListener } from './GraphListener';
import { Logger } from 'loglevel';
import { Expand, getObjectLogger } from './utils';

export type GraphQueryListenerOutput<
  T extends DocumentData,
  Q extends GraphQuery<T> | AnyGraphQueryGenerator<T>
> = GraphDocumentSnapshotQueryResult<T, Q, true>;

export class GraphQueryListener<
  T extends DocumentData,
  Ref extends AnyReference<T>,
  Q extends GraphQuery<T> | GraphQueryGenerator<Ref>
> {
  currentSnapshot: GraphQueryDocumentSnapshot<T>;
  queryGenerator: Q;
  result: GraphQueryDocumentSnapshot<T>;
  subQueryListeners: Record<
    string,
    GraphListener<
      DocumentData,
      AnyReference<DocumentData>,
      GraphQuery<DocumentData> | GraphQueryGenerator<AnyReference<DocumentData>>
    >
  >;
  isQueryInitialized: boolean;
  handleUpdate: (result: GraphQueryListenerOutput<T, Q>) => void;
  handleError: (error: FirestoreError) => void;
  logger: Logger;

  constructor(
    snapshot: GraphQueryDocumentSnapshot<T>,
    queryGenerator: Q,
    handleUpdate: (result: GraphQueryListenerOutput<T, Q>) => void,
    handleError: (error: FirestoreError) => void
  ) {
    this.logger = getObjectLogger(this, snapshot.ref.path);
    this.currentSnapshot = snapshot;
    this.queryGenerator = queryGenerator;
    this.subQueryListeners = {};
    this.isQueryInitialized = false;
    this.handleUpdate = handleUpdate;
    this.handleError = handleError;

    const query = makeQuery<T, Ref, Q>(snapshot, queryGenerator);

    this.logger.debug('init', snapshot, query);

    this.result = snapshot;

    if (this.isEmptyQueryResult(snapshot, query)) {
      this.logger.debug('empty query, return.');
      this.isQueryInitialized = true;
      handleUpdate(snapshot);
      return;
    }

    for (const [subQueryKey, subQueryGenerator] of Object.entries(query)) {
      const subQuery = makeSubQuery(
        snapshot,
        subQueryKey,
        subQueryGenerator as
          | GraphQuery<DocumentData>
          | GraphQueryGenerator<AnyReference<DocumentData>>
          | GraphQueryExtensionField
      );
      this.createSubQueryListener(snapshot, subQuery, handleError);
    }
    this.onUpdate();
  }

  private isEmptyQueryResult(
    result: typeof this.result,
    query: GetQueryType<T, Q>
  ): result is GraphQueryListenerOutput<T, Q> {
    return Object.keys(query).length === 0;
  }

  private isCompletedQueryResult(
    result: typeof this.result,
    subQueryListeners: typeof this.subQueryListeners
  ): result is GraphQueryListenerOutput<T, Q> {
    return Object.values(subQueryListeners).every(
      (subQueryListener) => !subQueryListener.loading
    );
  }

  private onUpdate() {
    this.logger.debug('onUpdate', this.result, this.subQueryListeners);
    this.logger.debug(
      `${
        Object.values(this.subQueryListeners).filter(
          (subQueryListener) => !subQueryListener.loading
        ).length
      }/${Object.values(this.subQueryListeners).length} initialized`
    );

    if (this.isCompletedQueryResult(this.result, this.subQueryListeners)) {
      this.logger.debug('updated');
      if (this.isQueryInitialized === false) this.isQueryInitialized = true;
      this.result.data = { ...this.result.data };
      this.handleUpdate(this.result);
    }
  }

  private static renameSnapshotKeyToQueryKey = <K extends `${string}Ref`>(
    snapshotKey: K
  ) => {
    if (!isQueryKey(snapshotKey)) {
      throw new Error(
        'Unexpected. field key without endsWith `Ref` is not supported'
      );
    }
    return snapshotKey.substring(
      0,
      snapshotKey.length - 3
    ) as K extends `${infer S}Ref` ? S : never;
  };

  private createSubQueryListener<
    U extends DocumentData,
    URef extends AnyReference<U>
  >(
    snapshot: GraphQueryDocumentSnapshot<T>,
    subQuery: SubQueryData<U, URef>,
    handleError: (error: FirestoreError) => void
  ) {
    this.logger.debug('createSubQueryListener', snapshot, subQuery);

    if (subQuery.ref == null) {
      return;
    }
    let subQueryKeyName: string;
    switch (subQuery.type) {
      case 'external':
        subQueryKeyName = GraphQueryListener.renameSnapshotKeyToQueryKey(
          subQuery.key
        );
        break;
      case 'extension':
        subQueryKeyName = subQuery.key;
        break;
    }

    this.subQueryListeners[subQuery.key] = makeGraphListener(
      subQuery.ref,
      subQuery.query,
      (result) => {
        this.result.data[subQueryKeyName as keyof T] = result as any;
        this.result = { ...this.result, data: { ...this.result.data } };
        this.onUpdate();
      },
      handleError
    );
  }

  private updateSubQueryListener<
    U extends DocumentData,
    URef extends AnyReference<U>,
    SubQ extends
      | GraphQuery<U>
      | GraphQueryGenerator<URef>
      | GraphQueryExtensionField
  >(
    subQueryKey: string,
    prevSnapshot: GraphQueryDocumentSnapshot<T>,
    prevSubQueryGenerator: SubQ,
    newSnapshot: GraphQueryDocumentSnapshot<T>,
    newSubQueryGenerator: SubQ,
    dryRun: boolean
  ): boolean {
    const prevSubQuery = makeSubQuery(
      prevSnapshot,
      subQueryKey,
      prevSubQueryGenerator
    );
    const newSubQuery = makeSubQuery(
      newSnapshot,
      subQueryKey,
      newSubQueryGenerator
    );

    this.logger.debug(
      'updateSubQueryListener',
      subQueryKey,
      prevSnapshot,
      prevSubQuery,
      newSnapshot,
      newSubQuery,
      dryRun
    );

    // compare ref
    if (prevSubQuery.type !== newSubQuery.type) {
      throw new Error('Unexpected Error. query type does not match');
    }

    if (prevSubQuery.ref == null && newSubQuery.ref == null) {
      // ref not exist ever
      this.logger.debug('ref not exist ever');
      return false;
    } else if (prevSubQuery.ref != null && newSubQuery.ref == null) {
      // ref removed
      this.logger.debug('ref removed');
      if (dryRun) return true;
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      return true;
    } else if (prevSubQuery.ref == null && newSubQuery.ref != null) {
      // ref created
      this.logger.debug('ref created');
      if (dryRun) return true;
      this.createSubQueryListener(newSnapshot, newSubQuery, this.handleError);
      return true;
    } else if (
      (prevSubQuery.ref instanceof DocumentReference &&
        newSubQuery.ref instanceof Query) ||
      (prevSubQuery.ref instanceof Query &&
        newSubQuery.ref instanceof DocumentReference)
    ) {
      // ref type changed
      this.logger.debug('ref type changed');
      if (dryRun) return true;
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      this.createSubQueryListener(newSnapshot, newSubQuery, this.handleError);
      return true;
    } else if (
      (prevSubQuery.ref instanceof DocumentReference &&
        newSubQuery.ref instanceof DocumentReference &&
        !refEqual(prevSubQuery.ref, newSubQuery.ref)) ||
      (prevSubQuery.ref instanceof Query &&
        newSubQuery.ref instanceof Query &&
        !queryEqual(prevSubQuery.ref, newSubQuery.ref))
    ) {
      // ref changed
      this.logger.debug('ref changed');
      if (dryRun) return true;
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      this.createSubQueryListener(newSnapshot, newSubQuery, this.handleError);
      return true;
    } else {
      // ref not changed
      this.logger.debug('ref not changed');
      return this.subQueryListeners[subQueryKey].updateQuery(
        newSubQuery.query,
        dryRun
      );
    }
  }

  updateSnapshot(newSnapshot: GraphQueryDocumentSnapshot<T>, dryRun: boolean) {
    if (!dryRun) {
      this.result = {
        ...this.result,
        ...newSnapshot,
        data: {
          ...this.result.data,
          ...newSnapshot.data,
        },
      };
    }
    this.logger.debug('updateSnapshot', newSnapshot, this.result, dryRun);
    return this.update(newSnapshot, this.queryGenerator, true, dryRun);
  }

  updateQuery(newQueryGenerator: Q, dryRun: boolean) {
    this.logger.debug('updateQuery', newQueryGenerator, dryRun);
    return this.update(this.currentSnapshot, newQueryGenerator, false, dryRun);
  }

  private update(
    newSnapshot: GraphQueryDocumentSnapshot<T>,
    newQueryGenerator: Q,
    stillHasUpdate: boolean,
    dryRun: boolean
  ): boolean {
    let hasUpdate = stillHasUpdate;
    const prevSnapshot = this.currentSnapshot;
    const prevQuery = makeQuery(this.currentSnapshot, this.queryGenerator);
    const newQuery = makeQuery(newSnapshot, newQueryGenerator);
    if (!dryRun) {
      this.currentSnapshot = newSnapshot;
      this.queryGenerator = newQueryGenerator;
    }
    this.logger.debug('update', prevSnapshot, newSnapshot, prevQuery, newQuery);

    // check snapshot keys for update snapshot and external field
    // - calc snapshot diff
    //   - update result
    //   - calc subQuery diff for each snapshot diff
    //     - update subQuery
    const prevSnapshotRefKeys = Object.keys(prevSnapshot.data).filter(
      isQueryKey
    );
    const newSnapshotRefKeys = Object.keys(newSnapshot.data).filter(isQueryKey);
    const allSnapshotRefKeys = union(prevSnapshotRefKeys, newSnapshotRefKeys);
    for (const _snapshotRefKey of allSnapshotRefKeys) {
      const snapshotRefKey = _snapshotRefKey as keyof T &
        typeof _snapshotRefKey;
      if (
        prevSnapshotRefKeys.includes(snapshotRefKey) &&
        !newSnapshotRefKeys.includes(snapshotRefKey)
      ) {
        // key removed
        this.logger.debug('key removed', snapshotRefKey);
        hasUpdate = true;
        if (dryRun) return hasUpdate;
        if (this.result && snapshotRefKey in this.result.data) {
          delete this.result.data[snapshotRefKey];
          this.result.data = { ...this.result.data };
        }
        if (
          this.subQueryListeners &&
          snapshotRefKey in this.subQueryListeners
        ) {
          this.subQueryListeners[snapshotRefKey].unsubscribe();
          delete this.subQueryListeners[snapshotRefKey];
        }
      }
      if (
        !prevSnapshotRefKeys.includes(snapshotRefKey) &&
        newSnapshotRefKeys.includes(snapshotRefKey)
      ) {
        // key created
        this.logger.debug('key created', snapshotRefKey);
        hasUpdate = true;
        if (dryRun) return hasUpdate;
        if (this.result) {
          this.result.data[snapshotRefKey] = newSnapshot.data[snapshotRefKey];
          this.result.data = { ...this.result.data };
        }
        if (snapshotRefKey in newQuery) {
          const subQuery = makeSubQuery(newSnapshot, snapshotRefKey, newQuery);
          this.createSubQueryListener(newSnapshot, subQuery, this.handleError);
        }
      }
      if (
        prevSnapshotRefKeys.includes(snapshotRefKey) &&
        newSnapshotRefKeys.includes(snapshotRefKey)
      ) {
        // key not changed
        this.logger.debug('key not changed', snapshotRefKey);
        if (!dryRun && this.result) {
          this.result.data[snapshotRefKey] = newSnapshot.data[snapshotRefKey];
          this.result.data = { ...this.result.data };
        }
        if (!(snapshotRefKey in prevQuery) && !(snapshotRefKey in newQuery)) {
          // subQuery not exist
          this.logger.debug('subQuery not exist', snapshotRefKey);
        }
        if (snapshotRefKey in prevQuery && !(snapshotRefKey in newQuery)) {
          // subQuery removed
          this.logger.debug('subQuery removed', snapshotRefKey);
          hasUpdate = true;
          if (dryRun) return hasUpdate;
          this.subQueryListeners[snapshotRefKey].unsubscribe();
          delete this.subQueryListeners[snapshotRefKey];
        }
        if (!(snapshotRefKey in prevQuery) && snapshotRefKey in newQuery) {
          // subQuery created
          this.logger.debug('subQuery created', snapshotRefKey);
          hasUpdate = true;
          if (dryRun) return hasUpdate;
          const subQuery = makeSubQuery(newSnapshot, snapshotRefKey, newQuery);
          this.createSubQueryListener(newSnapshot, subQuery, this.handleError);
        }
        if (snapshotRefKey in prevQuery && snapshotRefKey in newQuery) {
          // subQuery may modified
          this.logger.debug('subQuery may modified', snapshotRefKey);
          const subQueryHasUpdate = this.updateSubQueryListener(
            snapshotRefKey,
            prevSnapshot,
            prevQuery[snapshotRefKey as string] as
              | GraphQuery<DocumentData>
              | GraphQueryGenerator<AnyReference<DocumentData>>,
            newSnapshot,
            newQuery[snapshotRefKey as string] as
              | GraphQuery<DocumentData>
              | GraphQueryGenerator<AnyReference<DocumentData>>,
            dryRun
          );
          if (subQueryHasUpdate) {
            hasUpdate = true;
            if (dryRun) return hasUpdate;
          }
        }
      }
    }

    // check query keys for update extension field
    // - calc query keys diff
    //   - update extension result
    //   - calc subQuery diff for each query key diff
    //     - update subQuery
    const prevSubQueryKeys = Object.keys(prevQuery);
    const newSubQueryKeys = Object.keys(newQuery);
    const allSubQueryKeys = union(prevSubQueryKeys, newSubQueryKeys);
    for (const subQueryKey of allSubQueryKeys) {
      // skip not extension key
      const allSnapshotRefKeysAsString: string[] = allSnapshotRefKeys;
      if (allSnapshotRefKeysAsString.includes(subQueryKey)) {
        continue;
      }

      if (
        prevSubQueryKeys.includes(subQueryKey) &&
        !newSubQueryKeys.includes(subQueryKey)
      ) {
        // key removed
        this.logger.debug('key removed', subQueryKey);
        hasUpdate = true;
        if (dryRun) return hasUpdate;
        if (this.result && subQueryKey in this.result.data) {
          delete this.result.data[subQueryKey];
          this.result.data = { ...this.result.data };
        }
        if (this.subQueryListeners && subQueryKey in this.subQueryListeners) {
          this.subQueryListeners[subQueryKey].unsubscribe();
          delete this.subQueryListeners[subQueryKey];
        }
      }
      if (
        !prevSubQueryKeys.includes(subQueryKey) &&
        newSubQueryKeys.includes(subQueryKey)
      ) {
        // key created
        this.logger.debug('key created', subQueryKey);
        hasUpdate = true;
        if (dryRun) return hasUpdate;
        if (subQueryKey in newQuery) {
          const subQuery = makeSubQuery(newSnapshot, subQueryKey, newQuery);
          this.createSubQueryListener(newSnapshot, subQuery, this.handleError);
        }
      }
      if (
        prevSubQueryKeys.includes(subQueryKey) &&
        newSubQueryKeys.includes(subQueryKey)
      ) {
        // key not changed
        this.logger.debug('key not changed', subQueryKey);
        if (!(subQueryKey in prevQuery) && !(subQueryKey in newQuery)) {
          // subQuery not exist
          this.logger.debug('subQuery not exist', subQueryKey);
        }
        if (subQueryKey in prevQuery && !(subQueryKey in newQuery)) {
          // subQuery removed
          this.logger.debug('subQuery removed', subQueryKey);
          hasUpdate = true;
          if (dryRun) return hasUpdate;
          this.subQueryListeners[subQueryKey].unsubscribe();
          delete this.subQueryListeners[subQueryKey];
        }
        if (!(subQueryKey in prevQuery) && subQueryKey in newQuery) {
          // subQuery created
          this.logger.debug('subQuery created', subQueryKey);
          hasUpdate = true;
          if (dryRun) return hasUpdate;
          const subQuery = makeSubQuery(newSnapshot, subQueryKey, newQuery);
          this.createSubQueryListener(newSnapshot, subQuery, this.handleError);
        }
        if (subQueryKey in prevQuery && subQueryKey in newQuery) {
          // subQuery may modified
          this.logger.debug('subQuery may modified', subQueryKey);
          const subQueryHasUpdate = this.updateSubQueryListener(
            subQueryKey,
            prevSnapshot,
            prevQuery[subQueryKey] as
              | GraphQuery<DocumentData>
              | GraphQueryGenerator<AnyReference<DocumentData>>,
            newSnapshot,
            newQuery[subQueryKey] as
              | GraphQuery<DocumentData>
              | GraphQueryGenerator<AnyReference<DocumentData>>,
            dryRun
          );
          if (subQueryHasUpdate) {
            hasUpdate = true;
            if (dryRun) return hasUpdate;
          }
        }
      }
    }

    this.logger.debug('hasUpdate: ', hasUpdate);

    return hasUpdate;
  }

  unsubscribe() {
    this.logger.debug('unsubscribe');
    Object.values(this.subQueryListeners).forEach((queryListener) =>
      queryListener.unsubscribe()
    );
  }
}
