import {z} from 'zod';

/** Fixed observation metadata only; no SQL, credentials, paths, errors or execution authority. */
const nativeDiagnosticPhase=z.enum(['READY','ENVIRONMENT','CONNECT','TLS','IDENTITY','LEASE','RECONCILIATION_CONTEXT','SOURCE','OFFICIAL_AUTHORITY','ORIGINAL_OBJECTS','CATALOGUE','TARGET_HISTORY','ABSENCE','STORAGE_CAPABILITY','RECEIPT_READ','RECEIPT_PERSIST','REFRESH','CLEANUP']);
export const hostedMigrationNativeDiagnosticsSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_NATIVE_MIGRATION_DIAGNOSTICS'),phase:nativeDiagnosticPhase,failurePhase:nativeDiagnosticPhase.nullable(),session:z.enum(['NOT_STARTED','ATTEMPTED','VERIFIED','CLOSED_CONFIRMED','CLOSE_UNCONFIRMED']),lease:z.enum(['NOT_ATTEMPTED','ATTEMPTED','HELD','RELEASED','RELEASE_UNCONFIRMED']),partialReceipt:z.enum(['NOT_ATTEMPTED','ATTEMPTED','CONFIRMED','UNKNOWN'])}).strict();
export type HostedMigrationNativeDiagnostics=z.infer<typeof hostedMigrationNativeDiagnosticsSchema>;
