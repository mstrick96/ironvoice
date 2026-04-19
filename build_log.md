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
| 2 | State machine + UI shell | 🟡 Ready to start |
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

**Goal:** Lay the foundation. Single HTML file with the storage layer, state machine skeleton, and migration/initialization logic. No voice yet. No UI content yet. The app should load, show a minimal placeholder welcome screen, correctly initialize storage on first run, correctly detect a stale session, correctly apply the close-tab rule, and correctly save/load plan data. Testable entirely with manual UI interaction and browser dev tools.

### Exit criteria (all must be met before Step 2)

1. **Single file loads without errors** in Safari and Edge on iPhone from the GitHub Pages URL.
2. **First launch** creates all four storage keys (`iv.plan.v2`, `iv.session.v2` (null), `iv.history.v2` (empty array), `iv.settings.v2`) with correct schema version and default values.
3. **Subsequent launches** read the stored values correctly and do not overwrite them with defaults.
4. **Corrupted JSON in any key** is detected, stashed to `iv.corrupt.v2.<timestamp>`, and the key is reset to defaults. A banner is shown to the user.
5. **Schema migration ladder** exists (even if trivially empty at v2 → v2) and is exercised on load.
6. **Close-tab rule** works: manually setting `lastActivityTimestamp` to a value more than 6 hours ago triggers auto-finalize on load (session becomes a history entry with `autoFinalizedOnClose: true`, session is cleared, welcome screen is shown).
7. **Storage inspector** screen exists and shows: size in KB, session count, date range, last export, last backup. Buttons present but may be stubs. Clear button requires typed confirmation.
8. **State machine skeleton** exists with all five states defined and a single `transition()` function that is the only way to change state. State transitions are logged to the diagnostic buffer.
9. **PWA detection** works: launching from home screen shows a block screen.
10. **HTTPS detection** works: loading from a non-HTTPS origin shows a clear error.
11. **Online/offline detection** works: `navigator.onLine` false shows a banner.

### What is explicitly NOT in Step 1

- Voice (no SpeechRecognition, no SpeechSynthesis)
- Rest timer (no countdown logic yet)
- Wake Lock
- Full UI (no exercise cards, no set dots, no tab panels)
- Command parser
- CSV export
- Anything in Sections 3, 4.4–4.7, 5, 6.2, 9.3, 9.4 of the spec

### Code organization

The HTML file will be structured in clearly labeled sections:

```
<!DOCTYPE html>
<html>
<head>
  <!-- Meta, viewport, title -->
</head>
<body>

  <!-- ─── UI CONTAINERS (placeholders in Step 1) ─── -->
  <!-- overlays: welcome, pwa-block, https-error, storage-inspector -->
  <!-- main card (stub) -->
  <!-- diagnostic footer (dev only) -->

  <style>
    /* ─── BASE STYLES ─── */
    /* ─── OVERLAY STYLES ─── */
    /* ─── COMPONENT STYLES ─── */
  </style>

  <script>
    // ═══════════════════════════════════════════════
    // CONFIGURATION (user-editable constants)
    // ═══════════════════════════════════════════════
    //   WAKE_WORD, WAKE_WORD_FALLBACK, DEFAULT_PLAN, etc.

    // ═══════════════════════════════════════════════
    // CONSTANTS (internal, do not edit)
    // ═══════════════════════════════════════════════
    //   STORAGE_KEYS, SCHEMA_VERSIONS, STATE_NAMES, etc.

    // ═══════════════════════════════════════════════
    // DIAGNOSTICS (ring buffer + console mirror)
    // ═══════════════════════════════════════════════

    // ═══════════════════════════════════════════════
    // STORAGE LAYER
    // ═══════════════════════════════════════════════
    //   loadKey / saveKey / migrate / validate / stashCorrupt

    // ═══════════════════════════════════════════════
    // STATE MACHINE
    // ═══════════════════════════════════════════════
    //   currentState, transition(), onEnter, onExit

    // ═══════════════════════════════════════════════
    // UI RENDERING (Step 1: minimal placeholders)
    // ═══════════════════════════════════════════════

    // ═══════════════════════════════════════════════
    // LIFECYCLE HANDLERS
    // ═══════════════════════════════════════════════
    //   load, beforeunload, visibilitychange

    // ═══════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════
  </script>
</body>
</html>
```

