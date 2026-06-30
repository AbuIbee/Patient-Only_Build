# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**My Memoria Ally** — a dementia-care companion app built for patients only. React + TypeScript SPA deployed as a Capacitor Android app (`com.memoriahelps.ap`). Backend is Supabase (PostgreSQL + Auth + Storage).

## Commands

```bash
npm run dev          # local dev server (Vite)
npm run build        # production build → dist/
npm run lint         # ESLint
npm run preview      # preview the built dist/

# Android (Capacitor)
npm run appflow:build   # build + cap sync + sanity check
npm run ionic:build     # CI build: install + build + cap sync
```

No test runner is configured. Lint is the only automated check.

## Required environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRIPE_PRICE_FULL_SUPPORT_MONTHLY
```

## Architecture

### State management

Two React contexts carry all runtime state:

- **`AppContext`** (`src/store/AppContext.tsx`) — useReducer-based global store. Holds the current user, auth state, selected role, and all domain data (patient, medications, mood entries, memories, documents, reminders, tasks). Dispatch actions via `useApp()`.

- **`SubscriptionContext`** (`src/store/SubscriptionContext.tsx`) — wraps Supabase `subscriptions` table. Exposes `can(feature: FeatureKey)`, `tier`, `isMaster`, `isActive`. Listen for realtime changes via `postgres_changes`.

### Routing (no React Router)

Routing is manual `window.history.pushState`. `App.tsx` renders one of three layouts based on `state.selectedRole` and `state.isAuthenticated`:

- `PatientLayout` — the main patient experience; manages its own `currentView` state
- `AdminLayout` — admin-only panel
- Public pages (landing, login, pricing, privacy, about-us, `/patient-intake`) rendered directly

`PatientLayout` (`src/pages/patient/PatientLayout.tsx`) owns the navigation state for all patient views via a `PatientView` union type. Views are rendered by simple switch/conditional — no URL-based routing inside the authenticated shell.

### Auth + session

`src/lib/supabase.ts` — Supabase client configured with `sessionStorage` (not `localStorage`) for HIPAA compliance. Auth tokens do not persist across browser sessions. Always use `getSignedMediaUrl()` for files in the `patient-media` bucket; never call `getPublicUrl()`.

Session restore happens in `App.tsx` `useEffect`. There is a 10-minute inactivity auto-sign-out. Patients with `must_change_password = true` on their profile are forced to reset on login.

### Subscription / feature gating

`src/types/subscription.ts` is the single source of truth for tiers, features, and entitlement logic.

Tiers: `free_tier` | `paid_tier` | `master`

Use `<FeatureGate feature="..." requiredTier="...">` (`src/components/FeatureGate.tsx`) to wrap any gated UI. Use `useSubscription().can(feature)` for imperative checks.

`master` tier bypasses all gates — managed via Admin Center UI + `subscriptions` table, not a hardcoded email list (`MASTER_EMAILS` is intentionally empty).

Temp/demo users match `TEMP_USER_EMAIL_PATTERN` (`/^temp-user\d*@/i`) and are always read-only regardless of tier.

### Styling

Tailwind CSS with a custom warm-tone palette defined in `tailwind.config.js`:
`warm-ivory`, `warm-bronze`, `deep-bronze`, `charcoal`, `medium-gray`, `soft-sage`, `gentle-coral`, `calm-blue`.

All custom colors are CSS variables (defined in `src/index.css`). Use these semantic tokens rather than raw hex values.

UI primitives live in `src/components/ui/` — all are shadcn/ui components built on Radix UI. Import from `@/components/ui/<name>`.

Path alias `@/` maps to `src/`.

### Capacitor / mobile

The app targets Android. `capacitor.config.ts` points the live server URL at `www.mymemoriaally.com`. For local development, remove/comment the `server.url` to use the Vite dev server instead. Run `npx cap sync android` after any build before testing on device.

### Supabase schema highlights

Key tables: `profiles`, `patients`, `subscriptions`, `patient_intake`, `promo_redemptions`, `patient-media` (storage bucket).

`profiles` extends `auth.users` 1:1. On signup, a trigger (`handle_new_user`) auto-creates the profile row. Row-level security is enabled on all tables — queries always run as the authenticated user.

### Admin section

`src/pages/admin/` — `AdminLayout` renders `AdminDashboard`, `AdminPatients`, `AdminPendingApprovals`, `AdminAudit`. Admin users have role `'admin'` in `profiles.role`. The `superadmin` role (handled at session restore) routes to `AdminLayout`.
