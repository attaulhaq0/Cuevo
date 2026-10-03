import { z } from 'zod';
import { DomainError } from '@cuevo/domain';
import { groundedProposalSchema, validateEvidenceContext, ProposalEvaluationError, type AIProvider } from './orchestrator';
import { intelligenceAnalysisSchema } from '@cuevo/contracts';
import { resolveIntelligencePrompt } from './prompt';
import { validateInsightContext } from './insight-context';

export type FoundryProviderConfig = { endpoint: string; model: string; apiKey: string; reservedCost: number; syntheticOnly: boolean; inputCostPerMillion?: number; outputCostPerMillion?: number };
const legacyWireSchema = groundedProposalSchema.omit({ selectedActivityId: true,analysis:true }).extend({ selectedActivityId: z.uuid().nullable() }).strict();
const usefulWireSchema=legacyWireSchema.extend({analysis:intelligenceAnalysisSchema}).strict();
function unavailable() { return new DomainError('INTELLIGENCE_PROVIDER_FAILED', 503, 'Configured model generation is unavailable or requires review.'); }
async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > 65536 || !response.body) throw unavailable();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 65536) { await reader.cancel(); throw unavailable(); } chunks.push(chunk.value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Responses transport has no academic mutation tools and receives only minimized authorized facts. */
export class FoundryProvider implements AIProvider {
  private readonly endpoint: string;
  constructor(private readonly config: FoundryProviderConfig, private readonly transport: typeof fetch = fetch) {
    let endpoint: URL; try { endpoint = new URL(config.endpoint); } catch { throw unavailable(); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !endpoint.hostname.endsWith('.services.ai.azure.com') && !endpoint.hostname.endsWith('.openai.azure.com') || !/^\/openai\/v1\/?$/.test(endpoint.pathname)
      || !config.apiKey || !config.model || !Number.isFinite(config.reservedCost) || config.reservedCost <= 0
      || (config.inputCostPerMillion !== undefined || config.outputCostPerMillion !== undefined || !config.syntheticOnly) && (!Number.isFinite(config.inputCostPerMillion) || !Number.isFinite(config.outputCostPerMillion) || config.inputCostPerMillion! <= 0 || config.outputCostPerMillion! <= 0)) throw unavailable();
    this.endpoint = config.endpoint.replace(/\/$/, '') + '/responses';
  }
  async generate(request: Parameters<AIProvider['generate']>[0]): Promise<Awaited<ReturnType<AIProvider['generate']>>> {
    if (request.purpose !== 'NEXT_LEARNING_ACTION' || !Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 4000) throw unavailable();
    const context = validateEvidenceContext(request.context);
    const insight=request.insight?validateInsightContext(request.insight,context):undefined;const prompt=request.prompt??resolveIntelligencePrompt('next-learning-action','1');
    const wireSchema=prompt.version==='2'||prompt.version==='3'?usefulWireSchema:legacyWireSchema;const jsonSchema=z.toJSONSchema(wireSchema,{target:'draft-7'});
    const allowedActions=request.allowedActions??['GUIDED_PRACTICE','REVIEW_FEEDBACK'];
    if(!allowedActions.length||allowedActions.some(action=>!['GUIDED_PRACTICE','REVIEW_FEEDBACK'].includes(action)))throw unavailable();
    const learningOptions=insight?.learningOptions.map(option=>({activityId:option.activityId,kind:option.kind,...(prompt.version==='2'||prompt.version==='3'?{title:option.title,instructions:option.instructions}:{})}))??[];
    const untrustedContext=insight?{reference:insight.reference,recentResults:insight.recentResults,observations:insight.observations,priorInterventions:insight.priorInterventions,learningOptions}:undefined;
    const payload = { model: this.config.model, store: false, max_output_tokens: request.maxOutputTokens, reasoning: { effort: 'low' },
      input: [{ role: 'system', content: prompt.content+' '+(this.config.syntheticOnly?'This is synthetic test data.':'Use only the supplied authorized evidence.') },
        { role: 'user', content: JSON.stringify({ purpose: request.purpose, evidence: context,allowedActions,...(prompt.version==='2'||prompt.version==='3'?{untrustedContext}:{learningOptions}) }) }],
      text: { format: { type: 'json_schema', name: 'cuevo_grounded_proposal', strict: true, schema: jsonSchema } } };
    const body = JSON.stringify(payload);
    const inputBytes = new TextEncoder().encode(body).byteLength;
    if (inputBytes > 90000) throw unavailable();
    // UTF-8 bytes conservatively bound this small byte-tokenized request. Operator input
    // rates must include any chargeable cache writes; they are estimates, not invoice rates.
    if (this.config.inputCostPerMillion !== undefined && this.config.outputCostPerMillion !== undefined
      && (inputBytes * this.config.inputCostPerMillion + request.maxOutputTokens * this.config.outputCostPerMillion) / 1000000 > this.config.reservedCost)
      throw new DomainError('INTELLIGENCE_LIMIT_EXCEEDED', 503, 'Configured model budget requires review.');
    let response: Response;
    try { response = await this.transport(this.endpoint, { method: 'POST', redirect: 'error', credentials: 'omit', headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' }, body, signal: request.signal }); }
    catch { throw unavailable(); }
    if (!response.ok) throw unavailable();
    let value: unknown; try { value = await boundedJson(response); } catch { throw unavailable(); }
    const envelope = z.object({ status: z.literal('completed'), usage: z.object({ input_tokens: z.number().int().positive(), output_tokens: z.number().int().positive(), total_tokens: z.number().int().positive().optional() }), output: z.array(z.unknown()).optional(), output_text: z.string().optional() }).passthrough().safeParse(value);
    if (!envelope.success || envelope.data.usage.output_tokens > request.maxOutputTokens) throw unavailable();
    const chunks: string[] = [];
    for (const item of envelope.data.output ?? []) {
      const message = z.object({ type: z.enum(['message', 'reasoning']), content: z.array(z.object({ type: z.literal('output_text'), text: z.string() }).passthrough()).optional() }).passthrough().safeParse(item);
      if (!message.success) throw unavailable();
      if (message.data.type === 'message') for (const part of message.data.content ?? []) chunks.push(part.text);
    }
    const text = chunks.length ? chunks.join('') : envelope.data.output_text;
    if (!text) throw unavailable(); let output: unknown; try { output = JSON.parse(text); } catch { throw new ProposalEvaluationError(); }
    const parsed = wireSchema.safeParse(output); if (!parsed.success) throw new ProposalEvaluationError();
    const { selectedActivityId, ...grounded } = parsed.data;
    const hasRates = this.config.inputCostPerMillion !== undefined && this.config.outputCostPerMillion !== undefined;
    const cost = hasRates ? (envelope.data.usage.input_tokens * this.config.inputCostPerMillion! + envelope.data.usage.output_tokens * this.config.outputCostPerMillion!) / 1000000 : this.config.reservedCost;
    return { output: { ...grounded, ...(selectedActivityId ? { selectedActivityId } : {}) }, inputTokens: envelope.data.usage.input_tokens, outputTokens: envelope.data.usage.output_tokens, cost,
      costBasis: hasRates ? 'CONFIGURED_TOKEN_RATES' : 'BUDGET_RESERVATION', billedCost: null };
  }
}
