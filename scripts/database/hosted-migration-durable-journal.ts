import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { createHostedMigrationJournal } from './hosted-migration-journal';
import { createHostedMigrationRemoteJournal } from './hosted-migration-remote-journal';
import {parseHostedExecutionJournal,type HostedExecutionJournal,type HostedExecutionPorts} from './hosted-migration-journal-contracts';

const failure = () => Error('Original local and remote migration journal acknowledgements require review; contents withheld.');
const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/), ref = z.string().regex(/^[a-z]{20}$/);
const identitySchema = z.object({ projectRef: ref, sourceSha: sha, treeSha: sha, planSha256: digest, stageId: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), stageSha256: digest, databaseUrl: z.string().max(400), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/).max(30), certificateSha256: digest }).strict();
const token = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const inputSchema = z.object({ repoRoot: z.string(), journalRoot: z.string(), projectRef: ref, boundProjectRef: ref, identity: identitySchema, storageKey: token, providerToken: token }).strict();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type HostedMigrationDurableJournal = Pick<HostedExecutionPorts, 'readJournal' | 'writeJournal'>;
function own(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure(); if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const output: Record<string, unknown> = Object.create(null); for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); Object.defineProperty(output, key, { value: own(field.value, depth + 1), enumerable: true }); } return output;
}
function inputWithPermit(value:unknown){
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
  const metadata:Record<string,unknown>=Object.create(null);let reconciliationPermit:unknown,permitPresent=false;
  for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();if(key==='reconciliationPermit'){permitPresent=true;reconciliationPermit=field.value;}else Object.defineProperty(metadata,key,{value:own(field.value),enumerable:true});}
  return{metadata,permitPresent,reconciliationPermit};
}
function transition(prior: HostedExecutionJournal['state'] | undefined, next: HostedExecutionJournal['state']) { return prior === undefined ? next === 'INTENT' : prior === 'INTENT' ? next === 'COMMITTED' || next === 'REQUIRES_REVIEW' : prior === 'COMMITTED' && next === 'REQUIRES_REVIEW'; }

/** Instantiates the two actual journal adapters. Caller holds the real admitted
 * database lease and original release authority throughout; this consumer adds
 * no execution/approval/rehydration authority and never repairs old records. */
