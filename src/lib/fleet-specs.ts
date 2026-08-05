// ============================================================================
// Fleet equipment specs — structured data for the /equipment reference page
// ============================================================================
// This is the data source for the shared, simple-to-read equipment page used
// by BOTH the sales team and the field crews. The slide-deck version of the
// same numbers lives in content/topics/equipment-specs.txt — if a spec
// changes, update BOTH places (small internal tool; we keep them in sync by
// hand rather than sharing a parser).
//
// Values are kept as display strings (with units and quote/foot marks) so the
// page can render them verbatim. "TBD" and "—" are rendered muted.
// ============================================================================

export type SpecTable = {
  /** Anchor-friendly id, also used as React key */
  id: string;
  eyebrow: string;
  title: string;
  /** Optional one-line note shown under the title */
  note?: string;
  cols: string[];
  /** Each row must have exactly cols.length cells */
  rows: string[][];
  /** Optional footnote shown under the table */
  tip?: string;
};

export type ChartRef = {
  id: string;
  title: string;
  src: string;
  blurb: string;
};

export type NavSection = { id: string; label: string };

// Order of the in-page quick-jump nav.
export const NAV_SECTIONS: NavSection[] = [
  { id: 'ground', label: 'Ground' },
  { id: 'trucks', label: 'Trucks' },
  { id: 'lift', label: 'Aerial Lift' },
  { id: 'cranes', label: 'Cranes' },
  { id: 'charts', label: 'Charts' },
];

// ---------- Ground equipment ----------

export const STUMP_GRINDERS: SpecTable = {
  id: 'stump-grinders',
  eyebrow: 'Ground Equipment',
  title: 'Stump Grinders',
  note: 'Min-Width is the tightest gap the machine will squeeze through.',
  cols: ['Model', 'Length', 'Width', 'Min-Width', 'Height', 'Weight'],
  rows: [
    ['60tx', '142"', '51"', '36"', '72"', '3,500 lbs'],
    ['70tx', '142"', '51"', '36"', '72"', '3,900 lbs'],
    ['262', '110"', '50"', 'NA', '72"', '1,320 lbs'],
  ],
};

export const FORWARDERS: SpecTable = {
  id: 'forwarders',
  eyebrow: 'Ground Equipment',
  title: 'Forwarding Machines',
  note: 'What we use to move material out of the yard once it is on the ground.',
  cols: ['Model', 'Length', 'Width', 'Min-Width', 'Height', 'Weight'],
  rows: [
    ['CAT 259D3', '79"', '69"', 'NA', '83"', '8,987 lbs'],
    ['Avant 528', '100"', '50"', 'NA', '78.2"', '3,130 lbs'],
    ['Swinger 2000', '162"', '56"', 'NA', '94"', '7,600 lbs'],
    ['Bobcat A300', '143"', '75"', 'NA', '81"', '8,350 lbs'],
  ],
};

// ---------- Trucks ----------

export const BUCKET_TRUCKS: SpecTable = {
  id: 'bucket-trucks',
  eyebrow: 'Aerial Equipment',
  title: 'Bucket Trucks',
  note: 'Same drive footprint; outrigger spread and reach are where they differ.',
  cols: ['Spec', 'Elevator Bucket', 'Non-Elevator Bucket'],
  rows: [
    ['Drive Height', '12′ 10″', '12′ 10″'],
    ['Drive Width', '8′ 6″', '8′ 6″'],
    ['Drive Length', '28′ 5″', '28′ 5″'],
    ['Outrigger Width', '12′', '9′ 9″ front · 11′ 2″ back'],
    ['Outrigger Length', '8′ 6″', '11′ 7″'],
    ['Working Height', '75′', 'TBD'],
    ['Working Outreach', '42′', 'TBD'],
  ],
  tip: 'Non-elevator working height and outreach still need to be measured.',
};

export const CLAM_TRUCKS: SpecTable = {
  id: 'clam-trucks',
  eyebrow: 'Aerial Equipment',
  title: 'Clam Trucks',
  note: 'Grapple trucks — outrigger width plus how far they reach out and up.',
  cols: ['Spec', '305 Clam', 'Big Clams'],
  rows: [
    ['Drive Height', '13′ 4″', '13′ 8″'],
    ['Drive Width', '8′ 6″', '8′ 6″'],
    ['Drive Length', '28′ 5″', '38′'],
    ['Outrigger Width', '15′', '10′'],
    ['Max Side Reach', '30′', '26′'],
    ['Max Vertical Reach', '42′', '35′'],
  ],
};

// ---------- Aerial lift ----------

