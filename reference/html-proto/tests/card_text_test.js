// Card-text regression test. Locks in the rendered output of the
// describe* family (extracted from engine.js to js/card-text.js in
// v1.0.134) so future edits can't silently change what shows up on
// cards in the browser.
//
// Two layers:
//
//   Synthetic effects:   build a hand-rolled effect object, call
//                        describeEffect(eff), assert exact output.
//                        One per branch of the switch (one per case
//                        + a few subcases like dynamic-amount).
//
//   Real-card end-to-end: pull a known template from CARDS, build
//                         the card via ENGINE.makeCard, call
//                         describeCardSegments → segsToText. Catches
//                         regressions in the orchestration path
//                         (section ordering, keyword preamble,
//                         trigger preamble lowercasing, etc.)
//
// What this does NOT cover: visual rendering. The `highlight: true`
// flag on a bumped segment is asserted, but how the renderer paints
// it is the browser's job.

const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': ' + label + (info ? ' -- ' + info : ''));
  if (ok) pass++; else fail++;
}

// eqText: shared-subject "deal X damage to T1 and Y damage to T2"
// strips through describeEffectList. For per-effect assertions we
// flatten the segment array to a plain string via segsToText.
function eqText(actual, expected, label) {
  const ok = actual === expected;
  check(label, ok, ok ? '' : 'got "' + actual + '"');
}

// ─── describeAmount ───────────────────────────────────────────────────
console.log('=== describeAmount ===');
eqText(describeAmount(3), '3', 'integer passes through');
eqText(describeAmount({ from: 'targetPower' }), "the target's power",
       'dynamic value maps to phrase');
eqText(describeAmount({ from: 'unknownThing' }), 'X (unknownThing)',
       'unknown dynamic value falls back to "X (id)"');

// ─── describeEffect cases ─────────────────────────────────────────────
console.log('\n=== describeEffect: damage / damageAll / gainLife ===');
eqText(segsToText(describeEffect({ kind: 'damage', target: 'creature', amount: 3 })),
       'deal 3 damage to target creature', 'damage to creature');
eqText(segsToText(describeEffect({ kind: 'damage', target: 'self', amount: 2 })),
       'you take 2 damage', 'damage to self (life-loss phrasing)');
eqText(segsToText(describeEffect({ kind: 'damage', target: 'player', amount: 3 })),
       'deal 3 damage to target opponent', 'damage to player → "opponent"');
eqText(segsToText(describeEffect({ kind: 'damage', amount: 2, scope: 'all_creatures' })),
       'deal 2 damage to each creature', 'damage+scope → "each creature"');
eqText(segsToText(describeEffect({ kind: 'gainLife', target: 'self', amount: 3 })),
       'you gain 3 life', 'gainLife self');
eqText(segsToText(describeEffect({ kind: 'gainLife', amount: { from: 'targetPower' },
                                   target: 'creature' })),
       'you gains life equal to the target\'s power',
       'gainLife with dynamic amount and default owner');

console.log('\n=== describeEffect: draw / discard ===');
eqText(segsToText(describeEffect({ kind: 'draw', amount: 1 })),
       'draw a card', 'draw 1 uses "a card"');
eqText(segsToText(describeEffect({ kind: 'draw', amount: 3 })),
       'draw 3 cards', 'draw N>1 pluralizes');
eqText(segsToText(describeEffect({ kind: 'discard', target: 'player', amount: 2 })),
       'target player discards 2 cards', 'opponent discard');

console.log('\n=== describeEffect: pump / weaken / addCounter ===');
eqText(segsToText(describeEffect({ kind: 'pump', target: 'creature', power: 2, toughness: 2 })),
       'target creature gets +2/+2 until end of turn', 'pump generic');
eqText(segsToText(describeEffect({ kind: 'pump', target: 'self', power: 3, toughness: 3 })),
       'this creature gets +3/+3 until end of turn', 'pump self');
eqText(segsToText(describeEffect({ kind: 'pump', target: 'creature', power: -2, toughness: -2 })),
       'target creature gets -2/-2 until end of turn', 'signed pump (weaken)');
eqText(segsToText(describeEffect({ kind: 'addCounter', target: 'self', power: 1, toughness: 1 })),
       'put a +1/+1 counter on this', 'counter on self');

