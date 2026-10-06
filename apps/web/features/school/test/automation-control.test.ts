import assert from 'node:assert/strict';
import test from 'node:test';
import { schoolAutomationControl } from '../components/automation.tsx';
test('Learner State controls open its observation policy while other authority axes stay separate',()=>{assert.equal(schoolAutomationControl('LEARNER_STATE'),'observationPolicy');assert.equal(schoolAutomationControl('ATTENTION'),'progress');assert.equal(schoolAutomationControl('RECOGNITION'),'development');assert.equal(schoolAutomationControl('COMMUNICATION'),'community');assert.equal(schoolAutomationControl('INTELLIGENCE'),'improvement');});
