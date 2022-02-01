import {
  DocumentReference,
  DocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import {
  CollectionMetadata,
  Data,
  DocumentMetadata,
  extraField,
  GraphQuery,
  ID,
  PickRefField,
  _useJoinedQuery,
} from "../useJoinedQuery";
import { assertType, Equal } from "./helper";
import { getKanbans, getProjects, Kanban, Project, TODO, User } from "./schema";

type T2 = Exclude<keyof User, PickRefField<User>>;

const [projects] = _useJoinedQuery(getProjects(), (project) => ({
  ownerRef: {
    nowPlayingRef: {},
  },
  currentRef: {
    next: {},
  },
  kanbans: extraField(getKanbans(project.__ref__), {
    next: {},
  }),
}));

type ExpectProjectsType = CollectionMetadata<Project> &
  (DocumentMetadata<Project> & {
    owner: DocumentMetadata<User> & {
      createdAt: Timestamp;
      name: string;
      nowPlaying: DocumentMetadata<TODO> & TODO;
    };
    createdAt: Timestamp;
    current: DocumentMetadata<Kanban> & {
      title: string;
      createdAt: Timestamp;
      prev?: DocumentReference<Kanban> | null;
      next: (DocumentMetadata<Kanban> & Kanban) | null;
    };
    title?: string;
    kanbans: CollectionMetadata<Kanban> &
      (DocumentMetadata<Kanban> & {
        title: string;
        createdAt: Timestamp;
        prev?: DocumentReference<Kanban> | null;
        next: (DocumentMetadata<Kanban> & Kanban) | null;
      })[];
  })[];

assertType<Equal<typeof projects, ExpectProjectsType>>();

assertType<
  Equal<
    Pick<typeof projects extends (infer T)[] ? T : never, "kanbans">,
    Pick<ExpectProjectsType extends (infer T)[] ? T : never, "kanbans">
  >
>();
projects[0].current.next;

type A = GraphQuery<Project & { hogeRef: string }>;
