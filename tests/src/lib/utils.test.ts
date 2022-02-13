import { PickOptional } from "./utils";
import { assertType, Equal } from "../helper";

assertType<Equal<PickOptional<{ a?: string; b: number }>, { a: string }>>();
