-- ============================================================================
-- 058_knot_tying.sql
-- ============================================================================
-- Seed data for the Knot Tying training module: one catalog entry, the module
-- row (deck stored in source_text), a 12-question multiple-choice written
-- test, and a 6-item practical test-out.
--
-- Mirrors the Portawrap module (050): the deck is authored in the Bratt Tree
-- @layout DSL and rendered by the JS deck presenter in /public/training-deck/.
-- The canonical editable copy of the deck also lives at
-- /content/training-modules/knot_tying.txt — keep the two in sync.
--
-- The companion browsable reference (with step-by-step diagrams) lives at
-- /crew/knots. This module is how a crew member gets formally signed off.
--
-- Idempotent: every insert uses on conflict do nothing / do update.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Catalog entry so a passed test completes a real training row
-- ---------------------------------------------------------------------
insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based)
values
  ('knot_tying', 'Knot Tying', 330, false, false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Module (deck stored in source_text)
-- ---------------------------------------------------------------------
insert into field_crew_training_modules
  (slug, name, description, training_key, pass_threshold, requires_all_safety,
   version, is_active, theme, source_text)
values
  ('knot_tying',
   'Knot Tying',
   'The four knots the field crew rigs, hauls, and anchors with — the girth hitch, clove hitch, timber hitch, and running bowline — plus rope inspection and the safety rules that keep hands clear. Pairs with the Knot Library at /crew/knots.',
   'knot_tying',
   85,
   true,
   '1.0',
   true,
   'bark-cream',
$BTMOD$# ============================================================
# BRATT TREE TRAINING MODULE — Source Content
# Knot Tying (field crew)
#
# This file is the canonical, editable copy of the deck. The same text is
# seeded into field_crew_training_modules.source_text by migration
# 058_knot_tying.sql. Keep the two in sync.
#
# SYNTAX (short version):
#   @layout-name          starts a new slide
#   key: value            a single field on the current slide
#   key: value | value    multi-part value (split by |)
#   - item                a list item
#   # or //               a comment, ignored by the parser
# ============================================================

@cover
eyebrow: Field Skills
unit: Knot Tying
subtitle: The knots we rig, haul, and anchor with — and when to trust each one.
tagline: Right knot for the job.
tagline: Dressed and set.
tagline: Backed up when it matters.
meta-left: Bratt Tree · Field Crew Training Series
meta-right: Version 1.0 · Issued 2026

@welcome
eyebrow: Welcome
title: A knot is a tool. Pick the right one.
subtitle: Four knots cover most of what we do on the ground.
body: Every knot is a trade-off between how fast it ties, how well it holds, and how easily it comes undone afterward. The skill is not memorizing a hundred knots — it is knowing a handful cold and knowing which one fits the job in front of you.
body: This module covers the girth hitch, the clove hitch, the timber hitch, and the running bowline. Learn them here, practice them on a real rope, then get signed off by a trainer.
quote: A knot you can't tie in the dark, tired, isn't a knot you know yet.

@agenda
eyebrow: Course Agenda
title: What you'll learn
subtitle: Rope sense, four knots, when to use each, and a hands-on test-out.
- Rope & Safety | How rope fails, how to inspect it, and the rules that keep hands clear
- The Knots | Girth hitch, clove hitch, timber hitch, running bowline — step by step
- Choosing | Which knot fits which job, and common mistakes to avoid
- Test-Out | Tie each knot for a trainer, then pass the written test (85% to pass)

@section-divider
number: 01
title: Rope & Safety
tagline: The knot is only as good as the rope it's tied in — and the hands near it.

@two-column
eyebrow: Section 1 · Rope & Safety
title: Rope care & inspection
subtitle: Inspect before every rigging job. Retire anything you're unsure about.
left-header: Keep in service
left-icon: ✓
left: Consistent diameter with no flat spots or lumps
left: Smooth jacket — no cuts, glazing, or fuzzing to the core
left: Supple, not stiff or crunchy from shock loads or chemicals
left: Stored dry, out of the sun, off the ground
right-header: Retire it
right-icon: ×
right: Any cut, pulled strand, or exposed core
right: Glazed or melted spots — heat means the fibers are damaged
right: A rope that's been shock-loaded or chemically contaminated
right: When in doubt, tag it out — rope is cheaper than a hospital visit

@technique
eyebrow: Section 1 · Rope & Safety
title: Two habits that keep you whole
subtitle: Most rope injuries are hands and fingers caught where the load closes.
lead: A loaded rigging line stores enormous energy. When a knot cinches or a load runs, anything in the bight closes with it.
card: Dress and set | "Dress" means lay the knot flat with no crossed strands, then "set" it by pulling it snug before loading. A dressed knot holds its rated strength; a sloppy one doesn't.
card: Mind the bight | Never put a hand, finger, or foot inside a loop that can close under load. Cinching knots — like the running bowline — pull shut hard and fast.
warn: Standing inside a rigging loop, gripping the rope where a knot is about to cinch, or trusting an un-inspected line.

@section-divider
number: 02
title: The Knots
tagline: Four knots. Tie each one until it's muscle memory.

@steps
eyebrow: Section 2 · The Knots
title: Girth Hitch
subtitle: Also called a cow hitch or lark's foot. Attaches a sling or loop to a branch or anchor.
step: Make a bight | Fold the sling into a bight and pass it up behind the branch so it pokes out above.
step: Feed it through | Bring the rest of the sling — the hanging loop — up and pass it through that bight.
step: Cinch it | Pull the hanging loop down and dress the wraps flat. It cinches into a tidy collar around the branch.
step: Know the cost | A girth hitch can cut a sling's rated strength by roughly a third. Derate for rigging loads and dress it flat.

@steps
eyebrow: Section 2 · The Knots
title: Clove Hitch
subtitle: A quick, adjustable hitch for tying a rope onto a spar or post.
step: First turn | Take one turn around the spar, crossing the working end over the standing part.
step: Second turn | Take a second turn above the first, then tuck the working end under that last crossing turn.
step: Set it | Pull both ends tight. The two turns pinch the crossing flat against the spar.
step: Back it up | It can work loose under a pulsing or rotating load — always add a half hitch or two on rigging. Not a life-support knot on its own.

@steps
eyebrow: Section 2 · The Knots
title: Timber Hitch
subtitle: Grips a log or limb to drag or hoist — and unties easily once the load is off.
step: Around and across | Pass the working end around the log and back across the standing part.
step: Twist it | Twist the working end around its own bight three or more times, tucking with the lay of the rope.
step: Load it | Slide the twists snug against the log and load the standing part. Tension locks it; slack releases it.
step: Add control | For a hoisted piece, add a half hitch further along the limb so it can't swing.

@steps
eyebrow: Section 2 · The Knots
title: Running Bowline
subtitle: The arborist rigging standard — a self-tightening loop you can set from the ground.
step: Around the limb | Pass the working end around the limb, then lay it across the standing part.
step: Make the loop | Make a small overhand loop in the standing part and bring the working end up through it.
step: Finish the bowline | Take the working end behind the standing part and back down through the same loop. That's a bowline.
step: Let it run | Tighten the bowline, then pull the standing part — the fixed loop runs down and chokes the limb. Leave a fist-length tail and keep hands clear as it cinches.

@section-divider
number: 03
title: Choosing & Mistakes
tagline: The strongest knot tied for the wrong job is still the wrong knot.

@table
eyebrow: Section 3 · Choosing
title: Right knot for the job
subtitle: Start here, then confirm with your foreman on anything load-bearing.
cols: Job | Knot | Why
row: Choke a sling onto a branch | Girth hitch | Fastest way to attach a loop to a round anchor
row: Tie a line onto a spar or post | Clove hitch | Quick and adjustable — back it up on rigging
row: Drag or hoist a log | Timber hitch | Grips under load, falls apart when you're done
row: Set a rigging line from the ground | Running bowline | Self-tightens around the limb; unties after a heavy load
tip: When two knots would work, pick the one you can tie fastest and inspect at a glance. Speed and clarity are safety.

@mistakes
eyebrow: Section 3 · Mistakes
title: Common knot mistakes
subtitle: Every one of these has cost someone a load — or a finger.
- Leaving a knot sloppy — not dressed flat or not set snug before loading
- Too short a tail out of a bowline, so it creeps loose under load
- A clove hitch on rigging with no half-hitch backup
- A clove hitch set on a tapering branch, so it rolls off the small end
- Letting a timber hitch go slack before the piece is landed
- A girth hitch on a slick, tapering branch where it can slide off
- A hand or finger inside a loop that closes when the load comes on
- Trusting a rigging line you didn't inspect

@section-divider
number: 04
title: Test-Out
tagline: Show the trainer you can tie each one. Then take the written test.

@test-checklist
eyebrow: Section 4 · Test-Out
title: Practical test-out — on a real rope
subtitle: Trainer signs off each item. You must complete ALL before the written test.
cols: Knot | Task | Pass | Trainer Initials
row: Girth Hitch | Choke a sling onto a branch, dressed flat | ☐ |
row: Clove Hitch | Tie onto a spar and back it up with two half hitches | ☐ |
row: Timber Hitch | Rig a log to drag, then release it after the pull | ☐ |
row: Running Bowline | Set a self-tightening loop around a limb with a proper tail | ☐ |
row: Inspection | Inspect a rigging line and call out any defects | ☐ |
row: Safety | Point out the bight and keep hands clear as a knot cinches | ☐ |

@quiz
eyebrow: Section 4 · Test-Out
title: Knowledge check — 5 sample questions
subtitle: Try these as a warm-up. The full written test follows.
q: Which knot self-tightens around a limb, making it the go-to for setting a rigging line from the ground? | Clove hitch | Girth hitch | Running bowline | Timber hitch
q: A girth hitch reduces a sling's rated strength by roughly: | Nothing | A third | It doubles the strength | Half and then some
q: A clove hitch used on a rigging load should always be: | Left as-is | Backed up with a half hitch or two | Tied in wire rope | Tied on the thinnest part of the branch
q: The timber hitch holds because: | It's a permanent knot | There is tension on it — it releases when slack | It uses a metal clip | It can't come undone
q: When a knot is about to cinch under load, your hands should be: | Gripping the loop | Inside the bight | Well clear of the closing loop | Holding the standing part inside the loop

@quiz-answers
eyebrow: Section 4 · Test-Out
title: Sample question answers
subtitle: Check your work, then ask the trainer about anything unclear.
a: C) Running bowline | It's a bowline tied around its own standing part, so the loop runs closed around the limb and still unties after a heavy load.
a: B) A third | Choking a sling with a girth hitch costs roughly a third of its rated strength — derate accordingly and dress it flat.
a: B) Backed up with a half hitch or two | A clove hitch can work loose under a pulsing or rotating load, so always back it up on rigging.
a: B) There is tension on it | The timber hitch grips only while loaded and falls apart once slack — keep it loaded until the piece is landed.
a: C) Well clear of the closing loop | Never put a hand or finger in a loop that can close under load. Cinching knots pull shut hard and fast.

