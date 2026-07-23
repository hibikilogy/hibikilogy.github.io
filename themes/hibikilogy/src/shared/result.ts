import type { ErrorResult } from './types.ts'

export function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

export function catchError<T>(operation: () => T): ErrorResult<T>
export function catchError<T, E>(
  operation: () => T,
  mapError: (cause: unknown) => E,
): ErrorResult<T, E>
export function catchError<T, E>(
  operation: () => T,
  mapError?: (cause: unknown) => E,
): ErrorResult<T, E | Error> {
  try {
    return [operation(), null]
  }
  catch (cause) {
    return [undefined, mapError ? mapError(cause) : toError(cause)]
  }
}

export function catchAsyncError<T>(operation: () => PromiseLike<T>): Promise<ErrorResult<T>>
export function catchAsyncError<T, E>(
  operation: () => PromiseLike<T>,
  mapError: (cause: unknown) => E,
): Promise<ErrorResult<T, E>>
export async function catchAsyncError<T, E>(
  operation: () => PromiseLike<T>,
  mapError?: (cause: unknown) => E,
): Promise<ErrorResult<T, E | Error>> {
  try {
    return [await operation(), null]
  }
  catch (cause) {
    return [undefined, mapError ? mapError(cause) : toError(cause)]
  }
}
