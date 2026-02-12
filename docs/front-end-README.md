# Chillist

A simple plan management app built with React, TypeScript, and Tailwind CSS.
`chillist_mvp_specs_v_1.md` – full product specification for the MVP.

## Setup

### Install dependencies

- Run `npm install`.

### Configure environment variables

Copy the provided example and adjust as needed. The example binds the mock server to `0.0.0.0` (suitable for production containers); your local `.env` can keep `localhost` instead.

- Duplicate the template with `cp .env.example .env`.

Key variables:

- `MOCK_SERVER_HOST`: host binding for the dev mock server (`0.0.0.0` in the example; set `localhost` for local-only).
- `MOCK_SERVER_PORT`: port for the dev mock server (`3333`).
- `VITE_API_URL`: frontend API base URL (defaults to `http://localhost:3333`).

## Running Locally

### Start the Vite dev server

- `npm run dev`

### Run unit tests

- `npm run test`

### Type check

- `npm run typecheck`

### Build for production

- `npm run build`

## Mock Data Toolkit

### Watch mock dataset with Nodemon

Use the lightweight mock loader to validate JSON fixtures and preview dataset summaries while developing against the planned API contract.

- `npm run mock:watch`

This spins up Nodemon with `tsx`, reloading whenever files in `api/mock-data.json` or `api/mock.ts` change. You will see console output similar to:

```
[mock] dataset loaded { plans: 1, participants: 3, items: 10 }
```

Update the JSON payloads, save, and Nodemon will automatically re-run and print the refreshed counts, making it easy to iterate on future route shapes.

### Run the mock API server

Expose the JSON dataset over Fastify while you prototype the frontend against REST endpoints.

- `npm run mock:server`

The server watches the same `api/` sources and reloads on change. By default it listens on `http://localhost:3333`; use the routes below to interact:

- `GET /plans`
- `POST /plans` (accepts `owner` object, returns plan with participants)
- `GET /plans/:planId` (returns plan with participants + items)
- `PATCH /plans/:planId`
- `DELETE /plans/:planId`
- `GET /plans/:planId/participants`
- `POST /plans/:planId/participants`
- `GET /participants/:participantId`
- `PATCH /participants/:participantId`
- `DELETE /participants/:participantId`
- `GET /plans/:planId/items`
- `POST /plans/:planId/items`
- `GET /items/:itemId`
- `PATCH /items/:itemId`
- `DELETE /items/:itemId`

All write operations update `api/mock-data.json`, so you can keep iterating with realistic data.

## Linting & Husky

### Manual linting and formatting

- `npm run lint`
- `npm run lint:fix`

### Husky pre-commit hooks

Every commit triggers Husky, which runs:

1. `npm run typecheck` – fails on TypeScript errors.
2. ESLint + Prettier on staged files (`lint-staged`).
3. `npm run test:run` – executes unit tests in CI mode.

Fix any reported issues before committing; Husky will block the commit if a step fails.

### Recommended manual checks before commit

- `npm run typecheck`
- `npm run lint:fix`
- `npm run test:run`

## Working with Git

### Branch strategy

**Never push directly to `main`.** Always branch for your work.

- `git checkout -b feature/your-feature-name`
- Make changes, then `git add .`
- Commit with a Conventional Commit message, for example `git commit -m "feat: add new feature"`
- `git push origin feature/your-feature-name`

Open a Pull Request for review once your branch is pushed.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` – New feature
- `fix:` – Bug fix
- `docs:` – Documentation changes
- `refactor:` – Code refactoring
- `test:` – Adding or updating tests
- `chore:` – Maintenance tasks

## Tailwind CSS Customization

This project uses Tailwind CSS v4 with the Vite plugin. **No `tailwind.config.js` file is needed.**

To customize Tailwind (colors, fonts, breakpoints, etc.), edit `src/index.css`:

```css
@import 'tailwindcss';

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #10b981;
  --font-family-display: 'Inter', sans-serif;
  --breakpoint-3xl: 1920px;
}
```

See [Tailwind CSS v4 documentation](https://tailwindcss.com/docs) for more customization options.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Vitest + React Testing Library
- ESLint + Prettier
- Husky (pre-commit hooks)

## API Type Generation (OpenAPI)

The backend exposes an OpenAPI specification that can be used to automatically generate TypeScript types.

### Generate Types from Backend

```bash
# Install openapi-typescript (one-time)
npm install -D openapi-typescript

