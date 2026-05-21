-- ============================================================================
-- 024_avant_528_seed.sql
-- ============================================================================
-- Seed data for the Avant 528 Operator training module: 36 slides, 20 test
-- questions, 80 choices, 20 answer-key rows. All content is the trainers' own
-- materials reformatted for in-app rendering.
--
-- Idempotent: every insert uses on conflict do nothing / do update.
-- ============================================================================


-- =====================================================================
-- Avant 528 Operator training module — data seed
-- Idempotent: re-running is safe (on conflict do nothing / do update).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Module
-- ---------------------------------------------------------------------
insert into field_crew_training_modules
  (slug, name, description, training_key, pass_threshold, requires_all_safety, version, is_active)
values
  ('avant_528_operator',
   'Avant 528 Operator',
   'Operator certification for the Avant 528 compact loader with the Branch Manager attachment.',
   'avant_528_operator',
   85,
   true,
   '1.0',
   true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  training_key = excluded.training_key,
  pass_threshold = excluded.pass_threshold,
  requires_all_safety = excluded.requires_all_safety,
  version = excluded.version,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------
-- Slides (36)
-- ---------------------------------------------------------------------

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 1, 'intro',
$title$Avant 528 with the Branch Manager Attachment$title$,
$body$**OPERATOR TRAINING**

Move heavy debris. Protect your crew. Respect the machine.

Bratt Tree — New Hire Training Series

Version 1.0 — Issued 2026$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 2, 'intro',
$title$Welcome$title$,
$body$**Welcome to the crew.**

This unit moves a lot of weight. Treat it that way.

The Avant 528 is one of our most-used tools at Bratt Tree. Paired with the Branch Manager grapple, it's how we move trees, logs, and brush off jobsites quickly and safely.

By the end of this training you'll know how to run this machine confidently — and just as importantly, when NOT to run it. Safety isn't a chapter in this deck. It's every chapter.

> "Every shift ends with everyone going home — including the machine."$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 3, 'intro',
$title$Course Agenda$title$,
$body$**What you'll learn today.** Six sections, one practical test-out, one written test.

1. **Equipment Overview** — The 528, the Branch Manager grapple, why we use this combo
2. **Safety** — PPE, ROPS, stability, overhead hazards, bystander rules
3. **Operations** — Startup, driving, hydraulics, grappling, loading, shutdown
4. **Maintenance** — Daily checks, greasing, service intervals
5. **Best Practices** — Jobsite flow, crew communication, efficiency
6. **Test-Out** — Practical checklist on the machine + written test (85% to pass)$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 4, 'equipment',
$title$Section 1 — Equipment$title$,
$body$**SECTION 01 — Equipment**

Know what you're sitting in. Know what's hanging off the front.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 5, 'equipment',
$title$Meet the Avant 528$title$,
$body$**Compact articulated loader. Big lift, small footprint.**

- **2,094 lbs** — Lift capacity
- **9' 2"** — Lift height
- **26 hp** — Kubota diesel

**WHY WE RUN THE 528**

- **Articulated chassis with a rigid joint** — low center of gravity, no side-sway in the pivot, great stability when carrying loads.
- **Telescopic boom (24 in)** — extra reach when loading trucks or stacking debris piles.
- **Hydrostatic Avant Optidrive®** — single foot pedal, smooth direction changes, easy to feather under load.
- **Fits through standard 4-ft gates** — width 44.5 in. Goes in residential yards where skid steers can't.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 6, 'equipment',
$title$Specifications you should know cold$title$,
$body$**These numbers decide what you can and can't pick up.**

- **Machine weight (ROPS):** 3,131 lbs (1,420 kg)
- **Lift capacity (tipping load):** ~2,094 lbs (950 kg)
- **Max lift height:** 9 ft 2 in (2,790 mm)
- **Drive speed:** ~7.5 mph (12 km/h)
- **Engine:** Kubota D1105 Stage V Diesel
- **Engine output:** 26 hp (19 kW) @ 2,200 rpm
- **Aux. hydraulic flow / pressure:** ~9.5 gpm / 2,900 psi (36 L/min / 200 bar)
- **Telescopic boom extension:** ~24 in (600 mm)
- **Width / Length / Height:** 44.5" / 102.8" / 78" (1,130 / 2,610 / 1,980 mm)
- **Turning radius (outside):** ~6 ft 9 in (2,050 mm)
- **Tires:** 23 x 10.50-12 (Tractor/Grass tread)
- **Transmission:** Hydrostatic — Avant Optidrive®

**Tip:** If you can't recite the lift capacity and max lift height from memory, you're not ready to test out.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 7, 'equipment',
$title$Why articulated matters$title$,
$body$**It changes how the machine behaves — for better AND worse.**

**THE GOOD**

- **Tight turning radius** — pivots in half the space a skid steer needs.
- **Low center of gravity** — driver sits in the front chassis, weight is low.
- **Rigid pivot joint** — no side-to-side swing. Stable in all directions.
- **Smooth on lawns** — turf tires don't tear up customer grass like tracks do.

**THE WATCH-OUTS**

- **Pivot pinch point** — NEVER stand or kneel in the articulation joint. Crush hazard.
- **Stability drops when boom is raised** — keep loads low when traveling.
- **Side-hill driving** — going across a slope is more dangerous than going straight up or down it.
- **Counterweight effect of attachment** — load swings outboard as you articulate. Slow your inputs.

**Takeaway:** articulated is not a skid steer. Move slower, plan your line, and respect the pivot.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 8, 'equipment',
$title$The Branch Manager grapple$title$,
$body$**Our go-to attachment for moving debris — trees, logs, and brush.**

**ATTACHMENT QUICK FACTS**

- **Opening:** 56 in opening — large enough for most yard trees
- **Weight:** ~239–299 lbs depending on rotation type
- **Rotation:** 360° (knock-around manual rotation OR powered)
- **Hydraulics:** Single aux. circuit + 12V electric oil diverter for rotator
- **Mount:** Custom Avant mounting plate (NOT a universal skid-steer plate)
- **Features:** Tree pusher, grapple bollard for rope rigging, hitch receiver

**WHAT IT DOES FOR US**

- Picks up cut logs and trunks without a hand crew lifting them
- Grabs brush piles and feeds the chipper
- Drags felled trees out of tight backyards
- Loads trucks and dumpsters from the side
- Pushes leaners with the back of the grapple (carefully)
- Rotates to orient logs lengthwise for stacking
- Reduces hand-injury risk for the ground crew$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 9, 'safety',
$title$Section 2 — Safety$title$,
$body$**SECTION 02 — Safety**

If you're rushing, you're already wrong. Slow is smooth, smooth is safe.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 10, 'safety',
$title$Required PPE — every time, no exceptions$title$,
$body$**If you don't have it on, you don't sit in the seat.**

- **HARD HAT** — Class E or G. Worn whenever you're outside the cab on a tree job — and we recommend in the open ROPS too.
- **SAFETY GLASSES** — ANSI Z87.1. Sawdust, woodchips, and flying bark are constant. No exceptions.
- **HEARING PROTECTION** — Earplugs or muffs. NRR 25+. The 528 + chipper + chainsaws will damage hearing over time.
- **HIGH-VIS SHIRT/VEST** — Lime/orange. So the ground crew sees you, and you see them.
- **STEEL/COMPOSITE TOE BOOTS** — ASTM-rated. Logs roll. Branches drop. Your toes will lose.
- **WORK GLOVES** — Cut-resistant. Required when handling chains, hooks, or debris.
- **LONG PANTS, NO LOOSE CLOTHING** — No drawstrings or open hoodies near the articulation point or moving hydraulics.
- **SEATBELT** — Not optional. See the next slide. We mean it.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 11, 'safety',
$title$Pre-operation safety checklist$title$,
$body$**Walk around the machine before you touch the key. Every shift.**

- Tire pressure looks even — no flats or visible damage
- No fluid leaks under the machine (oil, hydraulic, coolant, diesel)
- Boom pivot pins and attachment locking pins fully seated
- Hydraulic hoses on the attachment are not chafed, kinked, or weeping
- Quick-attach lever is locked and secured
- Seatbelt buckle works — latch in, latch out
- ROPS bolts visibly tight, no cracks in the frame
- Beacon, work lights, and reverse beeper function
- Fire extinguisher present and in-date (cab option)
- Path is clear of bystanders, pets, garden hoses, low branches
- Overhead clear — power lines, eaves, soffits, low-hanging limbs
- You know where the jobsite muster point is in case of incident$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 12, 'safety',
$title$ROPS + seatbelt: the non-negotiable$title$,
$body$**The rollover bar alone doesn't save you. The seatbelt is what keeps you inside it.**

**99% effective** at preventing death and serious injury — when ROPS is used WITH a seatbelt. (Source: industry rollover protection studies)

**THE RULES**

- **Seatbelt ON before you turn the key**
- Never disable, modify, or remove the ROPS frame
- **If the machine starts to tip — DO NOT JUMP** — brace your feet, grip the steering wheel, stay in the seat. The ROPS protects you only if you're inside it.
- **Open ROPS = no overhead protection** — wear your hard hat even in the seat when working under trees.
- **Any damage to the ROPS = machine is OUT of service** until inspected. Don't weld, drill, or repair it yourself.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 13, 'safety',
$title$Overhead hazards$title$,
$body$**What's above the machine will kill you faster than what's in front of it.**

- **POWER LINES:** assume every line is energized. Keep a minimum 10-ft clearance — more for higher voltage. If unsure, call the utility BEFORE work begins.
- **TREE BEING FELLED** — Never position the 528 under a tree that's actively being cut. If you can't see the climber, you're too close.
- **DEAD/HANGING LIMBS** — Widow-makers fall straight down. Inspect the canopy before driving under.
- **ROOFS, EAVES, SOFFITS** — Boom up = boom over the gutter. Measure clearance before you raise.
- **GARAGE DOORS, AWNINGS** — Folded mast height of the 528 is ~6 ft 6 in. Telescope + boom + load can hit doorways fast.
- **OTHER CREW IN THE TREE** — Climber overhead = grapple stays grounded. Confirm by radio before any boom movement.
- **CHIPPER FEED CHUTE** — When loading the chipper, your grapple swings into the operator's lane. Eye contact + verbal call BEFORE swinging.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 14, 'safety',
$title$Stability, slopes & load handling$title$,
$body$**Three rules that keep this machine rubber-side-down.**

**1. MAX SLOPE: 15°**
Don't drive across slopes greater than 15° (about a 27% grade). When in doubt, take the loaded path STRAIGHT up or straight down — never across. Empty the grapple before traversing a steep grade.

**2. LOAD LOW WHEN MOVING**
Carry the load 6–12 inches off the ground while traveling. A raised boom moves the center of gravity UP and OUT. Only lift to dump or load. Never travel with the boom fully extended.

**3. RESPECT THE 2,094 LB TIP LOAD**
Tipping load is measured at 16 in from the coupling, attachment weight included. A long log centered far from the pivot weighs MORE on the machine than the same weight up close. If the rear wheels lift, you're past the limit — drop the load NOW.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 15, 'safety',
$title$Bystanders, pinch points & shutdown lockout$title$,
$body$**The most predictable injuries happen at the moments you least expect.**

**BYSTANDER & CREW RULES**

- No one within the grapple swing arc when boom is moving
- Never carry a person on, in, or under the grapple
- Maintain eye contact with the ground crew before every swing
- Use a spotter when backing up or loading the truck
- Pets and homeowners stay inside or behind tape
- Pinch points: articulation joint, boom pivots, grapple jaws
- NEVER stand between the grapple and a fixed object

**PROPER SHUTDOWN — EVERY TIME**

1. Park on level ground
2. Lower the boom and grapple FULLY to the ground
3. Set the parking brake / lock
4. Throttle to idle, run for 30 seconds (turbo cool-down)
5. Key off, remove key
6. Cycle hydraulic controls to release residual pressure
7. Walk around: leaks, damage, anything looks off? Report it.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 16, 'operations',
$title$Section 3 — Operations$title$,
$body$**SECTION 03 — Operations**

Now we turn the key — but only after Section 2 is muscle memory.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 17, 'operations',
$title$Starting the machine$title$,
$body$**Cold-start sequence — same every time.**

1. **Pre-op walk-around** — Use the checklist from slide 11. Don't skip it. Not even once.
2. **Mount safely** — Three points of contact (two hands + one foot OR two feet + one hand). Face the machine — never jump in or out.
3. **Adjust seat & buckle in** — Adjust seat so you reach all controls comfortably. Buckle the seatbelt BEFORE anything else.
4. **Controls in neutral** — Drive lever centered, hand throttle low, aux. hydraulics in detent.
5. **Glow plugs (cold weather)** — Turn key to PREHEAT position. Wait for the indicator light to go out (typically 5–10 seconds in cold).
6. **Crank to start** — Turn key to START. Release as soon as the engine catches. Never crank longer than 10 seconds.
7. **Warm up** — Let engine run at low idle for 1–2 minutes (longer in cold). Check gauges: oil pressure, charge, temp.
8. **Cycle hydraulics** — Slowly raise/lower the boom, extend/retract telescope, open/close the grapple. Listen for unusual noises.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 18, 'operations',
$title$Driving the 528 — Avant Optidrive®$title$,
$body$**Hydrostatic = one pedal forward, one pedal reverse. Smooth wins.**

Pedal in = move. Pedal out = stop. Articulated steering wheel = direction. Hand throttle = engine speed. Simple. Now use it RIGHT.

**DO**

- Engine RPM higher when you need hydraulic power (lifting, grapple force)
- Feather the pedal — abrupt starts/stops shock the load and the machine
- Steer SLOWLY when loaded — the load swings outboard at the pivot
- Brake by easing off the pedal (hydrostatic braking) — service brake for emergencies/parking
- Reverse only with mirrors AND a glance over the shoulder
- Always travel with boom DOWN (6-12 inches off ground, attachment tilted back)

**DON'T**

- DON'T slam the pedal from forward to reverse — gets expensive fast
- DON'T travel with the boom raised more than knee height
- DON'T high-RPM idle for long periods — wastes fuel and overheats hydraulics
- DON'T turn sharply on a slope — articulated machines roll predictably when you violate this
- DON'T drive with one hand or with your head out the side
- DON'T let anyone ride along — single seat, single operator$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 19, 'operations',
$title$Boom, telescope & aux hydraulics$title$,
$body$**Three control axes that work together. Practice until your hands know.**

- **BOOM UP / DOWN** — Joystick fore/aft. Raises and lowers the main lift arm. ALWAYS travel with boom down (6-12 inches off ground).
- **BOOM TILT (CROWD/DUMP)** — Joystick left/right. Rolls the attachment toward you (crowd) or away (dump). Tilt back on the load when carrying.
- **TELESCOPE EXTEND/RETRACT** — Auxiliary switch on the joystick. Extends the boom up to ~24 in (600 mm). Retract fully before driving.
- **AUX HYDRAULICS (GRAPPLE)** — Aux. flow lever / proportional thumb roller. Opens and closes the grapple jaws.
- **GRAPPLE ROTATOR (12V DIVERTER)** — Press the diverter button to swap aux. flow from the jaws to the rotator. Release = back to jaws.
- **HAND THROTTLE** — Sets engine RPM. Higher RPM = faster hydraulics + more force. Match RPM to the task.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 20, 'operations',
$title$Attaching & detaching the Branch Manager$title$,
$body$**Get the mechanical connection RIGHT before any hydraulic connection.**

**ATTACHING (in order)**

1. Park machine on level ground, engine OFF, key removed
2. Approach attachment slowly — tilt forward so coupler hooks engage the top lip of the Avant plate
3. Tilt the coupler back to roll the attachment into position
4. Get OUT of the seat. Lower the locking pin(s) by hand. Confirm fully seated through the hole
5. Visually confirm both sides of the quick-attach are locked
6. Engine OFF. Relieve hydraulic pressure (cycle joystick), then connect the hydraulic couplers — clean threads, no contamination
7. Plug in the 12V harness for the rotator diverter
8. Start engine, raise grapple slightly, cycle jaws & rotator from inside the cab — confirm operation

**DETACHING (reverse order)**

1. Lower attachment to LEVEL ground (not on a slope, not on rocks)
2. Engine OFF. Cycle joystick to relieve hydraulic pressure
3. Disconnect 12V harness and hydraulic couplers — cap or bag them to keep dirt out
4. Pull the locking pin(s)
5. Start engine. Tilt the coupler forward to release
6. Slowly back away from the attachment
7. Stage the attachment where it won't be a trip hazard or get hit$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 21, 'operations',
$title$Grappling debris — technique that works$title$,
$body$**Power matters, but position matters more.**

Approach low and slow. Set the jaws to engage the center of mass. Close. Tilt back. Lift only as much as you need to.

- **LOGS** — Grab near the center of mass — usually slightly toward the butt end. Long logs: balance is everything. Roll them with the rotator before lifting if you need to change orientation.
- **WHOLE TREE SECTIONS** — If the limb structure is uneven, expect 'dogleg' swing when you lift. Pause, let it settle, then move. NEVER swing over the crew.
- **BRUSH PILES** — Bury the lower jaw, close slowly. Compress the pile before lifting. Smaller bites = less fall-out on the drive to the chipper.
- **ODD SHAPES (ROOTBALLS, STUMPS)** — Use the rotator to find a flat purchase point. Approach from the side that minimizes overhang past the grapple.
- **PUSHING (NOT LIFTING)** — Use the BACK of the grapple to push leaners or debris. Never push with the open jaws — they bend.

**AVOID THESE:** Shock-loading (slamming jaws onto a log), prying out buried debris with hydraulic force, lifting anchored or rooted material.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 22, 'operations',
$title$Loading trucks, dumpsters & chippers$title$,
$body$**Highest-risk phase of the job. Slow down. Make eye contact.**

**BEFORE YOU LIFT INTO A TRUCK BED OR CHIPPER:**

**TRUCKS & DUMPSTERS**

- Confirm truck/dumpster is on level ground and chocked if needed
- Confirm no one is in the bed, on top of the pile, or behind the truck
- Confirm load fits inside the bed (length AND height) — log overhang is illegal
- Approach square to the truck, not at an angle
- Lift high enough to clear the rails, NOT higher
- Open jaws slowly to drop — never shake the grapple to dump

**CHIPPER FEEDING**

- Chipper operator runs the chipper — you DON'T
- Verbal call + eye contact before any boom swing toward the chute
- Stay BEHIND the operator's working zone; never swing across their lane
- Feed butt-end first, small bites — let the chipper pull, don't shove
- If a piece is too big or odd-shaped, set it down and let it be cut smaller
- STOP immediately if you hear the chipper bog, scream, or change pitch$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 23, 'maintenance',
$title$Section 4 — Maintenance$title$,
$body$**SECTION 04 — Maintenance**

A clean, greased machine doesn't break down on a customer's lawn.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 24, 'maintenance',
$title$Daily pre-op inspection$title$,
$body$**Two minutes of checking saves two hours of breakdown.**

- **TIRES** — Pressure even, no cuts or embedded debris, lug nuts visible/tight
- **ATTACHMENT PINS** — Quick-attach locking pins fully seated; safety clips in place
- **HYDRAULIC HOSES** — No leaks, no chafing, couplers clean and dry
- **BOOM PIVOTS** — Greased — wipe up extruded grease; check pin retainers
- **ENGINE OIL** — Dipstick — between MIN and MAX. Top up if low. NEVER overfill.
- **COOLANT** — Sight glass / reservoir — between MIN and MAX. Engine COLD only.
- **DIESEL FUEL** — Top off at start of shift, never run below 1/4 tank (water condensation)
- **AIR FILTER INDICATOR** — Visual indicator clear? If popped, change filter before starting.
- **BATTERY** — Terminals clean and tight; no corrosion or swelling
- **LIGHTS / BEACON / BEEPER** — All function before leaving the yard
- **SEAT, BELT, ROPS** — Belt latches cleanly; no cracks in ROPS frame; all bolts visible
- **ATTACHMENT GREASE POINTS** — Grapple pivots, rotator — fresh grease film visible$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 25, 'maintenance',
$title$Greasing schedule & points$title$,
$body$**Grease cheap. Pivot pins expensive.**

**WHEN TO GREASE**

- Daily — boom pivot & cylinder pins
- Daily — attachment quick-coupler pivots
- Daily — grapple pivot pins (very high cycle)
- Every 50 hrs — articulation joint
- Every 50 hrs — steering cylinder pins
- Every 50 hrs — drive shaft U-joints
- Weekly — wheel hub seals (light wipe)

**DO IT RIGHT**

- Use NLGI #2 multi-purpose lithium grease (or what the dealer specifies)
- **Wipe the zerk fitting clean BEFORE coupling**
- 2–3 shots per zerk — until you see fresh grease extrude
- Wipe excess immediately (it picks up grit otherwise)
- If a zerk won't take grease, report it — don't force it
- Replace any missing or damaged zerks before next shift$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 26, 'maintenance',
$title$Periodic service intervals$title$,
$body$**Operator-level vs. shop-level. Know the line.**

| Interval | Operator tasks | Shop tasks |
| --- | --- | --- |
| Daily | Walk-around, fluids, grease daily points, clean radiator screen | — |
| Every 10 hrs | Tire pressure check, more thorough grease pass, clean cab | — |
| Every 50 hrs | All grease points, check belt tension, drain water from fuel filter | Inspect hydraulic hoses, torque check on attachment plate |
| Every 250 hrs | Replace engine oil & filter, replace fuel filter, check coolant | Hydraulic filter, valve clearance check |
| Every 500 hrs | Inspect all electrical connections, log into service tracker | Replace hydraulic oil, replace air filter, full diagnostic |
| Annually | Bring to shop on schedule — don't wait for failures | Full inspection, ROPS bolts torque, brake system, A/C service |

If a fault light, unusual noise, leak, or performance change appears between intervals — **STOP the machine and report it.** Don't 'run it through the shift.'$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 27, 'best_practices',
$title$Section 5 — Best Practices$title$,
$body$**SECTION 05 — Best Practices**

Habits that separate a green operator from a Bratt Tree operator.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 28, 'best_practices',
$title$Jobsite efficiency$title$,
$body$**Move debris in a flow, not in fits and starts.**

- **PLAN YOUR DROP ZONE FIRST** — Before any cutting starts, decide where logs and brush will land. Mark the path from drop zone to truck/chipper. Move obstacles BEFORE you need to drive over them.
- **STAGE BY SIZE** — Logs in one pile, brush in another, contractor-grade debris in a third. Mixing piles = sorting later = wasted minutes per load.
- **FULL BITES, NOT NIBBLES** — Match the grapple to the load. Half-full grapples mean double the trips. Don't OVERLOAD either — see the 950 kg lift limit.
- **DRIVE WITH PURPOSE** — Pick a path and commit. Constant micro-adjusting wastes time and chews up the lawn.
- **PROTECT THE TURF** — Avoid hard turns on grass. If the homeowner cares about the yard (most do), lay plywood under the wheels in soft areas.
- **STAGING THE CHIPPER** — Position the chipper so the prevailing wind blows chips AWAY from cars, windows, and customers. Re-stage once if the wind shifts.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 29, 'best_practices',
$title$Communication on a tree job$title$,
$body$**Two-way radio, eye contact, hand signals. In that order.**

**STANDARD HAND SIGNALS**

- **STOP** — Both arms straight up, palms forward
- **GO / OK** — Single thumbs up — paired with eye contact
- **RAISE BOOM** — Index finger pointed up, circling motion
- **LOWER BOOM** — Index finger pointed down, circling motion
- **OPEN GRAPPLE** — Two flat hands moving apart, palms out
- **CLOSE GRAPPLE** — Two flat hands moving together
- **BACK UP** — Hand waving over shoulder, repeated
- **ALL CLEAR / DONE** — Fist tapped on top of hard hat

**Radio protocol:** clear, brief, one transmission per thought. Use names. Repeat back critical instructions. 'Affirmative' and 'Negative' — not 'yeah' or 'nope.'$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 30, 'best_practices',
$title$Common rookie mistakes$title$,
$body$**Don't be that operator. Every one of these has happened — don't add yours to the list.**

- Driving with the boom raised because it 'felt fine in the yard'
- Skipping the seatbelt because you're 'just moving it 20 feet'
- Articulating fast on a slope with a heavy log — side-roll waiting to happen
- Forgetting to lock the quick-attach pin — attachment drops at full extension
- Slamming forward-to-reverse on the Optidrive pedal — burns the pump out
- Running the engine at idle for an hour — wastes fuel, glazes the cylinders
- Pushing with the open jaws — bends the structural arms
- Not topping fuel at end of shift — water condensation overnight
- Loading the truck so high that overhang catches the gate frame
- Greasing through a dirty zerk — packing grit into the bearing
- Driving over the hydraulic hose you forgot to recoil
- Standing in the articulation pivot to fix the wiring — biggest crush risk on the machine$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 31, 'best_practices',
$title$Section 6 — Test-Out$title$,
$body$**SECTION 06 — Test-Out**

Show the trainer you can do it. Then take the written test.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 32, 'best_practices',
$title$Practical test-out — on the machine$title$,
$body$**Trainer signs off each item. You must complete ALL before the written test.**

**PRE-OP**

- Complete a full pre-op walk-around verbally narrating each check
- Verify and document fluid levels (engine oil, coolant, hydraulic)
- Attach the Branch Manager grapple from a cold start (no shortcuts)

**STARTUP**

- Mount the machine with proper three points of contact
- Complete the cold-start sequence and warm-up correctly

**DRIVING**

- Drive a figure-8 course without articulation correction errors
- Travel with boom DOWN and demonstrate slow direction change
- Reverse with spotter using verbal + hand signals

**GRAPPLE**

- Pick up a single log from a pile, rotate 180°, set it on a target
- Move a brush pile to a marked drop zone in 3 bites or fewer

**LOADING**

- Load a designated debris item into a truck bed without striking the sides
- Demonstrate proper chipper feeding etiquette with a partner

**SHUTDOWN**

- Perform full shutdown sequence and lockout
- Detach the grapple and stage it safely

**RECOVERY**

- Identify the 5 most common failure points by sight on the machine$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 33, 'best_practices',
$title$Knowledge check — 5 sample questions$title$,
$body$**Try these as a warm-up. Full 20-question test is in your training packet.**

**Q1.** Maximum lift capacity (tipping load) of the Avant 528 is:
- A) 1,100 lbs
- B) 2,094 lbs
- C) 3,131 lbs
- D) 5,512 lbs

