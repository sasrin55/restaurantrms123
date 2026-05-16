# CLAUDE.md — Seated RMS

Concise guidance for Claude Code working in this repository.

---

## Package layout

```
seated-rms/
├── client/              # React + Vite frontend
│   └── src/
│       ├── pages/       # One file per route (e.g. reservations.tsx, tables.tsx)
│       ├── components/  # Shared components; ui/ is shadcn/ui primitives
│       ├── hooks/       # Custom React hooks (use-time-slots.ts, use-toast.ts, …)
│       └── lib/         # Utilities: queryClient.ts, tables.ts, timeSlots.ts, utils.ts
├── server/              # Express backend
│   ├── index.ts         # App bootstrap, middleware, startup seeds
│   ├── routes.ts        # All API route definitions (~1200 lines)
│   ├── storage.ts       # IStorage interface + DatabaseStorage implementation
│   ├── db.ts            # Drizzle pg pool connection
│   ├── seed.ts          # One-time data migration seeds (v1–v6)
│   ├── googleSheets.ts  # Google Sheets sync helpers
│   ├── whatsapp.ts      # WhatsApp notification helper
│   └── autoComplete.ts  # Cron job: auto-complete past reservations
├── shared/
│   ├── schema.ts        # Drizzle table definitions + Zod insert schemas + TS types
│   └── menuData.ts      # Static menu item seed data
└── scripts/             # One-off data import/seed scripts (not part of the server)
```

---

## Common commands

```bash
npm run dev        # Dev server with HMR at http://localhost:5000
npm run build      # Production build (esbuild + Vite)
npm run start      # Run production build
npm run check      # TypeScript typecheck — run before pushing
npm run db:push    # Apply Drizzle schema changes to the database
```

---

## Key conventions

### Schema & types (`shared/schema.ts`)
- All table definitions live here. Adding a column: edit the Drizzle schema, then run `npm run db:push`.
- Each table exports: a Drizzle table object, a `createInsertSchema` Zod schema (with auto fields omitted), an insert type (`z.infer<typeof insertXSchema>`), and a select type (`typeof xTable.$inferSelect`).
- Array columns: use `.array()` as a method — `text().array()`, not `array(text())`.

### Storage layer (`server/storage.ts`)
- All DB access goes through `IStorage`. Add new methods to the interface first, then implement in `DatabaseStorage`.
- Never write raw Drizzle queries outside `storage.ts` (except analytics routes, which have their own inline queries).

### API routes (`server/routes.ts`)
- Internal staff API: `/api/*` — no key required (session auth guards the UI).
- External v1 API: `/v1/restaurants/paolas/*` — requires `X-Api-Key: <PUBLIC_API_KEY>` header.
  - Availability: `GET /v1/restaurants/paolas/availability?date=YYYY-MM-DD&party_size=N`
  - Create reservation: `POST /v1/restaurants/paolas/reservations`
  - Cancel reservation: `POST /v1/restaurants/paolas/cancel`

### Phone normalisation (v1 cancel endpoint)
The cancel endpoint strips all non-digit characters before comparing phone numbers:
```ts
const normalize = (p: string) => p.replace(/\D/g, "");
```
This means `+92 300 1234567` and `03001234567` are treated as the same number.

### Capacity model
Each table in `client/src/lib/tables.ts` has `minCapacity` and `maxCapacity`. There is no group/combination capacity model — multi-table bookings are stored as separate reservations sharing a `groupId`.

### Time slots
Slot labels are stored in the `time_slots` DB table (seeded on first run). The frontend reads them via `GET /api/time-slots`. When comparing reservation times to slot labels, **match by start time**, not exact label string — legacy reservations may have slightly different end-time labels (e.g. `"6:45 PM - 8:15 PM"` vs `"6:45 PM - 8:30 PM"`).

### Frontend data fetching
- Uses TanStack Query v5 (object form only: `useQuery({ queryKey, ... })`).
- Default fetcher in `client/src/lib/queryClient.ts` handles all `GET` calls — no `queryFn` needed for simple fetches.
- Mutations use `apiRequest(method, path, body)` from the same file.
- After mutations, invalidate by queryKey: `queryClient.invalidateQueries({ queryKey: ['/api/...'] })`.

### Environment variables
All secrets come from `process.env.*`. See `.env.example` for the full list. On Replit they live in Replit Secrets; locally they go in `.env` (gitignored).

---

## Deployment chain

```
Local edit → git push origin main
                ↓
         GitHub repo (source of truth)
                ↓
      Replit pulls + auto-deploys
                ↓
  npm run build → npm run db:push → node dist/index.cjs
                ↓
         app.seated.pk (live)
```

- Replit is the only deployment platform. No Dockerfile, no CI YAML needed.
- Schema migrations happen automatically via `npm run db:push` in the deploy step.
- `npm install` in the Replit deploy context runs without `--frozen-lockfile` — don't add that flag.

---

## Replit-only files (gitignored)

`.replit`, `replit.nix`, `.breakpoints`, `.config/`, `.cache/`, `.upm/` — these configure the Replit workspace and are not needed locally. They are listed in `.gitignore`.

---

## Things to be aware of

- **`attached_assets/`** is gitignored — it contains Replit-uploaded images and reference docs, not source code.
- **`scripts/`** contains one-off import scripts (`seed-prod.mjs`, `import-reservations-v*.mjs`). These are kept for reference but are not part of the running server.
- The Google Sheets integration uses the **Replit Google Sheets connector** for OAuth — locally you would need a service account JSON or skip Sheets sync entirely (it degrades gracefully when unconfigured).
- `@replit/vite-plugin-*` dev dependencies are Replit-specific; they're no-ops outside Replit but don't break local Vite builds.
