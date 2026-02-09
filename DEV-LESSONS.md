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

### [Config] AJV strict mode rejects OpenAPI-only keywords
**Date:** 2026-02-09
**Problem:** Used `discriminator` keyword in JSON Schema `oneOf` for the CreateItemBody schema. Fastify's AJV runs in strict mode and rejected it with "unknown keyword: discriminator"
**Solution:** Removed `discriminator` — AJV doesn't need it. Single-value enums in each sub-schema (`['equipment']` vs `['food']`) already act as natural discriminators for validation
**Prevention:** Avoid OpenAPI-only keywords (`discriminator`, `xml`, `externalDocs`) in schemas that AJV validates. Use simple flat schemas when possible — `oneOf` with `$ref` in Fastify can cause subtle validation issues

### [Logic] Keep schemas simple — handle conditional logic in handlers
**Date:** 2026-02-09
**Problem:** Tried to express "equipment items don't need unit, food items require unit" via `oneOf` with two sub-schemas and a discriminator. This caused AJV validation failures and added unnecessary complexity
**Solution:** One flat `CreateItemBody` schema with `unit` optional. Handler checks: if food and no unit, return 400. If equipment, auto-set unit to `pcs`
**Prevention:** Don't encode conditional business rules in JSON Schema. Use a simple flat schema for validation, enforce business rules in the handler
