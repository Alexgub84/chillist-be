---
description: Pre-push review checklist — run before every commit
---

# Pre-Push Review Checklist

Before committing, verify each item below. If any check fails, fix it before pushing.

## Route → Service Delegation

- [ ] Every route that creates, modifies, or deletes an entity delegates business logic to a service function in `src/services/` (or calls the same side-effect functions the service calls).
- [ ] If a service function has side effects (auto-assignment, cleanup, notifications), verify that **every route** triggering that action calls the same side-effect functions — not just the route you modified.
- [ ] Routes do not do raw DB operations that duplicate or skip logic already in a service.

## Test Layering

- [ ] **Unit tests** cover service functions in isolation (direct function calls, mocked or real DB).
- [ ] **Integration tests** cover full route behavior via `app.inject()` — never by calling service functions directly.
- [ ] Integration tests include both the happy path (success) and at least one key unhappy path (validation error, auth failure, not-found, conflict) per route.
- [ ] No integration test imports and calls a service function to trigger the behavior under test. If it does, it belongs in a unit test file instead.

## Rule Compliance

- [ ] If a new rule was added to `rules/backend.md` in this commit, existing code was audited for pre-existing violations and fixed.
- [ ] If a new service function was created, all routes that perform the same action were updated to use it.
