import { intelligenceExecutionManifestSchema } from '@cuevo/contracts';
import type { ServerConfig } from '@cuevo/config';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase } from '@cuevo/config/synthetic-runtime';
import { resolveIntelligencePrompt } from './prompt';

/** A configured execution description is separate from external provider approval. */
export function intelligenceExecutionManifest(config:ServerConfig,dataClassification:'SCHOOL_CUSTOM_NUMERIC'|'SCHOOL_CUSTOM_NATIVE'){
  const settings=config.intelligence;if(!config.aiEnabled||!settings.approved||settings.mode==='DISABLED'||!settings.provider||!settings.model)return null;
  if(config.deploymentEnvironment==='synthetic-staging'){
    if(settings.mode!=='FIXTURE')return null;
    try{const hosted=hostedSyntheticRuntime({CUEVO_DEPLOYMENT_ENVIRONMENT:config.deploymentEnvironment,CUEVO_SYNTHETIC_PROJECT_REF:config.syntheticProjectRef,CUEVO_SYNTHETIC_WEB_ORIGIN:config.allowedOrigin,SUPABASE_URL:config.supabaseUrl});if(!hosted)return null;requireHostedSyntheticDatabase(config.databaseUrl,hosted,'cuevo_api');}catch{return null;}
  }
  if(settings.mode==='LIVE'&&(settings.provider!=='azure-foundry'||!config.foundry?.endpoint||!config.foundry.apiKey||!settings.globalDailyBudget))return null;
  const prompt=resolveIntelligencePrompt(settings.promptId,dataClassification==='SCHOOL_CUSTOM_NATIVE'?'3':settings.promptVersion);
  return intelligenceExecutionManifestSchema.parse({version:'teacher-insight-1',purpose:prompt.task,capabilities:[...prompt.capabilities],mode:settings.mode,provider:settings.provider,model:settings.model,promptId:prompt.id,promptVersion:prompt.version,promptDigest:prompt.digest,promptSource:prompt.source,promptEffectiveAt:prompt.effectiveAt,evaluationVersion:'source-78-checked-evidence-1',dataClassification,providerDataPolicy:settings.mode==='FIXTURE'?(config.deploymentEnvironment==='synthetic-staging'?'HOSTED_SYNTHETIC_FIXTURE':'LOCAL_SYNTHETIC_FIXTURE'):config.foundry?.syntheticOnly?'SYNTHETIC_ONLY':'APPROVED',maxOutputTokens:settings.maxTokens,timeoutMs:settings.timeoutMs,maxCost:settings.maxCost});
}
