# KubeCon Mini Golf Leaderboard

Live mini-golf leaderboard for the MetalBear booth at KubeCon. Two routes — **Legacy Dev Loop** (the hard way) and **mirrord Fast Lane** (the shortcut) — displayed side-by-side on a kiosk TV with real-time updates and confetti animations.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — Postgres, Auth (magic link), Row Level Security, Realtime
- **canvas-confetti** — celebratory animations when a new #1 is set

## Pages

| Route | Purpose |
|---|---|
| `/` | Redirects to `/display` |
| `/display` | Public kiosk view — both leaderboards side-by-side, real-time updates, confetti on new #1 |
| `/display/legacy` | Fullscreen leaderboard for the Legacy Dev Loop route only |
| `/display/mirrord` | Fullscreen leaderboard for the mirrord Fast Lane route only |
| `/admin` | Staff-only — login via magic link, add runs, reset day |

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project. Note your **Project URL** and **anon public** API key from Settings → API.

### 2. Run the database migration

Open the **SQL Editor** in your Supabase dashboard and run the contents of:

```
supabase/migrations/001_create_runs.sql
```

This creates the `runs` table with:
- Computed `score_ms` column (elapsed time + 5s/stroke penalty + deterministic tiebreaker)
- Row Level Security policies (public read for today, staff write)
- Realtime publication

### 3. Enable Realtime

In Supabase Dashboard → Database → Replication, make sure the `runs` table has **Realtime** enabled (the migration does this via `ALTER PUBLICATION`, but verify in the UI).

### 4. Configure Auth

In Supabase Dashboard → Authentication → Providers, ensure **Email** is enabled with **Magic Link** sign-in. Add your domain to the redirect URLs (e.g., `http://localhost:3000/admin` for local dev, and your Vercel domain for production).

### 5. Clone and configure

```bash
git clone <this-repo>
cd kubecon-leaderboards
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 6. Install and run

```bash
npm install
npm run dev
```

- Display: [http://localhost:3000/display](http://localhost:3000/display)
- Admin: [http://localhost:3000/admin](http://localhost:3000/admin)

## How to Use

### Kiosk display (public)

Open `/display` on a TV or browser. The page shows the top 10 players for each route, ranked by total score (lower is better). Scores update in real time via Supabase Realtime — no polling or manual refresh needed. When someone takes first place, confetti fires from both corners of the screen.

Use `/display/legacy` or `/display/mirrord` if you want a single fullscreen leaderboard (e.g., for two separate TVs).

### Scoring a run (staff)

1. Go to `/admin` and enter your email to receive a magic link login.
2. Select a route (**Legacy** or **mirrord**) and enter the player's name (email is optional).
3. Press **GO!** to start the live timer, then **STOP** when the player finishes.
4. Adjust the stroke count (1–20) using the increment/decrement buttons. Each stroke adds a 5-second penalty to the final score.
5. Press **Submit Score**. The run appears instantly on all display pages.

### Resetting the board

Press **Reset Day** in the admin panel to archive all of today's runs. This is a soft-delete (`archived = true`) — no data is permanently lost. The leaderboard clears and is ready for fresh entries.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set the two `NEXT_PUBLIC_SUPABASE_*` environment variables in your Vercel project settings. Add the Vercel URL to Supabase Auth → URL Configuration → Redirect URLs.

## Scoring

```
score_ms = elapsed_ms + (strokes × 5000) + tiebreaker
```

- **elapsed_ms**: Actual time in milliseconds (max 240,000 = 4 minutes)
- **strokes**: 1–20 (each adds 5,000ms penalty)
- **tiebreaker**: `abs(hashtext(id::text)) % 1000` — deterministic, < 1 second, makes ties impossible

The leaderboard shows the top 10 per route for the current day, ranked by `score_ms` ascending (lower = better).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Run the Next.js linter |

## Project Structure

```
src/
  app/
    page.tsx                # Root redirect → /display
    layout.tsx              # Global layout + Google Fonts
    globals.css             # Scoreboard theme, colors, animations
    admin/page.tsx          # Staff login + timer-based entry form
    display/
      page.tsx              # Both leaderboards side-by-side
      legacy/page.tsx       # Legacy route fullscreen
      mirrord/page.tsx      # mirrord route fullscreen
  components/
    Leaderboard.tsx         # Scoreboard UI + useLeaderboardRealtime hook
  lib/
    supabase.ts             # Supabase client initialization
    types.ts                # TypeScript interfaces (Run, Route)
    format.ts               # Time formatting (ms → m:ss.sss)
supabase/
  migrations/
    001_create_runs.sql     # Database schema, RLS, indexes, realtime
```

## RLS Policies

| Policy | Role | Action | Condition |
|---|---|---|---|
| `anon_read_today` | `anon` | SELECT | `event_day = CURRENT_DATE AND NOT archived` |
| `staff_read_all` | `authenticated` | SELECT | `true` |
| `staff_insert` | `authenticated` | INSERT | `created_by = auth.uid()` |
| `staff_update` | `authenticated` | UPDATE | `true` |

## Data Model

```sql
runs (
  id          uuid PK default gen_random_uuid(),
  event_day   date NOT NULL default CURRENT_DATE,
  route       text NOT NULL check in ('legacy','mirrord'),
  player_name text NOT NULL,
  email       text,
  elapsed_ms  integer NOT NULL (1–240000),
  strokes     integer NOT NULL (1–20),
  score_ms    bigint GENERATED (computed),
  archived    boolean default false,
  created_at  timestamptz default now(),
  created_by  uuid references auth.users
)
```
