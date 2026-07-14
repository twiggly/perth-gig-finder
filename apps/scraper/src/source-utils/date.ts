export function normalizeUtcDate(
  value: string | null | undefined,
  errorLabel = "Invalid event date"
): string | null {
  if (!value) {
    return null;
  }

  const withTimezone =
    value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${errorLabel}: ${value}`);
  }

  return date.toISOString();
}
