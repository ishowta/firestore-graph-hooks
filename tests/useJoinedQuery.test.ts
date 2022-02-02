import {
  CollectionMetadata,
  DocumentMetadata,
  field,
  useQuery,
  useRootQuery,
  WithCollectionMetadata,
  WithMetadata,
} from "../useJoinedQuery";
import { assertType, Equal } from "./helper";
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
} from "./schema";

let [projects] = useQuery(getProjects(), (project) => ({
  ownerRef: (_user) => ({
    nowPlayingRef: (todo) => ({
      extraOnlyTestField: field(todo.__ref__, {}),
    }),
  }),
  currentRef: (kanban) => ({
    nextRef: {},
    todoLists: field(getTodoLists(kanban.__ref__), {}),
  }),
  kanbans: field(getKanbans(project.__ref__), {
    nextRef: {},
  }),
}));

let [query2] = useRootQuery({
  users: field(getUsers(), {}),
  projects: field(getProjects(), {}),
});

type ManuelaProject = typeof projects[number];
type ManuelaOwner = ManuelaProject["owner"];
type ManuelaKanban = ManuelaProject["kanbans"][number];

type ExpectProjectsType = CollectionMetadata<Project> &
  (DocumentMetadata<Project> &
    Project & {
      owner: DocumentMetadata<User> &
        User & {
          nowPlaying: DocumentMetadata<TODO> &
            TODO & {
              extraOnlyTestField: DocumentMetadata<TODO> & TODO;
            };
        };
      current: DocumentMetadata<Kanban> &
        Kanban & {
          next: (DocumentMetadata<Kanban> & Kanban) | null;
          todoLists: (DocumentMetadata<TODOList> & TODOList)[] &
            CollectionMetadata<TODOList>;
        };
      kanbans: CollectionMetadata<Kanban> &
        (DocumentMetadata<Kanban> &
          Kanban & {
            next: (DocumentMetadata<Kanban> & Kanban) | null;
          })[];
    })[];

type ExpectQuery2Type = {
  users: WithCollectionMetadata<User>;
  projects: WithCollectionMetadata<Project>;
};

assertType<Equal<typeof projects, ExpectProjectsType>>();
assertType<Equal<typeof query2, ExpectQuery2Type>>();
assertType<
  Equal<
    ManuelaKanban,
    WithMetadata<Kanban> & {
      next: WithMetadata<Kanban> | null;
    }
  >
>();
let expected: ExpectProjectsType = {} as any;
projects = expected;
expected = projects;

// query result <: original document
let firstOwner = projects[0].owner;
let firstKanban = projects[0].kanbans;
assertType<typeof projects extends Project[] ? true : false>();
assertType<typeof firstOwner extends User ? true : false>();
assertType<typeof firstKanban extends Kanban[] ? true : false>();
let _raw: Project[] = projects;
