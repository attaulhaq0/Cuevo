# Authentication presentation

Owns SignIn and AccessState components, exported through ui.tsx. Shared/session owns Auth client, current membership and provider state; shared/i18n owns common locale; shared/components owns branding/language controls. Auth presentation never depends on shell composition. Product source IDs 39, 62 and 63.

Authentication/client/membership unit cases live in shared/session/test, where their implementation is owned. Browser proof: tests/e2e/foundation.spec.ts. Keep denied, unavailable, expired and unknown states distinct; never accept a client-selected role as authorization or expose server credentials.

Product source lookup: [task context map](../../../../docs/product/context-map.md); numbered IDs resolve through the product registry.
