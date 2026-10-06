import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePersonChoice,currentLearnerChoices } from '../people.ts';
import { LearningApiError } from '../client.ts';
test('authorized child labels retain current class context without converting IDs into names', () => {
  const child = parsePersonChoice({ userId: 'student-id', displayName: 'Lina Hassan', role: 'student', classLabels: ['Year 8 · 8A · 2026–2027'] });
  assert.equal(child.classLabels[0], 'Year 8 · 8A · 2026–2027');
  assert.throws(() => parsePersonChoice({ userId: 'student-id', displayName: 'Lina Hassan', role: 'student', classLabels: [null] }), LearningApiError);
});
test('current learner choices refuse identical or missing school context without identifier suffixes',()=>{const person=parsePersonChoice({userId:'first',displayName:'Lina Hassan',role:'student',classLabels:['Year 8 · Cedar']});const ambiguous=currentLearnerChoices([person,{...person,id:'second',userId:'second'}, {...person,id:'missing',userId:'missing',classLabels:[]}],'Current class unavailable');assert.equal(ambiguous.every(choice=>choice.requiresReview),true);assert.equal(ambiguous[0].label,ambiguous[1].label);assert.equal(ambiguous.some(choice=>choice.label.includes('second')),false);const distinct=currentLearnerChoices([person,{...person,id:'second',userId:'second',classLabels:['Year 8 · Palm']}],'Current class unavailable');assert.equal(distinct.every(choice=>!choice.requiresReview),true);});