@two-column
eyebrow: Wrap-Up
title: How you get certified
subtitle: No paper sign-off — the hub tracks your certification automatically.
left-header: Your path to certification
left-icon: ✓
left: Your manager assigns you the Knot Tying module
left: Work through this deck and practice each knot on a real rope
left: Tie all four knots for a trainer on the practical test-out
left: Pass the written test — 85% or higher, every safety-critical question correct
left: Your certificate is issued automatically once both are done
right-header: Reference materials
right-icon: ↗
right: Knot Library — step-by-step diagrams in the Field Crew Hub (/crew/knots)
right: Internal SOP — Rigging & Controlled Lowering — ops binder
right: Rigging gear inspection & retirement log — yard office
right: Your foreman — ask before trusting any knot on a load

@closing
mark: BT
title: Learn four knots cold.
subtitle: Right knot for the job. Dressed and set. Hands clear. Get home safe.
$BTMOD$)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  training_key = excluded.training_key,
  pass_threshold = excluded.pass_threshold,
  requires_all_safety = excluded.requires_all_safety,
  version = excluded.version,
  is_active = excluded.is_active,
  theme = excluded.theme,
  source_text = excluded.source_text;

-- ---------------------------------------------------------------------
-- 3. Written test — questions, choices, answer key (12)
-- ---------------------------------------------------------------------

