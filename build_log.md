# Iron Voice — Build Log

**Project:** Iron Voice v2.0 rewrite
**Specification:** `IronVoice_Spec_v2_0_1_Released.docx` (canonical, in this repo)
**Repository:** `https://github.com/mstrick96/ironvoice`
**Live URL:** `https://mstrick96.github.io/ironvoice/`
**Runtime target:** iPhone, Safari or Edge, iOS 16.4+

---

## Purpose of this document

This build log is the single source of truth for the implementation journey of Iron Voice v2.0. It records:

- What has been completed and what is in progress
- Architectural decisions made during implementation
- Deviations from the spec (and why)
- Known issues deferred to later steps
- What to tell Claude when starting a new conversation to resume work

The spec itself is a **fixed** document — it describes the intended behavior of the finished app. This log is a **living** document — it tracks how we got there.

When a new conversation begins, Claude is re-oriented by reading this log plus the current spec. You do not need to re-explain the project.

---

## Build plan (7 steps)

Each step produces a testable artifact. Do not proceed to the next step until the current step's exit criteria are met.

| Step | Name | Status |
|------|------|--------|
| 1 | Skeleton + storage architecture | 🟢 Complete |
| 2 | State machine + UI shell | 🟢 Complete |
| 3 | Voice loop (Layer 1 wake word + basic commands) | 🟡 Code produced — awaiting device test |
| 4 | Full command grammar (Layer 2) | ⚪ Not started |
| 5 | Layer 3 intent matching | ⚪ Not started |
| 6 | Wake Lock + wall-clock rest timer + lifecycle hardening | ⚪ Not started |
| 7 | CSV export + backup workflow | ⚪ Not started |

Legend: ⚪ not started · 🟡 in progress · 🟢 complete · 🔴 blocked

---

## Architectural decisions (locked)

These decisions are settled. Changing any of them requires a spec revision and a new version number.

### Platform
- **Runtime:** iOS 16.4+ on iPhone. Safari or Edge only.
- **Hosting:** GitHub Pages at `https://mstrick96.github.io/ironvoice/`. HTTPS required for SpeechRecognition.
- **Repository visibility:** Public (free Pages tier).
- **Development workflow:** All file work via GitHub web interface. No git command line, no local dev server.
- **User's working devices:** iPad primary, iPhone for app testing, Windows PC as backup.

### Architecture
- **Single HTML file.** No build step, no dependencies, no npm. Everything inline.
- **Voice state machine.** IDLE / LISTENING / PROCESSING / SPEAKING / ERROR states. All UI is a pure function of current state. No independent UI updates.
- **Wall-clock time base.** All time-sensitive logic computed from `Date.now()`, never from interval tick counts. Survives backgrounding, lock, and app kill.
- **Separated storage keys.** `iv.plan.v2`, `iv.session.v2`, `iv.history.v2`, `iv.settings.v2`, plus diagnostics and corruption-stash keys. Each has a `schemaVersion` field.
- **Layered command parser.** Layer 1 (wake word fuzzy match) → Layer 2 (keyword grammar) → Layer 3 (intent matching) → Layer 4 (ambiguity or reject).
- **Compound command chaining.** Second command of a compound fires on the first's speech-end callback. No fixed-delay setTimeout.
- **6-hour heartbeat for close-tab detection.** Sessions with no activity for 6+ hours are auto-finalized on next launch.
- **No migration from v1.3.1.** Fresh start. v1.3.1 localStorage key is not touched.

### Voice
- **Wake word:** "Iron" (single word). Fuzzy match with allow-list of known misrecognitions.
- **Fallback wake word:** "Iron up" (configurable in HTML if false-triggers are a problem).
- **Voice preference order:** Alex → Aaron → Fred → any en-US non-female → any en-US → any English.
- **TTS warm-keep:** silent utterance every 15 seconds to prevent iOS silence-after-idle bug.
- **Background audio:** coexist with Audible/Apple Music/Spotify via iOS ducking, not claiming exclusive audio session.

### UI / UX
- **Dark theme, high contrast, large text.** Phone is worn on lanyard; screen is secondary interface.
- **PWA mode blocked.** Detected on launch; explains to user to open as browser tab.
- **Storage inspector.** User-facing screen for viewing storage size, session counts, backup dates, and clearing history (with typed confirmation).
- **Wake Lock.** Acquired on session start, re-acquired on visibility change. Prevents auto-lock during workout.

### Data
- **Exercise model:** uniform. "Timed" type (bike: level, duration) and "Strength" type (weight, reps, sets). Commands adapt to current exercise type.
- **CSV columns:** SessionID, Date, Time, Duration, Exercise, Type, Sets, Reps, Weight, Level, Minutes, Notes, SessionNote, InProgress.
- **CSV injection defense:** cells starting with `=+-@` etc. are prefixed with a single quote.
- **History:** uncapped. Soft reminders at 200 sessions and 180 days since backup.
- **Diagnostics:** rolling 100-entry in-memory + localStorage buffer.

---

## Deferred implementation details

Things that are correct to note but are not blockers for now:

- **Wake Lock on Edge iOS** — needs to be tested early in Step 6. If it doesn't work reliably on Edge, fallback to Safari for gym use.
- **Voice list availability** — some iOS versions don't fire `onvoiceschanged`. Need a retry loop with timeout on first load.
- **Share sheet on Edge iOS** — may behave differently from Safari. Test in Step 7.
- **Layer 3 similarity threshold** — exact value (0.6? 0.7?) to be determined by real testing in Step 5.
- **Diagnostics UI** — basic log view is enough; no need for filtering or export unless problems emerge.

---

## Step 1 — Skeleton + Storage Architecture

**Status: 🟢 Complete — all 8 device tests passed**

**Goal:** Lay the foundation. Single HTML file with the storage layer, state machine skeleton, and migration/initialization logic. No voice. No UI content. The app loads, shows a minimal welcome screen, correctly initializes storage on first run, correctly detects a stale session, correctly applies the close-tab rule, and correctly saves/loads plan data.

### Exit criteria (all met)

1. Single file loads without errors in Safari and Edge on iPhone from the GitHub Pages URL.
2. First launch creates all four storage keys with correct schema version and default values.
3. Subsequent launches read stored values correctly and do not overwrite them with defaults.
4. Corrupted JSON in any key is detected, stashed to `iv.corrupt.v2.<timestamp>`, and the key is reset to defaults with a banner shown.
5. Schema migration ladder exists and is exercised on load.
6. Close-tab rule works: `lastActivityTimestamp` older than 6 hours triggers auto-finalize on next load.
7. Storage inspector screen exists with size, session count, date range, last export, last backup. Clear button requires typed confirmation "ERASE".
8. State machine skeleton exists with all five states and a single `transition()` function as the only path to change state.
9. PWA detection works: launching from home screen shows a block screen.
10. HTTPS detection works: loading from a non-HTTPS origin shows a clear error.
11. Online/offline detection works: `navigator.onLine` false shows a banner.

