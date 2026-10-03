import { z } from 'zod';
import { diagnosticCategories, diagnosticFeatures, diagnosticStatuses, diagnosticTimings, diagnosticLocales, diagnosticViewports } from './analytics';
export const browserDiagnosticObservationSchema = z.strictObject({ category: z.enum(diagnosticCategories), feature: z.enum(diagnosticFeatures), status: z.enum(diagnosticStatuses), timing: z.enum(diagnosticTimings), locale: z.enum(diagnosticLocales), viewport: z.enum(diagnosticViewports) });
export const browserDiagnosticSchema = browserDiagnosticObservationSchema.extend({ diagnosticId: z.uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) });
export const browserDiagnosticsConfigSchema = z.strictObject({ enabled: z.boolean() });
export const browserDiagnosticReceiptSchema = z.strictObject({ recorded: z.boolean(), duplicate: z.boolean() }).refine(value => !value.duplicate || value.recorded);
