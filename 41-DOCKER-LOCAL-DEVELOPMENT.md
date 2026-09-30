# Docker and Local Development

## Goal

A junior developer should be able to clone, run one command, and reach a usable synthetic Edeviser environment.

## Local services

```text
web
api
worker
postgres/supabase local
mail testing
optional object storage emulator
optional observability
```

## Source of truth

- `docker-compose.yml`
- `.env.example`
- migration files
- seed scripts

## Required commands

```bash
npm install
npm run dev
npm run test
npm run lint
npm run typecheck
npm run e2e
```

If the repo uses pnpm, define one package manager and enforce it.

## Synthetic seed

Create:
- 1 school
- 5 teachers
- 30 students
- 30 parent relationships
- 2 coordinators
- 1 admin
- 2 classes
- mathematics
- English
- one curriculum MVP slice
- assessments
- realistic submissions
- interventions
- synthetic messages
- synthetic signals

Never seed production credentials.

## Data reset

Provide:
```bash
npm run db:reset
npm run db:seed
```

## Environment

`.env.example` contains names only, never secrets.

## Containers

Run as non-root where practical.

Pin major versions.

Health checks:
- web
- api
- worker
- database

## CI

Build Docker images in CI.

Do not deploy untested local-only images.
