// ============================================================================
// Arborist Playbook — the knowledge the video analyzer applies
// ============================================================================
// Loads the active playbook entries and formats them into a compact block that
// gets injected into the analysis prompt. Kept concise on purpose: it rides on
// every analysis, so we group by category and keep entries short.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type PlaybookEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
};

export async function getActivePlaybook(
  supabase: SupabaseClient,
): Promise<PlaybookEntry[]> {
  const { data, error } = await supabase
    .from('arborist_playbook')
    .select('id, category, title, content')
    .eq('active', true)
    .order('category', { ascending: true });
  if (error || !data) return [];
  return data as PlaybookEntry[];
}

/**
 * Render the playbook as a prompt block, grouped by category. Returns undefined
 * when the playbook is empty so callers can skip the section entirely.
 */
export function formatPlaybookForPrompt(entries: PlaybookEntry[]): string | undefined {
  if (entries.length === 0) return undefined;

  const byCategory = new Map<string, PlaybookEntry[]>();
  for (const e of entries) {
    const list = byCategory.get(e.category) ?? [];
    list.push(e);
    byCategory.set(e.category, list);
  }

  const lines: string[] = [
    'BRATT TREE SALES ARBORIST PLAYBOOK',
    "This is our team's own expertise and standards. Apply it when identifying",
    'species, judging disease / pest / hazard signs, deciding remove-vs-treat,',
    'and spotting sales opportunities in the frames.',
    '',
  ];
  for (const [category, list] of byCategory) {
    lines.push(`## ${category}`);
    for (const e of list) {
      lines.push(`- ${e.title}: ${e.content}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
