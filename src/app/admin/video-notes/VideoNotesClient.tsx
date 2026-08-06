'use client';

// ============================================================================
// Video Notes — client component
// ============================================================================
// Does the browser-side work so the server never has to touch ffmpeg:
//   1. Load the chosen video into a hidden <video> element.
//   2. Seek to evenly-spaced timestamps and draw each into a <canvas>,
//      exporting a downscaled JPEG per frame.
//   3. POST the frames to /api/video-notes/analyze and render the report.
//
// Frames are kept small (downscaled + modest JPEG quality) so the upload stays
// well under serverless request-size limits and the AI cost stays low.
// ============================================================================

import { useRef, useState } from 'react';
import type { Findings, VisualFinding } from '@/lib/video-notes';
import CoachMode from './CoachMode';
import { extractAudioMp3 } from './extractAudio';

// Tuning knobs. ~40 frames of an under-10-minute walkthrough is plenty of
// coverage while keeping the payload small (base64 inflates size by ~33%).
const MAX_FRAMES = 40;
const MIN_FRAMES = 6;
const TARGET_INTERVAL_SECONDS = 8;
const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.6;
// Cap standalone photos so the upload stays under the serverless size limit and
// the AI cost stays predictable. Connor's realistic case is a handful.
const MAX_PHOTOS = 24;

type Frame = { timecodeSeconds: number; dataBase64: string; label?: string };

const CATEGORY_LABELS: Record<VisualFinding['category'], string> = {
  power_line: 'Power line',
  slope: 'Slope / terrain',
  wet_area: 'Wet area',
  access_parking: 'Access / parking',
  tree_condition: 'Tree condition',
  other: 'Other',
};

