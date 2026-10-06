# API Implementation Checklist

## Each module must have

- controller
- service
- domain types
- repository/data access
- authorization
- validation
- OpenAPI
- tests
- audit where appropriate

## Academic mutation checklist

[ ] actor authenticated
[ ] school scope resolved
[ ] enrollment/relationship checked
[ ] entitlement checked
[ ] assessment/policy version checked
[ ] evidence references valid
[ ] idempotency key required
[ ] transaction
[ ] audit
[ ] outbox
[ ] response receipt

## AI mutation checklist

[ ] intent checked
[ ] data purpose checked
[ ] context minimized
[ ] policy applied
[ ] structured output validated
[ ] human approval where required
[ ] domain command used
[ ] AI run audited

## Social mutation checklist

[ ] school scope
[ ] membership
[ ] moderation policy
[ ] rate limit
[ ] message/report audit
[ ] attachment safety

## File checklist

[ ] bucket private
[ ] path scoped
[ ] access checked
[ ] short-lived authorized access
[ ] content type/size validated
[ ] malware scanning strategy where required
[ ] deletion/retention policy
