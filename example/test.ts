import { useEffect } from 'react';
import { field, useQuery } from '../src/index';
import { getKanbans, getProjects, getTodoLists } from '../test/schema';

export const useTest = () => {
  const [result, loading, error] = useQuery(getProjects(), (project) => ({
    ownerRef: {
      nowPlayingRef: {},
    },
    kanbans: field(getKanbans(project.ref), (kanban) => ({
      todoLists: field(getTodoLists(kanban.ref), {}),
    })),
  }));

  useEffect(() => {
    console.info(result, loading, error);
  });
};
