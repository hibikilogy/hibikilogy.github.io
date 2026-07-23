export type ErrorResult<T, E = Error>
  = readonly [data: T, error: null]
    | readonly [data: undefined, error: E]
