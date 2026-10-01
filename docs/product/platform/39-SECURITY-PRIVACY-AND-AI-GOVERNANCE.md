# Security, Privacy and AI Governance

## Threat model

Threat actors/risks:
- malicious student
- compromised parent account
- compromised staff account
- cross-tenant access
- manipulated client request
- leaked file URL
- prompt injection
- malicious uploaded content
- compromised AI provider/API key
- insider misuse
- abusive chat user
- model hallucination
- accidental over-sharing

## Security layers

```text
Browser
 ↓
Auth
 ↓
API authorization
 ↓
Tenant/role/object checks
 ↓
Database constraints/RLS
 ↓
Audit
 ↓
Monitoring
```

## Tenant isolation

Every protected resource must be scoped to school.

Never:
`GET /students/:id` → simply query by id.

Instead:
- resolve actor
- resolve tenant
- check role
- check relationship
- check object scope
- execute parameterized query

## Parent isolation

Parent access is based on a current approved relationship.

Revocation must affect:
- API
- file access
- reports
- messages
- search
- realtime
- cache invalidation

Previously delivered bytes cannot be recalled.

## File security

Buckets:
- public assets
- school-private
- learner-private
- sensitive staff/quality

Sensitive buckets remain private.

Use authorized downloads/signed URLs or server streaming as required.

## RLS

Enable RLS on exposed tables.

Write tests for:
- anon
- authenticated
- each role
- cross-school denial
- relationship revocation
- write denial

RLS is defense in depth, not a substitute for API authorization.

## AI data rules

Before a model call, determine:
- data purpose
- user authorization
- school policy
- age/data class
- provider contract status
- minimum context

Do not send:
- unnecessary student PII
- sensitive pastoral information unless explicitly approved and necessary
- secrets
- access tokens
- internal credentials

## Prompt injection

Treat retrieved documents/content as untrusted.

System/tool policies must be separate from retrieved content.

Never allow a document to instruct the agent to:
- ignore policy
- reveal secrets
- bypass authorization
- execute arbitrary code
- expose another learner

## AI output validation

All structured AI outputs pass schema validation.

AI must not directly mutate authoritative academic tables.

## High-impact decisions

Human approval for:
- grades
- student access changes
- sensitive parent communication
- safeguarding/pastoral conclusions
- curriculum official mappings
- accreditation claims
- irreversible school actions

## Social safety

MVP:
- school scope
- rate limits
- moderation
- report
- block/restrict
- staff escalation
- attachment controls
- audit
- private Realtime channels

## Audit

Record:
- actor
- timestamp
- school
- action
- target
- source request ID
- outcome
- before/after for important changes where permitted
- AI run ID where relevant

## Secrets

Never commit:
- service keys
- database passwords
- AI provider keys
- PostHog private keys
- signing secrets

Use environment/secret management.

## Privacy by design

Collect only data needed for a defined function.

Separate:
- academic
- development
- pastoral
- communication
- quality evidence

Do not create broad “all student data” AI retrieval endpoints.
