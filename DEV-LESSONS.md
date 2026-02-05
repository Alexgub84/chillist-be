# Development Lessons

A log of bugs, mistakes, and fixes encountered during development. Each entry documents the root cause and solution to prevent future occurrences.

---

<!-- Add new entries below this line -->

### [Arch] Use dependency injection for testable services
**Date:** 2026-02-02
**Problem:** Routes imported db directly, making tests require env vars before module load and coupling code to specific implementations
**Solution:** Use DI pattern - buildApp({ db }) accepts dependencies, routes use fastify.db from context, tests inject testcontainer db
**Prevention:** Always inject services into app, never import directly in routes. Entry point creates real services, tests create test services

### [Config] OpenAPI schemas must use centralized $ref system
**Date:** 2026-02-05
**Problem:** Inline JSON schemas in routes cause duplication, are hard to maintain, and result in bloated OpenAPI spec
**Solution:** Create `src/schemas/` folder with schemas that have `$id`, register via `registerSchemas(fastify)`, reference in routes with `{ $ref: 'SchemaName#' }`
**Prevention:** Never define schemas inline in routes. Always create in `src/schemas/`, register in index.ts, use $ref

### [Config] Don't hardcode localhost in OpenAPI servers
**Date:** 2026-02-05
**Problem:** OpenAPI spec had hardcoded `http://localhost:3333` in servers array, which gets committed and is irrelevant for frontend
**Solution:** Removed `servers` section entirely - frontend configures API URL via its own environment variables
**Prevention:** Don't include environment-specific URLs in OpenAPI spec. Let clients configure their own base URL

### [Config] Don't over-engineer error response schemas
**Date:** 2026-02-05
**Problem:** Created separate HealthyResponse and UnhealthyResponse schemas for health endpoint, but 503 response body is never parsed by clients
**Solution:** Single HealthResponse schema for 200 only. Unhealthy = any non-200 status, body doesn't matter
**Prevention:** Only type responses that clients actually parse. Error responses often just need status code check
