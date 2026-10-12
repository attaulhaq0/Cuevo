import { createHostedCommandJournal } from './hosted-command-journal';
import type { HostedCommandJournal, HostedCommandJournalCommand, HostedCommandJournalIdentity, HostedCommandJournalOriginal, HostedCommandJournalRead } from './hosted-command-journal-contracts';

export type HostedLearningLoopJournalIdentity = HostedCommandJournalIdentity;
export type HostedLearningLoopJournalCommand = HostedCommandJournalCommand<'learning-loop'>;
export type HostedLearningLoopJournalOriginal = HostedCommandJournalOriginal<'learning-loop'>;
export type HostedLearningLoopJournalRead = HostedCommandJournalRead<'learning-loop'>;
export type HostedLearningLoopJournal = HostedCommandJournal<'learning-loop'>;

/** Version-one compatibility surface. Local durable metadata remains separate
 * from request admission, runner recovery and independent native authority. */
export async function createHostedLearningLoopJournal(value: unknown): Promise<HostedLearningLoopJournal> {
  return createHostedCommandJournal('learning-loop', value);
}
