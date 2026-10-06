# Exact home action destinations

**Goal:** Home next-action links open the named assessment, marking submission, intervention or released result, with current authorization and browser Back/Forward.

**Sources:**13 prioritized next action;37 role journeys;36 meaningful primary actions;39 current object scope;62 feature/public interface architecture. The functional review confirms named actions currently open only their feature list.

**Design:** Add a browser-safe navigation intent in shared routing with explicit allowed target/source pairs and UUID validation. URLs retain `view` plus source kind/ID; shell passes the validated intent to the owning workspace. Each feature resolves the exact source through its current authorized API and shows denied/missing/retry/back states; deep links never authorize access. Owner tables remain authoritative. Existing server routes receive bounded exact single reads for assessment, current marking source and intervention as needed, not a broad search. Human labels remain primary and technical IDs stay query/provenance only.

**Acceptance:** Red navigation contract rejects foreign target/source pairs and malformed IDs. Actual home student pending task and teacher marking open the exact record despite list paging; intervention opens the exact approved task, result opens native evidence. Back/Forward and current revocation deny, English/Arabic/mobile/keyboard/axe pass. Public feature surfaces and hierarchy/docs guards updated; source permissions unchanged.

- [ ] Add navigation intent contract/parser tests and exact authorized source APIs.
- [ ] Connect role-home intents, shell URL/history and owner workspace resolution.
- [ ] Run actual API/current denial and browser next-action chains.
