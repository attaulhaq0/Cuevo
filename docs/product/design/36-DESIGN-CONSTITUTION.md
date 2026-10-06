# Edeviser Design Constitution

## Experience goal

Edeviser should feel:
- intelligent
- warm
- premium
- clear
- human
- energetic but calm
- school-trustworthy
- modern without looking like a generic AI SaaS dashboard

## Design hierarchy

Primary:
**What should I do next?**

Secondary:
**Why?**

Tertiary:
**What evidence supports this?**

## Avoid

- dashboard card walls
- excessive gradients
- excessive glassmorphism
- random rounded containers
- huge shadows
- tiny text
- emoji as primary UI icons
- mixed icon families
- charts without an actionable question
- decorative animation
- fake metrics
- “AI magic” visuals that hide provenance

## Visual system

Define tokens for:
- type scale
- spacing
- radius
- elevation
- colors
- motion
- focus
- density

Use semantic tokens, not arbitrary hex values in components.

## Typography

Support:
- Latin
- Arabic
- bilingual line lengths
- correct numeral handling
- accessible line heights

## Component principles

Build a reusable component library:
- Button
- Input
- Select
- Dialog
- Sheet
- Tabs
- Toast
- Table
- Card
- Timeline
- Status
- Progress
- EvidenceList
- SignalCard
- RecommendationPanel
- InterventionPanel
- LearningActivity
- MessageThread

## AI surfaces

An AI recommendation must visually show:
- AI-generated label
- evidence/source references
- why it appeared
- what is known vs inferred
- controls
- approval state

Never visually merge AI text into authoritative school data.

## Motion

Use Motion for:
- progress changes
- task completion
- feedback/reward
- navigation hierarchy
- expanding evidence
- subtle transitions

Rules:
- 120–280ms for micro interactions
- avoid long blocking animations
- support `prefers-reduced-motion`
- no animation-only information

## Student UX

The student home should feel like:
- learning journey
- next action
- progress
- meaningful achievement
- human connection

It should not feel like:
- ERP
- exam spreadsheet
- social media clone
- corporate analytics dashboard

## Teacher UX

Prioritize:
- what needs attention
- why
- evidence
- one-click next action

## Parent UX

Prioritize:
- understandable progress
- upcoming work
- approved teacher feedback
- how to help

## Admin UX

Prioritize:
- configuration
- permissions
- policy
- automation
- audit
- school health

## Accessibility

Target WCAG 2.2 AA practices appropriate to the web application.

Never rely on color alone.

All interactive elements need visible keyboard focus.