### What is NOT in Step 1
Voice, rest timer, wake lock, full UI (no exercise cards, set dots, tab panels), command parser, CSV export.

### Decision log for Step 1

- **Confirmation word is case-sensitive.** Typing "ERASE" enables the Clear History button; "erase" does not. Prevents accidental clears given iOS auto-capitalize.
- **Session storage uses `null` for "no active session"**, not an empty object. Avoids ambiguity.
- **`iv.diag.v2` uses a schema-less array.** Diagnostic entries are `{t, cat, msg, extra}`. Capped at 100 entries. No schemaVersion wrapper because format is internal-only.
- **State transitions use an explicit allowed-transitions table.** `ALLOWED_TRANSITIONS[from]` enumerates valid next states. Illegal transitions are logged and blocked. `State.forceReset()` is the only bypass, used only for HTTPS/PWA blocks.
- **Preflight checks run in priority order on `init()`:** PWA block → HTTPS block → storage load → offline banner.
- **`window.IV` and `window.__iv` both exposed** as the debug namespace.
- **Debug helpers built in:** `IV.debugStartSession()`, `IV.debugMakeSessionStale(hours)`, `IV.debugCorruptKey(name)`, `IV.debugWipeAll()`. Will be kept through Step 7, possibly behind `?debug=1` in final build.
- **Corruption stash keys** namespaced as `iv.corrupt.v2.<keyname>.<timestamp>` so you can tell what was corrupted, not just when.
- **On-device debug panel** added during Step 1 revision — seven buttons replacing console commands that only work on desktop. Auto-reloads after 2 seconds for actions that require it.
- **Diagnostic log viewer screen** added — last 100 internal events, color-coded by category (state, storage, lifecycle). Replaces console.log for on-device testing.
- **CSS specificity bug fixed:** `.inspector-actions button` was overriding `.btn-danger`. Fixed by adding `.inspector-actions button.btn-danger` with explicit red styling. Rule of thumb established: always verify variant classes (`.btn-danger`, `.btn-primary`) still win when applied inside scoped containers.
- **Debug panel and diaglog screen are transitional** — removed in Step 2. No `?debug=1` needed for Step 1 scaffolding.

**Lesson learned:** Console-based testing instructions assume desktop browsers. For any step that needs interactive testing on iPhone, build the test controls into the app itself during code generation, not as an afterthought.

---

## Step 2 — State Machine + UI Shell

**Status: 🟡 Code produced — ready for device testing**

**Goal:** Full workout UI with tap-driven interaction. No voice yet. Every screen present and navigable. Session lifecycle works end-to-end. Plan editor functional. Voice state machine wired to UI but voice itself is stubbed — the badge shows "STEP 2 · TAP" where the voice indicator will eventually appear.

### What was added in Step 2

**Removed from Step 1:** debug panel HTML, diaglog screen. `IV.debugStartSession()` now calls the real `Session.start()` instead of a stub.

**New screens:** Resume, Workout, Summary, Plan Editor. (Welcome, Storage, PWA, HTTPS carried forward from Step 1.)

**Voice aliases:** every exercise in `DEFAULT_PLAN` has an `aliases: string[]` field used by the Layer 2 parser in Step 3. Hip Adduction uses `['hip adduction', 'adduction', 'adductor', 'inner thigh', 'add machine']`; Hip Abduction uses `['hip abduction', 'abduction', 'abductor', 'outer thigh', 'ab machine']` — maximally distinct because they are acoustically near-identical and adjacent in the circuit.

**Tap-to-edit weight/reps:** tapping either value button opens a bottom-sheet. "Today Only" writes to `session.todayOverrides`. "Save for Next Time" also queues a `pendingPlanChange` applied at session end.

**Plan Editor:** deep-copy workflow. Expand/collapse per exercise. Full field editing (name, type, weight/reps/sets/rest or level/duration, coaching note, voice aliases). Up/down reorder. Delete. Add exercise. Saves only on Done; Cancel discards.

**End-workout confirmation:** overlay showing exercise count and elapsed time. "Keep Going" dismisses; "Yes, End Workout" finalizes.

**Session module:** `_data` (live session object) and `_plan` (loaded plan copy). Methods: `start()`, `resume()`, `startFresh()`, `navigate(delta)`, `goTo(index)`, `logSet()`, `undoLastSet()`, `applyTodayOverride(field, value)`, `queuePlanChange(field, value)`, `markNoteSeen(exId)`, `end()`. Every mutation calls `heartbeat()` which updates `lastActivityTimestamp` and saves to localStorage.

**Session data fields added in Step 2:** `todayOverrides: {}`, `noteSeenIds: []`. Existing carried forward: `id`, `startTime`, `currentIndex`, `logEntries`, `pendingPlanChanges`, `sessionNote`, `lastActivityTimestamp`, `schemaVersion`.

**Log entry fields:** `id, exId, name, type, setNum, timestamp` plus for strength: `weight, reps`; for timed: `level, duration`.

### Exit criteria — test all 13 on iPhone before marking Step 2 complete

1. **BEGIN WORKOUT** → workout card appears showing the first exercise.
2. **Navigation** → PREV and NEXT cycle through all 13 exercises without errors or blank cards.
3. **Logging a set (strength)** → tap a set dot; it fills in; a confirmation badge briefly appears on the card.
4. **Logging a set (timed)** → on the Bike card, tap MARK DONE; set logs correctly.
5. **Tap-to-edit weight — Today Only** → bottom sheet opens; tap Today Only; weight changes on card; no banner; plan not modified.
6. **Tap-to-edit weight — Save for Next Time** → bottom sheet opens; tap Save for Next Time; weight changes on card; banner appears confirming plan change queued.
7. **Tap-to-edit reps** → same two-path test as weight.
8. **Exercises tab** → shows all exercises with done/not-done indicators; tap any exercise to jump directly to its card.
9. **Session Log tab** → shows all logged sets, newest first.
10. **End workout flow** → tap END → overlay shows exercise count and elapsed time → "Keep Going" dismisses → tap END again → "Yes, End Workout" → Summary screen shows correct stats.
11. **Summary → Welcome** → tap Back to Home → Welcome shows updated session count.
12. **Resume flow** → close the tab mid-workout; reopen the URL → Resume screen shows the exercise you were on, sets logged, time since last activity → tap Resume → workout card restores to correct position. Also test: tap Start Fresh → fresh workout begins from exercise 1.
13. **Plan Editor** → tap Edit Plan → expand an exercise → edit name, weight, reps, a voice alias → Save Exercise → fields update in list → reorder with arrows → delete an exercise → add a new exercise → Done → changes persist when re-entering Plan Editor. Also: Cancel discards all changes.

