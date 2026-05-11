# CLAUDE.md — chillist-be

Project-specific rules. Global rules live in `~/.claude/CLAUDE.md` and apply everywhere.

---

## Workspace Scope

This is the **BACKEND repo** (`chillist-be`). Only modify files inside this repo.

**NEVER** modify files in `chillist-fe` or any other sibling repo — including "just this one hook" or debugging UI flows. Ship BE + OpenAPI + docs; FE work belongs in `chillist-fe`. If a task requires frontend changes, stop and tell the user to switch to the frontend repo.

**ONE exception:** you MAY read and write files in `../chillist-docs/` (the shared docs repo) to read rules/docs and update dev-lessons, guides, specs, or rules. Docs repo always commits directly to `main` — no feature branches or PRs.

---

## How to Start Every Task

Before writing any code, read ALL of these files first:

1. `../chillist-docs/rules/common.md` — git workflow, planning, code standards, security
2. `../chillist-docs/rules/backend.md` — schema design, DI, CORS, logging, testing, breaking changes
3. `../chillist-docs/guides/backend.md` — setup, scripts, database, deployment, CI/CD
4. `../chillist-docs/specs/mvp-v1.md` — product requirements, entities, API endpoints
5. `../chillist-docs/dev-lessons/backend.md` — past bugs (check before debugging)

For WhatsApp-related tasks, also read:

6. `../chillist-docs/specs/whatsapp.md` — WhatsApp integration spec: endpoints, invitation messaging, BE architecture, testing pattern

Read the docs FIRST, then explore only the specific files in this repo relevant to the task. Do NOT scan the entire codebase upfront.

---

## TDD — Test First, Then Code

**Strict red → green cycle. No exceptions.**

1. Write the integration test first (against real local DB via `buildApp()` + Testcontainers).
2. Run the test and **confirm it fails RED** — show the failing output before writing any implementation.
3. Write the minimal implementation to make it pass.
4. Re-run and confirm GREEN.

**Hard rules:**
- No production code before a failing test.
- The failing-test step is non-skippable.
- Integration tests use `buildApp()` with `db` from `setupTestDatabase()` — never mock the database.
- Test files live in `tests/integration/` following the `internal-*.test.ts` naming pattern for internal routes.

---

## Planning

Before writing any implementation code, complete ALL steps below in order. Do NOT skip any step. Stop and wait for explicit approval before proceeding.

For the full planning guide, read: `../chillist-docs/guides/planning.md`

### Step 0 — Read Project Docs First (MANDATORY)

Read ALL of these files before doing anything else. If any file is missing, STOP and tell the user.

1. `../chillist-docs/rules/common.md`
2. `../chillist-docs/rules/backend.md`
3. `../chillist-docs/guides/backend.md`
4. `../chillist-docs/specs/mvp-v1.md`
5. `../chillist-docs/dev-lessons/backend.md`
6. `../chillist-docs/guides/planning.md`

For WhatsApp tasks, also read: `../chillist-docs/specs/whatsapp.md`

### Step 1 — Lessons from Similar Tasks

Write a short "Lessons Relevant to This Task" section. Check `dev-lessons/backend.md` and `// TODO`, `// FIXME`, `// HACK` comments near the area. Call out common AI mistakes for this task type (async edge cases, missing null guards, happy-path-only tests, missing side-effect propagation across routes, etc.).

### Step 2 — Scenario Analysis

List ALL scenarios before writing a single test:
- **Happy path** — primary flow when everything works
- **Error path** — what can fail and what the system does for each
- **Edge cases** — empty/null/zero inputs, double-submit, race conditions, missing permissions, etc.

### Step 3 — Architecture & Security

- Identify all modules and services affected
- Nominate the design pattern to use
- Flag OWASP risks (IDOR, injection, broken auth)

### Step 4 — Test Strategy

Assign every scenario to the correct layer:
- **Unit** — service functions in isolation, direct function calls, mocked or real DB
- **Integration** — full route behavior via `app.inject()`, happy path + at least one unhappy path per route
- **E2E** — critical full-user journeys only

### Step 5 — Module & File Breakdown + Execution Flow

For each file: purpose, exports, dependencies, side effects. Flag files touching >3 concerns. Write a short prose description of the full flow from request to response.

### Step 6 — Documentation Plan

Every plan must include a documentation update step, or explicitly state:
> "No docs changes needed — reason: [why]"

### Step 7 — Approval Gate

**STOP. Present the full plan (Steps 1–6). Ask:**
> "Does this plan look right? Should I adjust anything before I start writing tests?"

Only proceed after the user explicitly approves.

---

## Before Committing

0. **Branch check (MANDATORY FIRST STEP):** Run `git branch --show-current`. If you are on `main`, STOP. Stash changes, create a feature branch (`git checkout -b feat/<slug>`), pop the stash. **NEVER commit directly to `main`.**
1. Run through the pre-push review checklist below.
2. Pull main and merge: `git fetch origin main && git merge origin/main`
3. Run `npm run openapi:generate` to regenerate the OpenAPI spec.
4. Update docs in `../chillist-docs/` if the change affects them:
   - `current/status.md` — update when features are added, changed, or removed; update "BE version" line with commit SHA
   - `specs/mvp-v1.md` — update Auth status row when auth milestones are reached
   - `specs/user-management.md` — update phase/step status and endpoint tables
   - `guides/backend.md` — update "What's next" section when phases/steps are completed
   - `dev-lessons/backend.md` — add entry if a bug was fixed or a non-obvious lesson learned
