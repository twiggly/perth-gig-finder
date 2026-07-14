export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function getOperationErrorMessage(input: {
  error: unknown;
  prefix: string;
  fallback: string;
}): string {
  return input.error instanceof Error
    ? `${input.prefix}: ${input.error.message}`
    : input.fallback;
}
