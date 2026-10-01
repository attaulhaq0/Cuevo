# Shared web infrastructure

Own only mechanisms reused across features: api/client.ts and pagination/responses, session/providers and membership/Auth, query hooks, common forms/feedback/branding, and global i18n. Shared may depend on packages/ui/contracts and other shared capabilities, never feature code. It has explicit server-free imports; tests live beside the capability in test. Feature-specific response models/copy remain under features.

`components/brand.tsx` is the one app-wide Cuevo brand surface, including the supplied transparent official mark under `assets/cuevo-mark.webp` and optional company attribution. It is not a source of role or school access. The auth loop/mascot remains feature-owned; student companion assets follow their own documented owner.

`LanguageSwitch` defaults to compact `EN`/Arabic labels for workspace chrome. Its `expanded` option displays the full English label on authentication; both variants use the same locale/session mechanism and accessible names.

CommandForm passes its successful response to onSaved before confirming the command journal. Feature receipt validation may reject an uncertain response while preserving the original key and payload; ordinary callbacks may ignore the response. Generic request, current scope and definitive/uncertain error classification remain shared.

Each CommandForm field describes its sanitized form-level error through aria-describedby. The API does not currently provide trusted per-field error detail, so the UI does not assert that every field is invalid. Native required/range validation and sign-in credential associations remain specific to their fields.

Product source lookup: [task context map](../../../docs/product/context-map.md); numbered IDs resolve through the product registry.
