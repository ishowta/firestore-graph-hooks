import { ColRef, DocRef } from 'src/shared/api/firebase'
import {
  Attendee,
  Folder,
  Room,
  RoomRef,
  RoomStatus,
  UserBelongedOrganization,
} from '../schema'
import { RoomModel } from './room'

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

type DocData = { [field: string]: any }

type FilterRefKeys<T extends DocData> = {
  [K in keyof T & string]: T[K] extends
    | (DocRef<DocData> | ColRef<DocData>)
    | undefined
    ? K
    : never
}[keyof T & string]

/*
any extends T[K]
    ? any
    :
*/
type GraphQuery<T extends DocData> =
  | ({
      [K in FilterRefKeys<T>]?: T[K] extends
        | (DocRef<infer U> | ColRef<infer U>)
        | undefined
        ? U extends DocData
          ? GraphQuery<U>
          : never
        : never
    } &
      {
        // we need negated type https://github.com/microsoft/TypeScript/pull/29317#issuecomment-452973876
        [K in string]?:
          | [DocRef<DocData> | ColRef<DocData>, Record<string, unknown>]
          | Record<string, unknown>
      })
  | ((data: T) => GraphQuery<T>)

type GraphQueryQueryType<T, Q extends GraphQuery<T>> = Q extends (
  ...args: any
) => any
  ? ReturnType<Q>
  : Q

type JoinedDataInner<T extends DocData, Q extends GraphQuery<T>> = {
  [K in keyof T]: K extends keyof GraphQueryQueryType<T, Q>
    ? RefToDoc<T[K]> extends DocData
      ? Required<GraphQueryQueryType<T, Q>[K]> extends GraphQuery<
          RefToDoc<T[K]>
        >
        ? JoinedData<T[K], Required<GraphQueryQueryType<T, Q>[K]>>
        : never
      : never
    : T[K]
} &
  {
    [K in keyof GraphQueryQueryType<T, Q>]: K extends keyof T
      ? unknown
      : GraphQueryQueryType<T, Q>[K] extends [infer Ref, infer UQuery]
      ? Ref extends DocRef<DocData> | ColRef<DocData>
        ? Required<UQuery> extends GraphQuery<RefToDoc<Ref>>
          ? JoinedData<Ref, Required<UQuery>>
          : never
        : never
      : never
  }

type RefToDoc<R extends DocRef<DocData> | ColRef<DocData>> = R extends
  | DocRef<infer D>
  | undefined
  ? D
  : R extends ColRef<infer D> | undefined
  ? D
  : never

type JoinedData<
  R extends DocRef<DocData> | ColRef<DocData>,
  Q extends GraphQuery<RefToDoc<R>>
> = R extends DocRef<infer U>
  ? Q extends GraphQuery<U>
    ? JoinedDataInner<U, Q>
    : never
  : R extends ColRef<infer U>
  ? Q extends GraphQuery<U>
    ? JoinedDataInner<U, Q>[]
    : never
  : never

declare function _useJoinedCollection<
  Ref extends DocRef<DocData> | ColRef<DocData>,
  Q extends GraphQuery<RefToDoc<Ref>>
>(ref: Ref, query: Q): [JoinedData<Ref, Q>, boolean, Error]

type Schema = {
  attendee: Attendee
}

declare function extraField<
  Ref extends DocRef<DocData> | ColRef<DocData>,
  Q extends GraphQuery<
    Ref extends DocRef<infer U> ? U : Ref extends ColRef<infer U> ? U : never
  >
>(ref: Ref, query: Q): [Ref, Q]

let ref: ColRef<RoomRef> = {} as any
const [folders] = _useJoinedCollection(ref, (roomRef) => ({
  ref: {
    belonged_organization_ref: {},
  },
  room: extraField(RoomModel.getPasswordRef(roomRef.ref.id), {
    belonged_organization_ref: {},
  }),
}))

folders[0].ref.name
