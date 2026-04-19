# GitHub Setup for Iron Voice

**A step-by-step walkthrough for hosting the Iron Voice app and its documents on GitHub Pages.**

*Written for someone who has a GitHub account but hasn't used it much. No command line. No git commands. Everything through the GitHub web interface.*

*This walkthrough has been refined based on real setup experience — the gotchas are noted where they occur.*

---

## What you're setting up

By the end of this walkthrough you will have:

1. A **repository** on GitHub that stores all your Iron Voice files — the spec, the build log, the HTML app, and any future supporting documents.
2. **GitHub Pages** enabled on that repository, which gives you a free HTTPS URL where the Iron Voice app actually runs.
3. A **workflow** for uploading new versions of files and editing existing ones, entirely through your web browser.

The whole setup takes about 15 minutes. You do it once and then forget about most of it.

---

## Before you start: use a desktop or laptop browser

**Important:** Do the setup from a Windows PC, Mac, or similar — not from an iPad or phone. GitHub's web interface works on tablets technically, but file uploads and downloads are awkward, and iPad browsers sometimes convert markdown files to PDF during upload (a real issue that caused pain during setup). Chrome or Edge on Windows is ideal. Firefox works too.

You can *chat with Claude* from any device, but do your GitHub file management from a proper computer. The iPad is fine for browsing the repo read-only if you want to check something while you're away from the computer.

---

## Concepts you need to know (briefly)

**Repository ("repo").** A folder on GitHub that holds a project. Yours will be called `ironvoice` or similar. It can be **public** (anyone can see it) or **private** (only you). For Iron Voice we'll make it public — see the "Visibility" note below.

**Commit.** A saved change. Every time you upload a file or edit one through the web interface, GitHub creates a commit with a timestamp and a short message describing what changed. You can view the full history of commits at any time and roll back to an earlier version if something breaks.

**GitHub Pages.** A free service built into GitHub that takes the files in your repository and serves them as a live website at a URL like `https://yourusername.github.io/ironvoice/`. Static files only — HTML, CSS, JavaScript, images, documents. No database, no server code. Perfect for Iron Voice.

**Branch.** A parallel version of your files. Most projects have a `main` branch that holds the official version. Fancier workflows use multiple branches, but for Iron Voice you only need `main`. You can forget this word exists.

That's all the GitHub vocabulary you need for this project.

---

## Note on visibility: public vs. private

GitHub Pages on **private** repositories requires a paid plan (GitHub Pro, $4/month). Pages on **public** repositories is free.

