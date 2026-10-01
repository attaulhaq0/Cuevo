# Assessment and Gradebook Functional Specification

## Assessment models

The engine must support:
- numeric
- percentage
- letter grade
- grade band
- criterion level
- achievement level
- rubric
- pass/fail
- custom structured result

## Components

Assessment:
- intent
- academic references
- components
- rubric
- grading scheme
- dates
- evidence requirements
- release policy

## Native result

Every result retains:
- native representation
- normalized representation where meaningful
- scale metadata
- assessment model
- policy version

Never discard the native result.

## Result lifecycle

DRAFT
→ REVIEW
→ RELEASE
→ CORRECTED

Corrections create a new immutable revision.

## Atomic result command

One server-owned transaction validates:
- actor
- tenant
- enrollment
- assessment
- authorization
- policy version
- evidence
- idempotency key

then writes:
- result revision
- current projection
- evidence relationship
- audit
- outbox

## Gradebook

Teacher needs:
- class grid
- student detail
- evidence drawer
- rubric
- bulk operations with confirmation
- pending releases

## Academic authority

AI may draft feedback or suggest marking assistance.

Final grades remain governed by the school's authorized assessment process.
