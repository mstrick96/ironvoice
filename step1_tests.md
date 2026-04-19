# Iron Voice — Step 1 Test Guide

**For iPhone testing of the Step 1 skeleton.**

Pull this document up on your iPad or PC while testing `index.html` on your iPhone. Each test has a clear pass/fail criterion. Report any failures back to Claude in the chat.

---

## Before you start

- Your iPhone's Safari or Edge should be open to `https://mstrick96.github.io/ironvoice/`
- The welcome screen should be visible: "IRON VOICE" logo, version tag "2.0.1 · STEP 1", a Step 1 hint block, "SIMULATE START" button, "Storage Inspector" button, and — new in this version — a dashed-border **Step 1 Debug Tools** panel with seven buttons.
- If the welcome screen doesn't appear, something is wrong at the very start; report that before attempting any tests.

**Important:** If you already have data from previous testing, tap **Wipe All IV Data** first to get a clean slate. The tests below assume a fresh first-launch state.

---

## Test 1 — First launch initialization

**Purpose:** Verify the app initializes storage correctly on a fresh install.

**Steps:**
1. From a clean state (after Wipe All IV Data), reload the page.
2. Tap **Storage Inspector**.

**Expected result:**
- Total size shows a value in bytes (something small, around 2-3 KB).
- Schema version shows `v2`.
- Current state shows `IDLE`.
- Live session shows `None`.
- Completed sessions shows `0`.
- Last export shows `Never`.
- Last confirmed backup shows `Never`.

**Pass criterion:** All fields populate with reasonable defaults. No errors, no blank fields, no `—` in place of a real value (except where `—` is expected for empty history/backup).

---

## Test 2 — Close-tab rule (stale session auto-finalize)

**Purpose:** Verify that a session older than 6 hours is auto-saved to history on next launch.

**Steps:**
1. Start from the welcome screen.
2. Tap **SIMULATE START**. You should see a green "Session started" status message briefly appear in the debug panel, and an info banner at the top saying "Debug session started."
3. Dismiss the banner if you want.
4. In the debug panel, tap **Make Session Stale (7h)**.
5. The app will automatically reload after 2 seconds.

