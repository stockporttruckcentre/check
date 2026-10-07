# Handoff: STC Checks (trailer check out / check in app)

## Read this first: how to use this pack

This pack is the design for **STC Checks**: a phone app for yard staff to check trailers out and in, plus an office admin area. It replaces the paper vehicle check sheet.

**Do not redesign it.** Build what is drawn. Previous builds from STC packs drifted into "something close" layouts. That is not acceptable here.

1. Open `STC-Checks-Design-Reference.html` in a browser. It is the source of truth for every screen, component, state, word and rule. Keep it open while you build.
2. Every colour, size, radius and string comes from `source/01-tokens-icons-primitives.js` and the other `source/` files. Copy values from there. Do not pick your own.
3. The `source/` files are the plain JavaScript that generated the reference page. Each UI part is a small function (`btn`, `topbar`, `stepRow`, `pin`, `trailerSVG` and so on). Rebuild each function as a component in your stack with the **same name, the same props and the same output**. The component map below lists them.
4. If something you need isn't drawn, stop and ask. Don't invent it. Mark any placeholder in the UI as `PLACEHOLDER` so it can't ship by accident.
5. Copy is final. Use the exact strings in the reference: British spelling, no em or en dashes, sentence case, and "Nearside / Offside" not "left / right".

The HTML is a design reference, not production code. Rebuild it in the target stack. If there is no codebase yet, use React Native or Expo for the phone app (offline storage, camera, orientation lock) and React for the office area. Both share one backend.

## Fidelity

**High fidelity.** Final colours, type, spacing, states and copy. Rebuild it pixel for pixel. The only grey placeholders are the photo tiles, which are real camera photos in the app.

## Product summary

- **Users:** yard staff (often wearing gloves, outdoors, in rain or bright sun), site leads, sales reps, office admins, and one Owner (Alex Ellis).
- **Core job:** pick a trailer, then work through its steps: customer and hire details, photos, damage pins, general items, tyres, readings and signature. Then send.
- **Output:** one email per check with a summary, a PDF that matches the paper sheet with the damage drawn on, and a zip of photos named by the app.
- **Living app:** people, roles, checklists, trailer types, wording, limits, email recipients, photo size and stock sheet column mapping are all managed in the app by admins, with drafts, publishing, versions, an activity log and undo. No developer is needed for day-to-day changes.

## Design tokens (exact)

Colours (from `01-tokens-icons-primitives.js`):

| Token | Hex | Use |
|---|---|---|
| N (navy) | `#09163A` | Primary text, primary buttons, top bar |
| N7 | `#1E2F63` | Navy pressed |
| N5 | `#3D5290` | Pending/sync accents |
| N1 | `#D9DEEC` | Navy tint |
| N05 | `#EFF2F8` | Selected row background, info banners |
| R (red) | `#CF2417` | Danger, new damage pins, required asterisk, brand accent |
| R7 | `#B31F14` | Error text on R1 |
| R1 | `#FCE3E1` | Error background |
| PA (paper) | `#F7F7F5` | App background |
| W | `#FFFFFF` | Surfaces |
| G | `#1F7A33` | Done, OK |
| G1 | `#E3F2E6` | OK background |
| A | `#8A5300` | Warning text |
| A1 | `#FFF1D6` | Warning background |
| MU | `#46527A` | Secondary text |
| SU | `#5B5B56` | Tertiary text, mono labels |
| BD | `#09163a9e` | Section and group dividers (1px solid). Never 2px. |
| BL | `#E2E2DE` | Card and control borders |
| Input border, idle | `#A3A39D` | 2px |
| Input border, focus | `#09163A` | 3px |
| Old damage pin | `#8A8F99` | Damage already on record |

Type:
- Headings: **Panton** 800 (700 for smaller titles), letter-spacing -0.02em to -0.04em. Font files are in `fonts/`.
- Body: **Inter** 400 to 800, 16 to 18px on the phone.
- Labels and codes: `ui-monospace, Menlo, Consolas, monospace`, 11 to 13px, uppercase with 0.04em spacing for labels.
- Phone body text is never below 15px. Actions are never below 16px.

