import {
  DocumentData,
  DocumentReference,
  Query,
  queryEqual,
  refEqual,
} from 'firebase/firestore';
import { union } from 'lodash-es';
import {
  GraphDocumentSnapshot,
  GraphQuery,
  GraphQueryDocumentSnapshot,
} from './types';
import { makeSubQuery } from './converter';
import { GraphListener, makeGraphListener } from './GraphListener';
import { Logger } from 'loglevel';
import { getObjectLogger } from './utils';

export class GraphQueryListener {
  currentSnapshot: GraphQueryDocumentSnapshot<any>;
  queryFactory: GraphQuery<any>;
  result: GraphDocumentSnapshot<any>;
  subQueryListeners: Record<string, GraphListener>;
  isQueryInitialized: boolean;
  handleUpdate: (result: any) => void;
  logger: Logger;

  constructor(
    snapshot: GraphQueryDocumentSnapshot<any>,
    queryFactory: GraphQuery<any>,
    handleUpdate: (result: any) => void
  ) {
    this.logger = getObjectLogger(this, snapshot.ref.path);
    this.currentSnapshot = snapshot;
    this.queryFactory = queryFactory;
    this.subQueryListeners = {};
    this.isQueryInitialized = false;
    this.handleUpdate = handleUpdate;

    const query = this.makeQuery(snapshot, queryFactory);

    this.logger.debug('init', snapshot, query);

    this.result = snapshot;

    if (Object.keys(query).length === 0) {
      this.logger.debug('empty query, return.');
      this.isQueryInitialized = true;
      handleUpdate(this.result);
      return;
    }

    for (const [subQueryKey, subQueryFactory] of Object.entries(query) as [
      any,
      any
    ]) {
      const subQuery = makeSubQuery(snapshot, subQueryKey, subQueryFactory);
      this.createSubQueryListener(snapshot, subQueryKey, subQuery);
    }
    this.onUpdate();
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

    if (
      Object.values(this.subQueryListeners).every(
        (subQueryListener) => !subQueryListener.loading
      )
    ) {
      this.logger.debug('updated');
      this.isQueryInitialized = true;
      this.result.data = { ...this.result.data };
      this.handleUpdate(this.result);
    }
  }

  private makeQuery(
    snapshot: GraphDocumentSnapshot<any>,
    queryFactory: GraphQuery<any>
  ) {
    return typeof queryFactory === 'function'
      ? queryFactory(snapshot)
      : queryFactory;
  }

  private createSubQueryListener(
    snapshot: GraphQueryDocumentSnapshot<any>,
    subQueryKey: string,
    subQuery: {
      type: 'external' | 'extension';
      ref: DocumentReference<DocumentData> | Query<DocumentData>;
      query: GraphQuery<any>;
    }
  ) {
    this.logger.debug(
      'createSubQueryListener',
      snapshot,
      subQueryKey,
      subQuery
    );

    if (subQuery.ref == null) {
      return;
    }
    if (
      !(
        subQuery.ref instanceof DocumentReference ||
        subQuery.ref instanceof Query
      )
    ) {
      throw new Error(`Unreachable. Expect ref, get ${subQuery.ref}.`);
    }
    let subQueryKeyName: string;
    switch (subQuery.type) {
      case 'external':
        if ((subQueryKey as string).endsWith('Ref')) {
          subQueryKeyName = (subQueryKey as string).substring(
            0,
            (subQueryKey as string).length - 3
          );
        } else {
          throw new Error(
            'Unexpected. field key without endsWith `Ref` is not supported'
          );
        }
        break;
      case 'extension':
        subQueryKeyName = subQueryKey;
        break;
    }

    this.subQueryListeners[subQueryKey] = makeGraphListener(
      subQuery.ref,
      subQuery.query,
      (result: any) => {
        this.result!['data'][subQueryKeyName] = result;
        this.onUpdate();
      },
      () => {}
    );
  }