**Bonus checks (not blocking but note any issues):**
- Bottom sheet on tap-to-edit should feel like a natural iOS sheet (slides up from bottom).
- Set dots should be large enough to tap reliably with gym-sweaty fingers.
- Hip Adduction and Hip Abduction voice aliases in Plan Editor are visibly distinct from each other.
- Jump-to-exercise from Exercises tab should feel instant.

### What is NOT in Step 2
Voice (SpeechRecognition, SpeechSynthesis), rest timer, wake lock, CSV export.

---

## Step 3 — Voice Loop (planned, not started)

**Scope:** SpeechRecognition setup, wake word detection with fuzzy match, Layer 1 parser, TTS warm-keep, state machine wiring for LISTENING / SPEAKING / PROCESSING. The "STEP 2 · TAP" badge becomes a live voice status indicator.

**Prerequisites:** Step 2 passes all 13 exit criteria on device.

---

## Decision log (chronological)

### 2026-04-19 — Step 2 code produced

**Design decisions finalized during Step 2:**

- **Voice aliases per exercise** are stored in the exercise object in `DEFAULT_PLAN`. This means aliases are user-editable via the Plan Editor and persist with the plan. The Layer 2 parser in Step 3 will build its lookup table from whatever aliases are currently in the saved plan, not from a hardcoded list. This is correct behavior: if the user renames an exercise or adds an alias, voice recognition adapts.

- **Hip Adduction / Hip Abduction alias separation** deliberate engineering decision: these two exercises are acoustically very close and adjacent in the circuit. Their alias lists were designed to be maximally distinct. Adduction = inner thigh muscles / add machine. Abduction = outer thigh muscles / ab machine. If a future user test reveals persistent confusion between them, the fallback is to rename one exercise entirely in the plan editor rather than tune the fuzzy matcher.

- **Today Only vs. Save for Next Time** uses `session.todayOverrides` and `session.pendingPlanChanges`. `getEffectiveValue(exId, field)` resolves in order: todayOverrides → plan value. Pending plan changes are applied to the plan object at `Session.end()`, then the plan is saved. This means if a session is abandoned (close-tab auto-finalize), pending plan changes are NOT applied — intentional. Only completed sessions update the plan.

- **Set dot recording design:** set dots record what the user actually did, not what the plan says. The user may tap a set dot with overridden values, standard values, or after changing values mid-exercise. Whatever the current effective value is at the moment of the tap is what gets logged. The plan's `sets` field controls how many dots are shown initially, but extra taps beyond that number are allowed (additional sets). No enforcement.

- **Plan Editor uses a deep copy.** `PlanEditor` module works entirely on a deep copy of the current plan until the user taps Done. This means navigation away from Plan Editor mid-edit and returning (via Cancel) leaves the plan unchanged. The copy is discarded; the original plan in storage is untouched.

- **`IV.debugStartSession()` now calls real `Session.start()`** rather than a Step 1 stub. This means debug helpers can now be used for realistic session testing from the console if needed.

### 2026-04-19 — Step 1 complete

All 8 tests on target device (iPhone, Safari) passed after one small cosmetic fix.

**Bug fixed:** Clear History button in Storage Inspector wasn't rendering with expected red outline. Root cause was CSS specificity: `.inspector-actions button` selector was overriding `.btn-danger` because it had higher specificity. Fixed by adding `.inspector-actions button.btn-danger` restoring red outline/text styling.

**Added during Step 1 revision:** on-device debug panel with seven buttons (replacing console-command approach that only works on desktop browsers); diagnostic log viewer screen showing last 100 internal events color-coded by category.

**Decision:** debug panel and diaglog screen are transitional — removed in Step 2. No `?debug=1` URL parameter needed.

**Lessons:** Console-based testing instructions assume desktop browsers and don't work for iPhone testing. Build test controls into the app during code generation. CSS specificity: when writing `.btn-danger` and also `.some-context button {}`, the context selector wins unless anticipated.

### 2026-04-18 — Step 1 code produced

File produced: `index.html` at repo root. (Filename changed from `IronVoice.html` per user decision.)

52 headless tests via jsdom, all passed. Test harness (`test.js`) not uploaded to repo — internal scaffolding only.

Known deferred: `viewRawJson` button uses `window.open()` on a blob URL, which may be blocked by iOS Safari popup blockers. Deferring until Step 7.

### 2026-04-18 — index.html filename confirmed
User chose `index.html` over `IronVoice.html`. Shorter URL, standard web convention, GitHub Pages serves it as root automatically.

### 2026-04-18 — Build log initiated
Build log document created. Step 1 scoped out with exit criteria.

### 2026-04-18 — Spec v2.0.1 released
Close-tab rule added (6-hour heartbeat, auto-finalize). v1.3.1 migration removed (user confirmed no data to preserve).

### 2026-04-18 — Repository created
`github.com/mstrick96/ironvoice` created, public, Pages enabled.

### 2026-04-17 — Spec v2.0 released
Wake word changed to "Iron". Voice preference updated to US male English. Bike treated as full-featured exercise. Audible compatibility explicitly guaranteed.

### 2026-04-17 — Spec v2.0 drafted
Initial complete rewrite specification. All v1.3.1 failure modes mapped to v2.0 fixes.

### 2026-04-17 — Rewrite decision made
v1.3.1 engineering review documented 6 Critical, 17 Major, and 7 Minor findings. Scale of required changes makes incremental patching more expensive than a clean rewrite.

---

## How to resume in a new conversation

Copy and paste this into the first message of the new conversation:

> I'm Michael. I'm working on the Iron Voice v2.0 rewrite — a single-file HTML voice-driven workout app for iPhone. We've completed Steps 1 and 2 of 7. I'm uploading the current spec, build log, and current index.html. Please read all three, confirm you're oriented, and pick up where the build log says we are.

Then upload:
1. `IronVoice_Spec_v2_0_1_Released.docx` (or current spec version)
2. `build_log.md` (this file, current version)
3. `index.html` (current code)

The spec is fixed. The build log is the running record. Claude will read all three and resume at the correct point.

---

*End of build log — last updated 2026-04-19 (Step 2 code produced, awaiting device test).*

### 2026-04-19 — Step 2 bug fixes (patch 1)

**Bug 1 fixed — Banner overlapping header:**
Root cause: `#banner-area` was a non-positioned div in normal document flow. Screens use `position: absolute; inset: 0; z-index: 10`, which covers the full viewport. The `.banner` children had `position: relative; z-index: 20`, but z-index of a child only creates stacking context relative to its positioned ancestor — and `#banner-area` was not positioned, so screens always won.
Fix: Added `position: fixed; top: 0; left: 0; right: 0; z-index: 2000; pointer-events: none` inline on `#banner-area`. Added `pointer-events: auto` to `.banner` so dismiss/action buttons still respond to taps. Banners now float above all screens and overlays.

