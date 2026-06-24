-- ============================================================================
-- 050_portawrap_operator.sql
-- ============================================================================
-- Seed data for the Portawrap Operator training module: one catalog entry,
-- the module row (with its designed deck stored in source_text), a 16-question
-- multiple-choice written test, and a 10-item practical test-out.
--
-- This mirrors the Avant 528 module (migrations 023/024/028/029): the deck is
-- authored in the Bratt Tree @layout DSL and rendered by the JS deck presenter
-- in /public/training-deck/. The canonical editable copy of the deck also
-- lives at /content/training-modules/portawrap_operator.txt.
--
-- The Portawrap is a stainless-steel rope friction device for controlled
-- lowering of cut tree sections — a rigging tool, not a machine — so the
-- sections are Equipment / Safety / Operation / Best Practices / Test-Out.
--
-- Idempotent: every insert uses on conflict do nothing / do update.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Catalog entry so a passed test completes a real training row
--    (field_crew_training_modules.training_key references this key)
-- ---------------------------------------------------------------------
insert into field_crew_trainings
  (key, display_name, display_order, card_required, is_hours_based)
values
  ('portawrap_operator', 'Portawrap Operator', 320, false, false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Module (deck stored in source_text — the deck-first approach from 028)
-- ---------------------------------------------------------------------
insert into field_crew_training_modules
  (slug, name, description, training_key, pass_threshold, requires_all_safety,
   version, is_active, theme, source_text)
values
  ('portawrap_operator',
   'Portawrap Operator',
   'Operator certification for the Portawrap stainless-steel rope friction device used for controlled lowering of cut tree sections.',
   'portawrap_operator',
   85,
   true,
   '1.0',
   true,
   'bark-cream',
$BTMOD$# ============================================================
# BRATT TREE TRAINING MODULE — Source Content
# This file is plain text. Edit it to author a new training module.
#
# SYNTAX (short version):
#   @layout-name          starts a new slide. See pattern-reference.txt
#                         for every available layout.
#   key: value            a single field on the current slide
#   key: value | value    multi-part value (split by |)
#   - item                a list item (used for agenda/checklist/mistakes)
#   # or //               a comment, ignored by the parser
#
# Tips:
#   • Repeat keys to make a list (e.g. multiple tagline: lines).
#   • Use **bold** and *italic* in text.
#   • Blank lines are optional and only for readability.
# ============================================================

@cover
eyebrow: Operator Training
unit: Portawrap
subtitle: Controlled Lowering Friction Device
tagline: Lower it under control.
tagline: Respect the anchor.
tagline: Keep your hands clear.
meta-left: Bratt Tree · New Hire Training Series
meta-right: Version 1.0 · Issued 2026

@welcome
eyebrow: Welcome
title: Welcome to controlled lowering.
subtitle: The Portawrap is simple. The loads are not.
body: The Portawrap is a stainless-steel rope friction device. It lets one ground worker lower heavy cut sections — limbs, logs, and tops — down to the ground under full control, instead of letting them free-fall.
body: It looks simple, and it is. But it is controlling thousands of pounds through a few wraps of rope. This device requires training and practice until cause and effect are second nature.
quote: Lowering heavy objects is dangerous — it takes knowledge, not just strength.

@agenda
eyebrow: Course Agenda
title: What you'll learn today
subtitle: Five sections, one practical test-out, one written test.
- Equipment | The Portawrap, its parts, and the rope and slings we run
- Safety | Inspection, PPE, anchors, hazards, and the hard rules
- Operation | Anchoring, wrapping, lowering, and locking off a load
- Best Practices | Choosing gear, dialing in wraps, common mistakes
- Test-Out | Practical checklist with a trainer + written test (85% to pass)

@section-divider
number: 01
title: Equipment
tagline: Know the device. Know the rope. Know the sling.

@hero-stats
eyebrow: Section 1 · Equipment
title: Meet the Portawrap
subtitle: A stainless-steel friction device for controlled lowering.
stat: 2,000 | lbs | Working Load Limit (10:1)
stat: 20,000 | lbs | Min. sling strength
panel-title: Why we run the Portawrap
point: **Controlled lowering** — heavy cut sections come down at a speed the ground worker sets, instead of free-falling onto the jobsite.
point: **One-person operation** — a single trained ground worker can run the whole lower.
point: **Simple and rugged** — stainless steel, few parts, nothing to power or fuel. Inspection is the only "maintenance."
point: **Friction does the work** — each wrap of rope adds holding power, so you meter the load out by feel.

@quick-facts
eyebrow: Section 1 · Equipment
title: The parts of the Portawrap
subtitle: Five things to know by name before you rig it.
panel-title: Know These Parts
fact: Guide Loop | Top loop. The rigging (running) line is fed through here first.
fact: Long Leg | The long tube — the working end you wrap the line around.
fact: Short Leg | The shorter tube of the body.
fact: Retention Pin (Horn) | Fixed pin (the "horn") you hitch the line onto to lock it off.
fact: Sling Loop | The long loop where the anchor sling attaches to the device.
list-title: How it all works together
- The sling connects the device to the anchor (attached at the sling loop)
- The rigging line feeds in through the guide loop at the top
- You wrap the line around the working end (long leg) to build friction
- More wraps = more friction = more control over heavier loads
- The retention pin (horn) lets you lock the line off hands-free

@table
eyebrow: Section 1 · Equipment
title: Specifications you should know
subtitle: These numbers decide what you can rig and how.
cols: Specification | Value
row: Working Load Limit (10:1) | 2,000 lbs (900 kg)
row: Weight — Medium | 3.75 lbs
row: Weight — Large | 7.25 lbs
row: Rope range — Medium | 11–16 mm (7/16 – 5/8 in)
row: Rope range — Large | 11–19 mm (7/16 – 3/4 in)
row: Recommended rope | Polyester-jacketed double-braid or solid braid
row: Rope to AVOID | 3-strand / twisted rope (hockling risk)
row: Anchor sling | Dead-eye sling with a spliced eye
row: Min. sling tensile strength | 20,000 lbs (9,000 kg)
tip: "10:1" means the device is built to ten times its 2,000 lb working load limit. That margin is for the unexpected — not a reason to push past 2,000 lbs.

@section-divider
number: 02
title: Safety
tagline: This device is only as safe as your inspection and your anchor.

@ppe-grid
eyebrow: Section 2 · Safety
title: Required PPE & dress
subtitle: The rope path is the hazard. Dress so nothing gets pulled into it.
item: Thick Leather Gloves | Worn whenever you feed rope into the device. Protect hands from friction burn and heat as the rope runs.
item: No Loose Clothing | No open sleeves, drawstrings, or flapping layers near the rope path — entanglement risk.
item: Long Hair Bundled | Tie back and tuck long hair. It can be pulled into the moving rope.
item: Hard Hat | Class E or G. You are working under a load coming down. No exceptions.
item: Safety Glasses | ANSI Z87.1. Bark, chips, and debris come off the load.
item: Hearing Protection | On a saw-and-chipper jobsite, every time.
item: High-Vis Shirt/Vest | So the climber and crew can see the ground worker on the rope.
item: Steel/Composite Toe Boots | ASTM-rated. Loads land near your feet.

@checklist
eyebrow: Section 2 · Safety
title: Pre-use inspection
subtitle: Inspect the device AND the system before every job. Replace anything worn.
- Portawrap body — no cracks, deep gouges, sharp edges, or deformation
- Retention pin (horn) undamaged and the rope path is smooth
- Anchor sling — no cuts, glazing, or broken strands; eye/splice intact
- Rigging line — no cuts, glazing, flat spots, or exposed core
- No gear that has been shock-loaded stays in service — tag it out if in doubt
- Anchor point (trunk/stem) inspected — sound wood, sized for the load
- Tree parts that could break free during the lower are identified
- Ground around the anchor checked for root decay or instability
- Landing zone is clear and you have enough rope to land the load
- Escape path out of the hazard zone is planned and clear
- Hands, hair, and clothing are clear of the rope path

@hazard-grid
eyebrow: Section 2 · Safety
title: Hazards to inspect for
subtitle: Most Portawrap incidents trace back to the anchor, the rope path, or running out of rope.
hero: ANCHOR POINT: Don't over-estimate the strength of your anchor or your rope. Expect the unexpected, and always have an escape plan out of the hazard zone.
item: Falling Tree Parts | Inspect the stem and canopy for parts that could break free while you remove connected sections.
item: Underground Failure | Tree failures can start below ground. Inspect the surrounding ground for root decay or other weakness.
item: Shock Loading | A dropped or snatched load multiplies force fast. Rig to lower smoothly, not to catch a free-fall.
item: The Rope Path | Never control the rope within 2 ft of the device — your hand can be pulled into the rope path.
item: Not Enough Rope | Make sure you have enough rope to land the load safely in the landing zone before you cut.
item: Wrong Connector | Never connect the sling to the device with a snap or metal connector — attach it to the sling loop directly.

@two-column
eyebrow: Section 2 · Safety
title: The hard rules
subtitle: Learn these cold. Every one of them is in the manufacturer's warnings.
left-header: Always
left-icon: ✓
left: Attach the sling to the device directly — no snaps or metal connectors
left: Wear thick leather gloves when feeding rope
left: Remove all slack before the load comes on
left: Keep enough rope to land the load in the zone
left: Have a planned escape route from the hazard zone
right-header: Never
right-icon: ×
right: Connect the Portawrap to the sling with a snap or any metal connector
right: Put your hands within 2 ft of the device while controlling rope
right: Operate with loose clothing or unbundled long hair
right: Change wrapping direction partway through a setup
right: Over-estimate your anchor or rope strength

@section-divider
number: 03
title: Operation
tagline: Anchor it. Wrap it. Pull the slack. Lower it under control.

@steps
eyebrow: Section 3 · Operation
title: Setting up the Portawrap
subtitle: Get the rigging RIGHT before any load goes overhead.
step: Inspect everything | Device, pin, sling, and rope — no damage or excessive wear.
step: Anchor the sling | Tie a dead-eye sling to a sound anchor sized for the load — use a cow hitch or a timber hitch.
step: Attach to the device | Connect the sling to the device's sling loop directly. NO snaps or metal connectors.
step: Install the running line | Feed a bite of rigging line through the guide loop (top), following the path shown in the manual.
step: Wrap the working end | Wrap the line around the working end (long leg). Start with 2–3 wraps. Keep wrapping the SAME direction the whole time.
step: Prep the line | Flake the line out so it feeds freely through your hands — no sticks, twigs, or tangles between the pile and you.
step: Remove the slack | Draw all slack out of the system so the line is taut before any load comes on.

@technique
eyebrow: Section 3 · Operation
title: Lowering a load
subtitle: One person runs it. Friction holds the load — you meter it out.
lead: Pull all the slack out, glove up, and let the wraps do the work. You are not muscling the load down; you are controlling how fast the rope runs.
card: Wraps Control the Load | More wraps = more friction = more holding power. Build the wrap count to the weight you expect.
card: Feeding Rope | Rope should flow smoothly through gloved hands. Let it run; don't fight it. Keep your hands well back from the device.
card: Too Much Friction | If the rope won't move under full load, you have too many wraps. Carefully unwrap ONE loop — hands clear of the device.
card: The Half-Wrap Trick | If half a wrap is causing too much friction, move to the other side of the rope exit position to fine-tune.
card: The Initial Drop | When the load is first cut it may drop slightly as slack pulls tight. This is normal — no cause for alarm.
card: Pre-Tension (Heavy Picks) | When needed, pre-tension the line with block and tackle (fiddle blocks with a reefing line and prusik) before the cut.
warn: Controlling the rope within 2 ft of the device, running too few wraps for the load, or running out of rope before the load lands.

@steps
eyebrow: Section 3 · Operation
title: Locking off the line
subtitle: Only when you need both hands free for another task.
step: Decide to lock off | Lock off only when you genuinely need to free your hands mid-task.
step: Build your wraps | Take as many wraps as possible between the guide loop and the retention pin (horn) — without overlapping the line.
step: Hitch it off | Hitch the line off on the retention pin (horn) as shown in the manual.
step: Why the wraps matter | Too few wraps before lock-off and a strong load can cinch the rope so tight you'll need a knife to free it.

@section-divider
number: 04
title: Best Practices
tagline: The right rope, the right anchor, and the right number of wraps.

@two-column
eyebrow: Section 4 · Best Practices
title: Choosing rope & sling
subtitle: The gear you rig with matters as much as how you rig it.
left-header: Use
left-icon: ✓
left: Polyester-jacketed double-braid rope
left: Solid-braid rope
left: A dead-eye sling with a spliced eye, rated at least 20,000 lbs
left: Rope sized for the device (Med 11–16 mm, Lg 11–19 mm)
right-header: Avoid
right-icon: ×
right: 3-strand or twisted rope — it can hockle and you can lose control
right: Snaps or metal hardware to connect the sling
right: Undersized, glazed, or worn slings and lines
right: Rope outside the device's diameter range
right: Any gear that has been shock-loaded — retire it

@mistakes
eyebrow: Section 4 · Best Practices
title: Common mistakes
subtitle: Every one of these has cost someone control of a load. Don't add yours.
- Too few wraps for the weight — the load runs away from you
- Too many wraps — the rope jams and won't feed
- Controlling the rope right at the device — your hand gets pulled in
- Changing wrap direction halfway — friction goes unpredictable
- Connecting the sling with a snap or metal connector instead of tying it on directly
- Not pulling the slack out before the load is cut
- Running out of rope before the load reaches the ground
- Locking off without enough wraps — the rope cinches and needs a knife
- Trusting an anchor or rope without inspecting it
- Loose sleeves or unbundled hair near the rope path
- No escape plan out of the hazard zone

@section-divider
number: 05
title: Test-Out
tagline: Show the trainer you can rig and lower it. Then take the written test.

@test-checklist
eyebrow: Section 5 · Test-Out
title: Practical test-out — on the gear
subtitle: Trainer signs off each item. You must complete ALL before the written test.
cols: Area | Task | Pass | Trainer Initials
row: Inspection | Inspect device, pin, sling, and rope and call out any defects | ☐ |
row: Anchor | Select and rig a sound anchor sized for the test load | ☐ |
row: Setup | Tie the dead-eye sling to the anchor (cow hitch or timber hitch) | ☐ |
row: Setup | Attach the sling to the sling loop directly (no metal connectors) | ☐ |
row: Setup | Install the running line through the guide loop correctly | ☐ |
row: Wraps | Apply correct wraps for the load, same direction throughout | ☐ |
row: Operation | Remove all slack and lower a controlled test load | ☐ |
row: Operation | Demonstrate gloved feeding with hands clear of the device | ☐ |
row: Adjust | Add or remove a wrap mid-task to correct friction safely | ☐ |
row: Lock-Off | Lock off the line on the retention pin (horn) with adequate wraps | ☐ |
row: Judgment | Confirm enough rope to land the load and state the escape plan | ☐ |

@quiz
eyebrow: Section 5 · Test-Out
title: Knowledge check — 5 sample questions
subtitle: Try these as a warm-up. The full written test is in your training packet.
q: Adding more wraps of rope around the Portawrap will: | Reduce your control of the load | Increase friction and holding power | Have no effect on the load | Make the rope feed faster
q: How should the anchor sling be connected to the Portawrap? | With a steel snap hook | With a carabiner | Attached to the sling loop directly, no metal connectors | With any quick connector
q: The closest you should control the rope to the device is: | Touching the device | Within 6 inches | At least 2 feet away | Distance doesn't matter
q: If the rope won't feed under a full load, you most likely have: | Too few wraps | Too many wraps | The wrong gloves | A bad anchor
q: How is the dead-eye sling tied to the anchor? | With a cow hitch or a timber hitch | With a snap hook | With a carabiner | It doesn't need a knot

@quiz-answers
eyebrow: Section 5 · Test-Out
title: Sample question answers
subtitle: Check your work, then ask the trainer if anything is unclear.
a: B) Increase friction and holding power | More wraps = more friction = more control. Add wraps for heavier loads.
a: C) Attached to the sling loop directly, no metal connectors | Never use a snap or metal connector. Connect the dead-eye sling straight to the sling loop.
a: C) At least 2 feet away | Closer than 2 ft and your hand can be pulled into the rope path and into the device.
a: B) Too many wraps | Too many wraps = too much friction. Carefully unwrap one loop, keeping your hands clear of the device.
a: A) With a cow hitch or a timber hitch | Tie the dead-eye sling to the anchor with a cow hitch or a timber hitch — no metal hardware.

