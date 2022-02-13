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
