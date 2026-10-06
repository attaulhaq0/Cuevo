# Security Threat and Test Matrix

| Threat | Control | Test |
|---|---|---|
| Cross-school student access | tenant authorization + RLS | school A user requests school B |
| Parent relationship revoked | current relationship check | revoke then re-request |
| Teacher changes other class | class authorization | direct API mutation |
| Leaked file URL | private storage | expired/revoked access |
| Public Realtime room | private channels | unauthorized join |
| Student chat abuse | report/rate-limit/moderation | spam + report |
| Prompt injection | policy/tool separation | malicious document |
| AI data leakage | minimum context | unrelated student present |
| AI changes grade | domain command boundary | model attempts mutation |
| Duplicate result | idempotency | same request twice |
| Worker duplicate | event idempotency | retry event |
| Stale curriculum | version pinning | superseded version |
| Missing evidence | state machine | release without evidence |
| Session revocation | current auth checks | old token/access path |
| Privilege escalation | role/entitlement checks | forged role request |
| Sensitive logs | redaction | inspect logs |
| Secret exposure | secret management | browser bundle scan |
| SQL injection | parameterized queries | malicious input |
| XSS | output encoding/sanitization | script payload |
| CSRF where applicable | SameSite/CSRF design | forged request |
| Broken object-level auth | object checks | IDOR test |
| Excessive API enumeration | pagination/rate limit | automated enumeration |

## Required security release gate

All critical rows must pass before production.