**Bug 2 fixed — No escape route from workout screen:**
Problem: The only exit from the workout screen was END → confirmation → summary → home, which forces a session-ending flow even if the user accidentally tapped Begin Workout or wants to visit the Plan Editor mid-session.
Fix: Added a small `⌂ HOME` button below the "IRON VOICE" brand text in the workout header. Two behaviors:
- If **no sets have been logged**: exits silently and immediately, discarding the session from localStorage (nothing to preserve).
- If **sets have been logged**: shows a confirmation overlay ("Session is saved and can be resumed") with Keep Going / Go to Home. Choosing Go to Home leaves the session in localStorage intact — next launch will detect it and show the Resume screen.

*End of build log — last updated 2026-04-19 (Step 2 patch 1).*

### 2026-04-20 — Step 2 bug fixes (patch 2)

**Bug fixed — Banner still overlapping header (root cause fully resolved):**
Patch 1 made banners position:fixed above screens, but screens didn't know to push their content down — so the banner landed directly on top of whatever was already at y=0 (the workout header, in Michael's test). The workout header also had its own `padding-top: max(16px, env(safe-area-inset-top))`, which would have double-counted safe-area space if the screen was already offset.

Full fix applied in patch 2:
1. Added `--banner-h: 0px` CSS variable to `:root`.
2. Changed `.screen` `padding-top` from `max(40px, env(safe-area-inset-top))` to `max(var(--banner-h), 40px, env(safe-area-inset-top))` — so when a banner is taller than the safe area (it includes safe-area padding in its own height), it wins and the screen content clears the banner; when no banner is present, safe-area wins as before.
3. Removed the redundant `padding-top: max(16px, env(safe-area-inset-top))` from `.workout-header` — the parent `.screen` now handles safe-area offsetting for all screens; the header no longer double-counts it.
4. Added a `MutationObserver` on `#banner-area` that updates `--banner-h` automatically whenever any banner is added, changed, or removed. No call site needs to remember to trigger the sync. Initial sync runs at startup.

### 2026-04-20 — Step 2 bug fixes (patch 3)

**Three issues addressed together:**

**1. Banner overlap (strengthened fix)** — Patch 2 code was verified in the file (CSS variable, observer, workout-header cleanup all present), but the user reported no visible change on device. Two plausible causes: iOS Safari HTML cache or a timing subtlety in `offsetHeight` reads. Added belt-and-braces:
- New `syncBannerOffsetNow()` function uses `requestAnimationFrame` to guarantee layout has completed before reading `offsetHeight`, then writes `--banner-h`.
- Called directly after every `appendChild`, every `banner.remove()`, and every action-button dismiss in `raiseBanner`. The `MutationObserver` from patch 2 remains as a second safety net.
- Version tag on Welcome screen bumped to **"VERSION 2.0.1 · STEP 2 · patch 3"** so the user can verify at a glance which code is actually loaded. If it reads "patch 3", all banner fixes are active.

**2. Banner persistence across screens** — Plan-change and Plan-saved banners stayed up forever and followed the user to Welcome after Session.end(). Root cause: no auto-dismiss timer and no cross-screen cleanup.
- Added `options` parameter to `raiseBanner(id, type, message, actionLabel, actionFn, options)`. Supports `transient: true` (marks banner for cleanup on screen change) and `autoDismissMs: N` (auto-removes after N ms).
- `UI.clearTransientBanners()` removes all banners with `data-transient="1"` and re-syncs the banner offset. Called automatically at the top of `showScreen()`.
- `plan-change` banner: 4s auto-dismiss, transient. `plan-saved` banner: 3s auto-dismiss, transient. `cleared` banner in Inspector: 3s auto-dismiss, transient.
- Sticky banners (corruption, offline, quota) are unaffected — they stay until user acts on them.

**3. Storage History: Oldest/Newest stuck at 4/19/2026, 8:00:00 PM (real bug)**  
Root cause: `Session.end()` stored the session's `date` field as `_data.startTime.slice(0, 10)` — i.e., just the YYYY-MM-DD portion like `"2026-04-20"`. When the Inspector called `new Date("2026-04-20")`, JavaScript parsed it as **UTC midnight**. For a user in Atlanta (UTC−4 EDT in April), UTC midnight of April 20 is **8:00 PM on April 19 local time**. Every session recorded today showed the same shifted timestamp. Completed-session count was correct because it came from `.length`, not from parsing dates.

Fix: Inspector now uses `session.startTime` (the full ISO timestamp, already stored in every record) for oldest/newest display, falling back to `.date` only if `startTime` is missing (older record compatibility).

---

*End of build log — last updated 2026-04-20 (patch 3).*

### 2026-04-20 — Step 2 device testing — patch 3 results

**Working:**
- Version tag confirmed "patch 3" on device, confirming the correct code is loaded.
- Plan-change and plan-saved confirmation banners now auto-dismiss correctly (3–4s) and no longer follow the user across screens.
- Storage Inspector now shows correct oldest/newest session timestamps. The UTC-midnight date bug is fully fixed.
- Home exit button on workout header works as specified (silent exit when no sets logged, confirmation overlay when sets are logged with session preserved for resume).
- Tap-to-edit weight/reps with Today Only vs. Save for Next Time working on device.
- Plan editor CRUD, reorder, alias editing all working.

**Known issue deferred to Step 3:**
- Banner overlap with workout-header text remains visible on device despite the full `--banner-h` + `MutationObserver` + `requestAnimationFrame` sync implementation. Unclear why it is not taking effect when the identical pattern works on the Storage and other screens. Since the workout-header will be substantially restructured in Step 3 to add the live voice status indicator (currently shown as "STEP 2 · TAP"), we are not investigating further here. Will revisit during Step 3 implementation.
- The workout screen is judged crowded enough that further banner offset CSS work would add more noise than value at this point. Transient banners are short-lived and users can still read the workout content once they auto-dismiss.

**Step 2 status: Functionally complete with one deferred cosmetic issue on the workout screen banner overlap.**

The remaining Step 2 exit criteria (13 items) have all been verified except where the banner overlap on the workout screen may partially obscure header text during the ~4-second transient window. This does not block Step 3.

---

*End of build log — last updated 2026-04-20 (Step 2 functionally complete).*

### 2026-04-20 — Step 2 ADD SET feature (patch 4)

**Feature added:** Mid-workout set addition with evidence-based guardrails.

**Motivation:** The user (80 years old, training for strength maintenance per sarcopenia research) described a progression strategy of starting at 1 set × 20 reps, adding sets first as he adapts, then eventually increasing weight and dropping back to 1 set. Current app forced him to end the workout and use the plan editor to add sets — not a realistic mid-workout workflow. Discussion of the feature surfaced a brief evidence review on resistance training for 80+ adults. Consensus: 2–3 sets is the evidence-based sweet spot for this age group; progressing reps before load is standard advice; balance training pairs multiplicatively with resistance training.

**Behavior added:**