For Iron Voice, a public repository is the right choice:
- Nothing in the code is sensitive (it's a workout app, not financial or medical data).
- Your actual workout history stays on your phone in localStorage — it's never in the repo.
- Public repos are not actively promoted or searched; random people are unlikely to find it.
- Free hosting with no limitations.

For a future project where you genuinely want privacy (perhaps proprietary algorithms or work-in-progress you don't want discovered), GitHub Pro at $48/year becomes reasonable. For Iron Voice, free and public is the right tradeoff.

---

## Part 1: Create the repository

1. Open [https://github.com](https://github.com) in your browser and sign in.

2. In the top-right corner, click the **+** icon and choose **New repository**.

3. Fill in the form:
   - **Repository name:** `ironvoice` (lowercase, no spaces — this becomes part of the URL)
   - **Description:** `Voice-driven workout assistant for iPhone` (optional but helpful)
   - **Visibility:** Select **Public**. (Free tier Pages requires this.)
   - **Initialize this repository with:** Check the box for **Add a README file**. Leave the other two boxes unchecked.
   - **.gitignore** and **license:** Leave as "None" for both.

4. Click the green **Create repository** button at the bottom.

You'll land on the repository page. It has one file in it so far: `README.md`. That file is what displays on the repository's front page. We'll edit it in a moment.

---

## Part 2: Enable GitHub Pages

This is what turns your repository into a live website.

1. On your repository page, click the **Settings** tab near the top.

2. In the left sidebar, scroll down and click **Pages**.

3. Under "Build and deployment":
   - **Source:** select **Deploy from a branch**.
   - **Branch:** select **main** from the first dropdown, and **/ (root)** from the second dropdown.
   - Click **Save**.

4. Wait about 60 seconds. Refresh the Pages settings screen. You should see a green banner at the top that says something like:

   > **Your site is live at https://yourusername.github.io/ironvoice/**

   That is your live URL. Copy it and save it somewhere — this is the URL you'll open on your iPhone to run Iron Voice.

**If you instead see an "Upgrade or make this repository public to enable Pages" message**, your repository is still set to private. Go back to the repository Settings, scroll to the bottom to the Danger Zone section, and use "Change repository visibility" to make it public. Then return to Pages settings.

If the Pages banner shows a yellow "in progress" message instead of the green "live" message, wait another 30 seconds and refresh. First-time Pages builds can take a minute or two.

---

## Part 3: Upload the spec document

Now you'll do your first file upload — the Iron Voice spec document.

1. Click the **Code** tab at the top of your repository page (this takes you back to the file list).

2. Click the **Add file** button near the top-right, then choose **Upload files**.

3. Drag the spec file (`IronVoice_Spec_v2_0_1_Released.docx`, or whatever the current version is) from your computer into the browser window. You'll see it appear in the upload area.

4. Scroll down below the upload area. You'll see a "Commit changes" section.

5. **Commit message.** GitHub's Copilot may auto-generate a commit message based on what changed — something like "Add IronVoice spec document." You can accept this, or edit it to be more descriptive. Both work fine.

6. Leave the extended description blank.

7. Make sure the radio button at the bottom says **Commit directly to the main branch** (it's the default).

8. Click the green **Commit changes** button.

The page will refresh and you'll see the spec file in your file list. You've made your first commit.

---

## Part 4: Editing files through the web interface

You don't need git or any desktop software. For a single-file project like Iron Voice, the GitHub web editor is entirely sufficient.

### To edit an existing text file (like `README.md` or the build log):

1. Click the filename in the file list to view it.
2. Click the **pencil icon** in the top-right of the file view.
3. Edit in the browser.
4. Scroll to the bottom. Accept Copilot's auto-generated commit message or enter your own.
5. Click **Commit changes**.

### To upload a new version of a file (like replacing `index.html` with an updated build):

1. Click **Add file** → **Upload files**.
2. Drag the new version of the file in. If its filename matches an existing file exactly (case-sensitive!), it will replace that file. If the filename is different (even in capitalization), a new file is created alongside the old one.
3. Commit message: accept Copilot's suggestion or enter your own.
4. Click **Commit changes**.

**Important about filenames:** GitHub filenames are case-sensitive. `Build_log.md` and `build_log.md` are different files on GitHub. When uploading an updated version, make sure the filename matches exactly, or you'll end up with two copies.

### To delete a file:

1. Click the filename in the file list to open the file view. If the click doesn't seem to navigate anywhere, **right-click the filename and choose "Open link in new tab"** — this reliably works even when regular clicks get intercepted by browser extensions or behave oddly.

2. In the file view, look for a **three-dot menu (⋯)** in the upper-right area, above the file content.

3. Click the three dots. You'll see a dropdown with options including "Raw," "Copy path," "Copy permalink," and at the bottom in red, **Delete file**.

4. Click **Delete file**.

5. GitHub will show a commit screen. Accept the auto-generated commit message or write your own. Click **Commit changes** to confirm.

The file is now deleted from the current version, but it's not gone forever — GitHub keeps the full history. If you ever needed to recover it, you could find it via the Commits view.

---

## Part 5: Updating the README

Your repository's README is what shows on the front page. Let's replace the default one with something useful.

1. Click `README.md` in the file list.
2. Click the pencil icon.
3. Delete everything that's there and paste in this content:

```
# Iron Voice

Voice-driven workout assistant for iPhone.

## Live app

https://yourusername.github.io/ironvoice/

(Replace "yourusername" with your actual GitHub username.)

## Documents

- **Specification:** `IronVoice_Spec_v2_0_1_Released.docx` (current version)
- **Build log:** `build_log.md` (implementation journey)
- **GitHub setup guide:** `github_setup.md`
- **Onboarding note:** `onboarding.md` (for starting new Claude conversations)

## Status

In active development. See build log for current progress.

## Platform

iOS 16.4 or later. Safari or Edge on iPhone. HTTPS hosting required.
```

4. Edit the live app URL to use your real GitHub username.
5. Commit message: accept Copilot's suggestion or write your own (e.g., "Update README with project overview").
6. Commit.

---

## Part 6: How you'll use this during the Iron Voice build

Here's the workflow for each build step:

1. **Claude produces a file** in the chat (spec update, build log entry, HTML code, etc.).
2. **You download it** from the chat. Click the download link. On Windows the file lands in your Downloads folder.
3. **You upload it to the repo** using the Upload files flow (Part 3 above). If it's replacing an existing file, use the same filename (exact case).
4. **You test** — for HTML changes, open the GitHub Pages URL on your iPhone. The new version is live within about 60 seconds of commit.
5. **If something is wrong**, you can always view past versions via the Commits link and roll back.

For the Iron Voice HTML file specifically, the URL on your phone will be `https://yourusername.github.io/ironvoice/` (the app is named `index.html`, which GitHub Pages serves automatically when you visit the root). Make a Safari bookmark for it and put the bookmark on your home screen for fast access.

**Do NOT use iOS "Add to Home Screen"** which creates a PWA. The Iron Voice spec explicitly blocks PWA mode because it breaks iOS speech recognition. A regular Safari bookmark is what you want. The app itself will block PWA mode if you accidentally launch it that way.

---

## Tips and troubleshooting

**"My Pages site shows a 404 after setup."** Two common causes:
- The Pages build hasn't completed yet. Wait 2 more minutes and refresh.
- There's no `index.html` in the repo yet. GitHub Pages serves `index.html` by default; if no such file exists, you get 404. This is expected during early development before the app itself has been uploaded.

**"I uploaded a file but the Pages URL still shows the old version."** Pages caches aggressively. Close the tab completely and reopen, or force-refresh with Ctrl+Shift+R on Windows / Cmd+Shift+R on Mac. Changes typically propagate within 60 seconds.

**"Clicking a filename doesn't seem to do anything."** Try right-clicking the filename and choosing "Open link in new tab." Browser extensions or ad blockers sometimes interfere with GitHub's navigation. Right-click-to-new-tab bypasses this reliably.

**"I want to see what changed between two versions of a file."** Click the **Commits** link (in the repo, just above the file list), then click any commit. GitHub shows a side-by-side diff of what was added and removed.

**"I accidentally deleted something important."** Find the commit where it still existed (via Commits), click the filename at that commit, and download the old version. Nothing is truly lost unless you rewrite git history (which requires command-line tools and is not something the web interface lets you do by accident).

**"I ended up with two versions of a file with slightly different capitalization."** This happens when you upload a file with a different filename capitalization than an existing file. Delete the old one following Part 4's delete instructions. Going forward, match filename capitalization exactly when replacing files.

**"I uploaded a markdown file and it became a PDF."** This has happened on iPad when sharing files through Safari. Avoid uploading from iPad — use a desktop or laptop browser for file uploads. If you already have a PDF version of what should be a markdown file, download it, copy the text content, create a new file with the correct `.md` filename, and paste the content in.

**"Can I use GitHub Desktop or the command line?"** Yes, but not necessary for this project. GitHub Desktop is a free GUI app that syncs a local folder with your repository. For Iron Voice, pure web interface is simpler. For the telescope project, where you'll have more files and edit more frequently, GitHub Desktop becomes worth installing. You can always add it later without changing anything about the repository itself.

**"Is GitHub's Copilot safe to use for commit messages?"** For simple file uploads and edits, yes. Copilot reads the diff and summarizes what changed — "Add build log document" or "Update spec to v2.0.1." For more complex changes where the *intent* matters (e.g., "Fix rest timer drift caused by iOS background throttling"), you may want to edit Copilot's suggestion to include the reasoning. But there's no risk to letting Copilot write commit messages; at worst they're a bit generic.

---

## Future-proofing: when you start the telescope project

Everything you've learned here applies identically. You'll create a second repository called `telescope` or similar, and it works the same way. The only new concept you might want to learn eventually is **branches**, which let you work on a risky change without touching the main version — but you can do the entire telescope project with the same single-branch workflow you're using here if you want to.

The main skill you're acquiring with this Iron Voice setup is the habit of: *when something changes, commit it with a clear message*. That habit alone, applied consistently, gives you a searchable, recoverable history of your entire project.

---

## Reference card (save for quick lookup)

| Task | Path |
|------|------|
| View files | Code tab |
| Upload new file | Add file → Upload files |
| Replace existing file | Upload files with matching filename (exact case) |
| Edit text file in browser | Click file → pencil icon |
| Delete file | Click file (or right-click → new tab) → three-dot menu → Delete file |
| See change history | Commits link |
| Roll back a file | Commits → click old version → download or copy |
| Pages settings | Settings → Pages |
| Repository visibility | Settings → scroll to Danger Zone |
| Your live URL | `https://yourusername.github.io/ironvoice/` |

---

*End of walkthrough.*
