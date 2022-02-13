/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/rules-of-hooks */

import { Firestore } from 'firebase/firestore';
import {
  CollectionMetadata,
  GraphDocumentSnapshot,
  GraphQueryDocumentSnapshot,
  WithCollectionMetadata,
} from '../src/types';
import { field, useQuery, useRootQuery } from '../src/useQuery';
import { assertType, Equal } from '../src/utils';
import {
  getKanbans,
  getProjects,
  getTodoLists,
  getUsers,
  Kanban,
  Project,
  TODO,
  TODOList,
  User,
} from './schema';

const types = () => {
  let firestore: Firestore = {} as any;
  let [projects] = useQuery(getProjects(), (project) => ({
    ownerRef: (_user) => ({
      nowPlayingRef: (todo) => ({
        extraOnlyTestField: field(todo.ref, {}),
      }),
    }),
    kanbans: field(getKanbans(project.ref), {}),
  }));

  let [query2] = useRootQuery({
    users: field(getUsers(), {}),
    projects: field(getProjects(), {}),
  });

  let expected: ExpectProjectsType = {} as any;
  projects = expected;
  expected = projects;

  let raw: GraphQueryDocumentSnapshot<Project>[] = projects;

  return [projects, query2] as const;
};

type ManuelaProjects = NonNullable<ReturnType<typeof types>[0]>;
type ManuelaOwner = ManuelaProjects[number]['data']['owner'];
type ManuelaKanban = ManuelaProjects[number]['data']['kanbans'][number];

type Query2ResultType = NonNullable<ReturnType<typeof types>[1]>;

type ExpectProjectsType = CollectionMetadata<Project> &
  (GraphQueryDocumentSnapshot<Project> & {
    data: {
      owner: GraphDocumentSnapshot<User> & {
        data: {
          nowPlaying: GraphDocumentSnapshot<TODO> & {
            data: {
              extraOnlyTestField: GraphDocumentSnapshot<TODO>;
            };
          };
        };
      };
      kanbans: CollectionMetadata<Kanban> &
        (GraphQueryDocumentSnapshot<Kanban> & {
          data: {};
        })[];
    };
  })[];

type ExpectQuery2Type = {
  users: WithCollectionMetadata<User>;
  projects: WithCollectionMetadata<Project>;
};

test('useQuery return type', () => {
  assertType<Equal<ManuelaProjects, ExpectProjectsType>>();
  assertType<Equal<Query2ResultType, ExpectQuery2Type>>();
  assertType<Equal<ManuelaKanban, GraphQueryDocumentSnapshot<Kanban>>>();
});

test('useQuery return type subtyping', () => {
  // query result <: original document
  assertType<
    ManuelaProjects extends GraphQueryDocumentSnapshot<Project>[] ? true : false
  >();
  assertType<
    ManuelaProjects[number]['data']['owner']['data'] extends User ? true : false
  >();
  assertType<
    ManuelaProjects[number]['data']['kanbans'] extends GraphQueryDocumentSnapshot<Kanban>[]
      ? true
      : false
  >();
});
