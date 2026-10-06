# Accessibility, RTL and Internationalization

## Languages

MVP:
- English
- Arabic

## Architecture

Use translation keys.

Never put user-facing English strings directly into business logic.

## RTL

Arabic must support:
- mirrored layout
- correct text alignment
- navigation
- icon direction where meaningful
- tables
- charts
- forms
- dialogs
- chat
- notifications

Not everything should mirror mechanically; semantic icons may remain direction-neutral.

## Numbers

Test:
- Arabic-Indic numerals where user locale requires them
- Latin numerals
- dates
- percentages
- grades

## Accessibility

Target WCAG 2.2 AA practices.

Must support:
- keyboard navigation
- visible focus
- labels
- semantic landmarks
- screen-reader names
- contrast
- non-color status
- reduced motion
- form error associations

## Age-appropriate language

Student UI should avoid administrative jargon.

Example:
“Try this practice” rather than “Execute intervention.”

Staff interfaces can be more operational.

## Testing

Every major route:
- English
- Arabic
- RTL
- keyboard
- screen reader smoke
- 200% zoom
- reduced motion
