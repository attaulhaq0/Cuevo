/** Native input presentation only; the immutable retained command is never rewritten. */
export function commandFieldValue(type: string | undefined, value: string | number | undefined): string | number | undefined {
  if (type !== 'datetime-local' || typeof value !== 'string' || !/[zZ]|[+-]\d\d:\d\d$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
