// Shared data shapes used across the app.

export type Salesperson = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  photo_url?: string | null;
  // Roster / profile fields (see migration 042). The roster shows
  // `name + ' ' + last_initial` (e.g. "Alex P"); on_roster is false for the
  // non-human attribution buckets ("Other", "Add-Ons").
  last_initial?: string | null;
  title?: string | null;
  certified?: boolean | null;
  isa_number?: string | null;
  is_manager?: boolean | null;
  on_roster?: boolean | null;
};

export type CrewKind = 'production' | 'phc' | 'stump' | 'unassigned' | 'clam';

export type Crew = {
  id: string;
  name: string;
  kind: CrewKind;
  display_order: number;
  is_active: boolean;
};

export type CrewMember = {
  slug: string;
  name: string;
  home_crew_id: string | null;
  is_foreman: boolean;
  display_order: number;
  is_active: boolean;
  auth_email: string | null;
};

export type AllowedEmail = {
  email: string;
  role: 'admin' | 'user' | 'sales_arborist' | 'field_crew';
  added_at: string;
};

export type Holiday = {
  holiday_date: string; // YYYY-MM-DD
  label: string;
  observed: boolean;
};
