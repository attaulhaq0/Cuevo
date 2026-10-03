# Authentication presentation

Owns SignIn and AccessState components, exported through ui.tsx. Shared/session owns Auth client, current membership and provider state; shared/i18n owns common locale; shared/components owns branding/language controls. Auth presentation never depends on shell composition. Product source IDs 39, 62 and 63.

Authentication/client/membership unit cases live in shared/session/test, where their implementation is owned. Browser proof: tests/e2e/foundation.spec.ts. Keep denied, unavailable, expired and unknown states distinct; never accept a client-selected role as authorization or expose server credentials.

Support-reference disclosures retain native details/summary behavior with a44px minimum touch target and token-based separation from access-recovery actions. Denied/expired/unavailable browser checks include their actual WCAG2.2 target-size assessment.

Initial locale and access markup use the server-provided cookie/configuration consistently before browser effects. Hydration verification captures console warnings/errors as well as page errors in extension-free English/Arabic documents. hydration-diagnostics.spec.ts separately injects a known extension body attribute to distinguish an outside DOM mutation from application markup; no blanket body suppression masks a discrepancy.

Product source lookup: [task context map](../../../../docs/product/context-map.md); numbered IDs resolve through the product registry.
