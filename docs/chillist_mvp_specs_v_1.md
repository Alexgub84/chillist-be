# Chillist — MVP Specification (v1.0)

> **Purpose:** Define a minimal, shippable product for organizing small trips/events with shared checklists. Optimized for rapid build, live testing, and FE/BE division of work.

---

## 1. Product Overview
- **One place** to create a plan (trip, dinner, picnic), invite participants, and track items to bring/buy.
- **Two item groups:** Equipment & Food.
- **Simple assignments:** Each item can be assigned to one participant via `assignedParticipantId`.
- **Shareable** plan link for participants to view/update statuses (MVP: public; optional name-only session).

**Non-goals (MVP):** Payments, complex permissions, offline sync, push notifications, calendar sync, advanced meals/portions engine.

---

## 2. Core Entities
- **Participant**
  - Required: `participantId`, `name`, `lastName`, `contactPhone`, `role` ("owner" | "participant" | "viewer")
  - Optional: `displayName`, `contactEmail`, `avatarUrl`
  - Timestamps: `createdAt`, `updatedAt`
- **Plan**
  - `planId`, `title`, optional: `description`, `location` (name/country/lat/lon/timezone), `startDate`, `endDate`, `tags[]`
  - `ownerParticipantId`, `status` ("draft" | "active" | "archived"), optional `visibility` ("public" | "unlisted" | "private")
  - Contains: `participants[]` (list of Participant objects), `items[]` (list of Item objects)
  - Timestamps: `createdAt`, `updatedAt`
- **Items**
  - **EquipmentItem** | **FoodItem** (discriminated by `category`)
  - Fields: `itemId`, `planId`, `name`, `category` ("equipment" | "food"), `quantity`, `unit` ("pcs" | "kg" | "g" | "lb" | "oz" | "l" | "ml" | "pack" | "set"), `status` ("pending" | "purchased" | "packed" | "canceled"), optional `notes`, optional `assignedParticipantId`
  - Timestamps: `createdAt`, `updatedAt`
- **Weather (optional)**
  - `WeatherBundle` (current + daily forecast) fetched for plan.location; non-blocking.

---

## 3. User Stories (MVP)
1. As an **owner**, I can create a plan with a title and dates.
2. As an **owner**, I can add participants (names only are enough for MVP).
3. As an **owner/participant**, I can add items (equipment/food), set quantities and units.
4. As a **participant**, I can assign an item to myself or be assigned by the owner.
5. As a **participant**, I can update item status (pending → purchased → packed).
6. As anyone with the **share link**, I can view the plan’s items and see who brings what.
7. Optional: As a **viewer**, I can see read-only details.

---

## 4. Feature Scope
### 4.1 Plans
- CRUD plans.
- Plan screen shows participants, items grouped by category, and completion stats.

### 4.2 Participants
- Add/remove participants to a plan.
- Role: "owner" (full edit), "participant" (update items & self-assign), "viewer" (read-only).

### 4.3 Items
- Add item (name, category, quantity, unit, notes, status).
- Group by category; filter by status; simple text search.
- Bulk: change status to "packed" or "purchased" for selected items (optional nice-to-have).

### 4.4 Assignments
- Simple 1:1 assignment: each item has an optional `assignedParticipantId` pointing to one participant.
- Show responsibility per person.

### 4.5 Weather (optional, non-blocking)
- Fetch and show a 3–5 day forecast for the plan location.

---

## 5. Non-Functional Requirements
- **MVP Platform:** Web app (desktop, tablet, mobile responsive).
- **FE Stack:** React + Vite + Tailwind CSS; React Query; Context where needed.
- **BE Stack:** Node.js + Fastify (TypeScript, ESM), simple in-memory store → DynamoDB (MVP persistence).
- **Deployment:**
  - FE: Vercel or Cloudflare Pages.
  - BE: Railway/Vercel Functions/Fly.io (choose one); environment config via `.env`.
- **Quality:** ESLint + Prettier, TypeScript strict, Husky pre-commit.
- **Telemetry (nice):** Request logs, basic error reporting.

---

