# Blind Wall Street Investment Challenge

An instructor-controlled, two-round, real-historical-sector-investment classroom game.
Hosted on **GitHub Pages**, with **Firebase Authentication** and **Cloud Firestore**.

## What students can do

- Join one of 3 groups using a private 10-character code.
- Read an anonymized briefing, with no year shown before investing.
- Allocate 100% of available wealth across 2–6 real S&P 500 sectors, in 5% steps, max 70% per sector.
- Submit one locked allocation per group and round, within **10 minutes enforced by Firestore server time**.
- See genuine historical one-year ETF total returns only after the instructor reveals them.
- Reinvest compounded wealth in the second, historically independent market episode.

A group that has **no valid submission** by the deadline receives an automatic **equal-weighted allocation (1/6 per sector)** when results are calculated. This fallback is performed when the instructor clicks **Reveal**, rather than being a student-authored submission.

## Round 2 victory music and celebration

- **Only after Market B (Round 2) is revealed**, the instructor screen shows a three-second countdown, animated confetti, winning group, final group rankings, Round 2 profit/loss, final portfolio values, and compounded returns.
- **Market A (Round 1) remains silent and has no celebration effects.** Students still see its ordinary results and leaderboard.
- On the instructor page, click **Enable original victory fanfare on this instructor device** *before* revealing final results. Sound is off by default to respect browser autoplay policies. There is **no sound on student devices**.
- **Replay Round 2 Winner Celebration** becomes available once the second round is completed. You can click it any time to replay the countdown, original fanfare, and confetti on the projector screen; it does not modify Firebase scores.
- This package contains an **original sound synthesized locally in the browser**, not the copyrighted Kahoot recording. It requires no music download, YouTube connection, or licensing of third-party audio.
- If browser audio is blocked or the sound option is off, visual results still work; click Replay after enabling sound. For best results, keep the instructor page open on the classroom display throughout the reveal.

## Initial setup — do these in order

1. Firebase Console: Web app registered; Anonymous and Email/Password sign-in enabled; Firestore Standard database created in Production mode.
2. Firebase Authentication: create the instructor email/password user.
3. Firestore Data: create an `admins` collection with a document whose ID matches the instructor's Authentication UID. Field: `role` (string) `admin`.
4. Paste the web app configuration into `firebase-config.js` (it contains **public identifiers only**, not administrator credentials).
5. Firebase Console → **Firestore Database → Rules**: replace with the contents of `firestore.rules`; then **Publish**. Check syntax in the console; test with Rules Playground/Emulator before the class.
6. Upload the repo's website files to GitHub, enable **Settings → Pages → Deploy from a branch → main / (root)**.
7. Visit `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/admin.html`, sign in as the instructor, and privately enter the two historical years, the briefings, and six validated total returns for each year. Enter real year-end information only and keep future results private.
8. Click **Initialize / reset** to generate 3 private group codes. Give one code to each team captain.
9. Open Market A → wait 10 minutes → Reveal → Open Market B → wait 10 minutes → Reveal final results.

## GitHub Pages URLs

- Student: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`
- Instructor: `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/admin.html`

Both pages are publicly accessible web addresses, but administrator actions require the Firebase email/password account and an `admins/{uid}` role document. **Do not equate an unlinked admin page with a secret URL.**

## Security and operational notes

- **Do not commit** secret data or answer keys into GitHub. The admin dashboard collects them privately into `privateRounds/r1` and `privateRounds/r2`, which Firestore rules restrict to admins. Public site files never contain future returns.
- Group codes live in `privateGroups` and are checked by Firestore rules. Students cannot read the private group-code collection. A code is shared with its group, so treat it as a team credential.
- Only the first valid submission for a group+round may be created. Subsequent student writes are denied; admin may delete a submission if correcting an exceptional problem.
- The backend verifies `request.time < openedAt + 10 minutes` with `openedAt` written as `serverTimestamp()`; the browser countdown is only a visual aid. A user who closes the tab without submitting will receive the fallback.
- The leaderboard and revealed returns are written by the authorized instructor browser, not by students. For higher-assurance production use, calculate results in trusted Cloud Functions. This prototype avoids requiring billing for Cloud Functions.
- A team can have multiple anonymous users holding its code; they all may attempt the **same one-time** team submission. In practice give each code to one designated captain to avoid competing clicks.
- A reset revokes old group codes and deletes recorded submissions/leaderboard but does not delete previously enrolled user membership documents. **For repeated class sessions, use a fresh Firebase project or manually purge old `members` documents before issuing new codes.** The site is designed for one classroom championship per setup.
- Rule and app logic should be tested with disposable Firebase users/rounds before grading. No financial advice or live investment transactions take place.

## Project files

- `index.html`, `student.js`: student portal
- `admin.html`, `admin.js`: instructor controls
- `finale.js`: Round 2-only instructor celebration and original synthesized fanfare
- `shared.js`: constants and common UI helpers; **no hidden outcomes**
- `firebase-config.js`: web app IDs, edit this
- `style.css`: visual design
- `firestore.rules`: restrictive server-side permissions
- `README.md`: these instructions
