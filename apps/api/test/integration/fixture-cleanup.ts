/** Test-only cleanup boundary for resources owned by an integration fixture. */
export async function withFixtureCleanup<T>(
  action: () => Promise<T>,
  steps: readonly (() => void | Promise<unknown>)[],
): Promise<T> {
  const errors: unknown[] = [];
  let result!: T;
  try { result = await action(); } catch (error) { errors.push(error); }
  for (const step of steps) {
    try { await step(); } catch (error) { errors.push(error); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Fixture action or cleanup failed.', { cause: errors[0] });
  return result;
}