**Expected result after reload:**
- You land on the welcome screen (not a resume screen — we don't have a resume screen in Step 1, and the stale session should have been auto-finalized rather than offered for resume).
- An info banner appears at the top saying **"Prior session was auto-saved to history."**
- Open Storage Inspector. Completed sessions should now show `1`.
- Live session should show `None`.

**Pass criterion:** The banner appears AND the history count went from 0 to 1 AND the live session is back to None.

---

## Test 3 — Corruption recovery (plan key)

**Purpose:** Verify that corrupted JSON in a storage key is detected and recovered from.

**Steps:**
1. From the welcome screen, tap **Corrupt Plan**.
2. The app will automatically reload after 2 seconds.

**Expected result after reload:**
- A **yellow banner** appears at the top saying something like "Stored plan data was corrupted and has been reset to defaults. The old data is preserved in diagnostics."
- Storage Inspector shows normal values (size, schema v2, etc.) — proving the plan was reset rather than left broken.

**Pass criterion:** The yellow corruption banner appears AND the app is otherwise functional.

---

## Test 4 — Corruption recovery (history and settings)

**Purpose:** Verify the same recovery mechanism works for other keys.

**Steps:**
1. Dismiss any banners.
2. Tap **Corrupt History**. Wait for reload. Confirm yellow banner. Dismiss.
3. Tap **Corrupt Settings**. Wait for reload. Confirm yellow banner. Dismiss.

**Pass criterion:** Each corruption shows its own yellow banner referring to the right key name.

---

## Test 5 — Clear history flow

**Purpose:** Verify the typed-confirmation clear history mechanism works.

**Steps:**
1. First create some history data: tap **SIMULATE START**, then **Make Session Stale (7h)**. Wait for reload. Confirm Storage Inspector now shows 1 session.
2. On Storage Inspector, scroll down and tap **Clear History** (red button).
3. A confirmation dialog appears asking you to type `ERASE` to confirm.
4. First, try typing lowercase `erase`. The "Clear History" button should stay disabled.
5. Clear the field and type uppercase `ERASE`. The button should become active.
6. Tap the active Clear History button.

**Expected result:**
- Dialog closes.
- Storage Inspector refreshes automatically.
- Completed sessions now shows `0` again.
- An info banner appears saying "History has been cleared."

**Pass criterion:** The button is correctly disabled for lowercase, enabled for uppercase `ERASE`, and clicking it successfully clears history.

---

## Test 6 — PWA block

**Purpose:** Verify that launching the app as a PWA (from Home Screen) shows a block screen instead of the app.

**Steps:**
1. In Safari on iPhone, with the Iron Voice page loaded, tap the **Share** button (square with up arrow).
2. Scroll down and tap **Add to Home Screen**.
3. Accept the default name and tap Add.
4. Close Safari entirely (swipe up to close the tab).
5. Go to your iPhone's home screen, find the new Iron Voice icon, and tap it to launch.

**Expected result:**
- Instead of the welcome screen, you see a "BLOCKED" screen explaining that the app cannot run as a standalone PWA and directing you to open in Safari or Edge.

**Pass criterion:** The BLOCKED screen appears, not the welcome screen.

**After testing:** Long-press the Home Screen icon and delete it. We don't want that icon on the phone going forward. Use a regular Safari bookmark instead if you want quick access.

---

## Test 7 — Offline banner

**Purpose:** Verify that loading offline shows a warning banner.

**Steps:**
1. Swipe down from the top-right of your iPhone to open Control Center.
2. Tap the airplane icon to enable airplane mode. (If Wi-Fi remains on through that, go to Settings → Wi-Fi → turn off.)
3. Pull down to refresh the Iron Voice page in Safari.

**Expected result:**
- A **yellow banner** appears at the top saying "Offline — voice commands unavailable. Tap controls still work."
- The welcome screen appears normally otherwise.

**Steps to end the test:**
4. Turn airplane mode back off.
5. Refresh the page.
6. The yellow banner should not appear this time.

**Pass criterion:** The banner appears when offline AND does not appear when online.

---

## Test 8 — Diagnostic log

**Purpose:** Verify you can view the internal diagnostics log on the phone.

**Steps:**
1. From the welcome screen, tap **View Diagnostic Log** in the debug panel.

**Expected result:**
- You see a screen titled "DIAGNOSTIC LOG."
- Below the title, a list of entries appears, most recent first, each with a timestamp, a category (STATE, STORAGE, LIFECYCLE, INIT, UI, DEBUG), and a message.
- Categories are color-coded (the left border of each entry is colored).
- Entries should include things like "IDLE → LISTENING" for state transitions and "Initialized plan with defaults" for storage events.

**Pass criterion:** The log has entries and is readable. No empty screen, no garbled text.

---

## What to report back

For each test, note:

- **Pass** — met the criterion. Move on.
- **Partial pass** — mostly worked but something was slightly off (e.g., wrong color, wrong wording, minor visual glitch).
- **Fail** — the expected behavior did not occur. Note what actually happened.

If you encounter anything unexpected that isn't covered by a test — visual glitches, layout problems, text that's hard to read, buttons that don't respond — also report that. This is the testing step where surprises are useful; they're much harder to catch once we're adding voice and workout UI.

---

## After all tests pass

When Tests 1–8 all pass, Step 1 is complete. Report back to Claude with a simple "All tests passed." Then we move to Step 2: the real workout UI (exercise cards, set dots, navigation). Still no voice in Step 2 — voice enters in Step 3.

---

*Test guide for Step 1 skeleton — refers to `index.html` at `https://mstrick96.github.io/ironvoice/`.*
