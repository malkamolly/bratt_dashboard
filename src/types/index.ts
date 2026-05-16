// Shared data shapes used across the app.

export type Salesperson = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
};

export type CrewKind = 'production' | 'phc' | 'stump' | 'unassigned';

export type Crew = {
  id: string;
  name: string;
  kind: CrewKind;
  display_order: number;
  is_active: boolean;
};

export type CrewMember = {
  id: string;
  name: string;
  home_crew_id: string | null;
  is_foreman: boolean;
  display_order: number;
  is_active: boolean;
};

export type AllowedEmail = {
  email: string;
  role: 'user' | 'admin';
  added_at: string;
};

export type Holiday = {
  holiday_date: string; // YYYY-MM-DD
  label: string;
  observed: boolean;
};
