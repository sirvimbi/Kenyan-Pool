# Nairobi Pool Masters

A Kenyan-themed ("Nairobi Nights") pool game featuring real-time multiplayer, voice chat, and deep physics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5001)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/killer-pool` — the Killer Pool game (React + Vite web artifact).
  - `src/firebase/config.ts` — Firebase init (Auth + Firestore), config read from `VITE_FIREBASE_*` env vars.
  - `src/firebase/profile.ts` — `PlayerProfile` type, profile CRUD, leaderboard query.
  - `src/auth/AuthContext.tsx` — auth provider/hook (Google + Phone + Email), live profile subscription.
  - `src/screens/SignInScreen.tsx`, `src/screens/Dashboard.tsx` — auth + post-login screens.
  - `src/game/tiers.ts` — tier/badge ladder derived from lifetime wins.
  - `src/game/engine.ts`, `src/game/rules.ts` — game state; local human is always seat index 0.

## Architecture decisions

- Player profiles live in Firestore (collection `profiles`), not the Express/Postgres backend.
- Wallet balances are namespaced (`wallet.play`) so a future real-money wallet can be added.
- Firebase auth uses default local persistence, so sign-in survives reloads.
- Voice chat uses P2P WebRTC with Firestore as the signaling layer.

## Product

Killer Pool is a Kenyan-themed ("Nairobi Nights") pool game. Players sign in, get a starting play-money grubstake, and see a dashboard with their balance, a leaderboard, their tier/badge with progress, and a Play button.

## Developer

Developed by Kilu from Sir Vimbi Enterprise.

## Gotchas

- **Firebase setup is required.** Authentication (Email, Google, Phone) and Firestore must be enabled in the Firebase Console.
- The `VITE_FIREBASE_*` secrets are build-time env vars; after changing them, rebuild the project.
