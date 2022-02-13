import { PickOptional } from './utils';
import { assertNotType, assertType, Equal } from './utils';

test('Equal', () => {
  assertNotType<Equal<number, string>>();
  assertNotType<Equal<any, string>>();
  assertNotType<Equal<any, unknown>>();
  assertType<Equal<any, any>>();
  assertType<Equal<unknown, unknown>>();
  assertNotType<Equal<any, never>>();
  assertNotType<Equal<string | undefined, string>>();
  assertType<Equal<string, string>>();
  assertType<Equal<string & {}, string>>();
  assertType<Equal<string & unknown, string>>();
  assertType<Equal<{ a: string } & { b: number }, { a: string; b: number }>>();
  assertNotType<Equal<{ a: string }, { a: string; b: number }>>();
  assertType<Equal<{ a?: string }, { a?: string | undefined }>>();
  assertNotType<Equal<1 | 2, 1>>();
});

test('PickOptional', () => {
  assertType<Equal<PickOptional<{ a?: string; b: number }>, { a: string }>>();
});
