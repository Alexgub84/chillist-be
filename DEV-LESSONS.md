# Development Lessons

A log of bugs, mistakes, and fixes encountered during development. Each entry documents the root cause and solution to prevent future occurrences.

---

<!-- Add new entries below this line -->

### [Arch] Use dependency injection for testable services
**Date:** 2026-02-02
**Problem:** Routes imported db directly, making tests require env vars before module load and coupling code to specific implementations
**Solution:** Use DI pattern - buildApp({ db }) accepts dependencies, routes use fastify.db from context, tests inject testcontainer db
**Prevention:** Always inject services into app, never import directly in routes. Entry point creates real services, tests create test services
