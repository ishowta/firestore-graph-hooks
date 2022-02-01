import { PickOptional } from "./helper";
import { assertType, Equal } from "./tests/helper";

assertType<Equal<PickOptional<{ a?: string; b: number }>, { a: string }>>();