5. Stage and commit following the finalization protocol in `../chillist-docs/guides/planning.md` Phase 5. Do **not** `git push` unless the user explicitly asks.

---

## Pre-Push Review Checklist

Before committing, verify each item. Fix any failures before pushing.

### Route → Service Delegation
- [ ] Every route that creates, modifies, or deletes an entity delegates business logic to a service function in `src/services/`
- [ ] If a service function has side effects (auto-assignment, cleanup, notifications), verify that **every route** triggering that action calls the same side-effect functions — not just the route you modified
- [ ] Routes do not do raw DB operations that duplicate or skip logic already in a service

### Test Layering
- [ ] **Unit tests** cover service functions in isolation (direct function calls, mocked or real DB)
- [ ] **Integration tests** cover full route behavior via `app.inject()` — never by calling service functions directly
- [ ] Integration tests include both the happy path and at least one key unhappy path per route
- [ ] No integration test imports and calls a service function to trigger the behavior under test

### Rule Compliance
- [ ] If a new rule was added to `rules/backend.md`, existing code was audited for pre-existing violations and fixed
- [ ] If a new service function was created, all routes that perform the same action were updated to use it

---

## Adding a New External Service

When integrating a new external API (WhatsApp, email, SMS, payment), follow this checklist.

### 1. Service layer
- Create the real service in `src/services/<name>/` implementing an interface (e.g., `IWhatsAppService`)
- Create a fake **client** for tests (e.g., `FakeGreenApiClient`) — fakes only the HTTP transport layer, returns success, stores calls for assertions
- Create a factory function that only creates the **real** service — never the fake
- The fake client must only be injectable via `buildApp` options, never created by the factory

### 2. Fastify plugin
- Register the service as a Fastify decorator via a plugin in `src/plugins/`
- If `opts.<client>` is provided (test injection), use it — wrap it in the real service class so all processing logic runs
- If provider is `fake` (dev only), use a `NoopService` that returns `{ success: false }`
- If the real service fails to initialize — **let it crash** (no silent fallback)
- Log the concrete service type at startup (info level)

### 3. Environment validation
- Add the provider env var to `src/env.ts` (e.g., `SERVICE_PROVIDER: z.enum([...]).default('fake')`)
- Add `.refine()`: block `fake` in production
- Add `.refine()`: require credentials when the real provider is selected
- Follow the same pattern as `SUPABASE_URL` and `WHATSAPP_PROVIDER`

### 4. Tests
- **Unit tests for the real service** — mock the HTTP layer (e.g., `globalThis.fetch`), not the service itself
- **Unit tests for the fake client** — verify it stores calls and returns expected shapes
- **Env guard tests** — verify `fake` is rejected in production, credentials required for real provider
- **Integration tests** — inject the fake via `buildApp` options, assert on stored messages
- **E2E prod test** — `describe.skipIf(!CREDS)`, tests the real API with real credentials; skipped in CI, run manually before deploy

### 5. Env example
- Add the new env vars to `.env.example` with comments explaining which values are for dev vs production

---

## Production Log Debugging

When asked to debug a production issue or fetch production logs:

1. **Fetch logs first** using the Railway log script:
   ```bash
   npm run railway:logs              # last 24 hours (default)
   npm run railway:logs -- 1         # last 1 hour
   npm run railway:logs -- 48        # last 48 hours
   npm run railway:logs -- 1 "@level:error"   # errors only, last 1h
   npm run railway:logs -- 24 "@level:warn"   # warnings only, last 24h
   ```

2. The script writes to `logs/railway-<timestamp>.log` (git-ignored). Read the output file to analyze.

3. **Prerequisites:** Railway CLI must be installed (`brew install railway`) and linked (`railway link`). CLI is already authenticated and linked in this workspace.

4. **Filter syntax:**
   - `@level:error` — errors only
   - `@level:warn` — warnings only
   - `"POST /api"` — substring match
   - `@level:error AND "failed"` — combine filters

5. After reading logs, identify relevant error/warning entries and correlate with the codebase.

---

## Updating Documentation

When you fix a bug, learn something new, or change workflow:

- Update `../chillist-docs/dev-lessons/backend.md` with the lesson
- If the fix implies a new rule, propose adding it to `../chillist-docs/rules/backend.md`
- If specs changed (features done, new endpoints), update `../chillist-docs/specs/mvp-v1.md`
- If features were added/changed/completed, update `../chillist-docs/current/status.md`
- If setup/scripts changed, update `../chillist-docs/guides/backend.md`
- If API routes or schemas changed, run `npm run openapi:generate` and commit `docs/openapi.json`

---

## Issue Creation

When asked to create GitHub issues, see `../chillist-docs/guides/issue-management.md`.
