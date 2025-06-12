export type TryResult<T> = [T, null] | [null, Error];

function trySync<T>(func: () => T): TryResult<T> {
  try {
    const result = func();
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

export async function tryAsync<T>(
  promiseOrFunction: Promise<T> | (() => Promise<T>)
): Promise<TryResult<T>> {
  try {
    const result =
      typeof promiseOrFunction === "function"
        ? await promiseOrFunction()
        : await promiseOrFunction;
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

function tryParse<T = unknown>(jsonString: string): TryResult<T> {
  return trySync(() => JSON.parse(jsonString) as T);
}

export { tryAsync as try, trySync, tryParse };