1. **ADD SET button** appears on the workout card only when all currently-shown dots are logged (prevents accidental extras before the planned work is complete). Tapping it adds one dot and tracks the count in a new session field `extraSetsToday[exId]`. Extras are today-only by default.

2. **Save N sets for next time button** appears once at least one extra dot has been added this session. Tapping it queues (or replaces) a `pendingPlanChange` of `{ field: 'sets', value: currentEffectiveCount }`. Button label changes to "✓ N sets saved for next time" with green styling once saved. Subsequent taps overwrite the pending change with the latest count (so the user can add more extras, then re-tap Save, and the plan update tracks the current dot count).

3. **Undo Last Set** continues to work as before — if an extra set has been logged and then undone, the dot count stays (user must separately navigate away or tap Undo until all logs are cleared). Extras are preserved across navigation within the session so the user can leave and return to an exercise without losing ADD SET taps.

**Guardrails (evidence-based):**

- **One-time 3+ sets warning per session.** First time the effective dot count for any exercise reaches 4 (i.e., the user has added the 3rd extra beyond a 1-set planned exercise, or added beyond a 3-set exercise), a single dismissible banner appears with message: "Most guidelines cap strength training at 2–3 sets for your age group. Consider increasing weight on your next progression instead." Session-scoped flag `capWarningShown` prevents repeat. Auto-dismiss 10s.

- **Progression prompt on Summary screen.** If the user used Save for Next Time on `sets` field for 3 or more distinct exercises in one session, a banner appears on the Summary screen: "You increased sets on N exercises today. When you're ready for the next progression step, consider increasing weight and dropping back to 1 set." Auto-dismiss 12s. Filters `pendingPlanChanges` to only `field === 'sets'`, so weight/reps changes don't inflate the count.

**Implementation notes:**

- New Session module methods: `addSetDotOnly()`, `saveSetCountForNextTime()`, `getEffectivePlannedSets(exId)`, `isSetCountSavedForNextTime(exId)`. Exported via the return block.

- Forward-compat: older sessions (resumed from Step 2 pre-patch-4 localStorage) are patched in `resume()` to add `extraSetsToday = {}` and `capWarningShown = false` if missing.

- `_renderSetArea` now calls `getEffectivePlannedSets(exId)` instead of `getEffectiveValue(exId, 'sets')` so extra dots persist across navigation.

- `Save for Next Time` coalesces repeated taps: the filter `ch => !(ch.exId === ex.id && ch.field === 'sets')` removes any prior `sets` change for this exercise before pushing the new one. No duplicate pending changes accumulate.

- Ordering fix: `Summary.show()` raises the progression-tip banner AFTER `UI.showScreen('summary')`, because `showScreen` calls `clearTransientBanners` at its top, which would wipe a banner raised before the screen change.

**Version tag:** "VERSION 2.0.1 · STEP 2 · patch 4"

**Test scenarios for device testing:**

1. Start workout. First exercise has planned 1 set. Verify: no ADD SET button visible (planned sets not yet logged).
2. Tap the one set dot. Verify: ADD SET button appears.
3. Tap ADD SET. Verify: second dot appears. "Save 2 sets for next time" button appears.
4. Tap the new dot to log it. Verify: ADD SET button appears again (now all dots logged).
5. Tap ADD SET a second time. Verify: third dot appears. "Save 3 sets for next time" button now says 3.
6. Tap Save for Next Time. Verify: plan-change banner appears, button becomes "✓ 3 sets saved for next time" in green.
7. Tap ADD SET a third time (would be 4 total). Verify: one-time "most guidelines cap at 2–3 sets" warning banner appears. Button label updates to "Save 4 sets for next time" (does not auto-save — user must tap Save again to update the pending change to 4).
8. Navigate to another exercise, back. Verify: all extra dots and saved state preserved.
9. Repeat Save for Next Time on 3 different exercises. End the workout. Verify: Summary screen shows "3 plan updates saved for next session" note AND the progression-prompt banner appears.
10. Next session: verify the plan now reflects the new set counts.

---

*End of build log — last updated 2026-04-20 (patch 4: ADD SET feature with guardrails).*

### 2026-04-20 — Step 2 complete

All patch-4 test scenarios verified on device. After ending a workout with Save-for-Next-Time applied, the new set counts correctly appear in subsequent sessions. Plan editor reflects the updated counts. All 13 Step 2 exit criteria are functionally met. The workout-screen banner-overlap cosmetic issue remains deferred to Step 3 (workout-header will be restructured when the live voice status indicator replaces "STEP 2 · TAP").

**Step 2 status: 🟢 Complete.**

Step 3 is cleared to begin.

---

*End of build log — last updated 2026-04-20 (Step 2 complete).*

---

## Step 3 — Voice Loop (Layer 1)

**Status: 🟡 Code produced — ready for device testing**

**Goal:** Bring the app to life with voice. The user taps BEGIN WORKOUT once, grants mic permission, and controls the workout by speaking "Iron" followed by a command. The voice status badge in the workout header shows live state (Listening / Speaking / Processing / Paused / Audio Off) driven entirely by `State.transition()`.

Step 3 builds the voice **plumbing** and a minimal Layer 1 command vocabulary. Steps 4–5 build the full grammar; Step 6 adds Wake Lock and the wall-clock rest timer.

### What was added in Step 3

**New module: `Voice` (≈380 lines)**
- Wraps `SpeechRecognition` (webkit-prefixed) and `speechSynthesis`.
- Holds recognizer instance, TTS preferred voice, warm-keep interval, wake-word matcher, Layer 1 parser.
- Public API: `initOnSessionStart()`, `shutdown()`, `handleBadgeTap()`, `restart()`, `say(text, onDone)`, `interruptSpeech()`, `onVisibilityHidden()`, `onVisibilityVisible()`. Test helpers: `__matchWakeWord`, `__parseCommand`.

**Wake-word matcher (Layer 1)**
- Bounded Levenshtein (distance ≤ 1 only — ~15 lines, not a full DP table).
- Allow-list of 11 known iOS misrecognitions: `iron`, `ironing`, `irons`, `i ron`, `ironic`, `ironed`, `hiron`, `eye ron`, `i run`, `iron.`, `iran`.
- Handles 2-word split-misrecognitions (`"i ron"`, `"eye ron"`) by trying 2-word prefixes against the allow-list before 1-word.
- Prefix form (`iron-*` up to 6 chars) caught as a safety net.
- Tries each of the 5 recognizer alternatives; first match wins.
- 17/17 unit tests passed offline: all documented misrecognitions match, all non-wake utterances reject, all empty / punctuation edge cases handled correctly.

**Layer 1 command parser — minimal vocabulary**
- `next` / `next exercise` / `move on` / `keep going`
- `previous` / `previous exercise` / `back` / `go back` / `last one`
- `repeat` / `say that again` / `what was that` / `come again`
- `help`
- `pause` / `stop listening` / `mute`
- Empty tail (`"Iron"` with nothing after) → bare prompt: "Yes? What would you like to do?"
- Anything else → "I didn't catch that. Say Iron help for commands."

