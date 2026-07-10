// Wave 2 conversation board — REBUILT after the container recycle from
// conversation-context data (the /tmp scratchpad died; artifacts + repo
// survived). Data below is the recovered per-card state: pitch (BEFORE),
// current spec (AFTER), and the discussion thread. Designer designNotes and
// some architect prose were lost — threads carry the load-bearing quotes.
// This file lives in the REPO now (docs/plans/wave-data/) so it survives.
const fs = require('fs');
const path = require('path');

// [group] ship = Joe R2 ship; discuss = Joe R2 hold (open question)
// [bill] needs engine primitive
const CARDS = [
 {key:'GW_0-2',name:'Steadfast Vanguard',group:'ship',
  before:{cost:'1GW',type:'Creature — Human Soldier',stats:'2/3',rules:'When Steadfast Vanguard enters, creatures you control gain vigilance until end of turn.'},
  after:{cost:'1WW',type:'Creature — Human Soldier',stats:'2/3',rules:'When Steadfast Vanguard enters, creatures you control gain vigilance until end of turn.'},
  thread:[['Killer (ship)','New niche: nothing grants mass vigilance. Alpha-strike without dropping your shields. Wire-legal today (aerial_maneuver grant shape).'],
   ['Architect','Wire-legal, zero engine work. Found a pre-existing graph gap: one-shot mass-buff triggers (warchanter, inspiring_herald, horned_herald, soulblade_captain) never register wants:wide — ~4-line buckets fix ships with the batch. Balance: fair vs inspiring_herald (4 mana mass +1/+1).'],
   ['Joe','I am thinking this can be 1WW.'],
   ['Fable','1WW confirmed — mass vigilance is white anyway. Applied to AFTER.']]},
 {key:'GW_3-1',name:'Tenacious Yearling',group:'ship',bill:true,
  before:{cost:'2G',type:'Creature — Beast',stats:'1/2',rules:'Whenever you cast a spell that alters a creature\'s power or toughness, put a +1/+1 counter on Tenacious Yearling.'},
  after:{cost:'2G',type:'Creature — Beast',stats:'1/2',rules:'Spells you cast that target creatures you control also put a +1/+1 counter on them.'},
  thread:[['Killer (ship)','Best of three tricks-matter pitches. Opens a real niche: no card rewards drafting combat tricks. Recruit record: 15 — the whole trick shelf.'],
   ['Architect','Two triggers (pump + grant_keyword) give OR semantics on existing rails; rules text broadened to match. Ship the trick vocabulary alongside — the biggest recruit card unwired defeats the point.'],
   ['Joe','Does this want to put the counter on itself, or on the targeted creature?'],
   ['Fable','Sharper design: counter on the SPELL\'S TARGET — "your tricks leave permanent scars," spreads value, can\'t be answered by killing one Beast. Needs the event-target plumbing, but Glade Marshal + Bramblefang already want the same ~15-20 lines. On-self is wire-legal today if you want zero risk. My vote: on-target.'],['Joe','We had talked about "your spells also do X" — what do you think about using a pipeline like that here?'],['Fable','Yes — unify it with Bramblefang on the ONE static spell-modifier primitive: "Spells you cast that change a creature\'s power or toughness or grant it a keyword also put a +1/+1 counter on it." Resolution-time, so the counter lands WITH the trick (no timing trap), no event-target plumbing needed, and the ~30-line primitive now has two customers. AFTER updated.'],['Joe','"Spells you cast that target creatures you control also put a +1/+1 counter on them"?'],['Fable','Better than my version, and it fixes a bug mine had: under the effect-kind wording, casting sicken on THEIR creature would have countered THEIR creature. Your "you control" guard solves it from the design side, drops the effect-kind scan entirely (simpler condition), and ropes in Sudden Reprieve and Chrysalis Ward as counter sources too. Adopted verbatim.'],['Joe','Oh interesting implication — how does this current wording work with roots and branches?'],['Fable','Cleanly, and it\'s the perfect test case: roots_and_branches targets one of THEIR creatures (tap) and one of YOURS (pump). "Creatures you control" filters per-target — so your pumped creature gets the counter, their tapped one doesn\'t. The spell becomes tap-theirs + pump-yours + a permanent counter on yours. Same per-target iteration Bramblefang\'s hook uses (his: all targets get damage; yours: your-creature targets get counters) — one shared primitive, two filters. sword_and_sorcery behaves identically.'],['Joe','SHIP. Awesome!'],['Fable','That\'s the full cut: 32 ship, 1 kill. Build begins.']]},
 {key:'WU_0-0',name:'Sudden Reprieve',group:'ship',
  before:{cost:'1U',type:'Sorcery',stats:'',rules:'Flash. Exile target creature you control, then return it to the battlefield.'},
  after:{cost:'1U',type:'Sorcery',stats:'',rules:'Flash. Exile target creature you control, then return it to the battlefield.'},
  thread:[['Killer (ship)','Wins the blink-spell niche. The move_card bf→exile→bf pair is Tideglass Broker\'s trigger recast as a flash spell; flicker payoffs exist but no flicker spell.'],
   ['Joe','Thoughts on "you control"? What use cases open up as a disruptive tool?'],
   ['Fable','Dropping it opens: blink their attacker mid-combat (damage evaporates), reset accumulated +1/+1 counters (Gloomfang!), wipe eot pumps — a real 1U answer card. But it stops being THE flicker deck\'s card, and blinking theirs re-triggers THEIR ETBs. Lean: keep "you control" for identity; the disruptive version is a different card (future "Displace").']]},
 {key:'WU_1-0',name:'Windmark Marshal',group:'ship',bill:true,
  before:{cost:'1WU',type:'Creature — Human Soldier',stats:'2/3',rules:'Other creatures you control with flying get +1/+1.'},
  after:{cost:'1WU',type:'Creature — Human Soldier',stats:'2/3',rules:'Other creatures you control with flying get +1/+1.'},
  thread:[['Killer (ship)','First keyword-filtered lord; no fliers-matter payoff exists. static_buffs filters route through matchFilter which supports has_keyword.'],
   ['Architect','Ship with the describeStaticBuff generator fix (keyword-filter phrasing, ~5 lines) — every lord relies on generated text; a hand-authored override would drift.']]},
 {key:'WU_1-1',name:'Wayclearer Knight',group:'ship',
  before:{cost:'3W',type:'Creature — Human Knight',stats:'3/3',rules:'Whenever Wayclearer Knight attacks, tap target creature an opponent controls.'},
  after:{cost:'3W',type:'Creature — Human Knight',stats:'3/3',rules:'Whenever Wayclearer Knight attacks, tap target creature an opponent controls.'},
  thread:[['Killer (ship)','Beats the other attack-tap pitch: tapping FEEDS smite_the_wicked (destroy target TAPPED creature — verified in pool). Wire-legal (mist_raider attack-trigger shape).'],
   ['Joe','...what\'s going on here? I\'m confused.'],
   ['Fable','Plainly: when it attacks, you tap one of their creatures — clearing a blocker (the name). Bonus: the tapped creature becomes legal food for smite_the_wicked. The architect noise was about extraction vocabulary, not the card. If the confusion was something else, point me at it.']]},
 {key:'WU_1-2',name:'Ambuscade Adept',group:'ship',bill:true,
  before:{cost:'1U',type:'Creature — Human Wizard',stats:'1/2',rules:'Flash. Whenever you cast a spell with flash, put a +1/+1 counter on Ambuscade Adept.'},
  after:{cost:'1U',type:'Creature — Human Wizard',stats:'1/2',rules:'Flash. Whenever you cast a spell with flash, put a +1/+1 counter on Ambuscade Adept.'},
  thread:[['Killer (kill→Joe overruled)','Flash-matters claimed three times; Warden of Hidden Hours wins on body/hand. Losing duplicate.'],
   ['Joe','Is "another" necessary for function? For clarity? Want Claude-as-game-design-partner feedback.'],
   ['Fable','Engine proof: spell_cast listeners are battlefield permanents; a card being cast is on the stack — it can NEVER hear its own cast, so "another" is functionally a no-op. House convention already resolves this: anger_hound/storm_caller carry another_card in the WIRE (the classification signature) while generated text reads "a spell." Solved problem, confusing hat. Needs the shared card_has_keyword predicate (~6 lines).']]},
 {key:'WU_2-2',name:'Warden of Hidden Hours',group:'ship',bill:true,
  before:{cost:'1WU',type:'Creature — Human Wizard',stats:'2/3',rules:'Flash. Whenever you cast a spell with flash, put a +1/+1 counter on Warden of Hidden Hours.'},
  after:{cost:'1UR',type:'Creature — Human Wizard',stats:'2/3',rules:'Whenever you cast a spell with flash, put a +1/+1 counter on Warden of Hidden Hours. (flash REMOVED — payoff, not the thing)'},
  thread:[['Killer (ship)','Wins the flash-matters niche. Vocab price honest: card_has_keyword mirrors card_has_subtype, one line.'],
   ['Joe','I see the overlap now haha. Move to 1UG or 1UR, take flash OFF it (a payoff, not the thing) and see how that feels.'],
   ['Fable','Love the payoff-not-the-thing instinct — also fixes a graph wart (with flash it provides what it wants). Pick: 1UR — thinnest pair post-wave, "spells at odd hours" is izzet. Applied to AFTER.']]},
 {key:'WU_3-0',name:'Windward Blessing',group:'ship',
  before:{cost:'U',type:'Sorcery',stats:'',rules:'Flash. Target creature you control gains flying until end of turn.'},
  after:{cost:'U',type:'Sorcery',stats:'',rules:'Flash. Target creature you control gains flying until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','Third copy of the grant-flying plan (aerial_maneuver, sky_champion).'],['Joe','Interesting bad card that may as well exist.']]},
 {key:'WU_3-2',name:'Undertow Recall',group:'ship',
  before:{cost:'1U',type:'Sorcery',stats:'',rules:'Flash. Return target creature you control to its owner\'s hand. Draw a card.'},
  after:{cost:'1U',type:'Sorcery',stats:'',rules:'Flash. Return target creature you control to its owner\'s hand. Draw a card.'},
  thread:[['Killer (kill→Joe overruled)','Same protect-and-rebuy niche as Sudden Reprieve, which blinks (no recast tax). One per niche.'],['Joe','Ship. (Both now live: blink = free rebuy, bounce = recast + a card.)']]},
 {key:'GU_0-0',name:'Covenant Scholar',group:'ship',
  before:{cost:'1GU',type:'Creature — Merfolk Wizard',stats:'2/3',rules:'Whenever another Wizard enters the battlefield under your control, put a +1/+1 counter on Covenant Scholar.'},
  after:{cost:'1GU',type:'Creature — Merfolk Wizard',stats:'2/3',rules:'Whenever another Wizard or Merfolk enters the battlefield under your control, put a +1/+1 counter on Covenant Scholar. (PROPOSED)'},
  thread:[['Killer (kill→Joe overruled)','Second Wizard-density payoff vs archmage_patriarch; also pitch cost (1GU) and JSON (4 mana) disagreed — build at 1GU.'],
   ['Joe','Thoughts on "Wizard or Merfolk"?'],
   ['Fable','Cheap and clean: extend card_has_subtype to any-of (card_has_subtype(Wizard, Merfolk)) — ~2 lines + a preamble tweak. Better than two triggers, which double-fire on a Merfolk Wizard. Recommend.'],['Joe','So as-is, we don\'t double-fire, correct?'],['Fable','Correct — a trigger fires once per EVENT no matter how many condition terms match. The double-fire risk existed only in the hypothetical TWO-triggers implementation of OR. With the any-of predicate it stays one trigger, one fire, even for a Merfolk Wizard entering.']]},
 {key:'GU_0-1',name:'Riftcurrent Minnow',group:'ship',
  before:{cost:'U',type:'Creature — Fish',stats:'1/1',rules:'Whenever you draw a card, Riftcurrent Minnow gets +1/+0 until end of turn.'},
  after:{cost:'U',type:'Creature — Fish',stats:'1/1',rules:'Whenever you draw a card, Riftcurrent Minnow gets +1/+0 until end of turn. (house ruling: drawing = any library→hand move)'},
  thread:[['Killer (ship)','First draw-matters card; zero cards condition on card_moves(library, hand); modest register incarnate.'],
   ['Joe','Help me understand the templating difference. Compatibility with tutors, or something else?'],
   ['Fable','The engine\'s zone event can\'t tell a draw from a tutor — both are library→hand. The rewrite templated honestly to the wire (includes tutors). Strict "draw" costs ~5 lines (flag the draw-path emit). Lean: broad version — tutors triggering it feels fine, zero engine work.'],['Joe','This sounds like a broader house-style issue: this probably wants to SAY "draw", and our tutors should also probably say "draw". Backlog item? Does this make sense?'],['Fable','It makes sense and I like it: house ruling "drawing = any card moving library→hand." Minnow\'s text reads "Whenever you draw a card," and the wire is honest because the house DEFINES draw that way. Backlogged: a tutor-text consistency pass so search effects phrase their hand-put as drawing.']]},
 {key:'GU_0-2',name:'Mistwing Duelist',group:'ship',
  before:{cost:'1GU',type:'Creature — Spirit',stats:'2/2',rules:'Whenever you cast an instant or sorcery spell, Mistwing Duelist gains flying until end of turn.'},
  after:{cost:'2U',type:'Creature — Spirit',stats:'2/2',rules:'Whenever you cast a noncreature spell, Mistwing Duelist gains flying until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','OR-tree wire claim + saturation — but every pool spell is Sorcery-typed, so "instant or sorcery" needs no OR at all.'],['Joe','I like it — broader, more future-proof, cleaner. (mono-U respec)']]},
 {key:'GU_1-1',name:'Riverbend Adept',group:'killed',
  before:{cost:'1U',type:'Creature — Merfolk Wizard',stats:'1/2',rules:'Whenever a creature an opponent controls is returned to its owner\'s hand, put a +1/+1 counter on Riverbend Adept.'},
  after:{cost:'1U',type:'Creature — Merfolk Wizard',stats:'1/2',rules:'(as pitched, + card_is_creature safety term — DIRECTION OPEN)'},
  thread:[['Killer (ship)','First bounce payoff; zero cards condition on card_moves(battlefield, hand). Devastation Tide feeds it N counters.'],
   ['Joe','I made a mistake calling it blink — I meant reusing ETBs and stuff. The architect missed the point somewhere.'],
   ['Fable','Clarifying fact: the reuse-ETBs payoff shape is "whenever another creature enters" — and you just SHIPPED its counter version (Bramble Acolyte). Every blink/bounce-replay/token feeds Acolyte. Riverbend\'s distinct niche is the opp-side bounce (tempo suite, 5 recruits). Recommend: ship as judged; a BLUE Acolyte is a clone decision if you want one.'],['Joe','KILL — bouncing opponents\' creatures is a narrow niche that is generally kinda bad. If that\'s the design we\'re iterating towards, it\'s a kill.'],['Fable','Killed. Ledger note: the bounce-payoff niche is now twice-rejected (Wave 1 twins + this) — future waves stop resurfacing it.']]},
 {key:'GU_1-2',name:'Otter Strategist',group:'ship',bill:true,
  before:{cost:'1U',type:'Creature — Otter Wizard',stats:'1/4',rules:'Whenever you cast a spell during an opponent\'s turn, draw a card.'},
  after:{cost:'1U',type:'Creature — Otter Wizard',stats:'1/4',rules:'Whenever you cast a spell during an opponent\'s turn, draw a card.'},
  thread:[['Killer (kill→Joe overruled)','Same hold-mana niche as Warden; turn-ownership predicate is a new price (~5 lines: opponents_turn).'],['Joe','Ship.']]},
 {key:'GU_2-1',name:'Chrysalis Ward',group:'ship',
  before:{cost:'1U',type:'Sorcery',stats:'',rules:'Flash. Target creature you control gains hexproof and indestructible until end of turn.'},
  after:{cost:'1U',type:'Sorcery',stats:'',rules:'Flash. Target creature you control gains hexproof and gets +0/+1 until end of turn.'},
  thread:[['Killer (refine)','Right instinct (no protection trick exists); retype to Sorcery+flash idiom.'],
   ['Joe','Ship with hexproof, not indestructible (that\'s a lot haha). Down with a minor toughness buff. Like +0/+1?'],
   ['Fable','Yes — hexproof alone does nothing against wraths and combat; +0/+1 gives it a floor. Applied. (Elystra combo now = permanently untargetable, acceptable.)']]},
 {key:'GU_2-2',name:'Rootbinder Druid',group:'ship',
  before:{cost:'1G',type:'Creature — Elf Druid',stats:'1/2',rules:'{G}, {T}: Target land becomes a 2/2 green Elemental creature until end of turn. It\'s still a land.'},
  after:{cost:'1G',type:'Creature — Elf Druid',stats:'1/2',rules:'{G}, {T}: Target land becomes a 2/2 green Elemental creature until end of turn. It\'s still a land.'},
  thread:[['Killer (kill→Joe overruled)','Fifth land animator, no payoff — but Joe shipped Canopy Sentinel WITH it: the pair dissolves the objection (animator + payoff package).'],
   ['Joe','What happens if this targets a land that\'s already a creature? (Curious, not blocking.)'],
   ['Fable','Pinning it with a test at build. Expected: type-grant unions harmlessly, the 2/2 stat-set refreshes for the turn. If it stacks weirdly, better to find out now.']]},
 {key:'GW_1-2',name:'Canopy Sentinel',group:'ship',
  before:{cost:'1GW',type:'Creature — Treefolk',stats:'2/4',rules:'Canopy Sentinel has vigilance. Lands you control that are creatures have vigilance.'},
  after:{cost:'1GW',type:'Creature — Treefolk',stats:'2/4',rules:'Vigilance. Lands you control that are creatures have vigilance.'},
  thread:[['Killer (kill→Joe overruled)','Hyper-marginal rider — but wire-plausible (animated lands pass the Creature gate).'],['Joe','Clever — Treefolk often have vigilance, and "lands have vigilance" is VERY good in the deck that wants it. (Ships with Rootbinder as the land-animation package.)']]},
 {key:'GW_2-0',name:'Bramble Acolyte',group:'ship',
  before:{cost:'2G',type:'Creature — Elf Druid',stats:'1/2',rules:'Whenever another creature enters the battlefield under your control, put a +1/+1 counter on Bramble Acolyte.'},
  after:{cost:'2G',type:'Creature — Elf Druid',stats:'1/2',rules:'Whenever another creature enters the battlefield under your control, put a +1/+1 counter on Bramble Acolyte.'},
  thread:[['Killer (kill→Joe overruled)','Beast Whisperer owns the enters-payoff plan (draw currency).'],['Joe','Ship.'],['Fable','Note: this IS the reuse-ETBs counter-payoff — every blink/bounce-replay/token feeds it. Relevant to the Riverbend discussion.']]},
 {key:'GW_3-0',name:'Mourning Shepherd',group:'ship',
  before:{cost:'1GW',type:'Creature — Human Cleric',stats:'2/3',rules:'Whenever a creature you control dies, put a +1/+1 counter on target creature you control.'},
  after:{cost:'1BG',type:'Creature — Human Cleric',stats:'2/3',rules:'Whenever a creature you control dies, put a +1/+1 counter on target creature you control.'},
  thread:[['Killer (kill→Joe overruled)','Bone Collector\'s plan in a flexible body.'],['Joe','Ship, but as BG.']]},
 {key:'RG_0-0',name:'Skullcrag Igniter',group:'ship',
  before:{cost:'1R',type:'Creature — Goblin Shaman',stats:'2/1',rules:'{T}, Sacrifice a creature: Skullcrag Igniter deals 2 damage to any target.'},
  after:{cost:'1R',type:'Creature — Goblin Shaman',stats:'2/1',rules:'{T}, Sacrifice a creature: Skullcrag Igniter deals 2 damage to any target.'},
  thread:[['Killer (ship)','Third sac-outlet, genuinely different plan: bodies→damage (feeder=board, ferryman=cards). Makes Threaten a two-for-one.']]},
 {key:'RG_1-0',name:'Bramblefang Provoker',group:'ship',bill:true,
  before:{cost:'1RG',type:'Creature — Elemental Wolf',stats:'2/2',rules:'Whenever you cast a spell that changes a creature\'s power or toughness until end of turn, Bramblefang Provoker deals 1 damage to any target.'},
  after:{cost:'1RG',type:'Creature — Elemental Wolf',stats:'2/2',rules:'Spells you cast also deal 1 damage to their targets.'},
  thread:[['Killer (kill→Joe overruled)','Strictly narrower storm_caller as pitched; the forced-redirect respec differentiates it.'],
   ['Architect','LOAD-BEARING TIMING TRAP as a trigger: spell-cast triggers resolve ABOVE the spell — flashing Giant Growth to save a 1-toughness blocker pings it dead BEFORE the pump lands.'],
   ['Joe','Do we need the "targets a creature" rider — duress dealing 1 damage seems fine? Wild idea: what if it actually MODIFIED the spell? "Spells also deal 1 damage to each of their targets."'],
   ['Fable','Your wild idea is secretly the bug fix: a static modifier applies at RESOLUTION — after the pump lands — dissolving the trap entirely. ~25-40 lines, new but clean. I\'d build the static version.'],['Joe','Why do we specify creature? Should this work on, say, duress? Seems potentially cool.'],['Fable','It should — extending to players is clean and very red: "Spells you cast also deal 1 damage to each creature or player they target." mind_rot pings the opponent, bolt does +1. Spell-targets (counterspells) stay excluded — you can\'t damage a spell, and pinging its controller is cute but muddy. AFTER updated.'],['Joe','"Spells you cast also deal 1 damage to their targets."?'],['Fable','Yes — cleaner. Implementation skips non-damageable targets (a countered spell just isn\'t pinged), so the text stays simple and true. Adopted.']]},
 {key:'RG_1-1',name:'Warhorn Rampager',group:'ship',
  before:{cost:'1R',type:'Creature — Beast',stats:'2/1',rules:'Whenever another creature you control attacks, Warhorn Rampager gets +1/+0 until end of turn.'},
  after:{cost:'1R',type:'Creature — Beast',stats:'2/1',rules:'Whenever another creature you control attacks, Warhorn Rampager gets +1/+0 until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','Warchanter\'s plan inverted.'],['Joe','Nah, this is a super cool variant on warchanter.']]},
 {key:'RG_2-2',name:'Landstrider Cub',group:'ship',
  before:{cost:'1G',type:'Creature — Beast',stats:'1/2',rules:'Whenever a land enters the battlefield under your control, put a +1/+1 counter on Landstrider Cub.'},
  after:{cost:'1G',type:'Creature — Beast',stats:'1/1',rules:'Whenever a land enters the battlefield under your control, put a +1/+1 counter on Landstrider Cub.'},
  thread:[['Killer (ship)','Won the 4-way landfall contest. Its extraction rule fixes the false-etb wart.'],['Joe','Ship as 1/1 I think.']]},
 {key:'RG_3-0',name:'Wildfire Colossus',group:'ship',
  before:{cost:'1RG',type:'Creature — Elemental',stats:'2/3',rules:'Whenever you cast an instant or sorcery that deals damage, put a +1/+1 counter on Wildfire Colossus.'},
  after:{cost:'1RG',type:'Creature — Elemental',stats:'2/3',rules:'Whenever you cast a sorcery that deals damage, put a +1/+1 counter on Wildfire Colossus.'},
  thread:[['Killer (ship)','New niche: no burn-matters payoff. Reframes symmetric sweepers as fuel. cardHasEffect scans only spell effects — ETB pingers correctly don\'t trigger it.'],
   ['Joe','As templated, does this trigger on creatures with ETBs? Does it SEEM like it would?'],
   ['Fable','No and no: casting flame_wisp does nothing (spell-level scan only), and the text says "sorcery," so it doesn\'t read like creatures count. Text and engine agree. Convalescent Firebrand\'s new predicate covers exactly the ETB side.'],['Joe','Sorry, I thought it said "spells". Can you check and see if this drifted?'],['Fable','Checked — no functional drift. The pitch said "instant or sorcery," which in this pool equals "sorcery" (every spell is Sorcery-typed; there is no Instant). Bare "spell" would be the WRONG word — it would suggest creature casts count, and they don\'t. The card text will read "sorcery."']]},
 {key:'RW_2-2',name:'Scrap the Machine',group:'ship',
  before:{cost:'R',type:'Sorcery',stats:'',rules:'Flash. Destroy target artifact creature.'},
  after:{cost:'R',type:'Sorcery',stats:'',rules:'Flash. Destroy target artifact.'},
  thread:[['Killer (ship)','Artifact-hate niche; the two-card combo with brand_of_iron is a drafted plan.'],['Joe','Probably just "destroy target artifact", right?'],['Fable','Agreed — rides golem_forge\'s permanent+filter shape, no new primitive. Applied.']]},
 {key:'RW_3-2',name:'Flintlock Duelist',group:'ship',bill:true,
  before:{cost:'1R',type:'Creature — Human Rogue',stats:'2/1',rules:'Whenever you activate an activated ability of a creature you control, Flintlock Duelist deals 1 damage to target opponent.'},
  after:{cost:'1R',type:'Creature — Human Rogue',stats:'2/1',rules:'Whenever you activate an ability of a creature you control, Flintlock Duelist deals 1 damage to target opponent.'},
  thread:[['Killer (ship)','Genuinely new niche (activations-matter) with rich providers. Price: ability_activated event, ~15-20 lines.'],
   ['Joe','Do we need "target opponent", or can we say "your opponent"?'],
   ['Fable','Functionally identical in a duel. Keep target:opp in the wire — blood_artist/toll_of_secrets house shape, auto-resolves with zero prompts — and "target opponent loses..." is already the pool\'s voice. Mana abilities structurally excluded (off-stack path); pinned by test.'],['Joe','Do those require targeting in the UI? We don\'t want unnecessary clicks if there\'s only ever one thing to click.'],['Fable','Zero clicks — the engine auto-fills implicit target types on triggers (the trigger-prompt code: "forced (one legal target) and implicit (opp/player/self/spell) slots auto-fill"). Only genuine choices ever prompt. Blood_artist has drained opponents promptlessly all along.'],['Joe','Does blood artist actually DISPLAY to the player as a targeted ability?'],['Fable','No targeting interaction exists for it — no picker, no arrow, no highlight. The only "targeted" signal is the WORD "target" in the generated text ("target opponent loses 1 life") and in the trigger log line. If that word bothers you, the honest fix is a uniform text-voice change: render implicit opp-targets as "Your opponent loses 1 life" pool-wide (~5-line generator tweak + test updates, touches blood_artist/toll_of_secrets/underboss/flintlock identically). MTG says "target opponent" even in 1v1; a 1v1 roguelike can fairly say "your opponent." Your style call — Flintlock ships either way.']]},
 {key:'GW_2-1',name:'Timberland Strider',group:'ship',
  before:{cost:'2G',type:'Creature — Elf Scout',stats:'2/2',rules:'Whenever a land enters the battlefield under your control, Timberland Strider gets +1/+1 until end of turn.'},
  after:{cost:'G',type:'Creature — Elf Scout',stats:'1/1',rules:'Whenever a land enters the battlefield under your control, Timberland Strider gets +1/+1 until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','Weakest landfall pitch — but at G 1/1 it\'s a different card.'],['Joe','1/1 for G.'],['Fable','Cub (permanent) and Strider (tempo) are different landfall rewards; both fine.']]},
 {key:'GW_2-2',name:'Glade Marshal',group:'ship',bill:true,
  before:{cost:'2W',type:'Creature — Human Soldier',stats:'2/3',rules:'Whenever you cast a spell that gives a creature +X/+X, target creature you control gains vigilance until end of turn.'},
  after:{cost:'2W',type:'Creature — Human Soldier',stats:'2/3',rules:'Whenever you cast a spell, each creature it targets gains vigilance until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','Tricks-matter went to Yearling; Joe respec\'d to the targets-a-creature form.'],
   ['Joe','Not seeing the issue justifying the architect\'s single-target rider. Which cards break?'],
   ['Fable','Two, by name: roots_and_branches (slot 0 taps THEIR creature, slot 1 pumps yours) and sword_and_sorcery (same split). On multi-target spells "that creature" is ambiguous — naive reads grant THEIR creature vigilance or fire twice. The rider is the honest scope. Alternative: "each creature it targets" (occasionally pumps theirs, harmless-weird).'],['Joe','If we grant a creature vigilance and then tap it, that\'s weird but not harmful, is it? Complexity is not a bad thing in a ccg.'],['Fable','Agreed — rider dropped. Going with "each creature it targets": fires on multi-target spells, occasionally gifts their creature vigilance, embraced as texture. Shares the event-target plumbing with Bramblefang\'s family. AFTER updated.']]},
 {key:'GU_3-0',name:'Slack Tide',group:'ship',
  before:{cost:'1GU',type:'Sorcery',stats:'',rules:'Flash. Untap target creature you control. It gains vigilance until end of turn.'},
  after:{cost:'1WU',type:'Sorcery',stats:'',rules:'Flash. Untap target creature you control. It gains vigilance until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','awaken_the_stone + rider.'],['Joe','Definitely 1WU, not 1UG.'],['Fable','Applied — the vigilance rider is white.']]},
 {key:'RW_0-1',name:'Chapter Recruiter',group:'ship',
  before:{cost:'1W',type:'Creature — Human Soldier',stats:'1/1',rules:'Whenever another Human enters the battlefield under your control, put a +1/+1 counter on Chapter Recruiter.'},
  after:{cost:'1WW',type:'Creature — Human Soldier',stats:'1/1',rules:'Whenever another Human enters the battlefield under your control, put a +1/+1 counter on Chapter Recruiter.'},
  thread:[['Killer (kill→Joe overruled)','62/306 cards are Human — near-constant trigger; free stats not a plan.'],
   ['Architect','Re-cost to 3 mana: at 2 it out-rates ajanis_pridemate given Human density.'],
   ['Joe','Fine as 1/1 for 2W. Might even want 1WW.'],['Fable','Taking your lean: 1WW 1/1. Applied.']]},
 {key:'RW_1-1',name:'Banner of the Vanguard',group:'ship',
  before:{cost:'1WR',type:'Creature — Human Soldier',stats:'2/2',rules:'Other creatures you control get +1/+0.'},
  after:{cost:'2WR',type:'Creature — Human Soldier',stats:'2/2',rules:'Other creatures you control get +1/+0.'},
  thread:[['Killer (kill→Joe overruled)','Filterless anthem, generically good.'],['Joe','Could be interesting as a bad card lol. 2WR, 2/2.']]},
 {key:'RW_2-1',name:'Skyward Tactician',group:'ship',
  before:{cost:'2W',type:'Creature — Human Soldier',stats:'2/2',rules:'Flying. Whenever you cast a spell, target creature you control gains flying until end of turn.'},
  after:{cost:'2W',type:'Creature — Human Soldier',stats:'2/2',rules:'Flying. Whenever you cast a spell, target creature you control gains flying until end of turn.'},
  thread:[['Killer (kill→Joe overruled)','Spell-cast saturation — but pays in EVASION, a currency the other payoffs don\'t.'],['Joe','Ship (was: let\'s think about it — resolved by shipping).']]},
 {key:'RW_3-0',name:'Convalescent Firebrand',group:'ship',bill:true,
  before:{cost:'1W',type:'Creature — Human Cleric',stats:'2/2',rules:'Whenever another creature with an enters-the-battlefield damage ability enters the battlefield under your control, you gain 2 life.'},
  after:{cost:'1W',type:'Creature — Human Cleric',stats:'2/2',rules:'Whenever another creature with an enters-the-battlefield damage ability enters the battlefield under your control, you gain 2 life.'},
  thread:[['Killer (kill→Joe overruled)','Broken as designed: card_has_effect only scans spell effects; ETB pingers keep damage in triggers — it never fires.'],
   ['Joe','How hard is this to actually implement?'],
   ['Fable','Small: card_has_etb_effect predicate scanning the cast card\'s ETB triggers (~6 lines) + archetype/preamble (~4). Reusable for any "creatures with ETB X" payoff.']]},
];

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function pips(c){const out=[];for(const ch of String(c||'')){if(/[0-9]/.test(ch))out.push('<span class="pip pip-c">'+ch+'</span>');else if('WUBRG'.includes(ch))out.push('<span class="pip pip-'+ch+'"></span>');}return out.join('')||esc(c);}
function ci(c){return [...new Set(String(c||'').split('').filter(x=>'WUBRG'.includes(x)))].join('')||'C';}
function frame(label,f,changed){return `<div class="half ${changed?'is-changed':''}"><div class="halflabel">${label}</div><header class="cardhead"><h3></h3><span class="cost">${pips(f.cost)}</span></header><div class="typeline"><span>${esc(f.type)}</span>${f.stats?`<span class="stats">${esc(f.stats)}</span>`:''}</div><p class="rules">${esc(f.rules)}</p></div>`;}
function tile(c){
  const changed = JSON.stringify(c.before)!==JSON.stringify(c.after);
  const chips=[`<span class="chip chip-hand">${esc(c.key)}</span>`];
  if(c.group==='discuss')chips.push('<span class="chip chip-cur-hold">IN DISCUSSION</span>');
  else if(c.group==='killed')chips.push('<span class="chip" style="background:var(--kill-bg);color:var(--kill)">KILLED</span>');
  else chips.push('<span class="chip chip-ship">shipping</span>');
  if(c.bill)chips.push('<span class="chip chip-cur-pick">engine bill</span>');
  if(changed)chips.push('<span class="chip chip-changed">rewritten</span>');
  const turns=c.thread.map(([who,text])=>`<div class="turn turn-${who.startsWith('Joe')?'joe':who.startsWith('Fable')?'fable':'agent'}"><span class="who">${esc(who)}</span><p>${esc(text)}</p></div>`).join('');
  return `<article class="card v-${c.group==='discuss'?'hold':c.group==='killed'?'kill':'ship'}" id="${esc(c.key)}">
  <div class="frame frame-pair ci-${ci(c.after.cost)}">
    <div class="half"><div class="halflabel">BEFORE — pitch</div><header class="cardhead"><h3>${esc(c.name)}</h3><span class="cost">${pips(c.before.cost)}</span></header><div class="typeline"><span>${esc(c.before.type)}</span>${c.before.stats?`<span class="stats">${esc(c.before.stats)}</span>`:''}</div><p class="rules">${esc(c.before.rules)}</p></div>
    <div class="arrow" aria-hidden="true">→</div>
    <div class="half ${changed?'is-changed':''}"><div class="halflabel">AFTER — current spec</div><header class="cardhead"><h3>${esc(c.name)}</h3><span class="cost">${pips(c.after.cost)}</span></header><div class="typeline"><span>${esc(c.after.type)}</span>${c.after.stats?`<span class="stats">${esc(c.after.stats)}</span>`:''}</div><p class="rules">${esc(c.after.rules)}</p></div>
  </div>
  <div class="meta">
    <div class="chips">${chips.join('')}</div>
    <div class="thread">${turns}</div>
    <div class="verdictbar" data-card="${esc(c.key)}" data-name="${esc(c.name)}">
      <span class="vlabel">your verdict</span>
      <button type="button" class="vbtn vbtn-ship" data-v="ship">ship</button>
      <button type="button" class="vbtn vbtn-hold" data-v="hold">hold</button>
      <button type="button" class="vbtn vbtn-kill" data-v="kill">kill</button>
    </div>
    <textarea class="vnote" rows="2" placeholder="your reply — no length limit"></textarea>
  </div>
</article>`;
}

