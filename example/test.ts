import { useEffect } from 'react';
import { field, useQuery, useRootQuery } from '../src/index';
import { getKanbans, getProjects, getTodoLists } from '../test/schema';

export const useTest = () => {
  const [result2, loading2, error2] = useQuery(
    getProjects(),
    (project) => ({})
  );

  const [result, loading, error] = useQuery(getProjects(), (project) => ({
    ownerRef: {
      nowPlayingRef: {},
    },
    kanbans: field(getKanbans(project.ref), (kanban) => ({
      todoLists: field(getTodoLists(kanban.ref), {}),
    })),
  }));

  useEffect(() => {
    console.warn(result, loading, error);
  });
};

export const useRootTest = () => {
  const [result2, loading2, error2] = useRootQuery({
    projects: field(getProjects(), (project) => ({})),
  });

  const [result, loading, error] = useRootQuery({
    projects: field(getProjects(), (project) => ({
      ownerRef: {
        nowPlayingRef: {},
      },
      kanbans: field(getKanbans(project.ref), (kanban) => ({
        todoLists: field(getTodoLists(kanban.ref), {}),
      })),
    })),
  });

  useEffect(() => {
    console.warn(result, loading, error);
  });
};
