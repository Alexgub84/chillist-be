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
