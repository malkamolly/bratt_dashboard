// ============================================================================
// Per-person Slack Tags config.
// ============================================================================
// The Slack Tags board is per-user: each person connects their own Slack and
// sees only their own tags (enforced by RLS). But two things differ per person:
// which channels/messages are noise (their FYI rules) and which usergroups they
// care about. Those live here, one block per employee, keyed by hub email.
//
// This map also IS the access list: only emails listed here can open /tags.
// To add someone: add a block with their email, their muted channels, and
// their usergroups, then have them open the board and click "Connect Slack".
//
// Kept dependency-free on purpose so the edge middleware can import it.
// ============================================================================

export type UserGroup = {
  id: string; // Slack subteam id (starts with "S")
  name: string; // section label, e.g. "PHC"
  handle: string; // searchable @-handle, e.g. "phc"
};

export type TagsUserConfig = {
  // Channel-name fragments to always send to FYI. Case- and separator-
  // insensitive, so "road closure" matches "#road_closure-permits-etc".
  mutedChannels: string[];
  // Message-content patterns to always send to FYI (recurring broadcasts).
  mutedMessages: RegExp[];
  // Usergroups to surface in their own chips/sections.
  userGroups: UserGroup[];
};

export const TAGS_USERS: Record<string, TagsUserConfig> = {
  'molly@bratttree.com': {
    mutedChannels: ['road closure', 'cancel'],
    mutedMessages: [
      // The daily schedule broadcast: "Good day, @… This is our schedule for …"
      /good day[\s\S]{0,400}this is our schedule for/i,
    ],
    userGroups: [
      { id: 'S0ANWS348F3', name: 'PHC', handle: 'phc' },
      { id: 'S0907G4TUNB', name: 'Scheduling', handle: 'scheduling' },
      { id: 'S090Q4DNC3E', name: 'Office', handle: 'officeteam' },
    ],
  },

  // --- Add the next employee here, e.g.: -------------------------------------
  // 'sean@bratttree.com': {
  //   mutedChannels: ['their-noisy-channel'],
  //   mutedMessages: [],
  //   userGroups: [{ id: 'S…', name: 'Crew', handle: 'crew' }],
  // },
};

const norm = (email: string | null | undefined) => (email ?? '').trim().toLowerCase();

/** Is this email allowed to use the Slack Tags board? */
export function isTagsUser(email: string | null | undefined): boolean {
  return norm(email) in TAGS_USERS;
}

/** This person's config, or null if they're not a Tags user. */
export function tagsConfigFor(email: string | null | undefined): TagsUserConfig | null {
  return TAGS_USERS[norm(email)] ?? null;
}