console.log('\n=== describeEffect: removeCreature severity ladder ===');
eqText(segsToText(describeEffect({ kind: 'removeCreature', target: 'creature', severity: 1 })),
       'tap target creature', 'sev 1 = tap');
eqText(segsToText(describeEffect({ kind: 'removeCreature', target: 'creature', severity: 2 })),
       "return target creature to its owner's hand", 'sev 2 = return');
eqText(segsToText(describeEffect({ kind: 'removeCreature', target: 'creature', severity: 3 })),
       'destroy target creature', 'sev 3 = destroy');
eqText(segsToText(describeEffect({ kind: 'removeCreature', target: 'creature', severity: 4 })),
       'exile target creature', 'sev 4 = exile');

console.log('\n=== describeEffect: addMana / counter / fightTarget ===');
eqText(segsToText(describeEffect({ kind: 'addMana', mana: '{R}{R}' })),
       'add {R}{R}', 'addMana with literal symbols');
eqText(segsToText(describeEffect({ kind: 'addMana', amounts: { R: 2, G: 1 } })),
       'add {R}{R}{G}', 'addMana with color-counts dict');
eqText(segsToText(describeEffect({ kind: 'counter', target: 'spell' })),
       'counter target spell', 'counterspell');
eqText(segsToText(describeEffect({ kind: 'fightTarget', target: 'creature' })),
       'your strongest creature fights target creature', 'fightTarget');

console.log('\n=== describeEffect: tokens (count-bumped wording) ===');
// No TOKENS lookup → falls back to "1/1 creature" stats with a sensible
// default niceName. Word count: "one", "two", ...
eqText(segsToText(describeEffect({ kind: 'createTokens', count: 1, tokenId: 'goblin' })),
       'create a 1/1 Goblin token', 'create 1 token uses "a"');
eqText(segsToText(describeEffect({ kind: 'createTokens', count: 2, tokenId: 'goblin' })),
       'create two 1/1 Goblin tokens', 'create N>1 uses word count');

console.log('\n=== describeEffect: edge cases ===');
eqText(segsToText(describeEffect({ kind: 'noop' })), '', 'noop renders empty');
eqText(segsToText(describeEffect({ kind: 'totallyUnknownEffect' })),
       '[totallyUnknownEffect]', 'unknown kind → debug fallback');

// ─── withFilter / targetPhrase ────────────────────────────────────────
console.log('\n=== targetPhrase + withFilter ===');
eqText(targetPhrase({ target: 'creature' }), 'target creature', 'creature target');
eqText(targetPhrase({ target: 'player', kind: 'gainLife' }), 'target player',
       'player+gainLife → "player" not "opponent"');
eqText(targetPhrase({ target: 'player', kind: 'damage' }), 'target opponent',
       'player+damage → "opponent"');
eqText(withFilter('target creature', { filter: { color: 'R', controller: 'opp' } }),
       'target Red creature an opponent controls',
       'color + controller filter');
eqText(withFilter('target creature', { filter: { minPower: 4 } }),
       'target creature with power 4 or greater', 'stat filter');

// ─── bumpedSeg highlight detection ────────────────────────────────────
console.log('\n=== bumpedSeg highlight flag ===');
{
  const eff = { amount: 5 };
  const tpl = { amount: 3 };
  const seg = bumpedSeg('amount', eff, tpl);
  check('value bumped → highlight=true', seg.highlight === true && seg.text === '5');
  const segNoBump = bumpedSeg('amount', { amount: 3 }, { amount: 3 });
  check('value unchanged → highlight=false', segNoBump.highlight === false);
  const segNoTpl = bumpedSeg('amount', { amount: 3 }, undefined);
  check('no tpl baseline → highlight=false', segNoTpl.highlight === false);
}

// ─── describeStaticBuff (lord text) ───────────────────────────────────
console.log('\n=== describeStaticBuff ===');
eqText(describeStaticBuff({ subtype: 'Goblin', power: 1, toughness: 1,
                            filter: { controller: 'self' } }),
       'Other Goblins you control get +1/+1.', 'lord +1/+1');
eqText(describeStaticBuff({ subtype: 'Spirit', filter: { controller: 'self' },
                            keywords: ['flying'] }),
       'Other Spirits you control have flying.', 'lord granting flying');
eqText(describeStaticBuff({}), '', 'empty buff → empty string');

