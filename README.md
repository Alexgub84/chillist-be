# Chillist Backend

Trip planning API with shared checklists. Built with Fastify + TypeScript.

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Fastify 5.x
- **Validation:** Zod
- **Testing:** Vitest
- **Linting:** ESLint + Prettier

## Local Development

### Prerequisites

- Node.js 20 or higher
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

The server starts at `http://localhost:3333`

### API Documentation (Swagger)

In development mode, Swagger UI is available at:

```
http://localhost:3333/docs
```

The OpenAPI JSON spec is available at:

```
http://localhost:3333/docs/json
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3333) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `FRONTEND_URL` | Frontend URL for CORS (production) | Yes (prod) |
| `API_KEY` | Secret key for API authentication | Yes (prod) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled production build |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm run typecheck` | TypeScript type checking |
| `npm run format` | Format code with Prettier |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run test:coverage` | Run tests with coverage |
| `npm run openapi:generate` | Generate OpenAPI spec to docs/openapi.json |
| `npm run openapi:validate` | Validate OpenAPI spec matches code |

## OpenAPI / Frontend Integration

The backend generates an OpenAPI specification that the frontend can use to generate TypeScript types.

### Generate OpenAPI Spec

```bash
npm run openapi:generate
```

This creates `docs/openapi.json` which contains the full API specification.

### Frontend Type Generation

In the frontend repository, run:

```bash
# From live server (dev mode)
npx openapi-typescript http://localhost:3333/docs/json -o src/types/api.ts

# From static file
npx openapi-typescript ../chillist-be/docs/openapi.json -o src/types/api.ts
```

This generates TypeScript types that exactly match the backend API responses.

### Validate Spec is Up-to-Date

```bash
npm run openapi:validate
```

This checks that `docs/openapi.json` matches the current code. CI runs this automatically.

### API Change Workflow

When your PR changes the API (modifies `docs/openapi.json`):

1. CI will fail with: `Add the 'fe-notified' label`
2. Review the API changes
3. Notify the frontend team to update their types
4. Add the `fe-notified` label to the PR
5. CI will pass and PR can be merged

This ensures frontend is always aware of API changes before deployment.

## Branch Strategy

| Branch | Purpose | Deploys To |
|--------|---------|------------|
| `feature/*` | Development work | - |
| `staging` | Pre-production testing | Staging environment |
| `main` | Production | Production environment |

### Rules

1. No direct push to `main` or `staging`
2. All changes via Pull Request
3. PRs require passing CI (lint, typecheck, tests, build)
4. `staging` → `main` merges only after verification in staging

## Environments

| Environment | URL |
|-------------|-----|
| Staging | `https://chillist-be-staging.up.railway.app` |
| Production | `https://chillist-be-production.up.railway.app` |

## API Endpoints

### Authentication

All endpoints (except `/health`) require the `x-api-key` header in production:

```bash
curl -H "x-api-key: your-secret-key" https://api.example.com/plans
```

### Health Check

```
GET /health
```

Returns server health status (no authentication required).

### Plans

```
GET /plans
```

Returns all plans.

## License

Private
