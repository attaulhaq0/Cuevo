import { createHostedCommandJournal } from './hosted-command-journal';
import type { HostedCommandJournal, HostedCommandJournalCommand, HostedCommandJournalIdentity, HostedCommandJournalOriginal, HostedCommandJournalRead } from './hosted-command-journal-contracts';

export type HostedCommunityJournalIdentity = HostedCommandJournalIdentity;
export type HostedCommunityJournalCommand = HostedCommandJournalCommand<'community'>;
export type HostedCommunityJournalOriginal = HostedCommandJournalOriginal<'community'>;
export type HostedCommunityJournalRead = HostedCommandJournalRead<'community'>;
export type HostedCommunityJournal = HostedCommandJournal<'community'>;

/** Confined local metadata only. Domain admission and independent community
 * native validation remain with their purpose-specific owners. */
export async function createHostedCommunityJournal(value: unknown): Promise<HostedCommunityJournal> {
  return createHostedCommandJournal('community', value);
}
