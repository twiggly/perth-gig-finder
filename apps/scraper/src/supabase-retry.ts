const TRANSIENT_ERROR_PATTERNS = [
  /502 bad gateway/i,
  /503 service unavailable/i,
  /504 gateway timeout/i,
  /\b52[0-4]\b/i,
  /cloudflare/i
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isTransientSupabaseErrorMessage(message: string): boolean {
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function retryTransientSupabaseOperation<T>(
  execute: () => Promise<T>,
  input: {
    delaysMs?: readonly number[];
  } = {}
): Promise<T> {
  const delaysMs = input.delaysMs ?? [250, 1000];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (
        !isTransientSupabaseErrorMessage(message) ||
        attempt === delaysMs.length
      ) {
        throw error;
      }

      await sleep(delaysMs[attempt] ?? 0);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unexpected retry failure");
}
