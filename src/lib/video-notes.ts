// ============================================================================
// Video notes — turn arborist estimate-walkthrough frames into a findings report
// ============================================================================
// This is the server-side brain of the /hub/video-notes tool. It takes a set of
// still frames pulled from a walkthrough video (each tagged with the time it was
// captured) and asks Claude to "look" at them and report what an estimator would
// want to know: power-line drops, slopes, wet areas, access/parking concerns,
// and extra trees worth quoting.
//
// It also applies the Bratt Tree Sales Arborist Playbook (src/lib/playbook.ts)
// when one is provided — that's the team's own expertise, distilled from the
// Training Library and taught in Coach Mode.
//
// v1 is VISUAL only — no audio transcript yet (see docs/video-notes.md). The
// prompt is written so the report clearly marks visual findings as "verify on
// site", because Claude is a sharp second set of eyes, not the ground truth.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';

// Default to Sonnet — the best quality/cost balance for this visual-review task
// (roughly half the per-video cost of Opus). To trade cost for maximum quality,
// set VIDEO_NOTES_MODEL=claude-opus-5 in the environment.
export const VIDEO_NOTES_MODEL = process.env.VIDEO_NOTES_MODEL || 'claude-sonnet-5';

// One frame pulled from the video, as base64 JPEG plus the time it was captured.
export type Frame = {
  timecodeSeconds: number;
  dataBase64: string; // raw base64 (no "data:image/jpeg;base64," prefix)
};

export type VisualFinding = {
  category:
    | 'power_line'
    | 'slope'
    | 'wet_area'
    | 'access_parking'
    | 'tree_condition'
    | 'other';
  timestamp: string; // "m:ss", or "" if not tied to one frame
  observation: string;
  confidence: 'low' | 'medium' | 'high';
  verify: string; // what to double-check on site
};

export type Findings = {
  property: string; // address if visible/known, else ""
  summary: string;
  visual_findings: VisualFinding[];
  sales_opportunities: { observation: string; timestamp: string }[];
  access_notes: string[];
};

// The instructions, minus the JSON contract. The playbook (if any) is inserted
// between this and the JSON spec so the "respond with only JSON" rule stays last.
const SYSTEM_HEAD = `You are helping Bratt Tree, an arborist company, review a video an arborist recorded while walking a property to prepare a tree-work estimate. You are given a series of still frames captured from that video, each labeled with the time it was taken.

Study the frames and produce an estimate findings report. Watch specifically for:
- POWER LINES crossing the property or running near/through the tree canopy (possible power-line drop needed).
- SLOPES / terrain: steep banks or grade changes that affect equipment access or safety.
- WET AREAS: standing water, mud, or boggy ground.
- ACCESS / PARKING: narrow roads, no driveway, tight frontage — where no-parking permits or special staging might be needed.
- ADDITIONAL SALES OPPORTUNITIES: other trees or issues visible in the frames (deadwood, cracks, leaning trees, disease/pest signs, stumps) that could be quoted.

If a Bratt Tree Sales Arborist Playbook is included below, treat it as authoritative team expertise — use it to identify species, recognize the visible signs of the diseases/pests/hazards it describes, judge remove-vs-treat-vs-prune, and surface the plant-health-care and sales opportunities it calls out.

Rules:
- You are looking at still frames, not the live video, so you may miss things that happened between frames. Treat every visual observation as something to VERIFY on site, not as confirmed fact.
- Give an honest confidence level for each observation. If the frames are unclear or you cannot tell, say so rather than guessing.
- Reference the timestamp label of the frame(s) an observation comes from.
- When you refer to a person, only ever use a first name + last initial (e.g. "Taylor M") — never a full last name.
- Do not include any internal or system XML tags in your response.`;

const SYSTEM_JSON_SPEC = `Respond with ONLY a single JSON object (no prose before or after, no markdown fences) matching exactly this shape:
{
  "property": "string — the address if it is visible/known, otherwise an empty string",
  "summary": "string — 2-3 sentences on the overall assessment",
  "visual_findings": [
    {
      "category": "one of: power_line | slope | wet_area | access_parking | tree_condition | other",
      "timestamp": "string like \\"1:20\\", or empty string",
      "observation": "string — what you see",
      "confidence": "one of: low | medium | high",
      "verify": "string — what to double-check on site"
    }
  ],
  "sales_opportunities": [
    { "observation": "string", "timestamp": "string like \\"0:45\\" or empty string" }
  ],
  "access_notes": ["string"]
}`;

function buildSystemPrompt(playbookText?: string): string {
  return playbookText
    ? `${SYSTEM_HEAD}\n\n---\n${playbookText}\n---\n\n${SYSTEM_JSON_SPEC}`
    : `${SYSTEM_HEAD}\n\n${SYSTEM_JSON_SPEC}`;
}

/**
 * Pull the first balanced JSON object out of a string. Claude is asked to return
 * only JSON, but this defends against a stray sentence or markdown fence sneaking
 * in so one odd character doesn't crash the whole request.
 */
function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in the model response.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced JSON in the model response.');
}

function secondsToLabel(s: number): string {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Send the frames to Claude and get back a structured findings report.
 * Throws with a clear message if the API key is missing, the model refuses,
 * or the response can't be parsed — the route turns these into a friendly error.
 */
export async function analyzeFrames(
  frames: Frame[],
  opts: { address?: string; playbookText?: string } = {},
): Promise<Findings> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it in Vercel (Project Settings → Environment Variables) so the dashboard can call Claude.',
    );
  }
  if (frames.length === 0) {
    throw new Error('No frames were extracted from the video.');
  }

  const client = new Anthropic();

  // Build the user turn: an intro, then each frame labeled with its timestamp.
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text:
        `Here are ${frames.length} frames from the walkthrough video, in order.` +
        (opts.address ? ` The property address is: ${opts.address}.` : '') +
        ` Produce the findings report as specified.`,
    },
  ];
  for (const frame of frames) {
    content.push({ type: 'text', text: `Frame at ${secondsToLabel(frame.timecodeSeconds)}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: frame.dataBase64 },
    });
  }

  const response = await client.messages.create({
    model: VIDEO_NOTES_MODEL,
    max_tokens: 8000,
    // Thinking off keeps cost and latency predictable for this bounded
    // extract-and-describe task; default effort ("high") allows disabling it.
    thinking: { type: 'disabled' },
    system: buildSystemPrompt(opts.playbookText),
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to analyze this video.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('The model returned no text to parse.');
  }

  const parsed = JSON.parse(extractJson(textBlock.text)) as Findings;
  return parsed;
}
