import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import { intelligenceExecutionManifest } from '../../src/modules/improvement/execution-manifest';
describe('source-controlled execution manifest',()=>{
 it('truthfully identifies an explicitly configured hosted synthetic fixture',()=>{
  const projectRef='abcdefghijklmnopqrst';
  const fixture=parseServerConfig({NODE_ENV:'production',CUEVO_DEPLOYMENT_ENVIRONMENT:'synthetic-staging',CUEVO_SYNTHETIC_PROJECT_REF:projectRef,CUEVO_SYNTHETIC_WEB_ORIGIN:'https://cuevo.example',API_ALLOWED_ORIGIN:'https://cuevo.example',DATABASE_URL:`postgresql://cuevo_api:private@db.${projectRef}.supabase.co:5432/postgres`,SUPABASE_URL:`https://${projectRef}.supabase.co`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'},'api');
  expect(intelligenceExecutionManifest(fixture,'SCHOOL_CUSTOM_NUMERIC')).toMatchObject({mode:'FIXTURE',providerDataPolicy:'HOSTED_SYNTHETIC_FIXTURE'});
  expect(intelligenceExecutionManifest({...fixture,syntheticProjectRef:undefined},'SCHOOL_CUSTOM_NUMERIC')).toBeNull();
  expect(intelligenceExecutionManifest({...fixture,supabaseUrl:'https://foreign.example'},'SCHOOL_CUSTOM_NUMERIC')).toBeNull();
 });
 it('binds configured task/prompt metadata without exposing credentials or manufacturing live approval',()=>{
  const fixture=parseServerConfig({NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:56321',AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'});
  expect(intelligenceExecutionManifest(fixture,'SCHOOL_CUSTOM_NUMERIC')).toMatchObject({provider:'deterministic-fixture',promptVersion:'2',promptSource:'SOURCE_CONTROLLED_TASK_POLICY',providerDataPolicy:'LOCAL_SYNTHETIC_FIXTURE'});expect(intelligenceExecutionManifest(fixture,'SCHOOL_CUSTOM_NATIVE')).toMatchObject({promptVersion:'3'});
  const unsupported=parseServerConfig({NODE_ENV:'test',AI_GENERATION_MODE:'LIVE',AI_PROVIDER:'unimplemented',AI_MODEL:'configured',OPENAI_API_KEY:'invented',AI_DATA_POLICY_STATUS:'APPROVED',AI_GLOBAL_DAILY_BUDGET:'1'});expect(intelligenceExecutionManifest(unsupported,'SCHOOL_CUSTOM_NUMERIC')).toBeNull();
 });
});