## 6. API (REST) — MVP Endpoints
> Base URL: `/` (versioning can be added later: `/v1`)

### 6.1 Health
- `GET /health` → `{ ok: true }`

### 6.2 Plans
- `GET /plans` → `Plan[]`
- `GET /plans/:planId` → `Plan` (includes `participants[]` and `items[]`)
- `POST /plans` → create → `201 Plan` (includes owner in `participants[]`)
  - Body: `{ title: string, owner: { name: string, lastName: string, contactPhone: string, displayName?: string, contactEmail?: string, avatarUrl?: string }, description?: string, startDate?: string, endDate?: string, location?: Location, status?: PlanStatus }`
- `PATCH /plans/:planId` → update → `Plan`
- `DELETE /plans/:planId` → `{ ok: true }`

### 6.3 Participants
- `GET /plans/:planId/participants` → `Participant[]`
- `POST /plans/:planId/participants` → `201 Participant`
  - Body: `{ name: string, lastName: string, contactPhone: string, displayName?: string, role?: "participant"|"viewer", contactEmail?: string, avatarUrl?: string }`
- `GET /participants/:participantId` → `Participant`
- `PATCH /participants/:participantId` → `Participant`
- `DELETE /participants/:participantId` → `{ ok: true }` (blocked for owner role)

### 6.4 Items
- `GET /plans/:planId/items` → `Item[]`
- `POST /plans/:planId/items` → `201 Item`
  - Body: `{ name: string, category: "equipment"|"food", quantity: number, unit: Unit, status?: ItemStatus, notes?: string, assignedParticipantId?: string }`
- `GET /items/:itemId` → `Item`
- `PATCH /items/:itemId` → `Item`
- `DELETE /items/:itemId` → `{ ok: true }`

**Status codes:** `200` OK, `201` Created, `204` No Content (optional), `400` Invalid, `404` Not Found.

---

## 7. Data Model (TypeScript — pure types)
- `Participant`, `Plan`, `EquipmentItem`, `FoodItem`, `Location`, `WeatherBundle`, `PlanDetails` (as defined in `/src/core/types`).

---

## 8. Validation (MVP)
- Client-side: lightweight checks (required fields, positive quantities, valid enum values).
- Server-side: Accept loose JSON first; add Zod schemas in v1.1 for robust validation.

---

## 9. UX Flow (Happy Path)
1. Create Plan → Add Title/Date + Owner details → BE creates plan with owner as first participant.
2. Add more Participants (name, lastName, phone required) → added via separate endpoint.
3. Add Items (equipment/food) → set quantities, optionally assign to a participant.
4. Share link → Participants update statuses as they buy/pack.

---

## 10. Sharing & Access (MVP)
- **Public link** per plan.
- Optional: name-only session (store name in cookie; show who updated what).
- No hard auth in MVP; later versions add login and granular permissions.

---

## 11. Deployment Plan
- **Phase 1 (Internal):** FE+BE on single environment; in-memory DB.
- **Phase 2 (MVP Live):** Switch to DynamoDB; FE on Vercel; BE on Railway; add environment secrets.
- **Phase 3 (Nice-to-have):** CI (GitHub Actions) for lint/test/build before deploy; staging branch → staging env; main → prod.

---

## 12. Analytics & Logging (Optional)
- Page views per plan.
- Item status changes per user name (if session enabled).
- Basic server logs and request latency.

---

## 13. Roadmap (Post-MVP)
1. **Personalized views:** filter per participant.
2. **Meals → auto food list** (portions per person; day-by-day plan).
3. **AI assist:** suggest missing essentials by location/date/weather.
4. **Weather integration** with alerts (wind, rain).
5. **Swipe UI** on mobile for quick status change.
6. **Save participant presets** (what each person usually brings).
7. **Better permissions & auth** (owner-only edits; private plans).
8. **WhatsApp/Telegram integration** for updates and quick check-offs via bot.

---

## 14. Definition of Done (MVP)
- Plans/Participants/Items CRUD working end-to-end.
- Deployed FE+BE; public link usable on mobile.
- At least 1 real trip tested by team with 3+ participants.
- Basic docs: README (setup/run), API list, .env example.
