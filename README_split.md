# Iron Voice

Voice-driven workout app for iPhone. Single-page HTML, deployed to
GitHub Pages, runs in Safari/Edge on iOS 26.

**Live app:** https://mstrick96.github.io/ironvoice/

## Repository layout

The deployed app is a single self-contained `index.html`. For
maintainability, the JavaScript source is split across multiple files
in `src/` and concatenated into `index.html` by a build step.

```
ironvoice/
├── index.html            ← deployed file (built artifact, do NOT edit by hand)
├── index.template.html   ← HTML shell + CSS, with placeholder for JS
├── src/
│   ├── 01-config.js      ← CONFIG, STATES, DEFAULT_PLAN
│   ├── 02-diag.js        ← Diag (must load early — others depend on it)
│   ├── 03-storage.js     ← Storage layer (localStorage with schema versioning)
│   ├── 04-state.js       ← State machine
│   ├── 05-ui.js          ← UI screens & banners
│   ├── 06-session.js     ← Session — workout flow, navigation, logging
│   ├── 07-voice.js       ← Voice — wake match, parser, speech, recognizer
│   ├── 08-voice-tester.js ← Voice tester diagnostic screen
│   ├── 09-workout-ui.js  ← Workout screen rendering
│   ├── 10-end-confirm.js ← End-workout confirmation overlay
│   ├── 11-summary.js     ← Summary screen
│   ├── 12-plan-editor.js ← Plan editor
│   ├── 13-inspector.js   ← Storage inspector (debug)
│   ├── 14-lifecycle.js   ← Lifecycle hooks (visibility, online/offline)
│   ├── 15-preflight.js   ← Pre-init capability checks
│   ├── 16-iv.js          ← IV — public dev console namespace
│   └── 17-init.js        ← init() function and top-level event wiring
├── build.sh              ← bash build script (Linux/Mac/CI)
├── build.ps1             ← PowerShell build script (Windows)
├── .github/workflows/
│   └── build.yml         ← Auto-rebuild on push (GitHub Actions)
├── build_log.md          ← Engineering decision log
└── README.md             ← This file
```

## Workflows

### Editing through the GitHub web interface

This is the simplest path; works from phone, tablet, or laptop.

1. Navigate to the file in `src/` you want to edit.
2. Click the pencil icon, make changes, commit.
3. Click the **Actions** tab. A "Build index.html" workflow will run.
4. Wait ~30 seconds for the green checkmark.
5. The Action commits the rebuilt `index.html` back to the repo. GitHub
   Pages serves the new version within ~1 minute.

**Do not edit `index.html` directly through the web interface.** It's
a build artifact — the next push to `src/` will overwrite your changes.

### Editing locally (Windows)

1. `git pull`
2. Edit a file in `src/`.
3. Open PowerShell in the repo root and run `.\build.ps1`.
4. Open `index.html` in a browser to test if you want.
5. `git add . ; git commit -m "..." ; git push`

The GitHub Action will run on push and re-do the build server-side. If
your local build matches what the Action produces, the Action commits
nothing. If they differ (rare — usually a line-ending issue), the
Action's version wins.

### Editing locally (Linux/Mac)

Same as Windows, but use `./build.sh` instead of `.\build.ps1`.

## Build mechanics

Both build scripts do the same thing:

1. Read `index.template.html`.
2. Concatenate every file in `src/` matching `*.js`, sorted alphabetically
   (the `01-`, `02-`, ... numeric prefixes determine load order).
3. Replace the `<!-- SCRIPTS_HERE -->` placeholder in the template with
   the concatenated JavaScript.
4. Write the result to `index.html`.

The output is a single `<script>` block inside `index.html` containing
every line of every `src/*.js` file in order. The deployed app loads
exactly the same way it always has — one HTML file, one script block,
one parse pass.

## Why split a deployed-as-one-file app?

The deployment constraint (single self-contained HTML file, no build
step required to serve, editable through GitHub web UI) is real and
intentional — it keeps the app simple to deploy, simple to edit from a
phone, and free of any toolchain dependency at run time.

But during *development*, a 4,500-line file is hard to navigate, hard
to change without breaking things, and expensive to send through any
LLM-assisted editing workflow. Splitting the source while keeping the
deployment artifact unchanged gets the best of both: per-module files
that fit in a normal mental working set, plus the single-file deploy
that has always served Iron Voice well.

## Adding a new module

1. Create `src/NN-name.js` where `NN` is a two-digit number that places
   it correctly in the load order (between the modules it depends on
   and the ones that depend on it).
2. Build (`./build.sh` or `.\build.ps1`) and verify `index.html` parses.
3. Commit. The Action will rebuild on the server too as a check.

## Build log

Engineering decisions, locked architectural choices, regression
hazards, and patch history live in `build_log.md`. Read that before
making non-trivial changes.
