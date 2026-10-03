import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityLabel } from '../capability-label.ts';

test('configured school features have human labels in both customer languages', () => {
  const configured = [
    ['learning', 'Learning', 'التعلّم'],
    ['assessment', 'Assessment and feedback', 'التقييم والملاحظات'],
    ['curriculum', 'Curriculum', 'المنهج'],
    ['learner.state', 'Learning progress', 'تقدّم التعلّم'],
    ['improvement', 'Next steps', 'الخطوات التالية'],
    ['school.operations', 'School operations', 'إدارة المدرسة'],
    ['community', 'School community', 'المجتمع المدرسي'],
    ['portfolio', 'Learning portfolio', 'ملف التعلّم'],
    ['restricted.records', 'Restricted school notes', 'الملاحظات المدرسية المقيّدة'],
  ] as const;
  for (const [code, english, arabic] of configured) {
    assert.equal(capabilityLabel(code, 'en'), english);
    assert.equal(capabilityLabel(code, 'ar'), arabic);
  }
});

test('unknown source codes never become primary labels or existing feature claims', () => {
  for (const code of ['new.feature', 'd3821d', '7c48f1', '8bb63f5b-7cfb-4a51-a680-b510befdaaf1', '', ' learner.state', 'LEARNER.STATE', 'portfolio ', 'toString', 'constructor', '__proto__']) {
    assert.equal(capabilityLabel(code, 'en'), 'Feature name unavailable');
    assert.equal(capabilityLabel(code, 'ar'), 'اسم الميزة غير متاح');
  }
});
