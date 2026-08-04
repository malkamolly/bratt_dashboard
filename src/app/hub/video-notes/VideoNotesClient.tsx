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

// Tuning knobs. ~40 frames of an under-10-minute walkthrough is plenty of
// coverage while keeping the payload small (base64 inflates size by ~33%).
const MAX_FRAMES = 40;
const MIN_FRAMES = 6;
const TARGET_INTERVAL_SECONDS = 8;
const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.6;

type Frame = { timecodeSeconds: number; dataBase64: string };

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
async function extractFrames(
  file: File,
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
      MAX_FRAMES,
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
      frames.push({ timecodeSeconds: t, dataBase64: dataUrl.split(',')[1] });
      onProgress(i + 1, count);
    }

    return { frames, duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Phase = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

export default function VideoNotesClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [findings, setFindings] = useState<Findings | null>(null);
  const [coaching, setCoaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAnalyze() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a video file first.');
      return;
    }
    setError('');
    setFindings(null);
    setCoaching(false);

    try {
      setPhase('extracting');
      setProgress({ done: 0, total: 0 });
      const { frames, duration } = await extractFrames(file, (done, total) =>
        setProgress({ done, total }),
      );

      setPhase('analyzing');
      const res = await fetch('/api/video-notes/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames,
          address: address.trim() || undefined,
          videoName: file.name,
          durationSeconds: duration,
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

  const busy = phase === 'extracting' || phase === 'analyzing';

  return (
    <div className="space-y-6">
      <div className="bt-card space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Video file</label>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            disabled={busy}
            className="block w-full text-sm"
          />
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
          {busy ? 'Working…' : 'Analyze video'}
        </button>

        {phase === 'extracting' && (
          <p className="text-sm text-neutral-600">
            Pulling frames from the video… {progress.done}/{progress.total || '…'}
          </p>
        )}
        {phase === 'analyzing' && (
          <p className="text-sm text-neutral-600">
            Claude is reviewing {progress.total} frames — this can take a minute…
          </p>
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

      {isAdmin && <LibraryImport />}
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
      <h2 className="font-semibold">Admin: Training Library</h2>
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
