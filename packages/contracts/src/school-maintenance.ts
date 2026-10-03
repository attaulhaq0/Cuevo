import { z } from 'zod';
import { calendarInputSchema, timetableInputSchema, reportPeriodInputSchema } from './school';
const review = { expectedRevision: z.number().int().positive(), reason: z.string().trim().min(1).max(1000), confirmChange: z.literal(true) };
export const schoolRecordEditSchema = z.discriminatedUnion('resource', [
  z.object({ resource: z.literal('calendar'), record: calendarInputSchema, ...review }).strict(),
  z.object({ resource: z.literal('timetable'), record: timetableInputSchema, ...review }).strict(),
  z.object({ resource: z.literal('report-periods'), record: reportPeriodInputSchema, ...review }).strict(),
]);
export const schoolRecordCancelSchema = z.object({ resource: z.enum(['calendar', 'timetable', 'report-periods']), ...review }).strict();
