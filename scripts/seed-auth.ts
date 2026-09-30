import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).port !== '56321') throw new Error('Synthetic identity seeding is restricted to the local Cuevo environment.');
const manifest = JSON.parse(await readFile('supabase/seed/identities.json', 'utf8')) as { synthetic: boolean; actors: { actorId: string; email: string; role: string }[] };
if (!manifest.synthetic) throw new Error('Only synthetic identity manifests are allowed.');
const secrets = JSON.parse(await readFile('.local/runtime-secrets.json', 'utf8')) as { syntheticPassword: string };
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let created = 0;
for (const actor of manifest.actors) {
  const existing = await client.auth.admin.getUserById(actor.actorId);
  if (existing.data.user) continue;
  const result = await client.auth.admin.createUser({ id: actor.actorId, email: actor.email, password: secrets.syntheticPassword, email_confirm: true, user_metadata: { synthetic: true } });
  if (result.error || result.data.user?.id !== actor.actorId) throw new Error(`Synthetic identity could not be provisioned (${actor.role}); no credentials printed.`);
  created++;
}
const accounts = manifest.actors.filter(a => ['admin', 'coordinator', 'teacher', 'student', 'parent'].includes(a.role)).map(a => ({ role: a.role, email: a.email, password: secrets.syntheticPassword }));
await writeFile('.local/synthetic-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 });
console.log(`Synthetic identities ready (${manifest.actors.length}, ${created} created). Local access details are in ignored .local/synthetic-accounts.json.`);
