import { getLogger } from 'loglevel';

export type PickOptional<T> = {
  [K in keyof T as {} extends Pick<T, K> ? K : never]-?: T[K];
};

export type SelectiveOptional<T, K extends string | number | symbol> = Partial<
  Pick<T, K & keyof T>
> & { [P in Exclude<keyof T, K>]: T[P] };

// https://github.com/microsoft/TypeScript/issues/27024

type EqualsFromCompiler<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2
  ? true
  : false;

type EqualsFromExtends<X, Y> = [X, Y] extends [Y, X] ? true : false;

export type Equal<X, Y> = unknown extends X & Y
  ? EqualsFromCompiler<X, Y>
  : EqualsFromExtends<X, Y>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export function assertType<_T extends true>() {}
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export function assertNotType<_T extends false>() {}

export type RequiredPrimitive<T> = T extends infer U | undefined ? U : T;

export type Expand<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

export const insert = <T>(arr: T[], value: T, index: number): T[] => {
  return arr
    .slice(0, index)
    .concat([value])
    .concat(arr.slice(index, arr.length));
};

export const getObjectLogger = (object: Object, name: string) => {
  return getLogger(`${object.constructor.name}[${name}]`);
};
