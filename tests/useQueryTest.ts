import { extraField, _useJoinedQuery } from "../useJoinedQuery";
import { getKanbans, getProjects } from "./schema";

const [projects] = _useJoinedQuery(getProjects(), (project) => ({
  ownerRef: {
    nowPlayingRef: {},
  },
  currentRef: {
    next: {},
  },
  kanbans: extraField(getKanbans(project.__ref__), {
    belonged_organization_ref: {},
  }),
}));

projects[0].current.next;