Sizes:
- Touch targets: 56px minimum and 64px for primary actions (`btn` default h:64). Nothing on a phone screen is tappable below 48px.
- Radius: 8px for controls and cards, 10 to 12px for groups and sheets, 999px for pills, 44px for the phone frame (reference only).
- Spacing: 4 / 8 / 10 / 12 / 16 / 20 / 24px. Screen padding is 16px.
- Shadow, desktop frames: `0 20px 44px rgba(9,22,58,0.12)`. Shadow, dialogs: `0 24px 60px rgba(9,22,58,0.25)`.
- Number plates: `#F7D117` with a 2px `#111` border, rendered as a real UK plate (`plate()`).
- Fleet number chip: navy, white monospace 800 (`fleet()`).

Icons are inline SVG paths on a 24px grid with a 2.2 stroke and round caps (map `IC` in file 01): tick, cross, alert, stop, info, cam, clock, cloud, off, chev, back, down, plus, trash, pen, edit, search, home, list, user, lock, retake, sync, draft, send, sign, gear, image, flash, more, truck, filter, undo, eye.

Status glyphs (`sg`) always pair a shape with a colour, never colour alone: done (green circle and tick), todo (navy ring), miss (red and alert), warn (amber and alert), pend (navy and clock), off, lock, na.

## Component map (build these, same names)

| Function in source | Component | File |
|---|---|---|
| `btn(text, kind, {h, ic, css})` | Button. Kinds: p (primary navy), s (secondary), d (danger red), g (ghost), ok, dis, dg | 01 |
| `topbar(title, {sub, back, close, save, prog, progLabel})` | Phone top bar with save state pill and progress | 01 |
| `scroll(inner, css)` | Scrolling content area (`flex:1; min-height:0; overflow-y:auto`; children never shrink) | 01 |
| `footer(inner)` | Sticky bottom action area | 01 |
| `bnav(activeIndex)` | Bottom nav: Home, Inspections, Unfinished, Settings | 01 |
| `plate(reg)`, `fleet(no)`, `photo(label, {st, ar})`, `card()` | Primitives | 01 |
| `stepRow(title, sub, state, {cur})` | Step list row on the inspection hub | 03 |
| `sheet(inner, {center})`, `toast(kind, text)`, `banner(kind, title, body)` | Overlays and feedback | 03 |
| `chip(text, on, {n, h})`, `badge(text, kind)` | Filters and status badges (badges are capitals with a symbol) | 03 |
| `camUI(title, guide, {n, frame})` | Camera screen with shot guide | 04 |
| `trailerMatch()`, `srcTag()`, `inp()` | Stock sheet match card, source tag (Stock sheet / Typed in), labelled input | 06 |
| `pinpad()`, `dots()`, `setGrp()`, `setRow()`, `tg()` | PIN entry, settings groups, toggle | 07 |
| `dk()`, `dh()`, `dt()`, `sb()`, `pill()` | Office desktop frame, header, table, small button, pill | 07 |
| `lp()` | Landscape phone frame (reference only) | 08 |
| `trailerSVG(view)`, `truckSVG()`, `vanSVG()` | Asset drawings: views ns, os, front, rear, roof in a 640×220 viewBox | 08 |
| `pin(n, x%, y%, kind)` | Damage pin: new (red), old (grey, lettered), act (dragging, ring) | 08 |
| `vtabs(active, counts)` | View tabs with a damage count per side | 08 |

## Screens by section (see the reference page; numbers match its contents list)

- **00 to 07, foundations:** principles, foundations, buttons, inputs, status and progress, cards, navigation, sheets and feedback. Every state is drawn: default, focus, error, disabled, done and loading.
- **08, full inspection flow:** 16 screens for a check out, from choosing out or in to the Sent screen. Screens 2 and 3 are replaced by the stock sheet versions in section 19. Screens 8 and 9 open the damage marker in section 27.
- **09, trailer types:** the table of which steps and items apply to each of the 10 types. Steps that don't apply are hidden, never greyed out.
- **10 to 15:** camera, screen states, the 16 mistakes the app designs for, offline and sync, wording, accessibility.
- **16 to 18:** app structure, office review, edge cases.
- **19, stock sheet link:** look up by any number (spaces, dashes and the C or STC prefix are ignored). Two matches always ask. "This is Dean Mann's trailer" warns but doesn't block, and tells the rep. Banners for an expired MOT (red), wrong site (amber) and status Sold (amber). Customer comes from the stock sheet and can be edited. Account no, order no, rate per week and replacement value are typed in (replacement value is optional).
- **20, signing in:** first time uses work email plus a 6-digit code. After that a 4-digit PIN, with simple PINs refused. On shared phones, "Who's using the phone?". 5 wrong tries locks for 15 minutes. Idle sign-out after 10 minutes, with the check kept.
- **21, staff settings:** personal preferences only.
- **22, people and roles:** users table, add a person, the roles × permissions grid. Owner permissions are fixed.
- **23, check builder:** steps (drag to reorder, toggle), items, item editor, draft, preview on phone, and Publish with a reason.
- **24, lists, wording and limits:** tabbed lists, the limits table, and wording with `{placeholders}`.
- **25, activity log, undo and restore:** the log, the undo dialog with a reason, a 30-day recycle bin, and versions with "Put back".
- **26, System (Owner):** health tiles and tools (View as, read stock sheet now, export everything, photo size, record keeping, column matching, backups).
- **27, marking damage:** the turn-sideways prompt, then a landscape diagram of the right asset type. Tap to drop a numbered pin, hold to drag with a magnifier, then add details (type letter, close-up and wide shot required), then a labelled camera, then a summary. There is also an upright fallback.
- **28, what the team receives:** the email, PDF page 1, zip tree, file naming and photo compression.

