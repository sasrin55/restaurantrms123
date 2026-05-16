# Seated RMS — Paola's Cosa Nostra

Restaurant reservation management system for **Paola's Cosa Nostra**.  
Live at **[app.seated.pk](https://app.seated.pk)** — deployed via Replit.

---

## What it is

A full-stack staff dashboard for managing restaurant reservations, guests, servers, tables, orders, and inventory. It exposes a public **v1 REST API** (`/v1/restaurants/paolas/...`) used by the Seated booking widget and any external integrations, as well as an internal `/api/` surface consumed by the React dashboard.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Backend | Express 5, TypeScript, tsx |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-zod |
| Frontend | React 18, Vite 7, Tailwind CSS 3, shadcn/ui (Radix) |
| Routing (client) | Wouter |
| Data fetching | TanStack Query v5 |
| Auth | Passport.js (local strategy) |
| Notifications | WhatsApp via external service |
| Google Sheets sync | googleapis |
| Package manager | npm (package-lock.json) |

---

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally (or a remote connection string)

### Setup

```bash
# 1. Clone
git clone git@github.com:<org>/seated-rms.git
cd seated-rms

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL and other required vars

# 4. Push the database schema
npm run db:push

# 5. Start the dev server (Express + Vite HMR on the same port)
npm run dev
# → http://localhost:5000
```

### Other commands

```bash
npm run build    # Production build  → dist/index.cjs + client assets
npm run start    # Run production build (needs DATABASE_URL etc.)
npm run check    # TypeScript typecheck (tsc --noEmit)
npm run db:push  # Sync Drizzle schema to the connected database
```

---

## Deployment

Replit handles the entire deploy pipeline:

1. Push to the connected GitHub repo (`main` branch)
2. Replit auto-pulls and runs the build + deploy steps:
   - `npm run build` (esbuild bundles server; Vite bundles client)
   - `npm run db:push && node dist/index.cjs` (migrates schema, starts server)
3. Live at **app.seated.pk**

No CI/CD config file is needed — Replit is the deployment platform.

---

## Environment variables

See [`.env.example`](.env.example) for the full list with descriptions.  
All secrets are stored in **Replit Secrets** for production; never committed to git.

---

## Architecture

The Express server serves both the REST API and the compiled React SPA from the same process on port 5000. In development, Vite runs as middleware (HMR). In production, Express serves the pre-built static files from `dist/public/`.

**Internal API** (`/api/*`) — CRUD for reservations, guests, tables, orders, menu items, time slots, analytics, and call logs. Protected by session auth (staff login).

**External v1 API** (`/v1/restaurants/paolas/*`) — Public-facing endpoints for availability checks, reservation creation, and cancellation. Protected by `X-Api-Key` header (`PUBLIC_API_KEY` secret). Used by the Seated booking widget.

**Google Sheets sync** — Reservations are mirrored to a Google Sheet (one tab per date). Uses the Replit Google Sheets connector for OAuth token management.

**WhatsApp notifications** — Confirmation messages sent via an external WhatsApp HTTP service configured by `WA_SERVICE_URL` / `WA_API_KEY`.