-- Q1
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 1, 'The Knots',
    $prompt$Which knot self-tightens around a limb, making it the go-to for setting a rigging line from the ground?$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Clove hitch$$),
  ('B', $$Girth hitch$$),
  ('C', $$Running bowline$$),
  ('D', $$Timber hitch$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$A running bowline is a bowline tied around its own standing part, so the loop runs closed around the limb — and it still unties after a heavy load.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 1
on conflict do nothing;

-- Q2
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 2, 'The Knots',
    $prompt$A girth hitch reduces a sling's rated strength by roughly:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Nothing — it's just as strong$$),
  ('B', $$About a third$$),
  ('C', $$It doubles the strength$$),
  ('D', $$More than half$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Choking a sling with a girth hitch costs roughly a third of its rated strength. Derate for rigging loads and dress it flat.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 2
on conflict do nothing;

-- Q3 (safety-critical)
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 3, 'The Knots',
    $prompt$A clove hitch used on a rigging load should always be:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Left as-is — it holds fine alone$$),
  ('B', $$Backed up with a half hitch or two$$),
  ('C', $$Tied in wire rope$$),
  ('D', $$Tied on the thinnest part of the branch$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$A clove hitch can work loose under a pulsing or rotating load, so always back it up with a half hitch or two on rigging. It is not a life-support knot on its own.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 3
on conflict do nothing;

-- Q4
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 4, 'The Knots',
    $prompt$The timber hitch holds because:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$It's a permanent knot$$),
  ('B', $$There is tension on it — it releases when slack$$),
  ('C', $$It uses a metal clip$$),
  ('D', $$It physically cannot come undone$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$The timber hitch grips only while loaded and falls apart once slack. Keep it under tension until the piece is landed.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 4
on conflict do nothing;

-- Q5 (safety-critical)
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 5, 'Rope & Safety',
    $prompt$When a knot is about to cinch under load, your hands should be:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Gripping the loop$$),
  ('B', $$Inside the bight$$),
  ('C', $$Well clear of the closing loop$$),
  ('D', $$Holding the standing part inside the loop$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Never put a hand, finger, or foot inside a loop that can close under load. Cinching knots pull shut hard and fast.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 5
on conflict do nothing;

-- Q6
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 6, 'The Knots',
    $prompt$Another common name for the girth hitch is:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Running bowline$$),
  ('B', $$Cow hitch (lark's foot)$$),
  ('C', $$Timber hitch$$),
  ('D', $$Clove hitch$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$The girth hitch is also called a cow hitch or lark's foot — the same knot under different names.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 6
on conflict do nothing;

-- Q7 (safety-critical)
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 7, 'The Knots',
    $prompt$How much tail should you leave out of a running bowline?$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$No tail is needed$$),
  ('B', $$Just enough to see the knot$$),
  ('C', $$At least a fist-length$$),
  ('D', $$As short as possible$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Leave a generous tail — at least a fist's length — so the bowline can't creep loose under load.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 7
on conflict do nothing;

-- Q8 (safety-critical)
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 8, 'Rope & Safety',
    $prompt$You find a glazed, melted-looking spot on a rigging line. You should:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Keep using it — glazing is cosmetic$$),
  ('B', $$Retire it — heat means the fibers are damaged$$),
  ('C', $$Wash it and put it back in service$$),
  ('D', $$Cut off the end and reuse the rest$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Glazed or melted spots mean the fibers have been heat-damaged. Retire the line — when in doubt, tag it out.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 8
on conflict do nothing;

-- Q9
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 9, 'Choosing',
    $prompt$You need to drag a log and want the knot to release easily once the pull is done. Best choice:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Girth hitch$$),
  ('B', $$Clove hitch$$),
  ('C', $$Timber hitch$$),
  ('D', $$A knot doesn't matter here$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$The timber hitch grips hard under tension and falls apart the moment the load comes off — ideal for dragging.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 9
on conflict do nothing;

-- Q10
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 10, 'The Knots',
    $prompt$A clove hitch set on a tapering branch is most likely to:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Get stronger$$),
  ('B', $$Roll off toward the small end$$),
  ('C', $$Turn into a bowline$$),
  ('D', $$Lock permanently in place$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$On a taper a clove hitch can roll off toward the small end. Set it where the diameter is steady.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 10
on conflict do nothing;

-- Q11
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 11, 'Rope & Safety',
    $prompt$"Dressing" a knot means:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Adding a second knot on top$$),
  ('B', $$Laying it flat with no crossed strands before you set it$$),
  ('C', $$Coating the rope in wax$$),
  ('D', $$Cutting the tail flush$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Dressing is laying the knot flat with no crossed strands; then you set it by pulling it snug. A dressed knot holds its rated strength.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 11
on conflict do nothing;

-- Q12
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('knot_tying', 12, 'The Knots',
    $prompt$A girth hitch grips by squeezing the anchor. On a slick, tapering branch this means it can:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Slide or slip off — back it up or move to a fork$$),
  ('B', $$Get twice as strong$$),
  ('C', $$Never move under any load$$),
  ('D', $$Automatically re-tie itself$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'A', $rationale$Because it grips by friction, a girth hitch can slide on a slick or tapering branch. Back it up or move to a fork when the load matters.$rationale$
from field_crew_training_module_questions
where module_slug = 'knot_tying' and position = 12
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Practical test-out items (6)
-- ---------------------------------------------------------------------
insert into field_crew_training_module_practical_items
  (module_slug, position, area, task)
values
  ('knot_tying', 1, 'Girth Hitch',     'Choke a sling onto a branch, dressed flat'),
  ('knot_tying', 2, 'Clove Hitch',     'Tie onto a spar and back it up with two half hitches'),
  ('knot_tying', 3, 'Timber Hitch',    'Rig a log to drag, then release it after the pull'),
  ('knot_tying', 4, 'Running Bowline', 'Set a self-tightening loop around a limb with a proper tail'),
  ('knot_tying', 5, 'Inspection',      'Inspect a rigging line and call out any defects'),
  ('knot_tying', 6, 'Safety',          'Point out the bight and keep hands clear as a knot cinches')
on conflict (module_slug, position) do update
  set area = excluded.area, task = excluded.task;

commit;
