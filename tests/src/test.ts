import { useEffect, useRef } from "react";
import { field, useQuery } from "./lib/useQuery";
import { getKanbans, getProjects, getTodoLists, getUsers } from "./schema";
import loglevel, { getLogger } from "loglevel";
import { apply, reg } from "loglevel-plugin-prefix";

loglevel.setDefaultLevel("DEBUG");
reg(loglevel);
apply(loglevel, {
  format(level, name, timestamp) {
    return `[${timestamp}] ${level} ${name}:`;
  },
});
const logger = getLogger("test");

export const useTest = () => {
  const [result, loading, error] = useQuery(getProjects(), (project) => ({
    //ownerRef: {},
    ownerRef: {
      nowPlayingRef: {},
    },
    kanbans: field(getKanbans(project.ref), (kanban) => ({
      todoLists: field(getTodoLists(kanban.ref), {}),
    })),
  }));

  useEffect(() => {
    logger.warn(result, loading, error);
  });
};