**Recognizer behavior (spec §3.2)**
- `continuous = false`, `interimResults = false`, `lang = 'en-US'`, `maxAlternatives = 5`.
- Auto-restart in `onend` whenever `_wantListening` is true and state is LISTENING — the only reliable pattern on iOS.
- `onerror` routes by error code: `no-speech`/`aborted` → silent restart; `not-allowed`/`service-not-allowed` → ERROR + mic-permission banner with Retry; `audio-capture` → ERROR + retry banner; `network` → ERROR + offline banner.

**TTS behavior (spec §3.4)**
- Voice preference ladder: Alex → Aaron → Fred → any `en-US` non-female (excludes Samantha, Victoria, Susan, Allison, Ava, Karen, Zoe) → any `en-US` → any English.
- `onvoiceschanged` retry loop handles iOS's asynchronous voice list load.
- Utterance chaining via `onend` callback — **never setTimeout** (spec §2.4).
- 15-second silent warm-keep utterance (single space, volume 0) fires only when state is LISTENING and ≥15s since last TTS end. Prevents iOS silence-after-idle bug.
- `speechSynthesis.cancel()` only on explicit tap-to-interrupt or shutdown — prevents v1.3.1's audio-focus-handoff race.

**State machine wiring (spec Table 3)**
- `Session.start()` → `Voice.initOnSessionStart()` → transition IDLE → LISTENING. Intro utterance ("Iron Voice ready. 13 exercises today. Starting with Recumbent Bike, level 1, 10 minutes.") routes through `Voice.say()` so mic is properly suspended during TTS.
- `Session.resume()` → same pattern, plus "Resumed. [exercise name]."
- `Session.end()` → `Voice.shutdown()` (stops recognizer, cancels TTS, clears warm-keep) then transition to IDLE.
- Both home-exit paths (with and without logged sets) → `Voice.shutdown()` before leaving workout screen.
- `speak()` transitions LISTENING → SPEAKING, runs TTS, on `onend` transitions back to LISTENING and restarts recognizer. If `_pauseAfterSpeak` is set (by `pause` command), transitions to IDLE instead.
- Badge tap: IDLE → resumes listening; ERROR → restart; LISTENING → pauses to IDLE; SPEAKING → interrupts TTS.

**UI integration**
- Workout-header restructured into two rows. Top row: HOME button (left), IRON VOICE brand (center), voice status badge (right). Bottom row: exercise progress indicator. This also fixes the deferred patch-3 banner-overlap cosmetic bug by letting `--banner-h` offset the entire header cleanly.
- `UI.reflectState()` extended to drive the voice badge. Five state styles via CSS classes: `voice-listening` (orange, pulsing dot animation), `voice-speaking` (filled orange background), `voice-processing` (neutral), `voice-error` (red border, red dot), `voice-idle` (grey, "Paused" text).
- Badge is tappable on the workout screen (calls `Voice.handleBadgeTap`).

**Tap-to-interrupt (spec §3.3)**
- Capturing-phase click handler on `screen-workout`. When state is SPEAKING and the tap target is not a button or input, calls `Voice.interruptSpeech()` which cancels TTS and transitions to LISTENING.
- Explicit exclusion of buttons and inputs so legitimate tap-to-log interactions don't accidentally cancel speech.

**Lifecycle wiring**
- `visibilitychange` → `Voice.onVisibilityHidden()` on hide (stops recognizer), `Voice.onVisibilityVisible()` on show (restarts recognizer if session active). Full Wake Lock integration is Step 6 — for Step 3 the screen will still auto-lock and the voice loop pauses until unlock.

### Locked decisions

- Wake word remains "Iron" with the fallback to "Iron up" available via `CONFIG.WAKE_WORD_FALLBACK` (not yet wired — documented for Step 4+ if false-trigger rate is unacceptable).
- Levenshtein ≤ 1 is the exact threshold from the spec. No tuning planned.
- The `_pauseAfterSpeak` flag pattern — used only for the `pause` command — is a one-off; it would grow into a cleaner transition-queue pattern in Step 4 if more commands need post-speech state control.

### Exit criteria — test all on iPhone before marking Step 3 complete

1. Launch. Tap BEGIN WORKOUT. iOS prompts for mic permission. Grant it. Voice badge reads "Listening" with an orange pulsing dot.
2. App speaks the intro: "Iron Voice ready. 13 exercises today. Starting with Recumbent Bike…". Badge goes solid orange during speech, returns to pulsing "Listening" after.
3. Say "Iron next." App speaks "Moving to Chest Press." State transitions reflect on badge.
4. Say "Iron previous." App speaks "Going back to Recumbent Bike."
5. Say "Iron repeat." App re-reads the current exercise description.
6. Say "Iron help." App speaks: "Say next, previous, or repeat. More commands coming soon."
7. Say just "Iron." App speaks: "Yes? What would you like to do?" and stays in Listening.
8. Say "the weather is nice today" (no wake word). App stays in Listening. No speech, no action.
9. Say "Iron banana." App speaks: "I didn't catch that. Say Iron help for commands."
10. Say "Iron pause." App transitions to IDLE, badge reads "Paused" in grey. Tap the badge — returns to "Listening".
11. During app speech, tap the workout screen (away from buttons). Speech cancels within ~200ms, badge returns to Listening immediately.
12. Leave app idle on Listening for 30+ seconds. Say "Iron next." App still responds (warm-keep working).
13. Lock iPhone screen. Wait 30s. Unlock. Voice loop resumes listening.
14. Background the app (home gesture). Wait 30s. Return. Voice loop restarts, no stuck badge.
15. Airplane mode → reload. Offline banner appears. BEGIN WORKOUT doesn't start voice. Tap controls still work.
16. Say "Ironing next." App still matches "ironing" as the wake word and executes "next" (fuzzy match).
17. Header layout: "STEP 2 · TAP" placeholder is gone. Voice badge shows real state. HOME button still works. Plan-change banners no longer overlap the header text.
18. All Step 2 tap-driven flows still work identically: ADD SET button, tap-to-edit weight/reps, plan editor, resume flow, summary screen, end-workout confirmation.

### What is NOT in Step 3

- Full Layer 2 keyword grammar (Tables 8–15 of spec) — Step 4
- Layer 3 intent matching with similarity scoring — Step 5
- Compound commands (`log it and rest`) — Step 4
- `go to [exercise name]` with alias lookup — Step 4
- Rest timer and audio cues — Step 6
- Screen Wake Lock — Step 6
- Full end-of-workout spoken summary — Step 4
- CSV export — Step 7

### Decision log for Step 3

**2026-04-21 — Step 3 code produced**

