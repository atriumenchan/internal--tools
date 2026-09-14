# ADMEXO Internal Tools

Spaces, chat, handbook acknowledgement, offer letters, and attendance for the ADMEXO team.

- After login, everyone reads and signs the handbook before they see the rest of the app.
- **Spaces** hold assignable tasks. **Chat** has DMs, groups, and a channel per Space.
- Draft an offer, share a private signing link. The letter is **not sent** until the candidate signs.
- Upload a biometric Excel (in/out punches). Each person gets a month of hours, leaves, absences, late marks, and overtime.

Repo: [github.com/atriumenchan/internal--tools](https://github.com/atriumenchan/internal--tools.git)

## 1. Supabase

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** → New query.
3. Paste everything in [`supabase/schema.sql`](supabase/schema.sql) and run it.
4. Paste everything in [`supabase/spaces.sql`](supabase/spaces.sql) and run it (Spaces, Chat, handbook gate).
5. Authentication → Providers → enable **Email**.
6. Settings → API → copy **Project URL**, **anon public** key, and **service_role** key (server only).

The first account in `profiles` is **admin**. Later staff are created from **Staff** in the app (same pattern as the invoice admin portal). Turn off public sign-ups and Confirm email under Authentication.

## 2. Environment

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

`NEXT_PUBLIC_APP_URL` is used when copying the candidate signing link. In production set it to your deployed origin.

`SUPABASE_SERVICE_ROLE_KEY` stays on the server. It lets an admin create logins from **Staff**. Never name it `NEXT_PUBLIC_`. On Vercel, add it as **Secret**.

## 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Until keys are set you will land on `/setup`.

## 4. Vercel

Import the GitHub repo as a **Next.js** project. In Project Settings → Build and Development:

- Framework Preset: **Next.js**
- Build Command: `npm run build`
- Output Directory: leave **empty** (do not set `public`)

Add env vars under Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as **Config**
- `NEXT_PUBLIC_APP_URL` as **Config** (your live site URL)
- `NEXT_PUBLIC_ADMIN_EMAIL` as **Config** (`ryan@admexo.com`)
- `SUPABASE_SERVICE_ROLE_KEY` as **Secret** (Settings → API → service_role)
- `ADMIN_PASSWORD` as **Secret** (creates that admin login in Supabase if it does not exist)

Then run [`supabase/seed.sql`](supabase/seed.sql) in the SQL editor. Ryan Ray (0003) is stored as ignored and dropped from attendance and logins. If the app already exists, also run [`supabase/spaces.sql`](supabase/spaces.sql) — that adds Spaces, Chat, and the handbook gate. Every current login must sign the handbook once after that.

## Offer letters

1. **Offers → New offer** — save a draft. Nothing is emailed or finalized.
2. **Open for signature** — creates a private `/sign/[token]` link.
3. Send that link yourself (WhatsApp, email, etc.).
4. The candidate reads the letter, draws a signature, and confirms.
5. Status becomes **Signed & sent**. You can print / save PDF. Until they sign, the letter stays unofficial.

## Attendance Excel

Primary format is the biometric **month performance** `.xls` (the `monthperformance…` export). Each person is a 10-row block:

- Header: Dept, Empcode, Name, Present, WO, HL, LV, Absent, Tot. Work+OT, Total OT
- Grid: days 1–31, then IN, OUT, WORK, Break, OT, Status (`P` / `A` / `WO` / `HL` / `LV`)

Headcount can change. The block layout must stay the same. Upload it on Attendance — the app detects it and uses the file’s own totals.

Other sheets (punch log or daily in/out) still work via column mapping.
