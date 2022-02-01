import { Project } from "./tests/schema";

export type PickOptional<T> = {
  [K in keyof T as {} extends Pick<T, K> ? K : never]-?: T[K];
};

export type SelectiveOptional<T, K extends string | number | symbol> = Partial<
  Pick<T, K & keyof T>
> &
  Omit<T, K & keyof T>;

type A = PickOptional<Project>;
