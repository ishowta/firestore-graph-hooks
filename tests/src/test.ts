import { useEffect, useRef } from "react";
import { useQuery } from "./lib/useQuery";
import { getUsers } from "./schema";

export const useTest = () => {
  const [result, loading, error] = useQuery(getUsers(), {});

  useEffect(() => {
    console.log(result, loading, error);
  });
};
