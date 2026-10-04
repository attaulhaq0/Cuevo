import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { thinkingFocusCatalogueSchema, thinkingFocusSchema, type ThinkingFocus, type ThinkingFocusCatalogue } from '@cuevo/contracts';
import { DomainError } from '@cuevo/domain';
import manifest from './manifest.json';

/** The build copies these private original metadata bytes with the Curriculum owner. */
declare const CUEVO_PEDAGOGY_CATALOGUE_URL: string | undefined;
const catalogueUrl = typeof CUEVO_PEDAGOGY_CATALOGUE_URL === 'string' ? new URL(CUEVO_PEDAGOGY_CATALOGUE_URL, import.meta.url) : new URL('./revised-bloom-v1.json', import.meta.url);

export function validateThinkingFocusCatalogue(bytes: string | Uint8Array): ThinkingFocusCatalogue {
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== manifest.files['revised-bloom-v1.json']) throw new DomainError('THINKING_FOCUS_SOURCE_REQUIRES_REVIEW', 409, 'The thinking-focus catalogue requires source review.');
  const text = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8');
  return thinkingFocusCatalogueSchema.parse(JSON.parse(text));
}

export function getThinkingFocusCatalogue(): ThinkingFocusCatalogue {
  return validateThinkingFocusCatalogue(readFileSync(catalogueUrl));
}

export function validateThinkingFocus(value: unknown): ThinkingFocus {
  const catalogue = getThinkingFocusCatalogue();
  const focus = thinkingFocusSchema.parse(value);
  if (focus.taxonomyVersion !== catalogue.taxonomyVersion) throw new DomainError('THINKING_FOCUS_SOURCE_REQUIRES_REVIEW', 409, 'The selected thinking-focus version requires review.');
  return focus;
}