Each major section will have a `// REGRESSION HAZARD:` comment on any code path that later steps should not casually modify.

### Testing Step 1

Tests are manual and use browser dev tools. You do not need automated tests for this project.

**Test scenarios to run on iPhone:**

1. **First launch:** open Pages URL. Welcome screen appears. Open dev tools (Safari: Develop menu from Mac mirror, or Web Inspector). Verify four `iv.*` keys exist in localStorage with correct schema versions.
2. **Second launch:** close tab, reopen. Same state preserved.
3. **Corruption handling:** in dev tools, manually set `iv.plan.v2` to `not valid json`. Reload. Banner should appear; key should be reset to default; corrupted value should exist under `iv.corrupt.v2.<timestamp>`.
4. **Close-tab rule:** in dev tools, manually set `iv.session.v2` to a realistic session object with `lastActivityTimestamp` set to 7 hours ago. Reload. Session should be auto-finalized into history; welcome screen should show; banner mentioning "prior session auto-saved" should appear.
5. **PWA block:** Add to Home Screen. Launch from home screen icon. Block screen appears instead of welcome.
6. **HTTPS check:** temporarily download the HTML file and open it from Files app (file:// URL). HTTPS error should appear.
7. **Offline:** enable airplane mode. Reload. Offline banner should appear.
8. **Storage inspector:** navigate to Storage screen from welcome. All metrics display correctly.

### Step 1 deliverable

A single file: `IronVoice.html`, uploaded to the repository root. The live URL `https://mstrick96.github.io/ironvoice/IronVoice.html` should run the Step 1 skeleton.

Update this build log with completion date, any decisions made during implementation, and any issues deferred.

---

## Decision log (chronological)

This section tracks decisions made during implementation, most recent first.

### 2026-04-19 — Step 1 complete

All 8 tests on target device (iPhone, Safari) passed after one small cosmetic fix:

**Bug found and fixed during testing:** Clear History button in Storage Inspector wasn't rendering with the expected red outline. Root cause was CSS specificity: `.inspector-actions button` selector was overriding the `.btn-danger` variant because it had higher specificity. Fixed by adding a more specific rule `.inspector-actions button.btn-danger` that restores the red outline/text styling. Confirms the visual hierarchy I intended: destructive actions look different from routine actions.

**Also added during Step 1 revision:**
- On-device debug panel with seven buttons, replacing the console-command approach that only worked on desktop browsers. Each debug action gives visible status feedback. Actions requiring a reload auto-reload after 2 seconds.
- Diagnostic log viewer screen — displays the last 100 internal events on the phone, color-coded by category (state, storage, lifecycle, etc.). This replaces what `console.log` was useful for on a desktop.
- Decision: the debug panel and diaglog screen will be removed in Step 2 when real workout UI takes over. No `?debug=1` URL parameter needed — Step 1 scaffolding is transitional.

**Lessons for future steps:**
- Console-based testing instructions assume desktop browsers and don't work for target-device (iPhone) testing. For any build step that needs interactive testing, build the test controls into the app itself. Do this *during* code generation, not as an afterthought.
- CSS specificity matters when adding variant classes inside specific contexts. When I write `.btn-danger` and also write `.some-context button { ... }`, the context selector wins unless I anticipate it. Rule of thumb for this project: any time I write a variant class (`.btn-danger`, `.btn-primary`, etc.), I should verify it still wins when applied inside `.inspector-actions`, `.debug-panel-buttons`, or other scoped containers.

### 2026-04-18 — Step 1 code produced

**File produced:** `index.html` at repo root. (Filename changed from `IronVoice.html` per user decision; shorter URL.)

**Implementation decisions made during Step 1:**

- **Confirmation word is case-sensitive.** Typing "ERASE" enables the Clear History button; "erase" does not. iOS auto-capitalize is configured but the JS check is strict. This prevents accidental clears if iOS auto-capitalization behaves unexpectedly on the user's device.

- **Session storage uses `null` for "no active session", not an empty object.** When there is no live session, `iv.session.v2` is either absent from localStorage (first load) or explicitly set to `null` (after end-of-workout). Both are handled as "no session" by the loader. This avoids ambiguity and keeps storage slightly smaller.

- **`iv.diag.v2` uses a schema-less array of entries.** Diagnostic entries are `{t, cat, msg, extra}` objects. The buffer is capped at 100 entries and persists across sessions. Unlike the four main keys, diagnostics do not have a `schemaVersion` wrapper because the format is internal-only and changes to it don't need migration.

- **State transitions use an explicit allowed-transitions table.** `ALLOWED_TRANSITIONS[from]` enumerates the valid next states. Attempted illegal transitions are logged and blocked. `State.forceReset()` exists as an escape hatch for error recovery (used only on HTTPS/PWA blocks) and bypasses the allowed-transitions check.

- **Preflight checks run in a specific priority order** on `init()`: PWA block → HTTPS block → storage load → offline banner. PWA is first because it's the most user-visible and explains the symptom; HTTPS is second because it prevents the mic from ever working.

- **`window.IV` and `window.__iv` are both exposed** as the debug namespace. Using `IV` in console is faster to type; `__iv` is the conventional "internal" name and avoids collision with any future global.

- **Debug helpers are built in for testing.** `IV.debugStartSession()`, `IV.debugMakeSessionStale(hours)`, `IV.debugCorruptKey(name)`, `IV.debugWipeAll()`. These replace the "manually edit localStorage in dev tools" steps in the build log's test scenarios — tests now exercisable via two-keystroke console commands. They will be kept in Step 7 but possibly hidden behind a `?debug=1` URL parameter in the final release build.

- **Corruption stash keys** are namespaced as `iv.corrupt.v2.<keyname>.<timestamp>`. The inclusion of `<keyname>` makes it easy to tell *what* was corrupted when looking at storage inspector output, not just when.

**Testing performed:**

- 52 headless tests via jsdom, covering: first-launch initialization, data preservation across loads, JSON corruption recovery, close-tab rule (stale session auto-finalize), PWA blocking, HTTPS blocking, offline banner, state machine enforcement (illegal transitions blocked), debug session creation, storage inspector values, clear history confirmation flow, and diagnostics buffer capture. All 52 passed.

- The test harness itself (`test.js`) is not uploaded to the repo. It's internal development scaffolding, not part of the deliverable. If we need it in the repo later for regression testing it can be added.

**Known deferred items (noted for future steps):**

- The `viewRawJson` button in the storage inspector uses `window.open()` on a blob URL. This may be blocked by iOS Safari popup blockers. Alternative: open in an overlay with `<pre>` formatting. Deferring until Step 7 when we implement real export.
- Font loading is implicit via `-apple-system`. If we ever wanted to guarantee identical typography on Edge iOS (which may use a different default), we'd embed a web font. Not needed for Step 1.

### 2026-04-18 — index.html filename confirmed
User chose `index.html` over `IronVoice.html`. Rationale: shorter URL, standard web convention, and GitHub Pages serves it as the root automatically.

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
v1.3.1 engineering review documented 6 Critical, 17 Major, and 7 Minor findings. Scale of required changes (voice state machine, wall-clock timer, storage redesign, NLU, wake lock, browser compatibility) makes incremental patching more expensive than a clean rewrite.

---

## How to resume in a new conversation

Copy and paste this into the first message of the new conversation:

> I'm Michael. I'm working on the Iron Voice v2.0 rewrite — a single-file HTML voice-driven workout app for iPhone. We've completed the spec and are in the middle of the build. I'm uploading the current spec and build log. Please read both, confirm you're oriented, and pick up where the build log says we are.

Then upload:
1. `IronVoice_Spec_v2_0_1_Released.docx` (or the current spec version)
2. `build_log.md` (this file, in its current state)
3. If we're past Step 1: `IronVoice.html` (the current code)

The spec is fixed. The build log is the running record. Claude will read both and resume at the correct point.

---

*End of build log — last updated 2026-04-18.*
