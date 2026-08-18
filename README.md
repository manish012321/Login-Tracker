# Login Tracker

A full-stack authentication and activity-logging app built with **React**, **Supabase Auth (Google OAuth)**, **Postgres Row Level Security**, **RPC functions**, and a **Supabase Edge Function**.

Users sign in with Google. Every login is recorded server-side (email + timestamp) and displayed live on the frontend — a raw login history table (direct query) and an aggregated stats table (fetched through a Supabase Edge Function).

---

## Live Demo

- **App:** [add your deployed Vercel/Netlify URL here]
- **Demo video:** [add your video link here]

---

## Tech Stack

| Layer         | Tech |
|---------------|------|
| Frontend      | React (Vite) |
| Hosting       | Vercel / Netlify |
| Auth          | Supabase Auth — Google OAuth provider |
| Database      | Supabase Postgres with Row Level Security |
| Backend logic | Postgres RPC functions (`security definer`) + Supabase Edge Function (Deno) |

---

## Architecture & Key Design Decisions

**RLS-first writes**
The `login_logs` table blocks all direct `INSERT`s via an RLS policy. The only way to write a row is through the `record_login()` RPC, which runs as `security definer` and inserts only the authenticated caller's own `auth.uid()` and email. This means no user can log a fake entry as someone else.

**RPC for aggregation**
`login_counts()` is a second RPC that groups logins per user (total login count + last login timestamp), kept separate from raw log reads.

**Edge Function as a verified API layer**
`get-login-stats` is a Supabase Edge Function that independently verifies the caller's JWT before calling `login_counts()` and returning JSON. This gives the function a genuine purpose beyond proxying a query — it acts as an authenticated read boundary.

**Reliable single-record-per-login**
Login recording uses Supabase's `onAuthStateChange` listener combined with a `sessionStorage` flag set immediately before the OAuth redirect. This ensures a login is recorded exactly once per real sign-in — not on every token refresh, tab refocus, or page reload.

---

## Folder Structure

```
login-tracker/              → React frontend (Vite)
  src/
    supabaseClient.js       → Supabase client init
    App.jsx                 → Auth + login history + stats UI
  .env.local                → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)

supabase/
  functions/
    get-login-stats/
      index.ts              → Edge Function (Deno)
  config.toml
```

---

## Database Schema & Security

```sql
-- table
create table login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  email text not null,
  login_at timestamptz not null default now()
);

-- lock it down
alter table login_logs enable row level security;

create policy "authenticated can read all logs"
  on login_logs for select to authenticated using (true);

create policy "no direct insert"
  on login_logs for insert to authenticated with check (false);

-- the only allowed way to write a row
create or replace function record_login()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into login_logs (user_id, email)
  values (auth.uid(), auth.jwt() ->> 'email');
end;
$$;
grant execute on function record_login() to authenticated;

-- used by the Edge Function
create or replace function login_counts()
returns table(email text, total_logins bigint, last_login timestamptz)
language sql security definer set search_path = public as $$
  select email, count(*) as total_logins, max(login_at) as last_login
  from login_logs group by email order by last_login desc;
$$;
grant execute on function login_counts() to authenticated;
```

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd login-tracker
npm install
```

### 2. Environment variables

Create `login-tracker/.env.local`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_anon_key
```

### 3. Supabase setup

- Create a Supabase project.
- Enable **Google** as an Auth provider (Authentication → Providers) using an OAuth Client ID/Secret from Google Cloud Console.
- Add your Google Cloud OAuth redirect URI:
  ```
  https://your-project-ref.supabase.co/auth/v1/callback
  ```
- Add your local + deployed URLs under Authentication → URL Configuration → Redirect URLs.
- Run the SQL above in the Supabase SQL Editor.

### 4. Deploy the Edge Function

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref your-project-ref
npx supabase functions deploy get-login-stats
```

### 5. Run the frontend

```bash
npm run dev
```

Visit `http://localhost:5173`.

---

## How It Works (Flow)

1. User clicks **Sign in with Google** → redirected to Google OAuth via Supabase.
2. On return, `onAuthStateChange` fires `SIGNED_IN`. If this was a genuine new sign-in (checked via a `sessionStorage` flag), the frontend calls `record_login()`.
3. `record_login()` runs server-side as `security definer`, inserting the user's own `auth.uid()` and email — RLS blocks any other write path.
4. The frontend queries `login_logs` directly to render the **Login History** table (allowed by the `select` RLS policy).
5. The frontend also calls the `get-login-stats` Edge Function, passing the user's access token. The function verifies the JWT, calls `login_counts()`, and returns aggregated stats — rendered in the **Login Stats** table.

---

## Notes / Learnings

- Supabase CLI cannot be installed globally via `npm install -g` — use `npx supabase <command>` instead, or install via Scoop (Windows) / Homebrew (Mac).
- `onAuthStateChange` can fire `SIGNED_IN` multiple times (token refresh, tab refocus), not just on real logins — guarding with a `sessionStorage` flag set right before the OAuth redirect prevents duplicate log entries.
- Direct table inserts are intentionally blocked by RLS; all writes are funneled through a `security definer` RPC to guarantee users can only log their own identity.