# Generate types from live backend (dev mode)
npx openapi-typescript http://localhost:3333/docs/json -o src/types/api.ts

# Or from the static spec file
npx openapi-typescript ../chillist-be/docs/openapi.json -o src/types/api.ts
```

### Add npm Script (Recommended)

Add to `package.json`:

```json
{
  "scripts": {
    "types:api": "openapi-typescript http://localhost:3333/docs/json -o src/types/api.ts"
  }
}
```

Then run:

```bash
npm run types:api
```

### When to Regenerate

Regenerate types whenever the backend API changes:

1. Backend updates routes or schemas
2. Run `npm run types:api` in frontend
3. TypeScript will show any breaking changes at compile time

---

# Backend API Specification

This section provides all the information needed to build a production backend that is compatible with this frontend.

## Recommended Backend Stack

- **Runtime:** Node.js (v20+)
- **Framework:** Fastify (TypeScript, ESM)
- **Validation:** Zod
- **Database:** DynamoDB (MVP) or PostgreSQL
- **Deployment:** Railway, Vercel Functions, or Fly.io

## Data Models

All types use ISO 8601 strings for dates/timestamps (e.g., `"2025-07-18T12:00:00.000Z"`).

### Enums

```typescript
type PlanStatus = "draft" | "active" | "archived";

type PlanVisibility = "public" | "unlisted" | "private";

type ParticipantRole = "owner" | "participant" | "viewer";

type ItemCategory = "equipment" | "food";

type ItemStatus = "pending" | "purchased" | "packed" | "canceled";

type Unit = "pcs" | "kg" | "g" | "lb" | "oz" | "l" | "ml" | "pack" | "set";
```

### Location

```typescript
interface Location {
  locationId?: string;      // UUID, auto-generated if not provided
  name?: string;            // e.g., "Pine Ridge Campground"
  timezone?: string;        // e.g., "America/Los_Angeles"
  latitude?: number;
  longitude?: number;
  country?: string;         // e.g., "USA"
  region?: string;          // e.g., "CA"
  city?: string;            // e.g., "Yosemite"
}
```

### Plan (Response)

```typescript
interface Plan {
  planId: string;                    // UUID, auto-generated on create
  title: string;                     // Required, min 1 char
  description?: string;
  status: PlanStatus;                // Defaults to "draft"
  visibility?: PlanVisibility;       // Defaults to "public"
  ownerParticipantId?: string;       // UUID of the owner participant
  location?: Location;
  startDate?: string;                // ISO date string
  endDate?: string;                  // ISO date string
  tags?: string[];
  participants: Participant[];       // Full participant objects (always includes owner)
  items: Item[];                     // Full item objects
  createdAt: string;                 // ISO timestamp, auto-generated
  updatedAt: string;                 // ISO timestamp, auto-updated
}
```

### PlanCreate (POST /plans body)

```typescript
interface PlanCreate {
  title: string;                     // Required
  owner: {                           // Required, BE creates as participant with role "owner"
    name: string;                    // Required
    lastName: string;                // Required
    contactPhone: string;            // Required
    displayName?: string;
    contactEmail?: string;
    avatarUrl?: string;
  };
  description?: string;
  status?: PlanStatus;               // Defaults to "draft"
  visibility?: PlanVisibility;       // Defaults to "public"
  location?: Location;
  startDate?: string;
  endDate?: string;
  tags?: string[];
}
```

### PlanPatch (PATCH /plans/:planId body)

All plan fields are optional (partial update). Does not include `owner` -- use participant endpoints to update participants.

### Participant

```typescript
interface Participant {
  participantId: string;             // UUID, auto-generated on create
  planId: string;                    // References the parent Plan
  name: string;                      // Required, first name
  lastName: string;                  // Required, last name
  contactPhone: string;              // Required, phone number
  displayName?: string;              // Optional nickname/short label
  role: ParticipantRole;             // "owner" | "participant" | "viewer"
  avatarUrl?: string;                // Valid URL
  contactEmail?: string;             // Valid email
  createdAt: string;                 // ISO timestamp
  updatedAt: string;                 // ISO timestamp
}
```

### ParticipantCreate (POST /plans/:planId/participants body)

```typescript
interface ParticipantCreate {
  name: string;                      // Required, first name
  lastName: string;                  // Required, last name
  contactPhone: string;              // Required, phone number
  displayName?: string;              // Optional nickname
  role?: ParticipantRole;            // Defaults to "participant"
  avatarUrl?: string;                // Valid URL
  contactEmail?: string;             // Valid email
}
```

### ParticipantPatch (PATCH /participants/:participantId body)

All fields from `ParticipantCreate` are optional (partial update). `displayName` can be set to `null` to clear it. `name`, `lastName`, `contactPhone` cannot be set to `null`.

### Item (Discriminated Union)

Items are discriminated by the `category` field.

```typescript
interface BaseItem {
  itemId: string;                    // UUID, auto-generated on create
  planId: string;                    // References the parent Plan
  name: string;                      // Required, min 1 char
  quantity: number;                  // Positive number, defaults to 1
  unit: Unit;                        // Defaults to "pcs"
  notes?: string;
  status: ItemStatus;                // Defaults to "pending"
  assignedParticipantId?: string;    // UUID, references a participant (simple 1:1 assignment)
  createdAt: string;                 // ISO timestamp
  updatedAt: string;                 // ISO timestamp
}

