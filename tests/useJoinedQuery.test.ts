import { DocumentReference, Timestamp } from "firebase/firestore";
import {
  CollectionMetadata,
  DocumentMetadata,
  extraField,
  _useJoinedQuery,
} from "../useJoinedQuery";
import { assertType, Equal } from "./helper";
import {
  getKanbans,
  getProjects,
  getTodoLists,
  Kanban,
  Project,
  TODO,
  TODOList,
  User,
} from "./schema";

let [projects] = _useJoinedQuery(getProjects(), (project) => ({
  ownerRef: (_user) => ({
    nowPlayingRef: (todo) => ({
      extraOnlyTestField: extraField(todo.__ref__, {}),
    }),
  }),
  currentRef: (kanban) => ({
    nextRef: {},
    todoLists: extraField(getTodoLists(kanban.__ref__), {}),
  }),
  kanbans: extraField(getKanbans(project.__ref__), {
    nextRef: {},
  }),
}));

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

assertType<Equal<typeof projects, ExpectProjectsType>>();
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