@two-column
eyebrow: Wrap-Up
title: How you get certified
subtitle: No paper sign-off — the hub tracks your certification automatically.
left-header: Your path to certification
left-icon: ✓
left: Your manager assigns you the Portawrap module
left: Work through this deck until you know it cold
left: Pass the written test — 85% or higher, with every safety-critical question correct
left: Complete the practical test-out with a trainer on the gear
left: Your certificate is issued automatically once both the test and the practical are done
right-header: Reference materials
right-icon: ↗
right: Notch Portawrap product info — notchequipment.com
right: Manufacturer instructions — this packet
right: Internal SOP — Rigging & Controlled Lowering — ops binder
right: Rigging gear inspection & retirement log — yard office
right: Emergency contacts — posted in every truck

@closing
mark: BT
title: Welcome to the rigging crew.
subtitle: Inspect every time. Respect the anchor. Keep your hands clear. Get home safe.
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
-- 2b. Re-run cleanup (trainer revisions)
--   • Drop the three questions the trainer cut (positions 11, 12, 16).
--   • Clear all choices/answer keys for this module so edited wording
--     (e.g. Q2, Q6) re-seeds cleanly — the on-conflict inserts below do
--     NOT overwrite existing child rows on their own.
--   attempt_answers has no ON DELETE CASCADE, so clear those first.
-- ---------------------------------------------------------------------
delete from field_crew_training_attempt_answers
  where question_id in (
    select id from field_crew_training_module_questions
    where module_slug = 'portawrap_operator' and position in (11, 12, 16)
  );

