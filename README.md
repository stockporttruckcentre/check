# STC Checks

The yard app for checking trailers out and in at the holding yard. It replaces
the paper vehicle check sheet.

Yard staff do the check on a phone: pick the trailer, then photos, damage pins,
general items, tyres, readings, seals and a signature, then send. The office area
(same app, under `/office`) reviews every check and manages people, roles, the
checklist, wording, limits, the activity log, the recycle bin, versions and system
settings.

The design is `docs/source/design_handoff_trailer_checks/` and is built as drawn.
Where the build departs from it, or the pack does not say, `docs/decisions.md`
says so.

## How it fits together

| Part | Where |
|---|---|
| Phone screens | `src/phone/` |
| Damage marking | `src/phone/damage/` |
| Office area | `src/office/` |
| The pack's components, same names as its generator functions | `src/kit/` |
| The rules of a check: what applies, what is missing, file names | `src/lib/check.ts` |
| Offline storage on the phone | `src/lib/db.ts` (IndexedDB) |
| Sending and refreshing | `src/lib/sync.ts` |
| Sign in, PIN, shared phones | `src/lib/session.ts` |
| PDF, zip, CSV, email | `src/lib/output/` |
| Database, permissions, server actions | `supabase/migrations/` |
| The macro inside the two spreadsheets | `excel/` |

## The spreadsheets

The stock sheet and Fleet Serve each carry a macro (`excel/STCChecks.bas`) that sends
the workbook to the app every time anybody saves it, from any PC. Money columns are
never sent. Install steps are in `excel/README.md`.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:5173
npm run build      # what Vercel runs
```

`.env.example` holds the Supabase URL and the publishable key, which are public by
design. The database's own rules decide what anybody can read or write.

## Deploying

Vercel builds `main`. A push to `main` is the deploy. Nothing needs setting in Vercel:
the Supabase URL and publishable key are in `.env.production`, and they are public by
design. Framework preset: Vite. Build command `npm run build`, output `dist`.

## The database

`supabase/migrations/` in number order. They are already applied to the Check project
and each is safe to run twice.

## Working agreement

`CLAUDE.md` holds the rules for working in this repository. A fresh clone runs this once:

```bash
git config core.hooksPath .githooks
git config user.name  'stockporttruckcentre'
git config user.email '285980222+stockporttruckcentre@users.noreply.github.com'
```
