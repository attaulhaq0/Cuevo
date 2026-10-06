import { describe, expect, it } from 'vitest';
import { getThinkingFocusCatalogue, validateThinkingFocus } from '../../src/modules/curriculum/public';
import { validateThinkingFocusCatalogue } from '../../src/modules/curriculum/pedagogy/catalogue';

describe('source-locked original thinking-focus vocabulary', () => {
  it('provides all six bilingual task categories and rejects learner-level interpretation', () => {
    const catalogue = getThinkingFocusCatalogue();
    expect(catalogue.processes.map(process => process.process)).toEqual(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE']);
    expect(catalogue.processes.every(process => process.label.en && process.label.ar && process.description.en && process.description.ar)).toBe(true);
    expect(catalogue.interpretation).toBe('TASK_DEMAND_NOT_LEARNER_LEVEL');
    expect(() => validateThinkingFocus({ taxonomyVersion: catalogue.taxonomyVersion, primaryProcess: 'APPLY', additionalProcesses: [], mastery: 0.9 })).toThrow();
  });
  it('pins original catalogue bytes, retains unavailable full text and rejects tampering', () => {
    const catalogue = getThinkingFocusCatalogue();
    expect(catalogue.sources.filter(source => source.access === 'BIBLIOGRAPHIC_ONLY').every(source => source.snapshotSha256 === null)).toBe(true);
    expect(catalogue.rights.externalFullTextLicensed).toBe(false);
    expect(catalogue.rights.publisherApproval).toBe(false);
    expect(() => validateThinkingFocusCatalogue(JSON.stringify({ ...catalogue, interpretation: 'LEARNER_LEVEL' }))).toThrow();
    expect(() => validateThinkingFocusCatalogue(JSON.stringify({ ...catalogue, processes: catalogue.processes.slice(0, 5) }))).toThrow();
  });
  it('returns an isolated catalogue value so callers cannot rewrite later validation', () => {
    const catalogue = getThinkingFocusCatalogue(); catalogue.processes[0].label.en = 'Changed by caller';
    expect(getThinkingFocusCatalogue().processes[0].label.en).toBe('Remember');
    expect(validateThinkingFocus({ taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'CREATE', additionalProcesses: ['REMEMBER'] }).primaryProcess).toBe('CREATE');
  });
});
