import {
  CollectionMetadata,
  DocumentMetadata,
  field,
  useQuery,
  useRootQuery,
  WithCollectionMetadata,
  WithMetadata,
} from "./lib/useQuery";
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

const types = () => {
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

  return [projects, query2] as const;
};

type ManuelaProjects = NonNullable<ReturnType<typeof types>[0]>;
type ManuelaOwner = ManuelaProjects[number]["owner"];
type ManuelaKanban = ManuelaProjects[number]["kanbans"][number];

type Query2ResultType = NonNullable<ReturnType<typeof types>[1]>;

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

assertType<Equal<ManuelaProjects, ExpectProjectsType>>();
assertType<Equal<Query2ResultType, ExpectQuery2Type>>();
assertType<
  Equal<
    ManuelaKanban,
    WithMetadata<Kanban> & {
      next: WithMetadata<Kanban> | null;
    }
  >
>();
// let expected: ExpectProjectsType = {} as any;
// projects = expected;
// expected = projects;

// query result <: original document
assertType<ManuelaProjects extends Project[] ? true : false>();
assertType<ManuelaProjects[number]["owner"] extends User ? true : false>();
assertType<
  ManuelaProjects[number]["kanbans"] extends Kanban[] ? true : false
>();
// let _raw: Project[] = projects;
