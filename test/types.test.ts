/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/rules-of-hooks */

import {
  CollectionMetadata,
  GraphDocumentSnapshot,
  GraphQueryDocumentSnapshot,
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

declare let expected: ExpectProjectsType;

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