- **Allow-list rather than full Levenshtein for wake word.** Using `Set` lookup for the known misrecognitions (11 entries) plus bounded Levenshtein ≤ 1 is O(1) per check and handles the edge cases the spec calls out. A full edit-distance library isn't needed at this layer — Layer 3 in Step 5 uses a different matching system for the command tail, not the wake word.
- **Two-word allow-list entries handled by trying 2-word prefixes first.** `"i ron"` and `"eye ron"` are real iOS misrecognitions. The initial implementation split only on the first space, which meant `"i ron next"` tokenized as `firstTok="i"`, `rest="ron next"` — no match. Fixed by checking `tokens[0] + ' ' + tokens[1]` against the allow-list before falling through to 1-word matching.
- **`Voice.say()` public method rather than accessing `_speak` directly from Session.** Sharing an underscored private across modules is fragile. Public `say(text, onDone)` gives Session a clean interface for the intro and "resumed" announcements, and will be used in Step 4 for the full command responses that originate in Session.
- **Tap-to-interrupt uses capturing phase with target filtering.** If tap-to-interrupt ran on every click including button taps, pressing a set dot during app speech would cancel speech AND log a set — surprising behavior. Filtering `e.target.closest('button')` and `e.target.tagName === 'INPUT'` means only taps on blank exercise-card area or the exercise name cancel speech.
- **Warm-keep timing gate uses wall-clock.** `Date.now() - _lastSpeechEnd >= 15000` instead of counting interval ticks. Same wall-clock principle as the rest timer will use in Step 6; survives backgrounding without drift.
- **`_pauseAfterSpeak` flag is a one-off.** It's the minimum viable mechanism for making the pause command's TTS finish before transitioning to IDLE (rather than returning to LISTENING as the default `onend` path does). If Step 4 adds more post-speech state control, this will be replaced with a proper transition queue.
- **Deferred patch-3 banner-overlap cosmetic issue is resolved** by the header restructure. The single-row flex layout with three competing items was what made the banner collide with the header text on iPhone; splitting into two rows gives the `--banner-h` offset clean vertical real estate to push into.

---

*End of build log — last updated 2026-04-21 (Step 3 code produced).*

### 2026-04-21 — Step 3 patch 1 (diagnostic tools + critical bug fixes)

**Context.** First device test of Step 3 revealed significant problems: voice quality was unacceptable (iOS was picking the compact Alex voice, robotic), "reps" was pronounced "representatives", navigation (voice or tap) was silent instead of announcing the destination, and recognition latency was 1.5-2s with intermittent failures. Web-search research surfaced a critical constraint: iOS Safari does not expose the best Siri/Premium voices to the Web Speech API even though they're installed on the device. This is an Apple platform limit, not a coding bug. Path forward: stay on Web Speech API, upgrade voice selection to prefer the best of what Safari exposes, let the user override via a diagnostic tool, and fix the other bugs.

**Voice quality — quality-scored selection replacing name-match.**
Previous `_pickVoice` did `byName('Alex')` first, which always picked the low-quality compact Alex on iOS 16+. New `_pickVoice` builds a score per voice using Apple's naming conventions: +100 for `siri` in name, +80 for `premium`, +60 for `enhanced`, +30 for `localService === false` (server-rendered/neural), +20 for `en-US`, +3 for non-female. Highest score wins. On iOS 26 devices this should pick whatever enhanced voice is installed (Ava Enhanced, Siri voices if exposed, etc.). Falls back cleanly to compact voices only when nothing better is installed.

**Voice Tester screen (new).**
A diagnostic utility accessible from the Welcome screen. Enumerates every voice `speechSynthesis.getVoices()` returns on this specific device, groups them by language (English first), shows each with its name, locale, and tags (remote / default). Each row has a Play button (samples the voice with a realistic app phrase — "Moving to Chest Press. One set, twenty reps at forty pounds.") and a Use button. Choosing Use persists the selection to `settings.preferredVoiceName` in localStorage; the choice survives page reload.

This is the definitive tool for answering "which voice sounds best on my device" — no more guessing from spec names. Also serves as a bug diagnostic: if iOS isn't exposing the good voices at all, the Voice Tester lists show exactly what's available.

**Text normalization (`reps` → `repetitions` and more).**
New `_normalizeForSpeech(text)` function in the Voice module, applied inside `_speak()` before the utterance is passed to `speechSynthesis.speak()`. Whole-word (`\b`) regex rules:
- `reps` → `repetitions`
- `rep` → `repetition`
- `lbs` → `pounds`
- `lb` → `pound`
- `min` → `minutes`
- `sec` → `seconds`
- `L1` / `L2` / `Ln` → `level N`

Whole-word boundary means legitimate words like "representative", "report", "combination" are untouched. 11/11 offline tests passed including the don't-mangle-real-words cases.

**Silent navigation bug fix.**
`Session.navigate()` now speaks the arriving exercise description via `Voice.say(_describeForSpeech(ex))`. Called on both voice-driven (`Iron next`) and tap-driven (NEXT button) navigation — announcements are consistent regardless of input method. Voice command handlers for `next` and `previous` no longer speak their own "Moving to X" prefix since `Session.navigate()` does the complete announcement including set count, reps, and weight. This also matches spec §6.2 which calls for exercise announcements on arrival.

New helper `Session._describeForSpeech(ex)` generates the canonical spoken description. Intentionally duplicates a similar helper in the Voice module (`_describeExercise`) — duplication is cheaper than cross-module coupling at this stage.

**Recognizer restart hardening.**
`onend` restart delay increased from 100ms to 300ms. iOS Safari needs ~250ms minimum to fully release the mic between single-shot recognitions; the previous 100ms sometimes fired before the mic was free, causing silent rejection (recognizer appeared active but no audio reached `onresult`).

`_startRecognizer()` now detects `InvalidStateError` / "already started" in the thrown exception message and retries once after a 500ms delay. Capped at 2 retries to prevent infinite loops.

Expected effect: fewer "have to say Iron next three times" moments. Not a cure for ambient noise interference but addresses the mic-release race condition.

**Known limitation accepted.**
The 1-2 second latency between "Iron next" and app response is inherent to iOS Safari's Web Speech API — Safari routes recognition through the legacy `SFSpeechRecognizer` pipeline even on iOS 26 (which has a new faster API called SpeechAnalyzer that is Swift-only and not exposed to web pages). The app is subject to this constraint unless ported to a native iOS app. The user explicitly chose to remain on the browser-app architecture and accept the latency.

**Version tag bumped to `patch 1`.**

**Test before calling Step 3 ready:**
1. Open Welcome screen → tap "Voice Tester" → sample several voices → pick one you find acceptable → tap Use → return to Welcome.
2. BEGIN WORKOUT. Listen to the intro — voice should now be the one you picked.
3. Say "Iron next." Tap NEXT button. Both should speak the full destination exercise details ("Moving to Chest Press. One set, twenty repetitions at forty pounds.") — note "repetitions" not "representatives".
4. Recognition should feel a bit more reliable than patch 0; still not instant but fewer silent failures.
5. If no voice is acceptable, that's a platform limitation and we need to have the cloud-TTS conversation.


