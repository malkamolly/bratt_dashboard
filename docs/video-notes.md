# Turning arborist estimate videos into written notes

This is a reusable playbook for using Claude Code to "watch" an arborist's
property walkthrough video and turn it into usable estimate notes. Written so
future sessions (and future you) don't have to re-figure it out.

## What this does

Arborists record video of properties while talking through their findings. Claude
can't press play and watch a video like a person, but it *can* read text and
images. So the trick is to turn each video into two things Claude can read:

1. **A transcript/summary** of what the arborist *says* (the findings — the gold).
2. **A few still frames** pulled from the video so Claude can *see* the trees /
   damage / property being described.

Then Claude writes it up.

## The tools (already available — nothing to install)

This uses the connected **Adobe media tools**. No `ffmpeg`, no Whisper, no
pipeline setup needed.

- `asset_add_file` — opens a file picker so you can upload the video.
- `media_summarize` — transcribes + summarizes the spoken content.
- `video_metadata` — returns length / resolution (used to plan which frames to grab).
- `video_render_frame` — pulls a single still image at a chosen timestamp.

## Step-by-step

1. **Get the video onto your device.** Our videos live in ServiceTitan (ST).
   Open the video in ST *where you're logged in* and download the `.mov`.
   > Why not just paste the ST link? This environment can't reach ServiceTitan
   > (it's blocked by the network policy), and ST video links only work while
   > *you're* logged in. So the reliable path is: download it, then upload it.
2. **Ask Claude to start.** Say: *"Transcribe and take notes from an arborist
   estimate video — open the file picker so I can upload the .mov."*
3. **Pick the file** in the picker Claude opens.
4. Claude runs `media_summarize` (the words) + `video_metadata` (the length),
   then grabs a handful of `video_render_frame` stills at the key moments.
5. Claude writes up the notes in the format below.

## Notes format (what a write-up should include)

- **Property / address** — if the arborist says it out loud.
- **Summary** — 2-3 sentences of the overall assessment.
- **Findings** — a bullet per tree/issue called out, each with a rough
  **timestamp** so you can jump back to that spot in the video.
- **Recommended work / estimate notes** — anything that sounds like scope or pricing.
- **Key images** — a few captured frames of the main problem areas.

Names of people always follow the house rule: **First name + last initial**
(e.g. `Taylor M`), never full last names.

## Known gotchas

- **The connection can be flaky.** The Adobe media connection sometimes gets
  stuck on "connecting" and jobs never report back. A page refresh does NOT fix
  it (the connection is session-level). The reliable fix is to **start a fresh
  session** and re-upload — the upload only takes seconds.
- **Give transcription a couple minutes.** For a ~50 MB clip, expect the summary
  in roughly 1-3 minutes. If nothing comes back within ~4-5 minutes, treat it as
  a stall and start a fresh session rather than waiting longer.
- **Silent / very noisy videos** won't transcribe well. If the arborist isn't
  talking clearly, Claude will lean on the frames instead and say so.

## Future improvement (not built yet)

Right now getting the video in is manual (download from ST, upload here). If this
becomes a regular workflow, the better long-term design is to pull videos
straight from ServiceTitan into this dashboard:

> ServiceTitan → the dashboard pulls the video → transcribes + generates notes →
> attaches the notes to the job.

That lives in *our* app (Vercel/Supabase can reach ServiceTitan without the
sandbox network block), built once for all ~10 users. **Prerequisite:** confirm
our ServiceTitan plan includes **API access** (ask the ST account rep, or look
for a Developer/API section in ST settings). Don't build this until the manual
version has proven the notes are actually useful.
