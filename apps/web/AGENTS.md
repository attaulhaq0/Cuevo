# Web contributor instructions

Inherit root AGENTS.md. Read this app README, docs/codebase-map.md and the affected feature README. Preserve the framework-generated block below; it is an additional version-specific reminder.

- app is for Next route composition; feature UI/model/messages/styles/test files belong under features/<feature>.
- public/media holds reviewed, versioned decorative bytes served by Next once. The consuming feature owns presentation/provenance. Never place private files, learner data, credentials or generated runtime content here; see docs/decisions/2026-10-03-public-decorative-media.md.
- Desktop and mobile use deliberately designed compositions in the same feature implementation, shared contracts/actions/tokens and deterministic initial HTML. Avoid duplicated forms, fetches, command owners or device-selected permission behavior.
- Shared session, requests, query hooks, forms and locale belong under shared and cannot import features. Shared design primitives belong in packages/ui.
- Cross-feature imports use only documented model.ts/api.ts/copy.ts/ui.tsx surfaces. Keep parsers separate from UI re-exports so Node tests stay browser/server independent.
- Course objective approval UI belongs to curriculum; learning preparation and academic marking consume current course-scoped approved choices and the public academic model label formatter. Preserve separate curriculum-source and approved academic-reference identities.
- Curriculum period planning uses current school period records and academic/learning public model/UI surfaces. Never infer taught lessons from completion or official coverage from a declared school plan; expose revision review and missing sources in both languages.
- Curriculum source lifecycle uses explicit technical school review; generic/source-locked provenance cannot become official/customer-ready through a checkbox. Show affected school work before retirement and keep retained evidence context clear.
- Academic class gradebook uses exact current course/source reads and native models; selected releases require server preview plus explicit per-source sharing/final confirmation. Never implement batch grades as browser loops or infer missing work as zero.
- Parent result sharing controls open one exact released source, read current publication/result revisions and require explicit reason/confirmation. Reports/portfolio/evidence rely on server publication authority; browser delivery cancellation does not replace it.
- Portfolio feedback review must match request/item/revision/learner/native source before mounting its confirmation. Show the actual reflection and source work, require selected-document review, and preserve existing separate parent publication. Collection/order controls remain learner-owned and use human names.
- School support metadata stays separate from profile/grades; only the exact task's public school/ui instructional surface is used for learner/parent content. Campus labels use school-authored facts and no campus membership grants access.
- Account composition uses school/ui LearnerProfile for exact current identity/enrollment/course context; never merge private notes, guardian directories or inferred traits into that projection.
 - Restricted record navigation requires explicit capability and admin/teacher role; source APIs still authorize policy owner/author/assigned follow-up. Its public UI stays separate from pupil, academic and intelligence views and makes synthetic-only retention limits visible.
- Never import @cuevo/config, database clients, Nest modules, server filesystem/network adapters or secrets into browser feature/shared code.
- Use English/Arabic translation keys, logical CSS and shared tokens. Preserve uncertain original-key retry, current membership revalidation, parent projections and disabled protected offline caching.
- Follow root customer-language rule: human names/context are primary labels; raw/shortened IDs and internal enum/source terminology belong only in explicitly opened support/provenance details. Unknown labels stay localized and actionable. Inspect all roles and duplicate-name states with real browser evidence.
- Explicit learner drilldowns must focus the named current detail after loading, including denied/unknown states, without stealing focus on background refresh. Reuse the existing school-authored class/year context across filters. Browser performance observations must assert rendered destinations and distinguish cancelled reads from actual transport failures; realistic volume remains a separate measurement.
- Hydration checks require deterministic initial server/client markup and actual console warning/error capture. Identify external DOM injection before changing product rendering; broad suppressHydrationWarning is not a substitute for fixing an application mismatch.
- Unit tests are discovered under features/*/test and shared/*/test; use the root web test runner rather than an obsolete flat test glob. Verify moved screens through Playwright/RTL/mobile/axe, plus typecheck/lint/build and architecture guards.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Shared UI semantic icon pixels stay under packages/ui/src/assets/icons; browser features use @cuevo/ui CuevoIcon names. Do not add random direct icon-library imports, duplicate a raster per feature, present PNGs as editable vectors, or turn illustration selection into source/role/academic authority. Keep directional transforms and disabled/focus/text semantics in the existing owner. Optical review at20–32px and theme/RTL/forced-color checks remain required.

Read docs/design/2026-10-03-approved-trail-colors-and-background.md for current palette changes: solid Royal primary actions, Pearl + blue edge selected controls, retained status badges and dedicated Midnight dark material. Use existing primary/selection tokens and shared characters/ui TrailBackground; never revive rejected gradients, cyan selection fills or brightness-dimmed light backgrounds. Preserve independent generic accent/status meaning, native callbacks, English/Arabic and static authentication.
