# Decisions and departures from the design pack

The pack in `docs/source/design_handoff_trailer_checks/` is the spec. Everything here
is either a decision the business made after the pack was drawn, or a place where the
pack does not say and something had to be built. Each one can be changed.

## Decided by the business (8 October 2026)

| Pack says | Built as | Why |
|---|---|---|
| React Native or Expo phone app | Installable web app (PWA), one codebase, phone and office | "it's just website based like all the others" |
| Email from `checks@stc-uk.com`, sent by the system | The phone's share screen opens with the PDF and zip attached; the user picks the office address and taps Send in their own mail app | No DNS changes are possible. The email comes from the signed-in user's own STC mailbox on their phone |
| "Sent" when the office has the email | "Sent" when the check has reached the database (the office screen reads that). The app cannot see whether the email itself went | A website cannot see inside the phone's mail app |
| Stock sheet read at 06:00 | A macro inside each workbook sends it on every save, from any PC | No server task, no PC left on, no ITG. Arrives within seconds |
| Status Sold shows an amber warning | On a check out: a trailer on a sales order, on the Sold List tab, or on hire in Fleet Serve is expected. Anything else asks "Confirm you're checking out the correct trailer". Check ins never ask | "if it's on a sales order it's expected to be checked out, same as if it's sold" |
| 7 sites | Carrington only for now; more are added in Lists and wording, Sites | |
| Customer and rate typed in | Filled from Fleet Serve when the trailer is on hire (tagged Fleet Serve), else from the stock sheet's Customer column, else typed | Fleet Serve is now connected |
| 10 trailer types | Fridge kept, plus the pack's rigid truck and van drawings as types | "yes add fridge" |
| Axle type sets the tyre layout | The count comes from the Description ("Tri Axle", "Tandem"). Axle Type is the make (BPW Drum). Where the description does not say, the app asks once and remembers for that trailer | BPW and SAF come in every axle count |

## Not drawn, built from the nearest drawn thing

- **Hub steps.** The hub lists the steps that apply. "7 of 11 steps" in the pack becomes the real count for the trailer.
- **Not fitted.** Items use OK / Damaged / Not fitted, from the pack's inputs section and its words table ("Item N/A" becomes "Not fitted"), over the flow screen's "N/A".
- **Camera blocked.** A website cannot open the phone's settings, so the main button is "Try again" and "How do I do this?" shows the steps for iPhone and Android.
- **Too dark.** The pack draws the blurry warning. A dark photo uses the same screen titled "This photo looks too dark".
- **Guide text per shot.** Only the nearside front shot has guide text in the pack. The others are blank until somebody writes them in the Check builder.
- **Tyre make.** The pack shows "Axle 1 · Michelin" but draws no way of entering the make, so it is not asked.
- **Damage zones.** Zone names ("Nearside, rear axles") follow the lines already in the drawings (panel lines at 170, 320, 470, the chassis at 150, the wheels from 454). They are editable lists.
- **Office damage card.** The section 17 desk draws an older zone plan. The record uses the section 27 and 28 drawings with pins, the same as the PDF.
- **Tablet layout.** On a tablet the phone screens show at phone width. The pack's "check list beside the current step" is not built yet.
- **Email the office.** A button on the Sent screen, built with the pack's primary button.
- **Wording written for screens the pack does not word**, all short and in the pack's voice: "Got it" on the "checked out your trailer" banner, "Lock the phone", "Open the office", "Refresh the stock sheet now", "Change to check in", "Change trailer", "Mark them OK", "Under the legal limit. It will be flagged to the office.", "More than 5,000 km from last time", "Not on the stock sheet", "Making the PDF and zip", "Email ready in your mail app", "This phone can't attach files to an email from here", "Type the code, or tap the link in the email on this phone.". Wording a screen shows from the checklist (questions, warnings) is editable in Lists and wording.
- A button label too long for a small phone wraps onto a second line inside the button instead of running off its edges. The pack's labels are all one line at the widths it draws.

- **No STC number yet.** New builds sit on the stock sheet with a chassis number and no STC number. Typing that chassis number finds the trailer and asks first: "No STC number yet", "A trailer usually needs its STC number before it's checked in", "Ask the office to add it to the stock sheet, then search again", with "Pick another trailer" and "Carry on without one". A check that carries on is flagged. Not drawn in the pack; built from its not-your-trailer sheet.
- **Same way twice.** If the last check the app has for a trailer went the same way (out then out, or in then in), it asks first: "{trailer} was checked out on {date} at {time}", "By {name}, ref {ref}. It hasn't been checked in since.", "Carry on only if this is a new check out. The office will see it flagged." Trailers the app has no history for are not asked about. Built from the same sheet.
- **Flags on the office record.** The record shows a "Flagged on the phone" card listing what the phone flagged. The PDF does not, because the pack's PDF has no place for it; the CSV in the zip does.

- **Camera not ready.** If the shutter is pressed before the camera has sent a picture, the camera says "The camera wasn't ready. Wait a second and take it again." A gallery photo that will not open says "That photo couldn't be opened. Pick another or take one." Both show on the camera screen in the pack's red, instead of a phone pop-up.
- **Unfinished checks follow the person.** An unfinished check saves itself to the office a moment after each change, photos included, so the same person can carry it on from any device they sign in on. The newer copy wins if both are changed.

- **The PDF is one page, by instruction from the business**, replacing the pack's page 1 plus following pages. In order: the navy band with the STC logo, "TRUCK CENTRE" in STC red and the STC number; the details grid with the asset as STC number then C number; the readings in the same cells; general checks in two columns with a tick, cross or dash, spaced to run the length of the tyre drawing; the tyres drawn from above to a real trailer's proportions (red at or under the legal limit, amber at or under the low tread warning); the damage drawings in one row (nearside and offside always, front, rear and roof when marked, front and rear cropped to their middle half so every drawing stands the same height) with NEARSIDE and OFFSIDE in Panton; a key to the type letters, once; the damage table with the type as its letter and the note taking whatever width the other columns leave; the signature row. Inter and Panton only: Inter is embedded from public/fonts. Rules are thinner and lighter than the pack's BD. The footer reads "STC 145564 · Check out sheet". A check with a lot of damage carries the table onto a second page.

- **Trailer ends drawn to scale.** The pack's rear and front drawings are nearly twice as wide as a real trailer's end. From the business, they are narrowed about the middle to 0.55 of the width, on the phone and the report, and the damage zones for those views move with them (migration 008).
- **Pins point at the spot.** The pack places a pin's box with its bottom on the spot, which leaves the turned tip about 6px below it. The tip now lands on the spot, on the phone and on the report.
- **Report details, from the business.** Company name "STC Sales & Leasing", STC in white and the rest in STC red; "CHECK OUT" in light grey so the trailer number stands out; values in the top cards a weight lighter (Inter SemiBold); the readings cards sized to their content; signature cards with the value centred under the label; tyres drawn from above lying the same way as the nearside drawing, with depths as numbers and the axle number on each axle; the damage key on the Damage heading line; the date in the footer.

## Numbers chosen because the pack gives none

- Blur check: Laplacian variance under 25 on the 400px copy. Dark: mean brightness under 40 of 255. Near copy: 8% of a 64 bit difference hash.
- Pinch zoom on the upright damage view stops at 4x.
- A photo that will not fit under 150KB even at 1280px and quality 55 is shrunk further rather than refused.