**Q2.** When traveling with a load, the grapple should be:
- A) Fully raised for visibility
- B) Tilted forward, jaws open
- C) 6–12 inches off the ground, tilted back
- D) Wherever feels balanced

**Q3.** Maximum slope to drive ACROSS with the 528 is approximately:
- A) 30°
- B) 25°
- C) 15°
- D) No limit if you go slowly

**Q4.** If the machine begins to tip, the correct response is:
- A) Jump clear immediately
- B) Brace and stay in the seat
- C) Open the door and lean out
- D) Drop the boom fast to counter

**Q5.** Before connecting hydraulic couplers to the Branch Manager, you should:
- A) Connect with engine running for pressure
- B) Engine OFF and cycle joystick to relieve pressure
- C) Spray with lubricant
- D) Plug in the 12V harness first$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 34, 'best_practices',
$title$Sample question answers$title$,
$body$**Check your work, then ask the trainer if anything is unclear.**

**Q1. B) 2,094 lbs** — Tipping load is ~2,094 lbs (950 kg) measured at 16 in from the coupling, including attachment weight. This is the limit — don't fight it.

**Q2. C) 6–12 inches off the ground, tilted back** — A raised boom raises the center of gravity AND swings the load further outboard when articulating. Keep it low.

**Q3. C) 15°** — 15° is the recommended limit. Above that, even articulated machines roll. Empty the grapple before any steep traverse.

