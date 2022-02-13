import {
  DocumentReference,
  Query,
  queryEqual,
  refEqual,
} from "firebase/firestore";
import { union } from "lodash-es";
import {
  GraphDocumentSnapshot,
  GraphQuery,
  GraphQueryDocumentSnapshot,
} from "./types";
import { makeSubQuery } from "./converter";
import { GraphListener, makeGraphListener } from "./GraphListener";

export class GraphQueryListener {
  currentSnapshot: GraphQueryDocumentSnapshot<any>;
  queryFactory: GraphQuery<any>;
  result: GraphDocumentSnapshot<any> | undefined;
  subQueryListeners: Record<string, GraphListener>;
  isQueryInitialized: boolean;
  handleUpdate: (result: any) => void;

  constructor(
    snapshot: GraphQueryDocumentSnapshot<any>,
    queryFactory: GraphQuery<any>,
    handleUpdate: (result: any) => void
  ) {
    console.log("[GraphQueryListener]");
    this.currentSnapshot = snapshot;
    this.queryFactory = queryFactory;
    this.subQueryListeners = {};
    this.isQueryInitialized = false;
    this.handleUpdate = handleUpdate;

    const query = this.makeQuery(snapshot);
    this.result = snapshot;
    for (const [subQueryKey, subQuery] of Object.entries(query) as [any, any]) {
      if (subQueryKey in snapshot.data) {
        this.createSubQueryListener(snapshot, subQueryKey, subQuery);
      }
    }
  }

  onUpdate() {
    if (
      Object.values(this.subQueryListeners).every(
        (subQueryListener) => subQueryListener.loading
      )
    ) {
      this.isQueryInitialized = true;
      this.handleUpdate(this.result);
    }
  }

  makeQuery(snapshot: GraphDocumentSnapshot<any>) {
    return typeof this.queryFactory === "function"
      ? this.queryFactory(snapshot)
      : this.queryFactory;
  }

  createSubQueryListener(
    snapshot: GraphQueryDocumentSnapshot<any>,
    subQueryKey: string,
    subQueryFactory: GraphQuery<any>
  ) {
    const subQuery = makeSubQuery(snapshot, subQueryKey, subQueryFactory);

    console.log(subQuery);
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
      case "external":
        if ((subQueryKey as string).endsWith("Ref")) {
          subQueryKeyName = (subQueryKey as string).substring(
            0,
            (subQueryKey as string).length - 3
          );
        } else {
          throw new Error(
            "Unexpected. field key without endsWith `Ref` is not supported"
          );
        }
        break;
      case "extension":
        subQueryKeyName = subQueryKey;
        break;
    }

