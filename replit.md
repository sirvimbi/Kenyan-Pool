# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/killer-pool` — the Killer Pool game (React + Vite web artifact, previewPath `/`).
  - `src/firebase/config.ts` — Firebase init (Auth + Firestore), config read from `VITE_FIREBASE_*` env vars, with missing-config guards.
  - `src/firebase/profile.ts` — `PlayerProfile` type (source of truth for the player/wallet/stats schema), profile CRUD, leaderboard query.
  - `src/auth/AuthContext.tsx` — auth provider/hook (Google + email/password), live profile subscription.
  - `src/screens/SignInScreen.tsx`, `src/screens/Dashboard.tsx` — auth + post-login screens.
  - `src/game/tiers.ts` — tier/badge ladder derived from lifetime wins.
  - `src/game/engine.ts`, `src/game/rules.ts` — game state; local human is always seat index 0.

## Architecture decisions

- Player profiles live in Firestore (collection `profiles`), not the Express/Postgres backend. The backend stays but is not required for accounts/dashboard.
- Wallet balances are namespaced (`wallet.play`) so a future real-money wallet can be added without a schema migration. Current app is play-money only.
- In-game balance privacy: only the local player (seat 0) sees their own balance; other players' balances render as `•••`. The prize pool is visible to everyone.
- Firebase auth uses default local persistence, so sign-in survives reloads.

## Product

Killer Pool is a Kenyan-themed ("Nairobi Nights") pool game. Players sign in (Google or email/password), get a starting play-money grubstake, and see a dashboard with their balance, a leaderboard, their tier/badge with progress, and a Play button. Game results persist to their profile (games played, wins, biggest pot).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Firebase console setup is required and is owner-only.** The code is wired up, but accounts won't work until, in the Firebase console: (1) Authentication is enabled with the **Email/Password** and **Google** providers; (2) a **Firestore** database is created with security rules allowing signed-in users to read all profiles (leaderboard) and write only their own; (3) the dev and published domains are added under Authentication → Settings → Authorized domains. The sign-in screen surfaces the exact Firebase error code when these are missing (e.g. `auth/configuration-not-found` = Authentication not enabled).
- The `VITE_FIREBASE_*` secrets are build-time env vars; after changing them, restart the `killer-pool` workflow so Vite picks them up.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
