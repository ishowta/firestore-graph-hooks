import { useEffect, useRef } from "react";
import { field, useQuery } from "./lib/useQuery";
import { getKanbans, getProjects, getTodoLists, getUsers } from "./schema";

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
    console.log(result, loading, error);
  });
};