    this.subQueryListeners[subQueryKey] = makeGraphListener(
      subQuery.ref,
      subQuery.query,
      (result: any) => {
        this.result!["data"][subQueryKeyName] = result;
        this.onUpdate();
      },
      () => {}
    );
  }

  updateSubQueryListener(
    subQueryKey: string,
    prevSnapshot: GraphQueryDocumentSnapshot<any>,
    prevSubQueryFactory: any,
    newSnapshot: GraphQueryDocumentSnapshot<any>,
    newSubQueryFactory: any
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
    // compare ref
    if (prevSubQuery.type !== newSubQuery.type) {
      throw new Error("Unexpected Error. query type does not match");
    }

    if (prevSubQuery.ref == null && newSubQuery.ref == null) {
      // ref not exist ever
      return false;
    } else if (prevSubQuery.ref != null && newSubQuery.ref == null) {
      // ref removed
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      return true;
    } else if (prevSubQuery.ref == null && newSubQuery.ref != null) {
      // ref created
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery.query);
      return true;
    } else if (
      (prevSubQuery.ref instanceof DocumentReference &&
        newSubQuery.ref instanceof Query) ||
      (prevSubQuery.ref instanceof Query &&
        newSubQuery.ref instanceof DocumentReference)
    ) {
      // ref type changed
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery.query);
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
      this.subQueryListeners[subQueryKey].unsubscribe();
      if (this.result) {
        delete this.result.data[subQueryKey];
      }
      this.createSubQueryListener(newSnapshot, subQueryKey, newSubQuery.query);
      return true;
    } else {
      // ref not changed
      return this.subQueryListeners[subQueryKey].updateQuery(newSubQuery.query);
    }
  }

  updateSnapshot(newSnapshot: GraphQueryDocumentSnapshot<any>) {
    return this.update(newSnapshot, this.queryFactory);
  }

  updateQuery(newQueryFactory: GraphQuery<any>) {
    return this.update(this.currentSnapshot, newQueryFactory);
  }

  update(
    newSnapshot: GraphQueryDocumentSnapshot<any>,
    newQueryFactory: GraphQuery<any>
  ): boolean {
    console.log("modified");
    let hasUpdate = false;
    const prevSnapshot = this.currentSnapshot;
    const prevQuery = this.makeQuery(this.currentSnapshot);
    this.currentSnapshot = newSnapshot;
    this.queryFactory = newQueryFactory;
    const newQuery = this.makeQuery(this.currentSnapshot);

    // - calc snapshot diff
    //   - update result
    //   - calc query diff for each snapshot diff
    //     - update subQuery
    const prevSnapshotKeys = Object.keys(prevSnapshot);
    const newSnapshotKeys = Object.keys(newSnapshot);
    for (const snapshotKey of union(prevSnapshotKeys, newSnapshotKeys)) {
      if (
        snapshotKey in prevSnapshotKeys &&
        !(snapshotKey in newSnapshotKeys)
      ) {
        // key removed
        hasUpdate = true;
        if (this.result && snapshotKey in this.result["data"]) {
          delete this.result["data"][snapshotKey];
        }
        if (this.subQueryListeners && snapshotKey in this.subQueryListeners) {
          this.subQueryListeners[snapshotKey].unsubscribe();
          delete this.subQueryListeners[snapshotKey];
        }
      }
      if (
        !(snapshotKey in prevSnapshotKeys) &&
        snapshotKey in newSnapshotKeys
      ) {
        // key created
        hasUpdate = true;
        if (this.result) {
          this.result["data"][snapshotKey] = newSnapshot.data[snapshotKey];
        }
        if (snapshotKey in newQuery) {
          this.createSubQueryListener(newSnapshot, snapshotKey, newQuery);
        }
      }
      if (snapshotKey in prevSnapshotKeys && snapshotKey in newSnapshotKeys) {
        // key not changed
        if (this.result) {
          this.result["data"][snapshotKey] = newSnapshot.data[snapshotKey];
        }
        if (!(snapshotKey in prevQuery) && !(snapshotKey in newQuery)) {
          // subQuery not exist
        }
        if (snapshotKey in prevQuery && !(snapshotKey in newQuery)) {
          // subQuery removed
          hasUpdate = true;
          this.subQueryListeners[snapshotKey].unsubscribe();
          delete this.subQueryListeners[snapshotKey];
        }
        if (!(snapshotKey in prevQuery) && snapshotKey in newQuery) {
          // subQuery created
          hasUpdate = true;
          this.createSubQueryListener(newSnapshot, snapshotKey, newQuery);
        }
        if (snapshotKey in prevQuery && snapshotKey in newQuery) {
          // subQuery may modified
          const subQueryHasUpdate = this.updateSubQueryListener(
            snapshotKey,
            prevSnapshot,
            prevQuery,
            newSnapshot,
            newQuery
          );
          if (subQueryHasUpdate) {
            hasUpdate = true;
          }
        }
      }
    }
    return hasUpdate;
  }

  unsubscribe() {
    Object.values(this.subQueryListeners).forEach((queryListener) =>
      queryListener.unsubscribe()
    );
  }
}
