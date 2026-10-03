import assert from 'node:assert/strict';
import test from 'node:test';
import { schoolRecordName, schoolClassName } from '../labels.ts';
test('school labels resolve current names without displaying identifiers as missing names', () => {
  assert.equal(schoolRecordName('private-identifier', [], 'Name unavailable'), 'Name unavailable');
  assert.equal(schoolClassName({ id: 'c', name: '8A', yearGroupId: 'g', academicYearId: 'y' }, [{ id: 'y', name: '2026–2027' }], [{ id: 'g', name: 'Year 8' }], 'Unavailable'), '8A · Year 8 · 2026–2027');
});
