export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }

  if (values.length === 0) {
    return [];
  }

  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let firstError: unknown;
  let hasError = false;

  const worker = async (): Promise<void> => {
    while (!hasError) {
      const index = nextIndex;

      if (index >= values.length) {
        return;
      }

      nextIndex += 1;

      try {
        results[index] = await mapper(values[index]!, index);
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );

  if (hasError) {
    throw firstError;
  }

  return results;
}
