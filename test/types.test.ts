/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/rules-of-hooks */

import {
  CollectionMetadata,
  GraphDocumentSnapshot,
  GraphDocumentSnapshotWithQueryResult,
  GraphQueryDocumentSnapshot,
  GraphQueryDocumentSnapshotWithQueryResult,
  WithCollectionMetadata,
} from '../src/types';
import { field, useQuery, useRootQuery } from '../src/useQuery';
import { assertType, Equal } from '../src/utils';
import {
  getKanbanOrder,
  getKanbans,
  getProjects,
  getTODOListOrder,
  getTodoLists,
  getTODOOrder,
  getTodos,
  getUsers,
  Kanban,
  Project,
  TODO,
  User,
} from './schema';

const types = () => {
  const [test] = useQuery(getProjects(), (project) => ({}));

  let [projects] = useQuery(getProjects(), (project) => ({
    ownerRef: (_user) => ({
      nowPlayingRef: (todo) => ({
        extraOnlyTestField: field(todo.ref, {}),
      }),
    }),
    kanbans: field(getKanbans(project.ref), {}),
  }));

  const [query2] = useRootQuery({
    users: field(getUsers(), {}),
    projects: field(getProjects(), {}),
  });

  const [q3] = useQuery(getProjects(), (project) => ({
    kanbanOrder: field(getKanbanOrder(project.ref), {}),
    kanbans: field(getKanbans(project.ref), (kanban) => ({
      todoListOrder: field(getTODOListOrder(kanban.ref), {}),
      todoLists: field(getTodoLists(kanban.ref), (todoList) => ({
        todoOrder: field(getTODOOrder(todoList.ref), {}),
        todos: field(getTodos(todoList.ref), {}),
      })),
    })),
  }));

  projects = expected;
  expected = projects;

  const raw: GraphQueryDocumentSnapshot<Project>[] = projects;

  return [projects, query2, q3] as const;
};

export type Q3Project = NonNullable<ReturnType<typeof types>[2]>[number];
export type Q3Kanban = Q3Project['data']['kanbans'][number];
export type Q3TODOList = Q3Kanban['data']['todoLists'][number];
export type Q3TODO = Q3TODOList['data']['todos'][number];

type SampleProjects = NonNullable<ReturnType<typeof types>[0]>;
type SampleOwner = SampleProjects[number]['data']['owner'];
type SampleOwnerNP = NonNullable<
  SampleProjects[number]['data']['owner']['data']
>['nowPlaying'];
type SampleKanban = SampleProjects[number]['data']['kanbans'][number];

type Query2ResultType = NonNullable<ReturnType<typeof types>[1]>;

type ExpectSampleProjects = CollectionMetadata<Project> &
  GraphQueryDocumentSnapshotWithQueryResult<
    Project,
    {
      owner: GraphDocumentSnapshotWithQueryResult<
        User,
        {
          nowPlaying: GraphDocumentSnapshotWithQueryResult<
            TODO,
            {
              extraOnlyTestField: GraphDocumentSnapshotWithQueryResult<
                TODO,
                {}
              >;
            }
          >;
        }
      >;
      kanbans: CollectionMetadata<Kanban> &
        GraphQueryDocumentSnapshotWithQueryResult<Kanban, {}>[];
    }
  >[];
type ExpectSampleOwner = ExpectSampleProjects[number]['data']['owner'];
type ExpectSampleOwnerNP = NonNullable<
  ExpectSampleProjects[number]['data']['owner']['data']
>['nowPlaying'];
type ExpectSampleKanban =
  ExpectSampleProjects[number]['data']['kanbans'][number];

declare let expected: ExpectSampleProjects;

type ExpectQuery2Type = {
  users: WithCollectionMetadata<User>;
  projects: WithCollectionMetadata<Project>;
};

test('useQuery return type', () => {
  assertType<Equal<SampleProjects, ExpectSampleProjects>>();
  assertType<Equal<SampleOwner, ExpectSampleOwner>>();
  assertType<Equal<SampleOwnerNP, ExpectSampleOwnerNP>>();
  assertType<Equal<SampleKanban, ExpectSampleKanban>>();
  assertType<Equal<Query2ResultType, ExpectQuery2Type>>();
  assertType<Equal<SampleKanban, GraphQueryDocumentSnapshot<Kanban>>>();
});

test('useQuery return type subtyping', () => {
  // query result <: original document
  assertType<
    SampleProjects extends GraphQueryDocumentSnapshot<Project>[] ? true : false
  >();
  assertType<
    NonNullable<SampleProjects[number]['data']['owner']['data']> extends User
      ? true
      : false
  >();
  assertType<
    SampleProjects[number]['data']['kanbans'] extends GraphQueryDocumentSnapshot<Kanban>[]
      ? true
      : false
  >();
});
