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
| 2 | State machine + UI shell | 🟡 In progress — bug fixes applied |
| 3 | Voice loop (Layer 1 wake word + basic commands) | ⚪ Not started |
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
