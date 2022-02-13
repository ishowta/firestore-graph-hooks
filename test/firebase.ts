import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

export const getApp = async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-firebase-graph-hooks',
  });
  const app = testEnv.authenticatedContext('admin');
  const firestore = app.firestore();
  return {
    app,
    firestore,
  };
};
