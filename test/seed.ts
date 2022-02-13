import {
  addDoc,
  Firestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { range } from 'lodash-es';
import {
  getKanbanOrder,
  getKanbans,
  getProjects,
  getTODOListOrder,
  getTodoLists,
  getTodos,
  getUsers,
} from './schema';

export const generateSeed = async () => {
  const userRefs = await Promise.all(
    range(10).map((i) =>
      addDoc(getUsers(), {
        createdAt: serverTimestamp(),
        name: `${i}man`,
      })
    )
  );
  const projectRefs = await Promise.all(
    range(3).map(async (i) => {
      const projectRef = await addDoc(getProjects(), {
        createdAt: serverTimestamp(),
        ownerRef: userRefs[i],
        title: `${i}th project`,
      });
      const kanbans = await Promise.all(
        range(3).map(async (j) => {
          const kanbanRef = await addDoc(getKanbans(projectRef), {
            createdAt: serverTimestamp(),
            title: `${j}th kanban`,
          });
          const todoLists = await Promise.all(
            range(3).map(async (k) => {
              const todoListRef = await addDoc(getTodoLists(kanbanRef), {
                createdAt: serverTimestamp(),
                name: `${k}th todoList`,
                memo: `Hello ${k} World!`,
              });
              const todos = await Promise.all(
                range(3).map(async (l) => {
                  const todoRef = await addDoc(getTodos(todoListRef), {
                    createdAt: serverTimestamp(),
                    title: `${l}th todo`,
                    scheduledTime: l * 30 * 60,
                  });
                  if (j === 0 && k === 0 && l === 0) {
                    updateDoc(userRefs[i], {
                      nowPlayingRef: todoRef,
                    });
                  }
                  return todoRef;
                })
              );
              await setDoc(getTODOListOrder(kanbanRef), {
                order: todos,
              });
              return todoListRef;
            })
          );
          await setDoc(getTODOListOrder(kanbanRef), {
            order: todoLists,
          });
          return kanbanRef;
        })
      );
      await setDoc(getKanbanOrder(projectRef), {
        order: kanbans,
      });
      return projectRef;
    })
  );
  return [userRefs, projectRefs];
};