delete from field_crew_training_module_questions
  where module_slug = 'portawrap_operator' and position in (11, 12, 16);

delete from field_crew_training_module_choices
  where question_id in (
    select id from field_crew_training_module_questions
    where module_slug = 'portawrap_operator'
  );

delete from field_crew_training_module_answer_key
  where question_id in (
    select id from field_crew_training_module_questions
    where module_slug = 'portawrap_operator'
  );

-- ---------------------------------------------------------------------
-- 3. Written test — questions, choices, answer key (13)
-- ---------------------------------------------------------------------

-- Q1
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 1, 'Equipment',
    $prompt$The Portawrap's Working Load Limit (at a 10:1 design factor) is approximately:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$500 lbs$$),
  ('B', $$1,000 lbs$$),
  ('C', $$2,000 lbs (900 kg)$$),
  ('D', $$5,000 lbs$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$The Working Load Limit is 2,000 lbs (900 kg) at a 10:1 design factor.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 1
on conflict do nothing;

-- Q2
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 2, 'Equipment',
    $prompt$Adding more wraps of rope around the Portawrap will:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Reduce your control of the load$$),
  ('B', $$Increase friction and give you more holding power$$),
  ('C', $$Have no effect on the load$$),
  ('D', $$Make the rope feed faster under load$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$More wraps = more friction = more holding power. Add wraps to control heavier loads.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 2
on conflict do nothing;

-- Q3
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 3, 'Equipment',
    $prompt$The recommended rope type for the Portawrap is:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$3-strand twisted rope$$),
  ('B', $$Polyester-jacketed double-braid or solid braid$$),
  ('C', $$Wire rope$$),
  ('D', $$Any rope on the truck$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Use polyester-jacketed double-braid or solid braid. 3-strand/twisted rope is discouraged.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 3
on conflict do nothing;

-- Q4
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 4, 'Equipment',
    $prompt$Why is 3-strand / twisted rope discouraged on the Portawrap?$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$It is too expensive$$),
  ('B', $$It can twist or hockle, leading to loss of control during lowering$$),
  ('C', $$It is too strong for the device$$),
  ('D', $$It floats and is hard to coil$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Twisting/hockling can cause loss of control during the lower. Use double-braid or solid braid.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 4
on conflict do nothing;

-- Q5
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 5, 'Equipment',
    $prompt$The anchor sling used with the Portawrap should have a minimum tensile strength of:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$2,000 lbs$$),
  ('B', $$5,000 lbs$$),
  ('C', $$10,000 lbs$$),
  ('D', $$20,000 lbs (9,000 kg)$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'D', $rationale$The sling should have a minimum tensile strength of 20,000 lbs (9,000 kg).$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 5
on conflict do nothing;

-- Q6
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 6, 'Safety',
    $prompt$The anchor sling must be connected to the Portawrap by:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$A steel snap hook$$),
  ('B', $$A carabiner$$),
  ('C', $$Attaching it to the sling loop directly, with no metal connectors$$),
  ('D', $$Any quick connector that fits$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Never use a snap or metal connector. Connect the dead-eye sling directly to the device's sling loop.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 6
on conflict do nothing;

-- Q7
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 7, 'Safety',
    $prompt$The closest you should control the rope to the device is:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Touching the device is fine$$),
  ('B', $$Within 6 inches$$),
  ('C', $$Within 1 foot$$),
  ('D', $$At least 2 feet away$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'D', $rationale$Within 2 ft your hand can be sucked into the rope path and into the device.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 7
on conflict do nothing;

-- Q8
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 8, 'Safety',
    $prompt$Before operating the Portawrap, you must:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Bundle long hair and remove loose clothing$$),
  ('B', $$Loosen your sleeves for movement$$),
  ('C', $$Take off your gloves for grip$$),
  ('D', $$Stand directly under the load$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'A', $rationale$Loose clothing and unbundled hair can be pulled into the rope path — an entanglement hazard.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 8
on conflict do nothing;

-- Q9
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 9, 'Safety',
    $prompt$When feeding rope into the Portawrap, you should wear:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$No gloves, for better grip$$),
  ('B', $$Thin cotton gloves$$),
  ('C', $$Thick leather gloves$$),
  ('D', $$Rubber dish gloves$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Thick leather gloves protect your hands from friction and heat as the rope runs.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 9
on conflict do nothing;

-- Q10
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 10, 'Safety',
    $prompt$Regarding your anchor point and rope strength, you should:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Assume they are strong enough if they look fine$$),
  ('B', $$Not over-estimate them; expect the unexpected and keep an escape plan$$),
  ('C', $$Always use the smallest sling available$$),
  ('D', $$Skip inspection if the gear is new$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Don't over-estimate anchor or rope strength. Expect the unexpected and always have an escape plan.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 10
on conflict do nothing;

-- Q13
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 13, 'Operation',
    $prompt$While wrapping the working line on the device, you should:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Change direction halfway for a better grip$$),
  ('B', $$Wrap in the same direction the whole time$$),
  ('C', $$Overlap every wrap tightly$$),
  ('D', $$Use only half a wrap$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Don't change direction. Keep wrapping the same way you started.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 13
on conflict do nothing;

-- Q14
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 14, 'Operation',
    $prompt$If the rope will not feed under a full load, the most likely cause is:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Too few wraps$$),
  ('B', $$Too many wraps, causing excessive friction$$),
  ('C', $$The gloves are too thick$$),
  ('D', $$The anchor is too strong$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Too many wraps = too much friction. Carefully unwrap one loop, keeping hands clear of the device.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 14
on conflict do nothing;

-- Q15
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('portawrap_operator', 15, 'Operation',
    $prompt$When locking off the line on the retention pin, you should first:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Take as many wraps as possible (without overlapping) between the guide loop and the pin$$),
  ('B', $$Use a single wrap to save time$$),
  ('C', $$Remove the anchor sling$$),
  ('D', $$Let go of the rope and step back$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'A', $rationale$Too few wraps before lock-off and a strong load can cinch the rope so tight it needs a knife to remove.$rationale$
from field_crew_training_module_questions
where module_slug = 'portawrap_operator' and position = 15
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Practical test-out items (10)
-- ---------------------------------------------------------------------
insert into field_crew_training_module_practical_items
  (module_slug, position, area, task)
values
  ('portawrap_operator',  1, 'Inspection', 'Inspect device, pin, sling, and rope and call out any defects'),
  ('portawrap_operator',  2, 'Anchor',     'Select and rig a sound anchor sized for the test load'),
  ('portawrap_operator',  3, 'Setup',      'Girth-hitch the sling to the sling loop (no metal connectors)'),
  ('portawrap_operator',  4, 'Setup',      'Install the running line through the guide loop correctly'),
  ('portawrap_operator',  5, 'Wraps',      'Apply correct wraps for a light load, same direction throughout'),
  ('portawrap_operator',  6, 'Operation',  'Remove all slack and lower a 200-400 lb load under control'),
  ('portawrap_operator',  7, 'Operation',  'Demonstrate gloved feeding with hands clear of the device'),
  ('portawrap_operator',  8, 'Adjust',     'Add or remove a wrap mid-task to correct friction safely'),
  ('portawrap_operator',  9, 'Lock-Off',   'Lock off the line on the retention pin with adequate wraps'),
  ('portawrap_operator', 10, 'Judgment',   'Confirm enough rope to land the load and state the escape plan')
on conflict (module_slug, position) do update
  set area = excluded.area, task = excluded.task;

commit;
