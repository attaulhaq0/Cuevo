# Native numeric score RTL repair

**Goal:** Keep actual score/maximum visually and accessibly ordered in English and Arabic.

**Sources:** Product17/36/63 and Academic/web/root instructions. Native numeric facts remain unchanged; rubric descriptors are separate.

Actual production Arabic screenshot showed7outof10 visually read as10/7. The existing `.native-score` flex container inherits RTL and contains independently laid out score/maximum fragments. Bind the ratio in a `bdi dir=ltr` element and provide localized accessible “score out of maximum” text using the same native values and locale number formatter. Keep design tokens and the existing `.native-score strong` selector.

- [x] Add actual Arabic browser assertions for accessible label and isolated ratio direction to the visible full learning loop.
- [x] Run and preserve failure before implementation (70467,32.5s missing numeric accessible/isolation markup).
- [x] Add locale copy and isolated markup without changing numeric data, native model or rubric flow.
- [x] Verify result cards through actual full-loop/numeric/rubric3case pass90899; inspect screenshot to find separate measured-outcome ratio still reversed.
- [x] Reproduce outcome ratio in actual loop91064 (36.3s missing LTR2ratios); reproduce standalone report ratio with valid consistent native fixture, then isolate outcome/report ratio renderers.
- [x] Build, rerun the real English/Arabic loop with mobile axe and inspect screenshot/DOM order. Production2450passed3cases56.6s (full loop47.1s and report download/old-session denial);159webcases,lint/type/build/architecture pass. Remaining academic source-language work stays open.

Raw source version/customer label work remains separate. This repair does not claim all RTL or all academic wording is complete.
