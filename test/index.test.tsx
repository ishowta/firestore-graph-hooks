import { generateSeed } from './seed';
import { field } from '../';
import { getKanbans, getProjects, getTodoLists } from './schema';
import { getApp } from './firebase';
import {
  DocumentReference,
  Firestore,
  orderBy,
  query,
  Query,
  Timestamp,
} from 'firebase/firestore';
import { makeGraphListener } from '../src/GraphListener';
import Channel from '@nodeguy/channel';
import traverse from 'traverse';

let firestore: Firestore;

beforeAll(async () => {
  firestore = (await getApp()).firestore as any;
  await generateSeed(firestore);
});

test('makeGraphListener', async () => {
  const queryChannel = Channel();

  makeGraphListener(
    query(getProjects(firestore), orderBy('createdAt')),
    (project: any) => ({
      ownerRef: {
        nowPlayingRef: {},
      },
      kanbans: field(
        query(getKanbans(project.ref), orderBy('createdAt')),
        (kanban) => ({
          todoLists: field(
            query(getTodoLists(kanban.ref), orderBy('createdAt')),
            {}
          ),
        })
      ),
    }),
    (result) => {
      queryChannel.push(result);
    },
    () => {}
  );

  const res = await queryChannel.shift();

  expect(
    traverse(res).map(function (x) {
      if (x instanceof DocumentReference || x instanceof Query)
        this.update('[Ref]');
      if (this.key === 'id') this.update('[ID]');
      if (x instanceof Timestamp) this.update('[Timestamp]');
    })
  ).toMatchSnapshot();
});