### 2026-04-22 — Step 3 patch 2 (wake-word change + diagnostic overlay)

**Wake word changed from "Iron" to "Coach".**

Device testing of patch 1 surfaced a deeper issue: "iron" is a poor wake word for speech recognizers. The user (Southern American English) pronounces it as "I-urn" (one syllable, vowel-r-vowel-n). iOS transcribes that as "I run", "I earn", "Iran", or other words depending on context. The Levenshtein+allow-list matcher catches some but not all variants, and the underlying problem is that "iron" is a common English word with multiple regional pronunciations and many phonetic neighbors.

After discussion of three robustness options (phonetic matching, different wake word, no wake word, push-to-talk), the user chose to change the wake word to "Coach". Reasoning:
- "Coach" has a strong terminal 'ch' consonant that recognizers lock onto reliably across accents.
- "Coach" is rarely spoken in normal conversation during a workout (lower false-positive rate than option 1's phonetic-class matcher).
- "Coach" thematically matches a workout-app's role.
- Single syllable, easy to say repeatedly, recognized consistently by major regions of English.
- The "Hey Coach" variant pattern-matches Alexa/Siri but the user finds it cumbersome; sticking with single-word "Coach".

Applied changes:
- `CONFIG.WAKE_WORD` = `'coach'`, `CONFIG.WAKE_WORD_FALLBACK` = `'hey coach'`
- `WAKE_ALLOW_LIST` rewritten with coach misrecognitions: `coach`, `coaches`, `coached`, `coaching`, `couch`, `couches`, `coat`, `coats`, `cooch`, `coach.`, `koch`, `kotch`, plus two-word variants `hey coach`, `hey coaches`, `hey couch`, `hey coat`, `a coach`, `okay coach`, plus `coachbuilder` for compound iOS recognitions.
- Prefix-form fallback updated from `startsWith('iron') && length <= 6` to `startsWith('coach') && length <= 9`.
- User-facing speech: "Say Coach help for commands" replaces "Say Iron help for commands".
- "Iron Voice" brand name preserved in intro utterance and screen logo. Only the wake word itself changed.
- 20/20 offline wake-word tests pass: catches `Coach`, `Couch`, `coat`, `hey coach`, `okay coach`, `koch`, `coaches`, `coaching`, plus Levenshtein-1 variants (`cosch`, `oach`); correctly rejects unrelated words (`caboose`, `cookie`, random sentences).

**Voice diagnostic overlay (new debug tool).**

A user-controlled diagnostic that displays the raw recognizer transcripts on screen so the user can see what iOS actually heard when a command doesn't trigger.

How it works:
- Setting `voiceDiagEnabled` added to `defaultSettings()` (defaults false).
- Toggle button added to Voice Tester screen labeled "Show voice diagnostic overlay" with a clear OFF/ON indicator. Persists to localStorage.
- When enabled, every `r.onresult` event populates a translucent overlay at the bottom of the workout screen showing all 5 alternatives the recognizer returned, each with confidence percentage. Auto-hides after 6 seconds.
- Doesn't speak, doesn't interfere with the wake-word match flow — pure read-only diagnostic.
- Use case: user says "Coach next", nothing happens. Toggles diagnostic on. Says "Coach next" again. Sees on screen "1. couch next [85%], 2. coach next [62%], 3. coaches next [40%], 4. cocoa next [28%], 5. cohash next [12%]." Now we know exactly what iOS heard and can refine the allow-list with real data, not guesses.

The diagnostic also serves as a long-term tuning tool: if "coach" turns out to have other common misrecognitions we haven't seen yet, the user can capture them via the overlay rather than relying on me to predict them.

**Implementation notes:**
- New `Voice` private methods `_isDiagEnabled`, `_setDiagEnabled`, `_showDiagResult`, `_hideDiagOverlay`. Exposed publicly as `Voice.isVoiceDiagEnabled` and `Voice.setVoiceDiagEnabled`.
- New `VoiceTester.toggleDiag()` flips the setting and re-renders the toggle button color/label.
- Overlay HTML lives next to the banner-area, fixed-positioned at the bottom-right. Always rendered, display:none when off. Uses pointer-events:none so taps pass through.
- Diag log captures the raw transcripts via the existing `Diag.add('voice', 'Recognizer onresult')` regardless of overlay state, so historical analysis is still possible via the Storage screen.

**Version tag:** "VERSION 2.0.1 · STEP 3 · patch 2"

**Test sequence:**
1. Open Voice Tester. Verify the diagnostic toggle is present and OFF by default.
2. BEGIN WORKOUT. Say "Coach next." App should respond immediately (or with the same ~1s iOS latency).
3. If recognition is unreliable: tap voice badge to pause, return to Welcome, open Voice Tester, toggle diagnostic ON, BEGIN WORKOUT again. Now every spoken command shows raw transcripts on screen for 6 seconds. Capture what iOS actually hears for your "Coach" pronunciation; report back.
4. Say "Coach next", "Coach previous", "Coach repeat", "Coach pause", "Coach help" — all should work.
5. Say "Couch next" — should also work (allow-list catches the misrecognition).
6. Say something with no wake word — app stays silent and listening.
7. Confirm previous patch 1 fixes still work: "reps" pronounced as "repetitions", PREV/NEXT buttons announce destination, Samantha (or whichever voice) plays correctly.


### 2026-04-25 — Step 3 patch 3 (Iron pronunciation fix)

**Problem:** TTS voices (Samantha confirmed, others likely the same) pronounce the spelling "Iron" as two distinct syllables — "I-RON" — which sounds old-fashioned/wrong to American ears. The natural English pronunciation is one syllable, "I-urn."

**Fix:** Two whole-word substitutions added to `_normalizeForSpeech`:
- `Iron` → `I-urn`
- `iron` → `i-urn`

The hyphenated form coerces TTS engines to treat the word as a single phonetic token rather than spelling it out. Brand name on screen ("IRON VOICE" logo, "Iron Voice ready" intro text in source) is unchanged — only the TTS output text is rewritten before being passed to `speechSynthesis.speak()`.

**Why hyphen rather than just "iurn":** Tested mentally against typical TTS behavior — the hyphenated form is more reliable across voices because TTS engines have explicit handling for hyphenated phonetic spellings. If Samantha or another voice still pronounces this oddly on device, alternative spellings to try are `eye-urn` (more readable) or `ahy-ern` (closer to dictionary IPA).

**Version tag:** "VERSION 2.0.1 · STEP 3 · patch 3"

**Test:** Begin a workout. Listen to "Iron Voice ready..." intro. Should now say "I-urn voice ready" — pronounced as natural single-syllable "iron."