const discuss = CARDS.filter(c=>c.group==='discuss');
const killed = CARDS.filter(c=>c.group==='killed');
const ship = CARDS.filter(c=>c.group==='ship');

const html = `<title>Wave 2 — Card Conversations</title>
<style>
:root{--bg:#eef0ec;--panel:#fbfcfa;--panel2:#f3f5f1;--ink:#20241f;--ink-soft:#5a6058;--line:#d7dbd3;--accent:#4a6570;--ship:#2f7d5a;--ship-bg:#e3efe7;--kill:#a53d35;--kill-bg:#f4e5e2;--hold:#b07f2e;--hold-bg:#f4ecdc;--recruit:#34566b;--recruit-bg:#e2ebf1;--shadow:0 1px 3px rgba(32,36,31,.08);}
@media (prefers-color-scheme: dark){:root{--bg:#171a1c;--panel:#212528;--panel2:#1c2022;--ink:#e3e1d8;--ink-soft:#9aa096;--line:#343a3e;--accent:#8fb2bf;--ship:#6cc59a;--ship-bg:#22362d;--kill:#e08a80;--kill-bg:#3a2725;--hold:#d9ab5f;--hold-bg:#38301f;--recruit:#9dc0d6;--recruit-bg:#24313a;--shadow:0 1px 3px rgba(0,0,0,.35);}}
:root[data-theme="dark"]{--bg:#171a1c;--panel:#212528;--panel2:#1c2022;--ink:#e3e1d8;--ink-soft:#9aa096;--line:#343a3e;--accent:#8fb2bf;--ship:#6cc59a;--ship-bg:#22362d;--kill:#e08a80;--kill-bg:#3a2725;--hold:#d9ab5f;--hold-bg:#38301f;--recruit:#9dc0d6;--recruit-bg:#24313a;--shadow:0 1px 3px rgba(0,0,0,.35);}
:root[data-theme="light"]{--bg:#eef0ec;--panel:#fbfcfa;--panel2:#f3f5f1;--ink:#20241f;--ink-soft:#5a6058;--line:#d7dbd3;--accent:#4a6570;--ship:#2f7d5a;--ship-bg:#e3efe7;--kill:#a53d35;--kill-bg:#f4e5e2;--hold:#b07f2e;--hold-bg:#f4ecdc;--recruit:#34566b;--recruit-bg:#e2ebf1;--shadow:0 1px 3px rgba(32,36,31,.08);}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
.wrap{max-width:1060px;margin:0 auto;padding:40px 24px 80px;}
h1,h2,.cardhead h3,.rules{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;}
h1{font-size:2rem;margin:0 0 4px;text-wrap:balance}
.sub{color:var(--ink-soft);margin:0 0 28px;max-width:70ch}
h2{font-size:1.35rem;margin:44px 0 6px;display:flex;align-items:baseline;gap:10px}
h2 .count{font-size:.85rem;font-family:ui-monospace,monospace;border-radius:4px;padding:1px 8px}
#discuss h2 .count{color:var(--hold);background:var(--hold-bg)}
#ship h2 .count{color:var(--ship);background:var(--ship-bg)}
.blurb{color:var(--ink-soft);margin:0 0 18px;max-width:72ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:16px}
@media (max-width:640px){.grid{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.card.v-ship{border-left:4px solid var(--ship)}
.card.v-hold{border-left:4px solid var(--hold)}
.card.v-kill{border-left:4px solid var(--kill);opacity:.75}
.frame{padding:12px 14px;border-bottom:1px solid var(--line);background:var(--panel2)}
.frame-pair{display:flex;gap:10px;align-items:stretch}
.frame-pair .half{flex:1;min-width:0;padding:8px 10px;border-radius:6px;background:var(--panel);border:1px solid var(--line)}
.frame-pair .half.is-changed{border-color:var(--ship);box-shadow:0 0 0 1px var(--ship)}
.frame-pair .arrow{align-self:center;color:var(--ink-soft);font-size:1.2rem;flex-shrink:0}
.halflabel{font:700 .62rem/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);margin-bottom:6px}
@media (max-width:640px){.frame-pair{flex-direction:column}.frame-pair .arrow{transform:rotate(90deg);align-self:flex-start}}
.frame.ci-U{box-shadow:inset 0 3px 0 #6da3c8}.frame.ci-B{box-shadow:inset 0 3px 0 #6b6560}.frame.ci-R{box-shadow:inset 0 3px 0 #cd7a5a}.frame.ci-W{box-shadow:inset 0 3px 0 #cfc99a}.frame.ci-G{box-shadow:inset 0 3px 0 #7fa36f}.frame.ci-C{box-shadow:inset 0 3px 0 #a8a49c}
.frame.ci-GW,.frame.ci-WG{box-shadow:inset 0 3px 0 #7fa36f,inset 0 6px 0 #cfc99a}.frame.ci-WU,.frame.ci-UW{box-shadow:inset 0 3px 0 #cfc99a,inset 0 6px 0 #6da3c8}.frame.ci-GU,.frame.ci-UG{box-shadow:inset 0 3px 0 #7fa36f,inset 0 6px 0 #6da3c8}.frame.ci-RG,.frame.ci-GR{box-shadow:inset 0 3px 0 #cd7a5a,inset 0 6px 0 #7fa36f}.frame.ci-RW,.frame.ci-WR{box-shadow:inset 0 3px 0 #cd7a5a,inset 0 6px 0 #cfc99a}.frame.ci-UR,.frame.ci-RU{box-shadow:inset 0 3px 0 #6da3c8,inset 0 6px 0 #cd7a5a}.frame.ci-BG,.frame.ci-GB{box-shadow:inset 0 3px 0 #6b6560,inset 0 6px 0 #7fa36f}
.cardhead{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.cardhead h3{margin:0;font-size:.95rem}
.cost{display:inline-flex;gap:3px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.pip{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 ui-monospace,monospace;color:#2b2b26;border:1px solid rgba(0,0,0,.25)}
.pip-c{background:#ccc7bd}.pip-W{background:#f5f0d0}.pip-U{background:#a8c9e0}.pip-B{background:#8f8a84}.pip-R{background:#e2926f}.pip-G{background:#97b985}
.typeline{display:flex;justify-content:space-between;font-size:.78rem;color:var(--ink-soft);margin:4px 0 6px}
.stats{font-family:ui-monospace,monospace;font-weight:700;color:var(--ink)}
.rules{margin:0;font-size:.85rem;white-space:pre-line}
.meta{padding:12px 16px 14px;display:flex;flex-direction:column;gap:9px;flex:1}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:.72rem;letter-spacing:.02em;padding:2px 9px;border-radius:20px;border:1px solid transparent}
.chip-hand{background:var(--panel2);border-color:var(--line);color:var(--ink-soft);font-family:ui-monospace,monospace}
.chip-ship{background:var(--ship-bg);color:var(--ship)}
.chip-changed{background:var(--ship-bg);color:var(--ship);border-color:var(--ship)}
.chip-cur-hold{background:var(--hold-bg);color:var(--hold);border-color:var(--hold);font-weight:700}
.chip-cur-pick{background:var(--recruit-bg);color:var(--recruit)}
.thread{display:flex;flex-direction:column;gap:6px}
.turn{border-left:3px solid var(--line);padding:4px 10px;border-radius:0 6px 6px 0;background:var(--panel2)}
.turn-joe{border-left-color:var(--hold);background:var(--hold-bg)}
.turn-fable{border-left-color:var(--accent)}
.turn .who{font:700 .66rem/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft)}
.turn p{margin:3px 0 0;font-size:.84rem}
.verdictbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:10px;border-top:1px dashed var(--line)}
.vlabel{font:700 .68rem/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft)}
.vbtn{font:700 .78rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:5px 14px;border-radius:20px;cursor:pointer;background:var(--panel2);color:var(--ink-soft);border:1px solid var(--line)}
.vbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.vbtn-ship.on{background:var(--ship);color:var(--panel);border-color:var(--ship)}
.vbtn-hold.on{background:var(--hold);color:var(--panel);border-color:var(--hold)}
.vbtn-kill.on{background:var(--kill);color:var(--panel);border-color:var(--kill)}
.vnote{width:100%;min-height:44px;font:inherit;font-size:.84rem;padding:7px 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink);resize:vertical}
.vnote:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.tallybar{position:sticky;bottom:0;z-index:5;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel);border-top:2px solid var(--accent);box-shadow:0 -2px 10px rgba(0,0,0,.12);padding:10px 24px;margin:48px -24px -80px;font-variant-numeric:tabular-nums}
.t-ship{color:var(--ship)}.t-hold{color:var(--hold)}.t-kill{color:var(--kill)}.t-open{color:var(--ink-soft)}
.copybtn{margin-left:auto;font:700 .85rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--accent);color:var(--panel);border:none;border-radius:6px;padding:9px 18px;cursor:pointer}
.copybtn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.copyhint{font-size:.75rem;color:var(--ink-soft);width:100%;margin:0}
</style>
<div class="wrap">
<h1>Wave 2 — Card Conversations</h1>
<p class="sub">Each card carries its own thread: pitch → killer → your verdicts → architect → your questions → my answers.
Reply in any card's box (no length limit), set verdicts, then Copy — the export carries your full replies.
BEFORE/AFTER frames show the pitch vs the current spec; green outline = something changed.
(Rebuilt after a container recycle from the conversation record — designer flavor notes were lost; all rulings, specs, and decisions survived.)</p>

<section id="discuss">
<h2><span class="count">${discuss.length}</span>In discussion — your reply moves these</h2>
<p class="blurb">Each thread ends with my latest answer to your question. Reply inline; a verdict of ship promotes it into the build batch.</p>
<div class="grid">${discuss.map(tile).join('\n')}</div>
</section>

<section id="ship">
<h2><span class="count">${ship.length}</span>Shipping — staged for the build</h2>
<p class="blurb">Your 18 ships with all respecs applied (1WW Recruiter, 2WR Banner, 1WU Slack Tide, 1/1 Cub, G 1/1 Strider, mono-U Mistwing, BG Shepherd, "destroy target artifact" Scrap). Veto or annotate anything here too.</p>
<div class="grid">${ship.map(tile).join('\n')}</div>
</section>

${killed.length ? `<section id="killed"><h2><span class="count" style="color:var(--kill);background:var(--kill-bg)">${killed.length}</span>Killed</h2><div class="grid">${killed.map(tile).join('\n')}</div></section>` : ''}

<div class="tallybar" id="tallybar">
  <span>Verdicts:</span>
  <span class="t-ship"><b id="n-ship">0</b> ship</span>
  <span class="t-hold"><b id="n-hold">0</b> hold</span>
  <span class="t-kill"><b id="n-kill">0</b> kill</span>
  <span class="t-open"><b id="n-open">${CARDS.length}</b> unset</span>
  <button type="button" class="copybtn" id="copybtn">Copy replies + verdicts for Claude</button>
  <p class="copyhint">Replies and verdicts persist in this browser. The export includes your full reply text per card — paste it in the chat and each reply lands in that card's thread.</p>
</div>
</div>
<script>
(function () {
  var KEY = 'wave2_convo_v1';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { state = {}; }
  var bars = Array.prototype.slice.call(document.querySelectorAll('.verdictbar'));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function paint(bar) {
    var id = bar.getAttribute('data-card');
    var cur = state[id] || {};
    bar.querySelectorAll('.vbtn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === cur.v);
    });
    var ta = bar.parentElement.querySelector('.vnote');
    if (ta && ta.value !== (cur.note || '')) ta.value = cur.note || '';
  }
  function tally() {
    var n = { ship: 0, hold: 0, kill: 0 };
    bars.forEach(function (bar) {
      var cur = state[bar.getAttribute('data-card')];
      if (cur && cur.v) n[cur.v]++;
    });
    document.getElementById('n-ship').textContent = n.ship;
    document.getElementById('n-hold').textContent = n.hold;
    document.getElementById('n-kill').textContent = n.kill;
    document.getElementById('n-open').textContent = bars.length - n.ship - n.hold - n.kill;
  }
  bars.forEach(function (bar) {
    var id = bar.getAttribute('data-card');
    bar.querySelectorAll('.vbtn').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-v');
        var cur = state[id] || {};
        cur.v = (cur.v === v) ? null : v;
        state[id] = cur; save(); paint(bar); tally();
      });
    });
    var ta = bar.parentElement.querySelector('.vnote');
    if (ta) ta.addEventListener('input', function (e) {
      var cur = state[id] || {}; cur.note = e.target.value; state[id] = cur; save();
    });
    paint(bar);
  });
  tally();
  document.getElementById('copybtn').addEventListener('click', function () {
    var lines = ['WAVE 2 CARD CONVERSATIONS — replies + verdicts', ''];
    bars.forEach(function (bar) {
      var id = bar.getAttribute('data-card');
      var name = bar.getAttribute('data-name');
      var cur = state[id] || {};
      if (!cur.v && !cur.note) return;
      lines.push('## ' + name + ' [' + id + ']' + (cur.v ? ' — ' + cur.v.toUpperCase() : ''));
      if (cur.note) lines.push(cur.note);
      lines.push('');
    });
    if (lines.length === 2) lines.push('(no verdicts or replies set)');
    var text = lines.join('\\n');
    var done = function () {
      var btn = document.getElementById('copybtn');
      var old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    } else { fallback(text); done(); }
    function fallback(t) {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
})();
</script>`;

const outDir = process.argv[2] || __dirname;
fs.writeFileSync(path.join(outDir, 'wave2-cutsheet.html'), html);
console.log('wrote wave2-cutsheet.html', html.length, 'bytes | discuss:', discuss.length, 'ship:', ship.length);