interface EquipmentItem extends BaseItem {
  category: "equipment";             // Literal discriminator
}

interface FoodItem extends BaseItem {
  category: "food";                  // Literal discriminator
}

type Item = EquipmentItem | FoodItem;
```

### ItemCreate (POST /plans/:planId/items body)

```typescript
interface ItemCreate {
  name: string;                      // Required, min 1 char
  category: ItemCategory;            // Required
  quantity?: number;                 // Defaults to 1
  unit?: Unit;                       // Defaults to "pcs"
  status?: ItemStatus;               // Defaults to "pending"
  notes?: string;
  assignedParticipantId?: string;    // Assign to a participant on creation
}
```

### ItemPatch (PATCH /items/:itemId body)

All fields from `ItemCreate` are optional (partial update). Set `assignedParticipantId` to `null` to unassign.

## API Endpoints

Base URL: `/` (versioning can be added later as `/v1`)

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

**Response:** `200 OK`
```json
{ "ok": true }
```

### Plans

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/plans` | List all plans |
| POST | `/plans` | Create a new plan (with owner) |
| GET | `/plans/:planId` | Get a single plan (includes participants + items) |
| PATCH | `/plans/:planId` | Update a plan |
| DELETE | `/plans/:planId` | Delete a plan |

#### GET /plans

**Response:** `200 OK` → `Plan[]`

#### POST /plans

**Request Body:** `PlanCreate` (includes required `owner` object)

**Response:** `201 Created` → `Plan` (includes `participants: [owner]`, `items: []`)

**Business Logic:**
- Generate `planId` as UUID
- Create owner as a participant with `role: "owner"` (BE generates `participantId`)
- Set `ownerParticipantId` on the plan to the new participant's UUID
- Set `createdAt` and `updatedAt` to current timestamp
- Return plan with participants and empty items array

#### GET /plans/:planId

**Response:** `200 OK` → `Plan` (includes `participants[]` and `items[]`)

**Error:** `404 Not Found` if plan doesn't exist

#### PATCH /plans/:planId

