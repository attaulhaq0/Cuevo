# Frontend Architecture

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- accessible Radix/React Aria
- Motion
- Lucide
- TanStack Query
- React Hook Form + Zod
- Storybook
- Playwright

## Folder structure

```text
apps/web/
  app/
    (auth)/
    (student)/
    (teacher)/
    (coordinator)/
    (parent)/
    (admin)/
  components/
    ui/
    learning/
    assessment/
    evidence/
    signals/
    intervention/
    community/
  features/
  hooks/
  lib/
  styles/
```

## Server/client boundary

Prefer server components for:
- route shells
- initial data
- secure server-side operations

Use client components for:
- quiz interaction
- realtime chat
- drag/drop
- rich editor
- interactive charts
- progress animation

## Data fetching

Use API contracts from NestJS.

Do not couple UI components directly to raw database tables.

## Design-system requirement

Every feature should use shared:
- typography
- spacing
- tokens
- primitives
- status components
- feedback patterns

## State

Server state:
TanStack Query.

Local UI state:
React state.

Cross-component state:
Zustand only when necessary.

Do not make Zustand the source of truth for academic data.

## Error boundaries

Use:
- route error boundaries
- component fallback
- retry
- reconnect state

Never silently swallow API errors.

## Navigation

Role-aware route groups.

Server authorization remains authoritative.

## Responsive

Design mobile behavior explicitly.

Do not hide desktop content indiscriminately to make mobile “fit.”