function fmt(seconds: number): string {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

// Pull evenly-spaced frames out of a video File, entirely in the browser.
// `maxFrames` caps how many to take (so multiple videos can share the budget);
// `videoLabel`, when set, prefixes each frame caption (e.g. "Video 2 @ 1:20")
// so Claude can tell frames from different clips apart.
async function extractFrames(
  file: File,
  maxFrames: number,
  videoLabel: string | undefined,
  onProgress: (done: number, total: number) => void,
): Promise<{ frames: Frame[]; duration: number }> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error('Could not read that video file. Try a .mov or .mp4.'));
    });

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      throw new Error('Could not determine the video length.');
    }

    const count = Math.min(
      maxFrames,
      Math.max(MIN_FRAMES, Math.floor(duration / TARGET_INTERVAL_SECONDS)),
    );
    const interval = duration / count;

    const scale = Math.min(1, MAX_WIDTH / (video.videoWidth || MAX_WIDTH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || MAX_WIDTH) * scale);
    canvas.height = Math.round((video.videoHeight || MAX_WIDTH) * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create a drawing canvas.');

    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      // Aim for the middle of each interval so the first frame isn't a black
      // pre-roll and the last isn't past the end.
      const t = Math.min(duration - 0.05, (i + 0.5) * interval);
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('Error while scanning the video.'));
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const label = videoLabel ? `${videoLabel} @ ${fmt(t)}` : undefined;
      frames.push({ timecodeSeconds: t, dataBase64: dataUrl.split(',')[1], label });
      onProgress(i + 1, count);
    }

    return { frames, duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Downscale a standalone photo into the same small JPEG the analyzer expects,
// entirely in the browser. Labeled ("Photo 1") rather than timecoded.
async function imageToFrame(file: File, label: string): Promise<Frame> {
  const img = document.createElement('img');
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not read the image ${file.name}.`));
      img.src = url;
    });
    const scale = Math.min(1, MAX_WIDTH / (img.naturalWidth || MAX_WIDTH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((img.naturalWidth || MAX_WIDTH) * scale);
    canvas.height = Math.round((img.naturalHeight || MAX_WIDTH) * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create a drawing canvas.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { timecodeSeconds: 0, dataBase64: dataUrl.split(',')[1], label };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Phase = 'idle' | 'extracting' | 'transcribing-audio' | 'analyzing' | 'done' | 'error';

export default function VideoNotesClient({
  isAdmin = false,
  isOwner = false,
}: {
  isAdmin?: boolean;
  isOwner?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [findings, setFindings] = useState<Findings | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [audioNote, setAudioNote] = useState('');
  const [mediaNote, setMediaNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAnalyze() {
    const files = Array.from(fileRef.current?.files ?? []);
    const videos = files.filter((f) => f.type.startsWith('video/'));
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (videos.length === 0 && images.length === 0) {
      setError('Choose a video, some photos, or both.');
      return;
    }
    setError('');
    setFindings(null);
    setCoaching(false);
    setAudioNote('');
    setMediaNote('');

    try {
      setPhase('extracting');
      setProgress({ done: 0, total: 0 });

      const allFrames: Frame[] = [];

      // Split the video frame budget across however many clips were uploaded, so
      // the total payload stays bounded whether it's one video or several.
      const perVideoMax =
        videos.length <= 1
          ? MAX_FRAMES
          : Math.max(MIN_FRAMES, Math.floor(MAX_FRAMES / videos.length));
      let totalDuration = 0;
      for (let vi = 0; vi < videos.length; vi++) {
        const label = videos.length > 1 ? `Video ${vi + 1}` : undefined;
        const { frames, duration } = await extractFrames(
          videos[vi],
          perVideoMax,
          label,
          (done, total) => setProgress({ done, total }),
        );
        allFrames.push(...frames);
        totalDuration += duration;
      }

      // Turn each standalone photo into an analysis image.
      const usePhotos = images.slice(0, MAX_PHOTOS);
      for (let ii = 0; ii < usePhotos.length; ii++) {
        allFrames.push(await imageToFrame(usePhotos[ii], `Photo ${ii + 1}`));
      }
      if (images.length > MAX_PHOTOS) {
        setMediaNote(
          `Using the first ${MAX_PHOTOS} of ${images.length} photos to keep the upload manageable.`,
        );
      }

      if (allFrames.length === 0) {
        throw new Error('Could not read any images from those files.');
      }

      // Best-effort: extract the narration audio from each video and transcribe
      // it. If anything here fails (silent video, odd codec, no Groq key, or a
      // photos-only upload), we quietly fall back to a visual-only analysis.
      let transcript: string | undefined;
      if (videos.length > 0) {
        try {
          setPhase('transcribing-audio');
          const parts: string[] = [];
          for (let vi = 0; vi < videos.length; vi++) {
            const mp3 = await extractAudioMp3(videos[vi]);
            if (mp3 && mp3.size > 0) {
              const form = new FormData();
              form.append('audio', mp3, 'narration.mp3');
              const tr = await fetch('/api/video-notes/transcribe', { method: 'POST', body: form });
              if (tr.ok) {
                const j = await tr.json();
                if (j.text) {
                  parts.push(videos.length > 1 ? `[Video ${vi + 1}] ${j.text}` : (j.text as string));
                }
              }
            }
          }
          transcript = parts.length ? parts.join('\n\n') : undefined;
          setAudioNote(
            transcript ? '' : 'No narration was picked up — this analysis is visual-only.',
          );
        } catch {
          setAudioNote("Couldn't process the audio — this analysis is visual-only.");
        }
      }

      setPhase('analyzing');
      setProgress({ done: allFrames.length, total: allFrames.length });
      const res = await fetch('/api/video-notes/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: allFrames,
          address: address.trim() || undefined,
          videoName: files.map((f) => f.name).join(', '),
          durationSeconds: totalDuration || undefined,
          transcript,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The analysis failed.');

      setFindings(json.findings as Findings);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  }

  const busy =
    phase === 'extracting' || phase === 'transcribing-audio' || phase === 'analyzing';

  return (
    <div className="space-y-6">
      <div className="bt-card space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Video and/or photos</label>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            multiple
            disabled={busy}
            className="block w-full text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Upload a walkthrough video, a few close-up photos, or both — they&apos;re
            reviewed together as one property.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Property address <span className="text-neutral-400">(optional)</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={busy}
            placeholder="123 Elm St"
            className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleAnalyze}
          disabled={busy}
          className="rounded bg-lime px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Analyze'}
        </button>

        {phase === 'extracting' && (
          <p className="text-sm text-neutral-600">
            Preparing your media… {progress.done}/{progress.total || '…'}
          </p>
        )}
        {phase === 'transcribing-audio' && (
          <p className="text-sm text-neutral-600">Listening to the narration…</p>
        )}
        {phase === 'analyzing' && (
          <p className="text-sm text-neutral-600">
            Claude is reviewing {progress.total} images — this can take a minute…
          </p>
        )}
        {mediaNote && <p className="text-sm text-neutral-500">{mediaNote}</p>}
        {audioNote && phase !== 'transcribing-audio' && (
          <p className="text-sm text-neutral-500">{audioNote}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {findings && <Report findings={findings} />}

      {findings && !coaching && (
        <button
          onClick={() => setCoaching(true)}
          className="rounded border border-neutral-400 px-4 py-2 text-sm font-semibold"
        >
          🎓 Coach this analysis — teach Claude to do it better
        </button>
      )}
      {findings && coaching && <CoachMode findings={findings} />}

      {isAdmin && (
        <div className="bt-card space-y-1">
          <h2 className="font-semibold">Playbook</h2>
          <p className="text-sm text-neutral-600">
            The expertise every analysis applies — from the Training Library and
            from Coach Mode sessions.
          </p>
          <p className="pt-1 text-sm">
            <a href="/admin/video-notes/playbook" className="font-medium underline">
              Manage Playbook →
            </a>{' '}
            <span className="text-neutral-500">
              (view, edit, turn off, or delete every entry)
            </span>
          </p>
        </div>
      )}

      {isOwner && <LibraryImport />}
      {isOwner && <ReferenceImport />}
    </div>
  );
}

// Admin-only: distill the Training Library into the playbook every analysis uses.
function LibraryImport() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function run() {
    setState('running');
    setMessage('');
    try {
      const res = await fetch('/api/video-notes/ingest-library', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed.');
      setState('done');
      setMessage(
        `Imported ${json.count} playbook entries from ${json.sources} library items. New analyses now apply them.`,
      );
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  return (
    <div className="bt-card space-y-2">
      <h2 className="font-semibold">Training Library import</h2>
      <p className="text-sm text-neutral-600">
        Distill the Sales Arborist Training Library into the analysis playbook.
        Re-run this whenever the Library changes. (This replaces the previously
        imported library entries; anything taught in Coach Mode is untouched.)
      </p>
      <button
        onClick={run}
        disabled={state === 'running'}
        className="rounded border border-neutral-400 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {state === 'running' ? 'Importing…' : 'Import / refresh Library'}
      </button>
      {message && (
        <p className={`text-sm ${state === 'error' ? 'text-red-600' : 'text-neutral-700'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

// Owner-only: distill the reference PDFs in content/references into the playbook.
// Separate from the Library import — these entries never appear in the Sales
// Arborist Library, and neither import can wipe the other's entries.
function ReferenceImport() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function run() {
    setState('running');
    setMessage('');
    try {
      const res = await fetch('/api/video-notes/ingest-references', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed.');
      setState('done');
      const skipped =
        json.skipped && json.skipped.length > 0
          ? ` Skipped: ${json.skipped.join('; ')}.`
          : '';
      setMessage(
        `Imported ${json.count} playbook entries from ${json.sources} reference PDF(s). New analyses now apply them.${skipped}`,
      );
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  return (
    <div className="bt-card space-y-2">
      <h2 className="font-semibold">Reference PDFs import</h2>
      <p className="text-sm text-neutral-600">
        Distill the PDFs in <code>content/references/</code> into the analysis
        playbook. Re-run this whenever those PDFs change. (This replaces the
        previously imported reference entries; the Training Library and Coach
        Mode entries are untouched. These entries do not appear in the Sales
        Arborist Library.)
      </p>
      <button
        onClick={run}
        disabled={state === 'running'}
        className="rounded border border-neutral-400 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {state === 'running' ? 'Importing…' : 'Import / refresh Reference PDFs'}
      </button>
      {message && (
        <p className={`text-sm ${state === 'error' ? 'text-red-600' : 'text-neutral-700'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: VisualFinding['confidence'] }) {
  const color =
    level === 'high'
      ? 'bg-green-100 text-green-800'
      : level === 'medium'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-neutral-100 text-neutral-700';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {level} confidence
    </span>
  );
}

function Report({ findings }: { findings: Findings }) {
  return (
    <div className="bt-card space-y-6">
      {findings.property && (
        <p className="text-sm">
          <span className="font-semibold">Property:</span> {findings.property}
        </p>
      )}

      <section>
        <h2 className="font-semibold mb-1">Summary</h2>
        <p className="text-sm text-neutral-800">{findings.summary}</p>
      </section>

      {findings.arborist_notes && findings.arborist_notes.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">What the arborist said</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-800">
            {findings.arborist_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2">
          Visual findings{' '}
          <span className="text-xs font-normal text-neutral-500">
            — verify each on site
          </span>
        </h2>
        {findings.visual_findings.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing notable spotted.</p>
        ) : (
          <ul className="space-y-3">
            {findings.visual_findings.map((f, i) => (
              <li key={i} className="border-l-2 border-lime pl-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{CATEGORY_LABELS[f.category]}</span>
                  {f.timestamp && (
                    <span className="text-neutral-500">@ {f.timestamp}</span>
                  )}
                  <ConfidenceBadge level={f.confidence} />
                </div>
                <p className="text-sm text-neutral-800">{f.observation}</p>
                {f.verify && (
                  <p className="text-xs text-neutral-500">Verify: {f.verify}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {findings.sales_opportunities.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Additional sales opportunities</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-800">
            {findings.sales_opportunities.map((s, i) => (
              <li key={i}>
                {s.observation}
                {s.timestamp && (
                  <span className="text-neutral-500"> (@ {s.timestamp})</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {findings.access_notes.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">Access / equipment / permit notes</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-800">
            {findings.access_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
