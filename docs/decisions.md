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
- **Wording written for screens the pack does not word**, all short and in the pack's voice: "Got it" on the "checked out your trailer" banner, "Lock the phone", "Open the office", "Refresh the stock sheet now", "Change to check in", "Change trailer", "Mark them OK", "Under the legal limit. It will be flagged to the office.", "More than 5,000 km from last time", "Not on the stock sheet", "Making the PDF and zip", "Email ready in your mail app", "This phone can't attach files to an email from here". Wording a screen shows from the checklist (questions, warnings) is editable in Lists and wording.

## Numbers chosen because the pack gives none

- Blur check: Laplacian variance under 25 on the 400px copy. Dark: mean brightness under 40 of 255. Near copy: 8% of a 64 bit difference hash.
- Pinch zoom on the upright damage view stops at 4x.
- A photo that will not fit under 150KB even at 1280px and quality 55 is shrunk further rather than refused.