**Request Body:** `PlanPatch` (partial)

**Response:** `200 OK` → `Plan`

**Business Logic:**
- Update `updatedAt` to current timestamp

**Error:** `404 Not Found` if plan doesn't exist

#### DELETE /plans/:planId

**Response:** `200 OK` → `{ ok: true }`

**Business Logic:**
- Cascade deletes all participants and items associated with this plan

**Error:** `404 Not Found` if plan doesn't exist

### Participants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/plans/:planId/participants` | List participants for a plan |
| POST | `/plans/:planId/participants` | Add participant to a plan |
| GET | `/participants/:participantId` | Get a single participant |
| PATCH | `/participants/:participantId` | Update a participant |
| DELETE | `/participants/:participantId` | Remove a participant |

#### GET /plans/:planId/participants

**Response:** `200 OK` → `Participant[]`

Returns all participants belonging to the plan, ordered by creation date.

**Error:** `404 Not Found` if plan doesn't exist

#### POST /plans/:planId/participants

**Request Body:** `ParticipantCreate`

**Response:** `201 Created` → `Participant`

**Business Logic:**
- Generate `participantId` as UUID
- Defaults `role` to `"participant"` if not provided
- Links participant to the plan via `planId`

**Error:** `404 Not Found` if plan doesn't exist

#### GET /participants/:participantId

**Response:** `200 OK` → `Participant`

**Error:** `404 Not Found` if participant doesn't exist

#### PATCH /participants/:participantId

**Request Body:** `ParticipantPatch` (partial)

**Response:** `200 OK` → `Participant`

**Business Logic:**
- Update `updatedAt` to current timestamp

**Error:** `404 Not Found` if participant doesn't exist

#### DELETE /participants/:participantId

**Response:** `200 OK` → `{ ok: true }`

**Business Logic:**
- Cannot delete participant with `role: "owner"` (returns `400`)
- Items assigned to this participant will have `assignedParticipantId` set to `null`

**Error:** `404 Not Found` if participant doesn't exist

