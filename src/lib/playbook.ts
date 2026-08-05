// ============================================================================
// Arborist Playbook — the knowledge the video analyzer applies
// ============================================================================
// Loads the active playbook entries and formats them into a compact block that
// gets injected into the analysis prompt. Kept concise on purpose: it rides on
// every analysis, so we group by category and keep entries short.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { isHeadArborist } from './auth';

export type PlaybookEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  source: 'library' | 'coach';
  created_by: string;
};

export async function getActivePlaybook(
  supabase: SupabaseClient,
): Promise<PlaybookEntry[]> {
  const { data, error } = await supabase
    .from('arborist_playbook')
    .select('id, category, title, content, source, created_by')
    .eq('active', true)
    .order('category', { ascending: true });
  if (error || !data) return [];
  return data as PlaybookEntry[];
}

/**
 * Render the playbook as a prompt block, split by authority so the analyzer
 * knows what overrides what. Coach-taught corrections outrank the imported
 * Library; Connor (head arborist) outranks everything. Returns undefined when
 * the playbook is empty so callers can skip the section entirely.
 */
export function formatPlaybookForPrompt(entries: PlaybookEntry[]): string | undefined {
  if (entries.length === 0) return undefined;

  const coach = entries.filter((e) => e.source === 'coach');
  const library = entries.filter((e) => e.source === 'library');

  const lines: string[] = [
    'BRATT TREE SALES ARBORIST PLAYBOOK',
    '',
    'AUTHORITY / PRECEDENCE — when anything conflicts, the higher rule wins:',
    "  1. Connor (head arborist) — marked [CONNOR — FINAL WORD]. His corrections are absolute and override everything below, including your own general knowledge.",
    '  2. Other team corrections (from coaching).',
    '  3. Reference knowledge from the training library.',
    '  4. Your own general arboriculture knowledge (lowest).',
    '',
  ];

  if (coach.length > 0) {
    lines.push('## TEAM CORRECTIONS (authoritative — override the library and general knowledge)');
    for (const e of coach) {
      const tag = isHeadArborist(e.created_by) ? ' [CONNOR — FINAL WORD]' : '';
      lines.push(`- (${e.category}) ${e.title}: ${e.content}${tag}`);
    }
    lines.push('');
  }

  if (library.length > 0) {
    lines.push('## REFERENCE KNOWLEDGE (from the training library — defer to any team correction above that conflicts)');
    for (const e of library) {
      lines.push(`- (${e.category}) ${e.title}: ${e.content}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