// ─── describeAbility / describeTrigger preamble ───────────────────────
console.log('\n=== describeAbility ===');
eqText(segsToText(describeAbility({ cost: { tap: true },
                                    effects: [{ kind: 'addMana', mana: '{R}' }] })),
       '{T}: add {R}', 'tap → add mana');
eqText(segsToText(describeAbility({ cost: { mana: { R: 1 }, tap: true },
                                    effects: [{ kind: 'damage', target: 'creature', amount: 1 }] })),
       '{T}, {R}: deal 1 damage to target creature', '{T},{R} damage');

console.log('\n=== describeTrigger ===');
eqText(segsToText(describeTrigger({ event: 'card_zone_change',
                                    condition: ['this_card', 'card_moves(anywhere, battlefield)'],
                                    effects: [{ kind: 'draw', amount: 1 }] })),
       'When this enters the battlefield, draw a card.', 'ETB → draw');
eqText(segsToText(describeTrigger({ event: 'attacks',
                                    condition: ['this_card'],
                                    effects: [{ kind: 'damage', target: 'player', amount: 1 }] })),
       'When this attacks, deal 1 damage to target opponent.', 'attacks → damage');

// ─── describeModalSegs ────────────────────────────────────────────────
console.log('\n=== describeModalSegs ===');
{
  const modes = [
    [{ kind: 'damage', target: 'creature', amount: 2 }],
    [{ kind: 'draw', amount: 2 }],
  ];
  // The em-dash is U+2014. Source the literal from the output so we
  // don't have to encode it in this file's string.
  const out = segsToText(describeModalSegs(modes));
  check('modal: starts with Choose one',
        out.startsWith('Choose one'), 'got "' + out + '"');
  check('modal: includes both modes',
        /deal 2 damage to target creature/i.test(out)
        && /draw 2 cards/i.test(out), 'got "' + out + '"');
  check('modal: joiner is "; or "',
        /; or /.test(out), 'got "' + out + '"');
  check('modal: ends in period',
        out.endsWith('.'), 'got "' + out + '"');
}

// ─── End-to-end: real card from CARDS ─────────────────────────────────
console.log('\n=== describeCardSegments end-to-end on real cards ===');
{
  // Lightning Bolt — instant, damage:any-target,3. Auto-generated text
  // (no customText flag) should structurally match the hand-authored
  // text "Deal 3 damage to any target."
  const bolt = CARDS.bolt;
  check('CARDS.bolt exists', !!bolt);
  if (bolt) {
    const card = ENGINE.makeCard('bolt');
    const text = describeCardText(card);
    check('Bolt text contains "3" and "damage"',
          /\b3\b/.test(text) && /damage/.test(text),
          'got "' + text + '"');
    check('Bolt text references "any target"',
          /any target/.test(text), 'got "' + text + '"');
  }
  // Mountain — basic land with no rules content. describeCardText
  // should return empty string (no preamble, no effects, no abilities
  // on the template). The browser shows just art + type, which is
  // correct MTG-style for a basic land.
  const mtn = CARDS.mountain;
  if (mtn) {
    const card = ENGINE.makeCard('mountain');
    const text = describeCardText(card);
    check('Mountain renders empty rules text (basic land)',
          text === '', 'got "' + text + '"');
  }
}

// ─── End-to-end: bumped value produces highlight=true segment ─────────
// We sidestep the empower-roll machinery (applyEmpowerRoll has a
// {location, subIdx, effIdx, field} shape that varies by card shape)
// and just mutate the live card's effect amount directly. The
// highlight logic compares card.effects[i] against
// CARDS[tplId].effects[i], so any divergence should produce a
// highlighted segment.
console.log('\n=== bumped value → highlight=true on the bumped segment ===');
{
  const bolt = CARDS.bolt;
  if (bolt) {
    const card = ENGINE.makeCard('bolt');
    card.effects[0].amount = 4;  // simulate +1 empower bump (tpl is 3)
    const segs = describeCardSegments(card);
    const bumpedSegs = segs.filter(s => s.highlight === true);
    check('At least one segment is highlighted after bumping amount',
          bumpedSegs.length >= 1,
          'segments: ' + JSON.stringify(segs.map(s => s.text + (s.highlight ? '*' : ''))));
    check('The bumped segment carries the live value "4"',
          bumpedSegs.some(s => s.text === '4'),
          'highlighted texts: ' + JSON.stringify(bumpedSegs.map(s => s.text)));
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail > 0 ? 1 : 0);
