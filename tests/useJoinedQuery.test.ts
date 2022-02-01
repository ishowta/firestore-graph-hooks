import { DocumentReference, Timestamp } from "firebase/firestore";
import {
  CollectionMetadata,
  DocumentMetadata,
  extraField,
  _useJoinedQuery,
} from "../useJoinedQuery";
import { assertType, Equal } from "./helper";
import { getKanbans, getProjects, Kanban, Project, TODO, User } from "./schema";

const [projects] = _useJoinedQuery(getProjects(), (project) => ({
  ownerRef: (_user) => ({
    nowPlayingRef: (todo) => ({
      extraOnlyTestField: extraField(todo.__ref__, {}),
    }),
  }),
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
      nowPlaying: DocumentMetadata<TODO> &
        TODO & {
          extraOnlyTestField: DocumentMetadata<TODO> & TODO;
        };
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

// assertType<
//   Equal<
//     Pick<typeof projects extends (infer T)[] ? T : never, "owner">,
//     Pick<ExpectProjectsType extends (infer T)[] ? T : never, "owner">
//   >
// >();