**Q4. B) Brace and stay in the seat** — ROPS + seatbelt = 99% effective. Outside the cage you're in the crush zone. The ONLY safe place is in the seat, belted.

**Q5. B) Engine OFF and cycle joystick to relieve pressure** — Trapped pressure makes couplers impossible to connect AND can inject hydraulic oil into your skin. Always relieve pressure first.$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 35, 'best_practices',
$title$Resources & sign-off$title$,
$body$**Where to go next — and what we need from you.**

**REFERENCE MATERIALS**

- Avant 528 Product Page — avanttecno.com/loader/avant-528/
- Avant Operator's Manual (523/528/530) — manuals.avanttecno.com
- Branch Manager Attachments — branchmanagerusa.com
- Internal SOP — Tree Debris Removal — See ops binder
- Maintenance log & checkout sheet — Yard office
- Emergency contacts — Posted in every truck

**OPERATOR SIGN-OFF**

I have completed the Avant 528 training course. I understand the safety requirements, operational procedures, and maintenance expectations.

- Operator name (print)
- Operator signature
- Trainer signature
- Date$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

insert into field_crew_training_module_slides (id, module_slug, position, section, title, body)
values (gen_random_uuid(), 'avant_528_operator', 36, 'closing',
$title$Welcome to the Bratt Tree crew$title$,
$body$**Welcome to the Bratt Tree crew.**

Run the machine right. Watch out for each other. Get home safe.

— BRATT TREE TREE SERVICE$body$)
on conflict (module_slug, position) do update set section = excluded.section, title = excluded.title, body = excluded.body;

