# STC Checks

The yard app for checking trailers out and in at the holding yard. It replaces
the paper vehicle check sheet.

Yard staff do the check on a phone: pick the trailer, then photos, damage pins,
general items, tyres, readings and a signature, then send. The office gets one
email per check with a summary, a PDF that reads like the paper sheet with the
damage drawn on, and a zip of photos named by the app. Admins manage people,
roles, checklists, wording and limits inside the app.

## State

Design received. Build not started.

The design is `docs/source/design_handoff_trailer_checks/`. Open
`STC-Checks-Design-Reference.html` in a browser with `fonts/` beside it. Its own
`README.md` is the handoff brief and says how it is to be built.

## Stack

Its own Supabase project and its own Vercel project, separate from the STC
dashboard. It moves onto the company server later, the same way the dashboard
will.

## Deploying

Vercel builds `main`. A push to `main` is the deploy.

## Working agreement

`CLAUDE.md` holds the rules for working in this repository. Read it before
changing anything.

## A fresh clone runs this once

```bash
git config core.hooksPath .githooks
git config user.name  'stockporttruckcentre'
git config user.email '285980222+stockporttruckcentre@users.noreply.github.com'
```
