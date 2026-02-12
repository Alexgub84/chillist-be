# Chillist Backend

REST API for trip/event planning with shared checklists.

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:migrate    # run database migrations
npm run dev           # start Fastify dev server
```

Server runs at http://localhost:3333. Swagger UI at http://localhost:3333/docs.

## Documentation

Full documentation lives in [chillist-docs](https://github.com/Alexgub84/chillist-docs):

- [Backend Guide](https://github.com/Alexgub84/chillist-docs/blob/main/guides/backend.md) - setup, scripts, database, deployment, security
- [Backend Rules](https://github.com/Alexgub84/chillist-docs/blob/main/rules/backend.md) - schema design, DI, CORS, OpenAPI
- [Common Rules](https://github.com/Alexgub84/chillist-docs/blob/main/rules/common.md) - git workflow, planning, security
- [MVP Spec](https://github.com/Alexgub84/chillist-docs/blob/main/specs/mvp-v1.md) - product requirements and status
- [Dev Lessons](https://github.com/Alexgub84/chillist-docs/blob/main/dev-lessons/backend.md) - past bugs and fixes

## Tech Stack

Node.js 20+, Fastify 5, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest, Testcontainers