## Behaviour and rules (must implement)

### Flow
- Steps can be done in any order. The hub shows ticks. Sign stays locked until every required step is done. The main button always names what's left.
- Auto-save on every change, with a save pill in the top bar ("Saved on phone", "Waiting to send", "Sent").
- Checks already started finish on the checklist version they began with.

### Damage marking
- The asset type comes from the stock sheet and selects the drawing: trailer (curtainsider, box, fridge and others), rigid truck or van. Views are Nearside, Offside, Front, Rear and Roof.
- Pins are stored as **normalised drawing coordinates** (x 0 to 1, y 0 to 1 within the view's 640×220 viewBox) plus the view id, never screen pixels. The same point renders on any phone and on the PDF.
- Pins are numbered 1, 2, 3 in the order they're added. Numbers are never reused after deletion.
- Each pin needs:
  - a type, using the damage letters in this order: **C Cut, T Tear, D Dent, CR Cracked, M Missing, S Scratch, H Holed**;
  - a close-up photo (shot 1, required);
  - a wide shot (shot 2, required);
  - optional extra photos;
  - an optional note, with voice typing.
- The zone name ("Nearside, rear axles") is worked out from the pin position against named zones per view. Admins can edit the zone names.
- Damage on record from the last check shows as grey lettered pins (A, B). At check-in each one gets "Still there" or "Repaired".
- Removing a pin shows Undo for 8 seconds, and its photos go to the recycle bin for 30 days.
- The upright fallback uses the same data, with pinch zoom.

### Photo compression (on the phone, before saving or upload)
1. Capture at camera resolution (often 4032×3024, HEIC or JPEG, 3 to 6 MB).
2. Apply EXIF orientation, then resize so the **long edge is 1600px**.
3. Encode as **JPEG** (.jpg). Never WebP or HEIC.
4. Start at quality 80 and step down by 5 until the file is **100KB or less**. The quality floor is 55. If it still doesn't fit at 55, resize to 1280px and repeat. **Hard limit 150KB.**
5. Strip EXIF, including GPS. Store capture time and location on the check record instead.
6. Run a blur check on the result. If it's too blurry, prompt a retake.
7. Save **only** the compressed file locally. Upload it to the storage bucket when there's signal. Full-size originals never reach the bucket.
8. Target size, long edge and the hard limit are admin settings (System > Photo size) and only affect new photos.

### File naming (done by the app at capture, never typed)
Pattern: `{STCNo}_{OUT|IN}_{YYYY-MM-DD}_{Section}{nn}_{Label}_{shot}.jpg`

- STC No with no space, e.g. `STC4418`.
- Sections: `P` photos, `D` damage (nn = pin number), `T` tyres, `R` readings.
- Label: hyphenated zone and the type word, e.g. `NS-rear-axles_Dent`.
- Shot: `_1` close-up, `_2` wide, then extras.
- Reopened checks add `_v2` to the email, PDF and zip names.

Zip: `{STCNo}_{OUT|IN}_{date}_{Customer-hyphenated}.zip`, containing `Report.pdf`, `Details.csv` (one row of all fields), `1-Photos/`, `2-Damage/` and `3-Tyres-and-readings/`. A full check is about 2MB, so the zip is attached to the email. Over 20MB, send a download link instead.

### Email and PDF
- All check emails go to **alexellis@stc-uk.com** for now. Recipients per site and per check type are an admin setting.
- Subject: `Check out · STC 4418 (C10772) · Borgas Haulage · 07 Oct 2026 · 4 new damage`.
- PDF page 1:
  - navy header;
  - a details grid;
  - damage drawings per view with the same pins;
  - a damage table (No, Where, Type, Note, Photos in zip), where the D numbers match the pins.
- The following PDF pages hold the general items, tyres and signature.

### Stock sheet link (read only)
Columns and what the app does with them:

| Stock sheet column | In the app |
|---|---|
| STC No, Ministry No, Supplier No, Chassis Number (plus the C number) | Search keys |
| Year, Make, Model, Description | Shown on the match card |
| Side Aperture, Colour, Door Type, Axle Type | Shown on the match card. Axle type sets the tyre layout. |
| MOT Date | Shown. Expired shows a red banner. |
| Location | Compared with the user's site. A mismatch is flagged. |
| Status | Shown. Sold or unavailable shows a warning. |
| Sales Rep | Compared with the signed-in user. "Not your trailer" asks first. |
| Customer | Fills the customer field, which can be edited |
| NBV, Refurb Costs, Refurb Costs at Sale, Total NBV, Sales Price, Profit, Profit % | **Never sent to the phone** |
| Supplier, Trade In?, Paid?, Received Date, Order Date, Dispatch Date, Month, New Or Used, Trailer Docs, Signed Order, Deposit Received?, Paid in Full?, JR Notes | Not used |

- The app never writes to the stock sheet. Differences go to the office as notes.
- A cached copy (search keys and match card fields only) downloads at the start of each shift.
- A trailer not on the stock sheet can still be checked, and is flagged to the office.

### Roles (the default grid, editable in the app)
| Permission | Yard staff | Sales rep | Site lead | Office admin | Owner |
|---|---|---|---|---|---|
| Do checks out and in | ✓ | ✓ | ✓ | ✓ | ✓ |
| See other people's unfinished checks | | | ✓ | ✓ | ✓ |
| Reopen a sent check (with reason) | | | ✓ | ✓ | ✓ |
| Add and remove people | | | | ✓ | ✓ |
| Edit checks, lists and wording | | | | ✓ | ✓ |
| Publish a new version | | | | | ✓ |
| Undo and restore | | | | ✓ | ✓ |
| System settings, export, view as | | | | | ✓ |

### Undo and audit
- Every action is written to an append-only log (who, when, what, target, detail).
- Admin changes can be undone with a reason, and the undo is logged too.
- Deleted items can be restored for 30 days.
- Checklist versions can be put back.
- Sent checks are never edited. Reopening one creates a new version.
- Signatures and photo times are never changed.

### Offline
- Offline first. Everything works with no signal. The queue sends when signal returns. Losing signal shows as normal, not as an error.

## Suggested data model (minimum)
- `Check { id, stcNo, cNo, direction: OUT|IN, siteId, userId, customer, accountNo, orderNo, ratePerWeek, replacementValue?, collectingReg, driverName?, checklistVersion, status: draft|waiting|sent|reopened, version, createdAt, sentAt }`
- `DamagePin { id, checkId, number, view: ns|os|front|rear|roof, x, y, zoneName, type: C|T|D|CR|M|S|H, note?, status: new|still_there|repaired, previousPinId? }`
- `Photo { id, checkId, section: P|D|T|R, refId?, shot, fileName, bytes, width, height, takenAt, lat?, lng?, uploadedAt? }`
- `ChecklistVersion { id, number, publishedBy, reason, steps[], items[] }` with items applied per trailer type.
- `Role`, `Permission`, `User { email, role, siteId, pinHash, status }`, `Setting { key, value, version }`, `AuditEvent { at, userId, action, target, detail, undoOf? }`, `RecycleItem { kind, payload, deletedAt, deletedBy }`.

## Placeholders in the reference (not real data)
- STC 4418 / C10772, Borgas Haulage, BOR001, order 4471, £145 per week, MX19 KLA, Jordan Hill, Sam Price, Priya Shah, Kev Doyle and the photo tiles are all sample data.
- "STC Checks" is a working name.

## Files
- `STC-Checks-Design-Reference.html`: the full design reference as one static page. Open it in a browser with `fonts/` beside it.
- `source/01` to `08`: the generator functions with exact values. File names list the sections inside each one.
- `fonts/`: the Panton font files. Inter loads from Google Fonts.
