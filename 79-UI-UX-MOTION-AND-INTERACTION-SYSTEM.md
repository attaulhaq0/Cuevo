# Edeviser UI/UX, Motion and Interaction System

## Product feeling

Edeviser should feel:

- intelligent
- warm
- modern
- premium
- human
- trustworthy
- energetic without being childish

It should feel like a learning product, not an ERP.

## Role questions

Student: What should I do next?
Teacher: Who needs me, why, and what can I do?
Parent: How is my child progressing and how can I support them?
Coordinator: Where are learning/evidence gaps and what action is needed?
Admin: What should I configure, control or investigate?

## Information hierarchy

1. Action / next step
2. Why it matters
3. Evidence/context
4. Optional deeper analysis

## Visual rules

Use:

- strong typography hierarchy
- generous but efficient spacing
- semantic design tokens
- consistent icon family
- restrained shadows
- meaningful grouping
- progressive disclosure
- skeleton/loading states
- excellent empty states
- clear error/recovery states

Avoid:

- dashboard card walls
- excessive gradients
- glassmorphism everywhere
- random border radii
- giant decorative charts
- fake metrics
- emoji as primary UI icons
- mixing icon systems
- tiny text
- decorative AI animations

## Motion

Use Motion for meaningful transitions:

- page/context transitions
- expanding evidence
- progress updates
- task completion
- achievement/reward feedback
- live collaboration status

Target micro interactions approximately 120–280ms where appropriate.

Honor `prefers-reduced-motion`.

No important information may depend on animation.

## Student experience

Student Home should prioritize:

- continue learning
- today's actions
- personalized next step
- progress
- learning habit recognition
- community connection

## Teacher experience

Teacher Home should prioritize:

- attention signals
- evidence-backed explanation
- fast review
- assessment queue
- interventions

## Responsive rule

Desktop is not simply mobile with components hidden.

Define behavior for:

- 1440+
- 1024
- 768
- 390
- 320 where feasible

Test touch targets and keyboard behavior independently.

## Accessibility

Target WCAG 2.2 AA practices appropriate to the product, including visible focus, semantic structure, keyboard operation, adequate contrast and reduced motion.

Official source:
https://www.w3.org/WAI/standards-guidelines/wcag/

## RTL

Arabic is a first-class language, not a translation patch.

Logical CSS properties, mirrored navigation where appropriate, correct bidirectional text handling and Arabic-friendly typography are required.