-- ---------------------------------------------------------------------
-- Questions, Choices, Answer Key (20)
-- ---------------------------------------------------------------------

-- Q1
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 1, 'Equipment Overview',
    $prompt$The maximum lift capacity (tipping load) of the Avant 528 is approximately:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$1,100 lbs (500 kg)$$),
  ('B', $$2,094 lbs (950 kg)$$),
  ('C', $$3,131 lbs (1,420 kg)$$),
  ('D', $$5,512 lbs (2,500 kg)$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Tipping load is ~2,094 lbs (950 kg), measured at 16 in from the coupling, including attachment weight.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 1
on conflict do nothing;

-- Q2
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 2, 'Equipment Overview',
    $prompt$The Branch Manager grapple opens to approximately:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$36 inches$$),
  ('B', $$48 inches$$),
  ('C', $$56 inches$$),
  ('D', $$72 inches$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$The Branch Manager mini-grapple has a 56-inch jaw opening — sized for most yard trees.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 2
on conflict do nothing;

-- Q3
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 3, 'Equipment Overview',
    $prompt$The Avant 528 engine is a:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$26 hp Kubota D1105 diesel$$),
  ('B', $$35 hp Honda gasoline$$),
  ('C', $$19 hp Kohler diesel$$),
  ('D', $$50 hp Yanmar diesel$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'A', $rationale$Kubota D1105 Stage V diesel — 19 kW / 26 hp at 2,200 rpm.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 3
on conflict do nothing;

-- Q4
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 4, 'Safety',
    $prompt$Before turning the key, you must always:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Honk the horn$$),
  ('B', $$Buckle the seatbelt$$),
  ('C', $$Lower the boom$$),
  ('D', $$Open the cab door$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Seatbelt always goes on FIRST. ROPS only protects you when you're belted into the seat.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 4
on conflict do nothing;

-- Q5
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 5, 'Safety',
    $prompt$The recommended maximum slope to drive ACROSS with the 528 is approximately:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$5°$$),
  ('B', $$10°$$),
  ('C', $$15°$$),
  ('D', $$25°$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$15° is the safe traverse limit. Above that, even articulated machines can side-roll.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 5
on conflict do nothing;

-- Q6
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 6, 'Safety',
    $prompt$If the machine begins to tip over, the correct action is:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Jump clear immediately$$),
  ('B', $$Open the door and lean out the side$$),
  ('C', $$Brace your feet, grip the wheel, and stay in the seat$$),
  ('D', $$Drop the boom fast to counterweight$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$STAY IN THE SEAT. ROPS + seatbelt is 99% effective. Jumping puts you in the crush zone.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 6
on conflict do nothing;

-- Q7
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 7, 'Safety',
    $prompt$ROPS combined with a properly worn seatbelt is approximately how effective at preventing rollover fatalities and serious injuries?$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$50%$$),
  ('B', $$75%$$),
  ('C', $$99%$$),
  ('D', $$Less than 25%$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$99% effective per industry rollover studies — but ONLY when the seatbelt is worn.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 7
on conflict do nothing;

-- Q8
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 8, 'Safety',
    $prompt$When working near overhead power lines, the minimum clearance you should maintain is:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$3 feet$$),
  ('B', $$5 feet$$),
  ('C', $$10 feet (more for high voltage)$$),
  ('D', $$Whatever feels safe$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$OSHA minimum is 10 feet for typical voltages; higher voltage requires more. Assume every line is live.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 8
on conflict do nothing;

-- Q9
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 9, 'Safety',
    $prompt$Which area of the 528 presents the most severe crush/pinch hazard when the engine is running?$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$The boom cylinder$$),
  ('B', $$The articulation joint (pivot point)$$),
  ('C', $$The hydraulic couplers$$),
  ('D', $$The throttle linkage$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$NEVER stand or kneel in the articulation joint. It can close on you in a fraction of a second.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 9
on conflict do nothing;

-- Q10
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 10, 'Safety',
    $prompt$While traveling with a load, the grapple should be:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Fully raised for maximum visibility$$),
  ('B', $$Tilted forward with jaws open$$),
  ('C', $$6–12 inches off the ground, tilted back$$),
  ('D', $$At whatever height feels balanced$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Low and tilted back keeps the center of gravity down and the load secure when articulating.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 10
on conflict do nothing;

-- Q11
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 11, 'Safety',
    $prompt$Required PPE for operating the Avant 528 on a Bratt Tree jobsite includes (choose the BEST answer):$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Hard hat, safety glasses, hearing protection, high-vis, steel-toe boots, work gloves, seatbelt$$),
  ('B', $$Just a hard hat and gloves$$),
  ('C', $$Sunglasses and any work boots$$),
  ('D', $$Whatever you wore yesterday$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'A', $rationale$All required PPE must be worn every time — no exceptions, regardless of how short the task is.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 11
on conflict do nothing;

-- Q12
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 12, 'Operations',
    $prompt$Before connecting hydraulic couplers to the Branch Manager attachment, you should:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Connect them with the engine running so you get full pressure$$),
  ('B', $$Turn engine OFF, then cycle the joystick to relieve trapped hydraulic pressure$$),
  ('C', $$Spray the couplers with lubricant first$$),
  ('D', $$Plug in the 12V harness before any hydraulic work$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Trapped pressure makes couplers impossible to connect AND can inject hydraulic oil into your skin — a medical emergency.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 12
on conflict do nothing;

-- Q13
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 13, 'Operations',
    $prompt$On the Avant Optidrive® hydrostatic transmission, to bring the machine to a normal stop you should:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Slam the pedal in the opposite direction$$),
  ('B', $$Engage the parking brake while moving$$),
  ('C', $$Ease off the drive pedal — hydrostatic braking does the work$$),
  ('D', $$Pull the engine throttle to zero$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Hydrostatic braking is built in. Slamming forward-to-reverse damages the pump.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 13
on conflict do nothing;

-- Q14
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 14, 'Operations',
    $prompt$On a single-auxiliary 528, the Branch Manager grapple's rotator function is controlled by:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$A separate hydraulic circuit on the boom$$),
  ('B', $$A 12V electric oil diverter that re-routes the aux. flow$$),
  ('C', $$A mechanical lever mounted on the attachment$$),
  ('D', $$The hand throttle position$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$The 12V diverter swaps aux. flow between jaws and rotator. Press = rotator; release = back to jaws.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 14
on conflict do nothing;

-- Q15
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 15, 'Operations',
    $prompt$After driving an attachment onto the Avant quick-coupler, you must:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Pull on the attachment from inside the seat to test it$$),
  ('B', $$Get out of the seat and visually confirm both locking pins are fully seated$$),
  ('C', $$Drive forward at speed to seat the pins$$),
  ('D', $$Call the trainer to inspect it$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$Get out and LOOK at both sides. A dropped attachment at full boom extension is catastrophic.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 15
on conflict do nothing;

-- Q16
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 16, 'Operations',
    $prompt$When feeding debris into the chipper, the operator running the 528 should:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Swing the grapple across the chipper operator's working lane to feed faster$$),
  ('B', $$Throw branches into the chute by hand$$),
  ('C', $$Make eye contact and a verbal call before any boom swing toward the chute$$),
  ('D', $$Take over running the chipper from the ground crew$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Eye contact + verbal call EVERY time. Never swing across the operator's lane.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 16
on conflict do nothing;

-- Q17
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 17, 'Maintenance',
    $prompt$Daily pre-operation inspection includes ALL of the following EXCEPT:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Tire pressure and tire condition$$),
  ('B', $$Hydraulic hoses and couplers$$),
  ('C', $$Replacing the hydraulic oil$$),
  ('D', $$Engine oil, coolant, and fuel levels$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Replacing hydraulic oil is a 500-hour service task — NOT daily. Daily is inspection and fluid level checks.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 17
on conflict do nothing;

-- Q18
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 18, 'Maintenance',
    $prompt$Before applying grease to a zerk fitting, you should:$prompt$,
    false)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Force grease through with maximum pump pressure$$),
  ('B', $$Wipe the zerk fitting clean to prevent contamination$$),
  ('C', $$Heat the zerk with a torch to soften old grease$$),
  ('D', $$Spray it with WD-40$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'B', $rationale$A dirty zerk pushes grit straight into the bearing. Wipe clean BEFORE coupling the grease gun.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 18
on conflict do nothing;

-- Q19
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 19, 'Best Practices',
    $prompt$When the ground crew gives the STOP hand signal (both arms straight up, palms forward), you should:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Slow down to a crawl$$),
  ('B', $$Finish the current motion, then stop$$),
  ('C', $$Stop all motion immediately$$),
  ('D', $$Acknowledge with a thumbs-up and continue$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$STOP means STOP — right now. The signaler is seeing something you aren't.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 19
on conflict do nothing;

-- Q20
with q as (
  insert into field_crew_training_module_questions (module_slug, position, section, prompt, safety_critical)
  values ('avant_528_operator', 20, 'Best Practices',
    $prompt$During pre-op inspection you notice a small puddle of hydraulic fluid under the machine. The correct action is:$prompt$,
    true)
  on conflict (module_slug, position) do update set prompt = excluded.prompt, section = excluded.section, safety_critical = excluded.safety_critical returning id
)
insert into field_crew_training_module_choices (question_id, letter, text)
select q.id, v.letter, v.text from q cross join (values
  ('A', $$Top off the reservoir and run the shift$$),
  ('B', $$Wipe it up and ignore it — small leaks are normal$$),
  ('C', $$Stop, report it, tag the machine out of service, and have it inspected$$),
  ('D', $$Check it again at lunch$$)
) as v(letter, text)
on conflict do nothing;

insert into field_crew_training_module_answer_key (question_id, correct_choice, rationale)
select id, 'C', $rationale$Leaks don't fix themselves. Tag-out is the safest path and saves the machine from worse damage.$rationale$
from field_crew_training_module_questions
where module_slug = 'avant_528_operator' and position = 20
on conflict do nothing;

commit;
