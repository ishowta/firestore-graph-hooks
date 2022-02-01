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

export function assertType<_T extends true>() {}
export function assertNotType<_T extends false>() {}

export type RequiredPrimitive<T> = T extends infer U | undefined ? U : T;
