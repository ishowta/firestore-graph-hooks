import { generateSeed } from './seed';
import { field } from '../';
import { getKanbans, getProjects, getTodoLists, Project } from './schema';
import {
  DocumentReference,
  orderBy,
  query,
  Query,
  Timestamp,
} from 'firebase/firestore';
import { makeGraphListener } from '../src/GraphListener';
import Channel from '@nodeguy/channel';
import traverse from 'traverse';
import { GraphDocumentSnapshot } from '../src/types';

beforeAll(async () => {
  await generateSeed();
});

test('makeGraphListener', async () => {
  const queryChannel = Channel();

  makeGraphListener(
    query(getProjects(), orderBy('createdAt')),
    (project: GraphDocumentSnapshot<Project>) => ({
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
    (error) => {
      throw error;
    }
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