export async function createHostedMigrationDurableJournal(value: unknown): Promise<HostedMigrationDurableJournal> {
  try {
    const captured=inputWithPermit(value),input = inputSchema.parse(captured.metadata);
    if (input.projectRef !== input.boundProjectRef || input.projectRef !== input.identity.projectRef || !isAbsolute(input.repoRoot) || resolve(input.repoRoot) !== input.repoRoot || await realpath(input.repoRoot) !== input.repoRoot || !isAbsolute(input.journalRoot) || resolve(input.journalRoot) !== input.journalRoot || dirname(input.journalRoot) !== join(input.repoRoot, '.local', 'hosted-release')) throw failure();
    const requirePermit=async(safety=false)=>{if(captured.permitPresent){const native=await import('./hosted-migration-database');return safety?native.assertNativeReconciliationSafetyRecord(captured.reconciliationPermit,input.identity):native.assertNativeReconciliationPermit(captured.reconciliationPermit,input.identity);}return null;};
    await requirePermit();
    let existed = false; try { const before = await lstat(input.journalRoot); if (!before.isDirectory() || before.isSymbolicLink() || await realpath(input.journalRoot) !== input.journalRoot) throw failure(); existed = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure(); }
    // Remote metadata construction precedes creation of a new local owner.
    const remote = await createHostedMigrationRemoteJournal({ projectRef: input.projectRef, boundProjectRef: input.boundProjectRef, storageKey: input.storageKey, providerToken: input.providerToken, identity: input.identity,...(captured.permitPresent?{reconciliationPermit:captured.reconciliationPermit}:{}) });
    await requirePermit();
    const local = await createHostedMigrationJournal({ repoRoot: input.repoRoot, journalRoot: input.journalRoot, identity: input.identity });
    let uncertain = false, active = false, ownedIntentHash: string | null = null;
    const parsed = (value: unknown): HostedExecutionJournal | null => { if (value === null) return null; const raw = own(value), safe = parseHostedExecutionJournal(raw); if (hash(safe.identity) !== hash(input.identity)) throw failure(); return JSON.parse(JSON.stringify(raw)) as HostedExecutionJournal; };
    const selectedOriginal=async()=>{
      const selected=(await requirePermit())?.selectedOriginalIntent;if(!selected)return null;
      const acknowledgement=await local.readOriginalIntentAcknowledgement(),payload=parsed(acknowledgement.payload);await requirePermit();
      if(!payload||payload.version!==1||payload.state!=='INTENT'||hash(selected.identity)!==hash(input.identity)||acknowledgement.ownerSha256!==selected.ownerSha256||acknowledgement.record1Sha256!==selected.record1Sha256||hash(payload)!==selected.payloadSha256)throw failure();return selected.payloadSha256;
    };
    const pair = async (allowFresh = false): Promise<HostedExecutionJournal | null> => {
      if (uncertain) throw failure();await requirePermit();const left = parsed(await local.readJournal()),selected=ownedIntentHash===null&&left?.state==='INTENT'?await selectedOriginal():null, right = parsed(await remote.readJournal()), confirmedLocal = parsed(await local.readJournal());await requirePermit();
      if (uncertain || hash(left) !== hash(right) || hash(left) !== hash(confirmedLocal)) throw failure();
      if (left === null) { if (existed || !allowFresh) throw failure(); return null; }
      if(selected!==null){if(left.state!=='INTENT'||hash(left)!==selected)throw failure();ownedIntentHash=selected;}
      if (left.state === 'INTENT' && hash(left) !== ownedIntentHash || left.state === 'REQUIRES_REVIEW') throw failure();
      return left;
    };
    const safetyPair=async()=>{if(!captured.permitPresent||ownedIntentHash===null)throw failure();await requirePermit(true);const left=parsed(await local.readJournal()),right=parsed(await remote.readOwnedSafetyJournal()),confirmedLocal=parsed(await local.readJournal());await requirePermit(true);if(!left||hash(left)!==hash(right)||hash(left)!==hash(confirmedLocal)||left.state==='INTENT'&&hash(left)!==ownedIntentHash)throw failure();return left;};
    return {
      readJournal: async () => { if (active || uncertain) throw failure(); try { return structuredClone(await pair(true)); } catch { uncertain = true; throw failure(); } },
      writeJournal: async value => {
        if (active) { uncertain = true; return { kind: 'UNCONFIRMED' }; } active = true;
        try {
          if(captured.permitPresent){const native=await import('./hosted-migration-database');if(own(value)&&typeof value==='object'&&value!==null&&Object.getOwnPropertyDescriptor(value,'state')?.value==='REQUIRES_REVIEW'&&ownedIntentHash!==null)native.assertNativeReconciliationSafetyRecord(captured.reconciliationPermit,input.identity);else native.assertNativeMigrationEffectPermit(captured.reconciliationPermit,input.identity);}
          const raw = own(value), requested = parseHostedExecutionJournal(raw); if (hash(requested.identity) !== hash(input.identity)) throw failure(); const payload = JSON.parse(JSON.stringify(raw)) as HostedExecutionJournal, expected = hash(payload),safety=captured.permitPresent&&payload.state==='REQUIRES_REVIEW'&&ownedIntentHash!==null;
          if(uncertain&&!safety)throw failure();let before:HostedExecutionJournal|null;
          if(!safety&&ownedIntentHash===null){const selected=(await requirePermit())?.selectedOriginalIntent;if(selected&&hash(selected.identity)===hash(input.identity))await pair();}
          if(safety)before=await safetyPair();else{await requirePermit();before=parsed(await local.readJournal());const stable=parsed(await local.readJournal());await requirePermit();if(hash(before)!==hash(stable)||before===null&&existed||before?.state==='INTENT'&&hash(before)!==ownedIntentHash||before?.state==='REQUIRES_REVIEW')throw failure();}
          const unchanged=before!==null&&hash(before)===expected;
          if (!unchanged&&!transition(before?.state, payload.state) || before?.state === 'INTENT' && hash(before) !== ownedIntentHash) throw failure();
          const priorConfirmed=parsed(await local.readJournal());await requirePermit(safety);if(hash(priorConfirmed)!==hash(before))throw failure();
          if(unchanged){const remoteReceipt=await remote.compareAndWriteJournal(before,structuredClone(payload)),left=parsed(await local.readJournal()),right=parsed(remoteReceipt.kind==='SYNCED'?remoteReceipt.payload:null),confirmedLocal=parsed(await local.readJournal());await requirePermit(safety);if(uncertain&&!safety||remoteReceipt.kind!=='SYNCED'||remoteReceipt.sha256!==expected||hash(left)!==expected||hash(right)!==expected||hash(confirmedLocal)!==expected)throw failure();return{kind:'SYNCED',sha256:expected};}
          await requirePermit(safety);const localReceipt = await local.writeJournal(structuredClone(payload)); if (uncertain&&!safety || localReceipt.kind !== 'SYNCED' || localReceipt.sha256 !== expected) throw failure();
          await requirePermit(safety);const remoteReceipt = await remote.compareAndWriteJournal(before,structuredClone(payload)); if (uncertain&&!safety || remoteReceipt.kind !== 'SYNCED' || remoteReceipt.sha256 !== expected) throw failure();
          const left = parsed(await local.readJournal()), right = parsed(remoteReceipt.payload), confirmedLocal = parsed(await local.readJournal());
          if (uncertain&&!safety || left === null || right === null || hash(left) !== expected || hash(right) !== expected || hash(confirmedLocal) !== expected) throw failure();
          if(remoteReceipt.publication&&captured.permitPresent&&!safety){const native=await import('./hosted-migration-database');native.readNativeJournalPublicationAcknowledgement(remoteReceipt.publication,input.identity,payload);}else await requirePermit(safety);
          if (payload.state === 'INTENT') ownedIntentHash = expected;
          return { kind: 'SYNCED', sha256: expected };
        } catch { uncertain = true; return { kind: 'UNCONFIRMED' }; } finally { active = false; }
      },
    };
  } catch { throw failure(); }
}
