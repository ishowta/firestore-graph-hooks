import {
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  Timestamp,
} from "@firebase/firestore";
import { firestore } from "./firebase";

// 妥協
export type Second = number;

/**
 * ユーザー
 * /users/{userID}
 */
export type User = {
  createdAt: Timestamp;
  name: string;
  nowPlayingRef: DocumentReference<TODO>;
};

/**
 * プロジェクト
 * /projects/{projectID}
 */
export type Project = {
  ownerRef: DocumentReference<User>;
  createdAt: Timestamp;
  currentRef: DocumentReference<Kanban>;
  title?: string;
};
export const getProjects = () =>
  collection(firestore, "projects") as CollectionReference<Project>;

/**
 * カンバン
 * /projects/{projectID}/kanbans/{kanbanID}
 */
export type Kanban = {
  title: string;
  createdAt: Timestamp;
  prev?: DocumentReference<Kanban> | null;
  next?: DocumentReference<Kanban> | null;
};
export const getKanbans = (projectRef: DocumentReference<Project>) =>
  collection(projectRef, "kanbans") as CollectionReference<Kanban>;

/**
 * TODOリスト
 * /projects/{projectID}/kanbans/{kanbanID}/todoLists/{todoListID}
 */
export type TODOList = {
  name?: string;
  memo?: string;
  finished?: boolean;
  reactionList?: string[];
  createdAt: Timestamp;
  prev?: DocumentReference<TODOList> | null;
  next?: DocumentReference<TODOList> | null;
};
export const getTodoLists = (kanbanRef: DocumentReference<Kanban>) =>
  collection(kanbanRef, "todoLists") as CollectionReference<TODOList>;

/**
 * TODOリストオーダー
 * /projects/{projectID}/kanbans/{kanbanID}/metadata/todoListOrder
 */
export type TODOListOrder = {
  order: ID[];
};
export const getTODOListOrder = (kanbanRef: DocumentReference<Kanban>) =>
  doc(
    collection(kanbanRef, "metadata"),
    "todoListOrder"
  ) as DocumentReference<TODOListOrder>;

/**
 * TODO
 * /projects/{projectID}/kanbans/{kanbanID}/todoLists/{todoListID}/todos/{todoID}
 */
export type TODO = {
  title?: string;
  /**
   * 予定されたタスクにかかる時間
   */
  scheduledTime: Second;
  timer:
    | {
        isWorking: false;
        time: Second;
      }
    | {
        isWorking: true;
        time: Second;
        lastBeginAt: Timestamp;
      };
  completed?: boolean;
  timeoverReason?: string;
  prev?: DocumentReference<TODOList> | null;
  next?: DocumentReference<TODOList> | null;
  createdAt: Timestamp;
};
export const getTodos = (todoListRef: DocumentReference<TODOList>) =>
  collection(todoListRef, "todos") as CollectionReference<TODO>;

/**
 * TODOオーダー
 * /projects/{projectID}/kanbans/{kanbanID}/metadata/todoListOrder
 */
export type TODOOrder = {
  order: ID[];
};
export const getTODOOrder = (todoListRef: DocumentReference<TODOList>) =>
  doc(
    collection(todoListRef, "metadata"),
    "todoOrder"
  ) as DocumentReference<TODOOrder>;