  private updateSubQueryListener(
    subQueryKey: string,
    prevSnapshot: GraphQueryDocumentSnapshot<any>,
    prevSubQueryFactory: any,
    newSnapshot: GraphQueryDocumentSnapshot<any>,
    newSubQueryFactory: any,
    dryRun: boolean
  ): boolean {
    const prevSubQuery = makeSubQuery(
      prevSnapshot,
      subQueryKey,
      prevSubQueryFactory
    );
    const newSubQuery = makeSubQuery(
      newSnapshot,
      subQueryKey,
      newSubQueryFactory
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
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery);
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
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery);
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
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery);
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

  updateSnapshot(
    newSnapshot: GraphQueryDocumentSnapshot<any>,
    dryRun: boolean
  ) {
    if (!dryRun) {
      this.result = {
        ...this.result,
        ...newSnapshot,
      };
    }
    this.logger.debug('updateSnapshot', newSnapshot, this.result, dryRun);
    return this.update(newSnapshot, this.queryFactory, true, dryRun);
  }

  updateQuery(newQueryFactory: GraphQuery<any>, dryRun: boolean) {
    this.logger.debug('updateQuery', newQueryFactory, dryRun);
    return this.update(this.currentSnapshot, newQueryFactory, false, dryRun);
  }

  private update(
    newSnapshot: GraphQueryDocumentSnapshot<any>,
    newQueryFactory: GraphQuery<any>,
    stillHasUpdate: boolean,
    dryRun: boolean
  ): boolean {
    let hasUpdate = stillHasUpdate;
    const prevSnapshot = this.currentSnapshot;
    const prevQuery = this.makeQuery(this.currentSnapshot, this.queryFactory);
    const newQuery = this.makeQuery(newSnapshot, newQueryFactory);
    if (!dryRun) {
      this.currentSnapshot = newSnapshot;
      this.queryFactory = newQueryFactory;
    }
    this.logger.debug('update', prevSnapshot, newSnapshot, prevQuery, newQuery);

    // check snapshot keys for update snapshot and external field
    // - calc snapshot diff
    //   - update result
    //   - calc subQuery diff for each snapshot diff
    //     - update subQuery
    const prevSnapshotKeys = Object.keys(prevSnapshot.data);
    const newSnapshotKeys = Object.keys(newSnapshot.data);
    const allSnapshotKeys = union(prevSnapshotKeys, newSnapshotKeys);
    for (const snapshotKey of allSnapshotKeys) {
      if (
        prevSnapshotKeys.includes(snapshotKey) &&
        !newSnapshotKeys.includes(snapshotKey)
      ) {
        // key removed
        this.logger.debug('key removed', snapshotKey);
        hasUpdate = true;
        if (dryRun) return hasUpdate;
        if (this.result && snapshotKey in this.result['data']) {
          delete this.result['data'][snapshotKey];
        }
        if (this.subQueryListeners && snapshotKey in this.subQueryListeners) {
          this.subQueryListeners[snapshotKey].unsubscribe();
          delete this.subQueryListeners[snapshotKey];
        }
      }
      if (
        !prevSnapshotKeys.includes(snapshotKey) &&
        newSnapshotKeys.includes(snapshotKey)
      ) {
        // key created
        this.logger.debug('key created', snapshotKey);
        hasUpdate = true;
        if (dryRun) return hasUpdate;
        if (this.result) {
          this.result['data'][snapshotKey] = newSnapshot.data[snapshotKey];
        }
        if (snapshotKey in newQuery) {
          const subQuery = makeSubQuery(newSnapshot, snapshotKey, newQuery);
          this.createSubQueryListener(newSnapshot, snapshotKey, subQuery);
        }
      }
      if (
        prevSnapshotKeys.includes(snapshotKey) &&
        newSnapshotKeys.includes(snapshotKey)
      ) {
        // key not changed
        this.logger.debug('key not changed', snapshotKey);
        if (!dryRun && this.result) {
          this.result['data'][snapshotKey] = newSnapshot.data[snapshotKey];
        }
        if (!(snapshotKey in prevQuery) && !(snapshotKey in newQuery)) {
          // subQuery not exist
          this.logger.debug('subQuery not exist', snapshotKey);
        }
        if (snapshotKey in prevQuery && !(snapshotKey in newQuery)) {
          // subQuery removed
          this.logger.debug('subQuery removed', snapshotKey);
          hasUpdate = true;
          if (dryRun) return hasUpdate;
          this.subQueryListeners[snapshotKey].unsubscribe();
          delete this.subQueryListeners[snapshotKey];
        }
        if (!(snapshotKey in prevQuery) && snapshotKey in newQuery) {
          // subQuery created
          this.logger.debug('subQuery created', snapshotKey);
          hasUpdate = true;
          if (dryRun) return hasUpdate;
          const subQuery = makeSubQuery(newSnapshot, snapshotKey, newQuery);
          this.createSubQueryListener(newSnapshot, snapshotKey, subQuery);
        }
        if (snapshotKey in prevQuery && snapshotKey in newQuery) {
          // subQuery may modified
          this.logger.debug('subQuery may modified', snapshotKey);
          const subQueryHasUpdate = this.updateSubQueryListener(
            snapshotKey,
            prevSnapshot,
            (prevQuery as any)[snapshotKey],
            newSnapshot,
            (newQuery as any)[snapshotKey],
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
      if (allSnapshotKeys.includes(subQueryKey)) {
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
        if (this.result && subQueryKey in this.result['data']) {
          delete this.result['data'][subQueryKey];
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
          this.createSubQueryListener(newSnapshot, subQueryKey, subQuery);
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
          this.createSubQueryListener(newSnapshot, subQueryKey, subQuery);
        }
        if (subQueryKey in prevQuery && subQueryKey in newQuery) {
          // subQuery may modified
          this.logger.debug('subQuery may modified', subQueryKey);
          const subQueryHasUpdate = this.updateSubQueryListener(
            subQueryKey,
            prevSnapshot,
            (prevQuery as any)[subQueryKey],
            newSnapshot,
            (newQuery as any)[subQueryKey],
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
