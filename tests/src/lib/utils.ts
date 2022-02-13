import { getLogger } from "loglevel";
import hash from "object-hash";

export type PickOptional<T> = {
  [K in keyof T as {} extends Pick<T, K> ? K : never]-?: T[K];
};

export type SelectiveOptional<T, K extends string | number | symbol> = Partial<
  Pick<T, K & keyof T>
> &
  Omit<T, K & keyof T>;

export const insert = <T>(arr: T[], value: T, index: number): T[] => {
  return arr
    .slice(0, index)
    .concat([value])
    .concat(arr.slice(index, arr.length));
};

export const getObjectLogger = (object: Object, key?: string) => {
  return getLogger(
    `${object.constructor.name}[${key ?? hash(object).slice(0, 7)}]`
  );
};
