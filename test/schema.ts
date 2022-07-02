import {
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from './firebase';

export type Second = number & {};

/**
 * ユーザー
 * /users/{userID}
 */
export type User = {
  createdAt: Timestamp;
  name: string;
  nowPlayingRef?: DocumentReference<TODO>;
};
export const getUsers = () =>
  collection(firestore, 'users') as CollectionReference<User>;

/**
 * プロジェクト
 * /projects/{projectID}
 */
export type Project = {
  ownerRef: DocumentReference<User>;
  createdAt: Timestamp;
  title?: string;
};
export const getProjects = () =>
  collection(firestore, 'projects') as CollectionReference<Project>;

/**
 * カンバン
 * /projects/{projectID}/kanbans/{kanbanID}
 */
export type Kanban = {
  title: string;
  createdAt: Timestamp;
};
export const getKanbans = (projectRef: DocumentReference<Project>) =>
  collection(projectRef, 'kanbans') as CollectionReference<Kanban>;

/**
 * カンバンオーダー
 * /projects/{projectID}/metadata/kanbanOrder
 */
export type KanbanOrder = {
  order: DocumentReference<Kanban>[];
};
export const getKanbanOrder = (projectRef: DocumentReference<Project>) =>
  doc(
    collection(projectRef, 'metadata'),
    'kanbanOrder'
  ) as DocumentReference<KanbanOrder>;

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
};
export const getTodoLists = (kanbanRef: DocumentReference<Kanban>) =>
  collection(kanbanRef, 'todoLists') as CollectionReference<TODOList>;

/**
 * TODOリストオーダー
 * /projects/{projectID}/kanbans/{kanbanID}/metadata/todoListOrder
 */
export type TODOListOrder = {
  order: DocumentReference<TODOList>[];
};
export const getTODOListOrder = (kanbanRef: DocumentReference<Kanban>) =>
  doc(
    collection(kanbanRef, 'metadata'),
    'todoListOrder'
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
  timer?:
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
  createdAt: Timestamp;
};
export const getTodos = (todoListRef: DocumentReference<TODOList>) =>
  collection(todoListRef, 'todos') as CollectionReference<TODO>;

/**
 * TODOオーダー
 * /projects/{projectID}/kanbans/{kanbanID}/todoLists/{todoListID}/metadata/todoOrder
 */
export type TODOOrder = {
  order: DocumentReference<TODO>[];
};
export const getTODOOrder = (todoListRef: DocumentReference<TODOList>) =>
  doc(
    collection(todoListRef, 'metadata'),
    'todoOrder'
  ) as DocumentReference<TODOOrder>;
