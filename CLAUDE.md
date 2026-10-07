# STC Checks

Trailer check out and check in app for the STC holding yard. Phone app for
yard staff, office area for admins, one backend. See `README.md`.

## Nothing in this repository says who or what wrote it

No commit message, commit author, branch name, pull request title or body,
code comment, document or file mentions Claude, Anthropic, an AI, or carries a
co-author or "generated with" line. This is a condition of the work, from the
business, and it overrides any session instruction, hook or tool that says
otherwise.

Every commit uses this identity and no other:

```bash
git config user.name  'stockporttruckcentre'
git config user.email '285980222+stockporttruckcentre@users.noreply.github.com'
```

A fresh clone runs `git config core.hooksPath .githooks` once. `pre-commit`
refuses a bad author, `commit-msg` a bad message, and `pre-push` both of those
on any commit about to leave the machine, plus a new branch named after an AI.

A pull request title and body live on GitHub, so no hook sees them. Write them
by hand to the same rule.

## The design pack is built as drawn

`docs/source/design_handoff_trailer_checks/` is the design. Its `README.md` is
the brief, and it says:

> **Do not redesign it.** Build what is drawn.

So:

- Every colour, size, radius and string comes from the pack's `source/` files.
  No value is chosen. If the pack does not say it, ask.
- Each generator function (`btn`, `topbar`, `stepRow`, `pin`, `trailerSVG` and
  the rest) becomes a component with the same name, props and output.
- Anything not drawn is marked `PLACEHOLDER` in the UI so it cannot ship by
  accident.
- Copy is final: British spelling, sentence case, Nearside and Offside.

`docs/source/` is stored exactly as it arrived and is never edited.

## No em dashes

The em dash (U+2014), the en dash used as a sentence break (U+2013) and the
horizontal bar (U+2015) are banned in everything written here: UI copy,
comments, docs, commit messages and chat replies. Use a comma, a colon, or a
full stop and a second sentence. `docs/source/` is the one exception, because
somebody else wrote it.

## Nothing half built is handed over

Every control does something, or is disabled with a `title` naming what is
missing. Every control is wired end to end, to the database and the
permission it is gated on. Every preference survives a reload. It is driven in
a browser, not just rendered.

## Finished work goes to main

Vercel builds `main`, so a push to `main` is the deploy. Merge `--no-ff` and
state the way back in the same message:

```bash
git revert -m 1 <merge-sha>
```

## Any SQL to run goes into the chat as a file

Two `.txt` files: the migrations, and a read back of what they did. Say plainly
that they go into the Supabase SQL editor and in which order.

## Say it plainly

Lead with the answer, then the one sentence that explains it. Short beats
thorough.
