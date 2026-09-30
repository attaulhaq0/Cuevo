# School Configuration and Modularity

## Goal

The same Edeviser application must support schools with one curriculum, multiple curricula, different modules and different quality/jurisdiction contexts.

## Three axes

### 1. Entitlements
What Edeviser capabilities the school has.

Examples:
- assessment
- portfolio
- habit/development
- intelligence
- accreditation workspace

### 2. Academic configuration
Which curriculum/programmes the school uses.

Examples:
- England National Curriculum
- Cambridge IGCSE
- IB MYP
- Pakistan NCP

### 3. Authorization
What a specific user can do.

## Formula

```text
school entitlement
+
school configuration
+
user authorization
=
capability available to this user
```

## Never rely on navigation hiding

A user should receive `403` when a protected endpoint is outside:
- tenant scope
- entitlement
- programme scope
- relationship
- role permission

## Example: Qatar British school

```text
Curriculum:
- England National Curriculum KS1–KS4
- Cambridge IGCSE

Jurisdiction:
- Qatar

Quality:
- BSO
- QNSA

Modules:
- SIS
- LMS
- Assessment
- Evidence
- Intelligence
- Development
- Community
- Parent
```

## Example: IB school

```text
Curriculum:
- IB PYP
- IB MYP
- IB DP

Jurisdiction:
- Qatar

Quality:
- CIS
- QNSA
```

## Example: school using one programme

Only the configured programme should appear in academic setup and navigation.

## Example: mixed school

A school may have:
- British primary
- Cambridge secondary
- another programme in sixth form

The data model stores programme instances instead of creating separate applications.

## Tenant isolation

All tenant-scoped queries should begin with a validated tenant context.

Do not accept `school_id` from the client as the sole proof of authorization.

## Feature rollout

Use server-side feature flags/entitlements.

Do not ship half-working features merely hidden in the UI.

## Configuration inheritance

Default:
Global product defaults
→ curriculum pack defaults
→ school settings
→ programme instance settings
→ course/teacher settings

More specific configuration can override non-authoritative defaults.

Authoritative academic rules cannot be overridden by a cosmetic UI setting.