### Items

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/plans/:planId/items` | List items for a plan |
| POST | `/plans/:planId/items` | Add item to a plan |
| GET | `/items/:itemId` | Get a single item |
| PATCH | `/items/:itemId` | Update an item |
| DELETE | `/items/:itemId` | Remove an item |

#### GET /plans/:planId/items

**Response:** `200 OK` → `Item[]`

Returns all items where `item.planId === planId`.

**Error:** `404 Not Found` if plan doesn't exist

#### POST /plans/:planId/items

**Request Body:** `ItemCreate`

**Response:** `201 Created` → `Item`

**Business Logic:**
- Generate `itemId` as UUID
- Set `planId` from URL parameter
- Apply defaults: `quantity: 1`, `unit: "pcs"`, `status: "pending"`

**Error:** `404 Not Found` if plan doesn't exist

#### GET /items/:itemId

**Response:** `200 OK` → `Item`

**Error:** `404 Not Found` if item doesn't exist

#### PATCH /items/:itemId

**Request Body:** `ItemPatch` (partial)

**Response:** `200 OK` → `Item`

**Business Logic:**
- Update `updatedAt` to current timestamp

**Error:** `404 Not Found` if item doesn't exist

#### DELETE /items/:itemId

**Response:** `204 No Content`

**Error:** `404 Not Found` if item doesn't exist

## HTTP Status Codes

| Code | Usage |
|------|-------|
| `200 OK` | Successful GET, PATCH |
| `201 Created` | Successful POST |
| `204 No Content` | Successful DELETE |
| `400 Bad Request` | Validation error (invalid body) |
| `404 Not Found` | Resource not found |
| `500 Internal Server Error` | Unexpected server error |

## Error Response Format

```json
{
  "message": "Human-readable error description"
}
```

## Validation Rules (Zod Schemas)

### Plan Validation

```typescript
const planCreateSchema = z.object({
  title: z.string().min(1),
  owner: z.object({
    name: z.string().min(1),
    lastName: z.string().min(1),
    contactPhone: z.string().min(1),
    displayName: z.string().min(1).optional(),
    contactEmail: z.string().email().optional(),
    avatarUrl: z.string().url().optional(),
  }),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  location: locationSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
```

### Participant Validation

```typescript
const participantCreateSchema = z.object({
  name: z.string().min(1),
  lastName: z.string().min(1),
  contactPhone: z.string().min(1),
  displayName: z.string().min(1).optional(),
  role: z.enum(["owner", "participant", "viewer"]).default("participant"),
  avatarUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
});
```

### Item Validation

```typescript
const itemCreateSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().optional(),
  unit: z.enum(["pcs", "kg", "g", "lb", "oz", "l", "ml", "pack", "set"]).optional(),
  status: z.enum(["pending", "purchased", "packed", "canceled"]).optional(),
  notes: z.string().optional(),
  category: z.enum(["equipment", "food"]),
});
```

### Location Validation

```typescript
const locationSchema = z.object({
  locationId: z.string().optional(),
  name: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
});
```

## CORS Configuration

The backend must enable CORS to allow requests from the frontend:

```typescript
await app.register(cors, {
  origin: true, // Or specify allowed origins
});
```

## Sample Mock Data

See `api/mock-data.json` for example data structures:

```json
{
  "planId": "plan-1",
  "title": "Weekend Camping Trip",
  "description": "Two-night stay at Pine Ridge Campground.",
  "status": "active",
  "visibility": "public",
  "ownerParticipantId": "participant-1",
  "location": {
    "name": "Pine Ridge Campground",
    "timezone": "America/Los_Angeles",
    "latitude": 37.8651,
    "longitude": -119.5383,
    "country": "USA",
    "region": "CA",
    "city": "Yosemite"
  },
  "startDate": "2025-07-18T00:00:00.000Z",
  "endDate": "2025-07-20T00:00:00.000Z",
  "tags": ["outdoors", "family", "camping"],
  "createdAt": "2025-05-01T12:00:00.000Z",
  "updatedAt": "2025-05-10T08:30:00.000Z",
  "participants": [
    {
      "participantId": "participant-1",
      "planId": "plan-1",
      "name": "Alex",
      "lastName": "Guberman",
      "contactPhone": "+1-555-123-4567",
      "displayName": "Alex G.",
      "role": "owner",
      "contactEmail": "alex@example.com",
      "avatarUrl": "https://api.dicebear.com/7.x/avataaars/svg?seed=alex",
      "createdAt": "2025-05-01T12:00:00.000Z",
      "updatedAt": "2025-05-10T08:00:00.000Z"
    },
    {
      "participantId": "participant-2",
      "planId": "plan-1",
      "name": "Sasha",
      "lastName": "Smith",
      "contactPhone": "+1-555-987-6543",
      "role": "participant",
      "createdAt": "2025-05-02T09:00:00.000Z",
      "updatedAt": "2025-05-02T09:00:00.000Z"
    }
  ],
  "items": [
    {
      "itemId": "item-1",
      "planId": "plan-1",
      "name": "Family Tent",
      "quantity": 1,
      "unit": "set",
      "notes": "Check stakes before departure",
      "status": "packed",
      "category": "equipment",
      "assignedParticipantId": "participant-1",
      "createdAt": "2025-05-02T10:00:00.000Z",
      "updatedAt": "2025-05-10T08:15:00.000Z"
    }
  ]
}
```

## Future Endpoints (Post-MVP)

- Partial quantity assignments (split items between multiple participants)
- Weather integration
- Authentication and user accounts

## Environment Variables (Backend)

```env
PORT=3333
HOST=0.0.0.0
NODE_ENV=development

# Database (examples)
DATABASE_URL=dynamodb://localhost:8000
# or
DATABASE_URL=postgresql://user:pass@localhost:5432/chillist

# CORS (optional)
ALLOWED_ORIGINS=http://localhost:5173,https://chillist.app
```



