import {
  CollectionMetadata,
  GraphDocumentSnapshot,
  WithCollectionMetadata,
} from "firestore-graph-hooks/src/types";
import {
  field,
  useQuery,
  useRootQuery,
} from "firestore-graph-hooks/src/useQuery";
import { assertType, Equal } from "firestore-graph-hooks/src/utils";
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
        extraOnlyTestField: field(todo.ref, {}),
      }),
    }),
    kanbans: field(getKanbans(project.ref), {
      nextRef: {},
    }),
  }));

  let [query2] = useRootQuery({
    users: field(getUsers(), {}),
    projects: field(getProjects(), {}),
  });

  let expected: ExpectProjectsType = {} as any;
  projects = expected;
  expected = projects;

  return [projects, query2] as const;
};

type ManuelaProjects = NonNullable<ReturnType<typeof types>[0]>;
type ManuelaOwner = ManuelaProjects[number]["owner"];
type ManuelaKanban = ManuelaProjects[number]["kanbans"][number];

type Query2ResultType = NonNullable<ReturnType<typeof types>[1]>;

type ExpectProjectsType = CollectionMetadata<Project> &
  (GraphDocumentSnapshot<Project> & {
    owner: GraphDocumentSnapshot<User> & {
      nowPlaying: GraphDocumentSnapshot<TODO> & {
        extraOnlyTestField: GraphDocumentSnapshot<TODO>;
      };
    };
    kanbans: CollectionMetadata<Kanban> &
      (GraphDocumentSnapshot<Kanban> & {
        next: GraphDocumentSnapshot<Kanban> | null;
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
    GraphDocumentSnapshot<Kanban> & {
      next: GraphDocumentSnapshot<Kanban> | null;
    }
  >
>();

// query result <: original document
assertType<ManuelaProjects extends Project[] ? true : false>();
assertType<ManuelaProjects[number]["owner"] extends User ? true : false>();
assertType<
  ManuelaProjects[number]["kanbans"] extends Kanban[] ? true : false
>();
// let _raw: Project[] = projects;
