import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAuthError } from '../auth-error.ts';

test('only invalid credentials produce the credential feedback branch', () => {
  assert.equal(classifyAuthError({ status: 400, code: 'invalid_credentials', message: 'secret internal detail' }), 'credentials');
  assert.equal(classifyAuthError({ status: 422, code: 'invalid_credentials' }), 'credentials');
});

test('disabled email provider is an unavailable sign-in service despite its 422 status', () => {
  assert.equal(classifyAuthError({ status: 422, code: 'email_provider_disabled', message: 'Email logins are disabled' }), 'unavailable');
});

test('rate limits and service or network failures never tell the user to change credentials', () => {
  for (const error of [
    { status: 429, code: 'over_request_rate_limit' },
    { status: 429, code: 'over_email_send_rate_limit' },
    { status: 500, code: 'unexpected_failure' },
    { status: 503, code: 'service_unavailable' },
    { status: 0, name: 'AuthRetryableFetchError' },
    new TypeError('Failed to fetch'),
    null,
    { message: 'password internal upstream detail' },
    { status: 400, code: 'unknown_error' },
    { status: 400, code: 'user_banned' },
    { status: 400, code: 'email_not_confirmed' },
  ]) assert.equal(classifyAuthError(error), 'unavailable');
});

test('unavailable HTTP status takes precedence over an inconsistent credential code', () => {
  assert.equal(classifyAuthError({ status: 429, code: 'invalid_credentials' }), 'unavailable');
  assert.equal(classifyAuthError({ status: 503, code: 'invalid_credentials' }), 'unavailable');
});