export const AERIAL_LIFT: SpecTable = {
  id: 'aerial-lift',
  eyebrow: 'Aerial Equipment',
  title: 'Aerial Lift — Nifty SD64',
  note: 'Tracked lift — drive it in tight, then set it on grade.',
  cols: ['Spec', 'Nifty SD64'],
  rows: [
    ['Drive L × W × H', '242" × 81" × 89"'],
    ['Weight', '9,170 lbs'],
    ['Working Height', '70′'],
    ['Working Outreach', '42′'],
    ['Platform Height', '63.5′'],
    ['Working Width × Length', '15′ × 15.58′'],
    ['Gradeability (driving)', '45% / 24°'],
    ['Max Slope (setting)', '18% / 10°'],
  ],
};

// ---------- Cranes ----------

export const CRANE_DIMENSIONS: SpecTable = {
  id: 'crane-dimensions',
  eyebrow: 'Cranes',
  title: 'Crane Fleet — dimensions',
  note: 'The KB uses stabilizers instead of outriggers, spread wider front-to-back.',
  cols: ['Spec', '40T Crane', '20T Crane', 'KB Crane'],
  rows: [
    ['Model', 'Manitex 40124SHL', 'Manitex 22101', 'EFFER 505 6S+3S HD'],
    ['Drive Height', '13′', '12′', '13′ 6″'],
    ['Drive Width', '9′', '9′', '8′ 6″'],
    ['Drive Length', '40′', '32′', '33′'],
    ['Outrigger / Stabilizer Width', '24′', '22′', '21′ 6″ front · 27′ 6″ rear'],
    ['Outrigger / Stabilizer Length', '24′', '22′', '18′ 9″'],
    ['Turret from rear', '8′', '4′ or 6′ (confirm)', '—'],
  ],
};

export const CRANE_CAPACITY: SpecTable = {
  id: 'crane-capacity',
  eyebrow: 'Cranes',
  title: 'Quick capacity by radius',
  note: 'Outriggers fully extended. Confirm against the full load chart for the actual boom length and setup.',
  cols: ['Load radius', '20T (22101)', '40T (40124SHL)'],
  rows: [
    ['40 ft', '4,500 lbs', '12,500 lbs'],
    ['60 ft', '2,100 lbs', '6,000 lbs'],
    ['80 ft', '800 lbs', '3,000 lbs'],
    ['100 ft', '—', '1,200 lbs'],
  ],
  tip: 'KB (EFFER 505) capacity depends entirely on the attachment — read it off the knuckle-boom placards.',
};

// Operating rules for the cranes — rendered as a callout, not a table.
export const CRANE_RULES: { label: string; body: string }[] = [
  {
    label: 'Sign the disclaimer first',
    body: 'Never drive onto private property without a signed Equipment Disclaimer. All three cranes will crack weak concrete.',
  },
  {
    label: 'Check the slope',
    body: 'Setting up over 3° (20T & 40T) or 4° (KB) needs sign-off. Use the slope chart to turn a driveway’s drop into a percentage.',
  },
  {
    label: 'Pick the smallest that fits',
    body: 'The 20T gets into driveways and yards with less damage; the 40T and KB are built to stay on the road. The KB runs a hook & slings or a grapple saw — reach and capacity depend on the attachment.',
  },
  {
    label: 'Measure from the turret',
    body: 'Reach is measured from the turret, not the bumper. The 40T is 8′ from the rear; the 20T is unconfirmed — the spec sheet says 4′, the setup doc says 6′.',
  },
];

// ---------- Reference charts ----------

export const CRANE_CHARTS: ChartRef[] = [
  {
    id: 'chart-40t',
    title: '40T — Manitex 40124SHL',
    src: '/topics/equipment-specs/crane-chart-40t.png',
    blurb: 'Fully extended outriggers only. Down to your load radius, across to the boom length — that cell is your max capacity.',
  },
  {
    id: 'chart-20t',
    title: '20T — Manitex 22101',
    src: '/topics/equipment-specs/crane-chart-20t.png',
    blurb: 'Use only with all outriggers fully extended. Includes both main-boom and jib load ratings.',
  },
  {
    id: 'chart-kb',
    title: 'KB — EFFER 505 6S+3S HD',
    src: '/topics/equipment-specs/crane-chart-kb.jpg',
    blurb: 'One placard per configuration — hook use, plus GMT-040 and GMT-050 grapple saws. Match it to the attachment on the machine.',
  },
  {
    id: 'chart-slope',
    title: 'Percent-of-slope chart',
    src: '/topics/equipment-specs/slope-chart.jpg',
    blurb: 'Left = distance (ft), top = % slope, center = drop in tenths of a foot. A 40′ driveway that falls 1.6′ is a 4% slope.',
  },
];
