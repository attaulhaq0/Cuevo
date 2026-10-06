export type WorkerRow = Record<string, unknown>;
/** Private SQL calls only; each query completes its own transaction on the supplied connection. */
export interface WorkerQueryPort {
  query(sql: string, values?: unknown[]): Promise<{ rows: WorkerRow[] }>;
}
