# Onboarding Message for New Conversations

When you start a new Claude conversation to continue Iron Voice work, paste the message below as your first message, then attach the three files listed.

-----

## The message

> I’m Michael, working on the Iron Voice v2.0 rewrite — a single-file HTML voice-driven workout app for iPhone. We’re in the middle of a systematic build. I’m uploading the current spec and build log, and the code if we’re past Step 1. Please read all of them, confirm you’re oriented, and pick up where the build log says we are. Do not produce code or make decisions until you’ve read these documents and told me your understanding of our current state.

## Files to attach

1. **Current spec** — most recent version (e.g., `IronVoice_Spec_v2_0_1_Released.docx`)
1. **Build log** — `build_log.md`
1. **Current HTML** (if any) — `IronVoice.html`

-----

## Why this works

- The spec is fixed and describes the intended end state
- The build log tracks what we’ve completed and what’s next
- The HTML is the current state of the code
- Claude can read all three and resume without you re-explaining anything

## Tips

- **Keep the build log in the repo up to date.** If Claude has updated the build log but you haven’t committed the new version, the next conversation will be working from stale information.
- **Don’t skip the “please confirm you’re oriented” step.** If Claude misreads the build log, you want to catch it before it produces a turn of wrong-direction work.
- **If Claude’s understanding is wrong**, correct it before proceeding. Usually this is a small misunderstanding of where we are in the build.
- **Start a new conversation when the current one feels sluggish or long.** Long conversations can degrade in quality. A fresh conversation with fresh context from the repo is usually better than pushing through.

## For the telescope project

This same pattern works for any multi-conversation project. You’ll create an equivalent `telescope_build_log.md` in the telescope repository. Same onboarding pattern, same files.

-----

*File kept in the repository for easy reference.*
