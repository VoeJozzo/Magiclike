// =========================================================================
// CARD TEXT — Card-text generation helpers. Turns card data
// (effects, triggers, abilities, static buffs, modal effects) into the
// human-readable rules text shown on cards in the UI and in card popups.
//
// Pure read-only: doesn't mutate game state. Operates on card *instances*
// (which carry sticker/empower bumps) but takes optional `tpl*` baseline
// arguments to diff against — bumped numeric values get marked
// `highlight: true` so the renderer can visually emphasize them.
//
// Output shape: most functions return an array of `{text, highlight}`
// segments. `describeCardText` is the flat-string convenience wrapper.
//
// Called by makeCard (engine.js) after stickers are applied, by render.js
// and controller.js to render card popups, and by the deck-viewer fallback.
// Cards with `customText: true` (Endomorph, Codex, Elystra) opt out — their
// hand-authored `text` is used verbatim.
//
// Single ENGINE dependency: `ENGINE.synthesizeStapledTemplate` is consulted
// inside describeCardSegments when describing stapled cards, guarded by a
// `typeof ENGINE !== 'undefined'` check so this file can load before ENGINE.
// All other helpers in this file are self-contained.
// =========================================================================

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const NUM_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

// targetPhrase: eff.target → noun phrase. target:'player' reads as "target
// opponent" for damage/discard (offensive context) but "target player" for
// gainLife (either-direction). target:'self' resolves at call site.
function targetPhrase(eff) {
  const t = eff.target;
  if (t === 'self')     return 'you';
  if (t === 'player') {
    if (eff.kind === 'gainLife') return 'target player';
    if (eff.kind === 'discard')  return 'target player';
    return 'target opponent';
  }
  if (t === 'creature') return 'target creature';
  if (t === 'graveyardCreature') return 'target creature card';
  if (t === 'permanent')return 'target permanent';
  if (t === 'spell')    return 'target spell';
  if (t === 'any')      return 'any target';
  if (t === 'card')     return 'target card';
  return t || '';
}

// withFilter: apply eff.filter to a noun phrase. Filters add adjectives
// before the noun ("tapped creature", "non-Black creature") or modifying
// clauses after ("creature with flying", "creature you control").
// Pre-modifiers are stat/color-style; post-modifiers are relational.
function withFilter(noun, eff) {
  if (!eff.filter) return noun;
  const f = eff.filter;
  const pre = [];
  const post = [];
  if (f.tapped === true)  pre.push('tapped');
  if (f.tapped === false) pre.push('untapped');
  if (f.color)            pre.push(COLOR_NAMES[f.color] || f.color);
  if (f.notColor)         pre.push('non-' + (COLOR_NAMES[f.notColor] || f.notColor));
  // Subtype: "Spirit creature card", "Goblin creature", etc. The subtype
  // is a literal string from the card data — we trust it to be properly
  // capitalized at the source (e.g., 'Spirit', 'Goblin', 'Wizard Artificer').
  if (f.subtype)          pre.push(f.subtype);
  if (f.hasKeyword)       post.push('with ' + f.hasKeyword);
  if (f.notKeyword)       post.push('without ' + f.notKeyword);
  if (f.controller === 'you' || f.controller === 'self') post.push('you control');
  if (f.controller === 'opp') post.push('an opponent controls');
  // Stat filters: "with toughness N or less", "with power N or greater".
  if (typeof f.maxTough === 'number') post.push('with toughness ' + f.maxTough + ' or less');
  if (typeof f.minTough === 'number') post.push('with toughness ' + f.minTough + ' or greater');
  if (typeof f.maxPower === 'number') post.push('with power ' + f.maxPower + ' or less');
  if (typeof f.minPower === 'number') post.push('with power ' + f.minPower + ' or greater');
  let out = noun;
  if (pre.length) {
    out = out.replace('creature', pre.join(' ') + ' creature')
             .replace('permanent', pre.join(' ') + ' permanent');
  }
  if (post.length) out += ' ' + post.join(' ');
  return out;
}

// describeAmount: numeric values pass through; dynamic-value objects like
// {from:'targetPower'} get a player-readable phrase. Used for damage,
// gainLife, and any other field that might reference resolve-time values.
function describeAmount(amount) {
  if (typeof amount === 'number') return String(amount);
  if (amount && typeof amount === 'object' && amount.from) {
    const dynMap = {
      targetPower:    "the target's power",
      targetTough:    "the target's toughness",
      sourcePower:    "this creature's power",
      sourceToughness:"this creature's toughness",
      manaSpent:      'mana spent on it',
    };
    return dynMap[amount.from] || ('X (' + amount.from + ')');
  }
  return String(amount);
}

// Segment-tagged value: emit a numeric (or otherwise comparable) field as a
// segment, marking it `highlight: true` if the live value differs from the
// template baseline. This is how empower-bumped values get visual emphasis
// in the rendered card text. tplEff may be undefined (no baseline available
// → no highlights). The non-tpl callsites pass undefined, the bumped check
// silently skips.
function bumpedSeg(field, eff, tplEff, fallback) {
  const v = eff[field] !== undefined ? eff[field] : fallback;
  const tplV = tplEff ? (tplEff[field] !== undefined ? tplEff[field] : fallback) : undefined;
  const bumped = tplEff != null
    && typeof v === 'number' && typeof tplV === 'number'
    && v !== tplV;
  return { text: String(v), highlight: bumped };
}

// Like bumpedSeg but takes a precomputed display string (e.g. severity tier
// name "destroy" / "exile" derived from numeric severity). Highlights when
// the underlying numeric source differs from the template baseline.
function bumpedDerived(displayText, sourceField, eff, tplEff) {
  const v = eff[sourceField];
  const tplV = tplEff ? tplEff[sourceField] : undefined;
  const bumped = tplEff != null
    && typeof v === 'number' && typeof tplV === 'number'
    && v !== tplV;
  return { text: displayText, highlight: bumped };
}

// Plain non-highlighted segment.
function plainSeg(text) {
  return { text, highlight: false };
}

// describeEffect: render a single effect as an array of {text, highlight}
// segments. Lowercase-leading so the caller can decide capitalization.
// `tplEff` (optional) is the corresponding template effect for diff
// comparison — values that differ from the baseline get marked for visual
// highlighting in the renderer. Without tplEff, no highlights are emitted.
function describeEffect(eff, tplEff) {
  const t = withFilter(targetPhrase(eff), eff);
  const amtSeg = (() => {
    // Dynamic amounts (e.g., {from:'targetPower'}) are non-numeric; render
    // their phrase string and never highlight (empower can't bump them).
    if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
      return plainSeg(describeAmount(eff.amount));
    }
    return bumpedSeg('amount', eff, tplEff);
  })();
  switch (eff.kind) {
    case 'damage':
      if (eff.target === 'self') return [plainSeg('you take '), amtSeg, plainSeg(' damage')];
      return [plainSeg('deal '), amtSeg, plainSeg(' damage to ' + t)];
    case 'damageAll':
      return [plainSeg('deal '), amtSeg, plainSeg(' damage to each creature')];
    case 'gainLife':
      // Dynamic-value gainLife (Swords to Plowshares) — non-bumpable.
      if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
        const owner = (eff.who && eff.who.from === 'targetController') ? "its controller" : 'you';
        return [plainSeg(owner + ' gains life equal to ' + describeAmount(eff.amount))];
      }
      if (eff.target === 'self')   return [plainSeg('you gain '), amtSeg, plainSeg(' life')];
      if (eff.target === 'player') return [plainSeg(t + ' gains '), amtSeg, plainSeg(' life')];
      return [plainSeg('gain '), amtSeg, plainSeg(' life')];
    case 'draw':
      if (eff.target === 'player') {
        if (eff.amount === 1) return [plainSeg(t + ' draws a card')];
        return [plainSeg(t + ' draws '), amtSeg, plainSeg(' cards')];
      }
      if (eff.amount === 1) return [plainSeg('draw a card')];
      return [plainSeg('draw '), amtSeg, plainSeg(' cards')];
    case 'discard':
      if (eff.target === 'player') {
        if (eff.amount === 1) return [plainSeg(t + ' discards a card')];
        return [plainSeg(t + ' discards '), amtSeg, plainSeg(' cards')];
      }
      if (eff.amount === 1) return [plainSeg('discard a card')];
      return [plainSeg('discard '), amtSeg, plainSeg(' cards')];
    case 'pump': {
      // Power and toughness are independently bumpable.
      const pSeg = bumpedSeg('power', eff, tplEff, 0);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 0);
      const subj = eff.target === 'self' ? 'this creature' : t;
      return [plainSeg(subj + ' gets +'), pSeg, plainSeg('/+'), tSeg, plainSeg(' until end of turn')];
    }
    case 'pumpAllYours': {
      const pSeg = bumpedSeg('power', eff, tplEff, 0);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 0);
      return [plainSeg('creatures you control get +'), pSeg, plainSeg('/+'), tSeg, plainSeg(' until end of turn')];
    }
    case 'addCounter': {
      const pSeg = bumpedSeg('power', eff, tplEff, 1);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 1);
      const tail = eff.target === 'self' ? ' counter on this' : ' counter on ' + t;
      return [plainSeg('put a +'), pSeg, plainSeg('/+'), tSeg, plainSeg(tail)];
    }
    case 'grantKeyword': {
      // Duration text. Three cases:
      //   - 'eot': until end of turn (combat tricks, Overrun-style)
      //   - absent + target is a creature: persistent grant that ends when
      //     the source leaves the battlefield (engine clears via
      //     clearRestrictionsFromSource). Surface that — otherwise the
      //     reader has no way to know the grant isn't truly permanent.
      //   - absent + target is self/no target (none in current pool, but
      //     defensively): omit duration text.
      let dur;
      if (eff.duration === 'eot') {
        dur = ' until end of turn';
      } else if (eff.target === 'creature' || eff.whose === 'allYours' || eff.whose === 'all') {
        dur = ' as long as this is on the battlefield';
      } else {
        dur = '';
      }
      if (eff.whose === 'allYours') {
        return [plainSeg('creatures you control gain ' + eff.keyword + dur)];
      }
      if (eff.target === 'self') return [plainSeg('this creature gains ' + eff.keyword + dur)];
      return [plainSeg(t + ' gains ' + eff.keyword + dur)];
    }
    case 'removeCreature': {
      // Severity ladder: 1=tap, 2=return, 3=destroy, 4=exile. The displayed
      // verb is derived from severity, so highlight the verb when severity
      // differs from baseline (empower can promote tier).
      const sev = eff.severity || 1;
      const verb = sev >= 4 ? 'exile' : sev >= 3 ? 'destroy'
                 : sev >= 2 ? 'return' : 'tap';
      const verbSeg = bumpedDerived(verb, 'severity', eff, tplEff);
      if (sev >= 2 && sev < 3) return [verbSeg, plainSeg(' ' + t + " to its owner's hand")];
      return [verbSeg, plainSeg(' ' + t)];
    }
    case 'removeAll': {
      const sev = eff.severity || 1;
      const scope = eff.whose === 'opp' ? "all creatures an opponent controls"
                  : eff.whose === 'self' || eff.whose === 'you' ? "all creatures you control"
                  : 'all creatures';
      const verb = sev >= 4 ? 'exile' : sev >= 3 ? 'destroy'
                 : sev >= 2 ? 'return' : 'tap';
      const verbSeg = bumpedDerived(verb, 'severity', eff, tplEff);
      if (sev >= 2 && sev < 3) return [verbSeg, plainSeg(' ' + scope + " to their owners' hands")];
      return [verbSeg, plainSeg(' ' + scope)];
    }
    case 'counter':
      return [plainSeg('counter ' + t)];
    case 'createTokens': {
      const tok = eff.tokenId || 'creature';
      const tokTpl = (typeof TOKENS !== 'undefined' && TOKENS[tok]) || null;
      const niceName = tokTpl ? tokTpl.name : tok.replace(/_.*/, '').replace(/^./, c => c.toUpperCase());
      const colorWord = tokTpl && tokTpl.color
        ? (COLOR_NAMES[tokTpl.color] || '').toLowerCase() + ' ' : '';
      const stats = tokTpl ? (tokTpl.power + '/' + tokTpl.toughness) : '1/1';
      const kwSuffix = tokTpl && tokTpl.keywords && tokTpl.keywords.length
        ? ' with ' + tokTpl.keywords.join(', ') : '';
      // count is bumpable; render as word ("two" / "three") and highlight
      // the word when count differs from baseline.
      if (eff.count === 1) {
        return [plainSeg('create a ' + colorWord + stats + ' ' + niceName + ' token' + kwSuffix)];
      }
      const wordCount = NUM_WORDS[eff.count] || String(eff.count);
      const countSeg = bumpedDerived(wordCount, 'count', eff, tplEff);
      return [plainSeg('create '), countSeg, plainSeg(' ' + colorWord + stats + ' ' + niceName + ' tokens' + kwSuffix)];
    }
    case 'searchCreature':
      return [plainSeg('search your library for a creature card and put it into your hand')];
    case 'searchLandTapped':
      return [plainSeg('search your library for a basic land and put it onto the battlefield tapped')];
    case 'returnFromGraveyard':
      return [plainSeg('return ' + t + ' from your graveyard to your hand')];
    case 'shuffleIntoLibrary':
      return [plainSeg('shuffle ' + t + " into its owner's library")];
    case 'untap': {
      if (eff.target === 'self') return [plainSeg('untap this creature')];
      const filterMinusTapped = eff.filter ? Object.assign({}, eff.filter, {tapped: undefined}) : null;
      const tNoTap = withFilter(targetPhrase(eff), filterMinusTapped ? Object.assign({}, eff, {filter: filterMinusTapped}) : eff);
      return [plainSeg('untap ' + tNoTap)];
    }
    case 'applyInGameSplice':
      // Stapler's effect. The card has hand-authored text describing the
      // two-target shape; auto-gen falls back to a minimal description
      // for diagnostic surfaces (deck-viewer fallback, error rendering).
      return [plainSeg('staple the second target permanent onto the first')];
    case 'noop':
      // Marker effect used to force a second target in the validation
      // harness — has no described behavior. Render as empty so it doesn't
      // appear in any sentence.
      return [plainSeg('')];
    case 'fightTarget':
      return [plainSeg('your strongest creature fights ' + t)];
    case 'restrict':
      return [plainSeg(t + " can't attack or block")];
    case 'flicker':
      return [plainSeg('exile ' + t + ', then return it to the battlefield')];
    case 'exileUntilEOT':
      return [plainSeg('exile ' + t + ' until end of turn')];
    case 'gainControl': {
      // Mind Control / Threaten. Text composition mirrors MtG: "gain
      // control of X" with optional duration and rider clauses.
      const parts = ['gain control of ' + t];
      if (eff.duration === 'eot') parts.push(' until end of turn');
      // Riders read as a separate sentence ("Untap it. It gains haste
      // until end of turn.") rather than chained — matches Threaten's
      // template better than a comma-stitched run-on.
      const segs = [plainSeg(parts.join(''))];
      const riders = [];
      if (eff.untap) riders.push('untap it');
      if (eff.grantHaste) riders.push('it gains haste until end of turn');
      if (riders.length > 0) {
        // Capitalize each rider clause for sentence-y feel.
        const cap = riders.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join('. ');
        segs.push(plainSeg('. ' + cap));
      }
      return segs;
    }
    case 'addMana': {
      if (eff.amounts) {
        let symbols = '';
        for (const [color, n] of Object.entries(eff.amounts)) {
          for (let i = 0; i < n; i++) symbols += '{' + color + '}';
        }
        return [plainSeg('add ' + (symbols || '{C}'))];
      }
      return [plainSeg('add ' + (eff.mana || '{C}'))];
    }
    case 'edict':
      return [plainSeg(t + ' sacrifices a creature')];
    case 'weaken': {
      const pSeg = bumpedSeg('power', eff, tplEff, 1);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 1);
      return [plainSeg(t + ' gets -'), pSeg, plainSeg('/-'), tSeg, plainSeg(' until end of turn')];
    }
    case 'steal':
      return [plainSeg('shuffle ' + t + ' into your library')];
    case 'endomorphAbsorb':
      return [plainSeg('gain a keyword from the slain creature, or +1/+1 if none')];
    case 'ripPermanent':
      // Vile Edict: the target player chooses one of their permanents to
      // rip. Cards have their hand-authored text on the template; this is
      // a fallback for any path that auto-describes the effect.
      return [plainSeg(t + ' rips a permanent they control')];
    case 'destroyAndStickerSlot':
      // Scarification: card text is hand-authored. This fallback gives
      // something readable if a non-template path tries to describe it.
      return [plainSeg('destroy ' + t + ' and scar it')];
    case 'symmetricize':
      return [plainSeg(t + "'s controller equalizes its power, toughness, or cost")];
    case 'embargo':
      return [plainSeg('return ' + t + ' to hand; it costs {1} more forever')];
    case 'bleach':
      return [plainSeg('exile ' + t + '; it is colorless forever')];
  }
  return [plainSeg('[' + eff.kind + ']')];
}

// Convenience: flatten a segment array to a plain string.
function segsToText(segs) {
  return segs.map(s => s.text).join('');
}

// describeEffectList: join multiple effect clauses into a sentence/paragraph.
// Special-case for damage-only multi-target spells (Branching Bolt, Char,
// Drain Life): use shared-subject "X deals A damage to T1 and B damage to T2"
// phrasing which reads naturally with empower bumps. Otherwise, separate
// sentences.
//
// Returns an array of {text, highlight} segments. tplEffects is the parallel
// template effects array — passed through to describeEffect for the diff.
function describeEffectList(effects, cardName, tplEffects) {
  if (!Array.isArray(effects) || effects.length === 0) return [];
  const tplOf = i => (Array.isArray(tplEffects) ? tplEffects[i] : undefined);
  const parts = effects.map((e, i) => describeEffect(e, tplOf(i)));
  if (parts.length === 1) {
    return capitalizeSegs(parts[0]).concat(plainSeg('.'));
  }
  // Damage-only 2-effect: shared-subject style. Re-render directly so we can
  // intersperse the shared-subject prefix and the "and" connector around the
  // bumpable amounts.
  const allDamage = effects.every(e => e.kind === 'damage');
  if (allDamage && effects.length === 2) {
    const e0 = effects[0], e1 = effects[1];
    const tpl0 = tplOf(0), tpl1 = tplOf(1);
    const t0 = withFilter(targetPhrase(e0), e0);
    const t1 = withFilter(targetPhrase(e1), e1);
    const prefix = cardName ? cardName : 'This';
    const seg0 = (typeof e0.amount === 'object' && e0.amount && e0.amount.from)
      ? plainSeg(describeAmount(e0.amount))
      : bumpedSeg('amount', e0, tpl0);
    const seg1 = (typeof e1.amount === 'object' && e1.amount && e1.amount.from)
      ? plainSeg(describeAmount(e1.amount))
      : bumpedSeg('amount', e1, tpl1);
    if (e1.target === 'self') {
      return [
        plainSeg(prefix + ' deals '), seg0, plainSeg(' damage to ' + t0 + ' and '),
        seg1, plainSeg(' damage to you.'),
      ];
    }
    return [
      plainSeg(prefix + ' deals '), seg0, plainSeg(' damage to ' + t0 + ' and '),
      seg1, plainSeg(' damage to ' + t1 + '.'),
    ];
  }
  // Rummage / loot pattern: "draw N, then discard M".
  if (effects.length === 2
      && effects[0].kind === 'draw'
      && effects[1].kind === 'discard'
      && effects[1].target === 'self') {
    return capitalizeSegs(parts[0]).concat(plainSeg(', then ')).concat(parts[1]).concat(plainSeg('.'));
  }
  // Default: separate sentences. Capitalize the first segment of each part
  // and join with periods.
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out.push(plainSeg('. '));
    out.push(...capitalizeSegs(parts[i]));
  }
  out.push(plainSeg('.'));
  return out;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// capitalizeSegs: capitalize the very first character of the first
// non-empty segment. Used at sentence boundaries.
function capitalizeSegs(segs) {
  if (!segs || segs.length === 0) return segs;
  const out = segs.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i].text && out[i].text.length > 0) {
      out[i] = { text: capitalize(out[i].text), highlight: out[i].highlight };
      break;
    }
  }
  return out;
}

// triggerPreamble: render the "When/Whenever ..." prefix for a trigger.
// Branches on event + condId; falls back to generic phrasing if condId is
// unrecognized so we still emit something sensible.
function triggerPreamble(trig) {
  const ev = trig.event;
  const cid = trig.condId;
  const params = trig.params || {};
  // "this" triggers — singular, usually "When this <event>, ..."
  if (cid === 'thisEnters')  return 'When this enters the battlefield,';
  if (cid === 'thisDies')    return 'When this dies,';
  if (cid === 'thisAttacks') return 'When this attacks,';
  if (cid === 'thisKillsCreature') return 'Whenever a creature dealt damage by this dies,';
  if (cid === 'thisAttacksAfterOppLifeLoss') {
    return 'When this attacks, if an opponent has lost life this turn,';
  }
  // "another" triggers — plural-event, "Whenever another ..."
  if (cid === 'anotherCreatureYouEntersOfSubtype') {
    return 'Whenever another ' + (params.sub || 'creature') + ' enters under your control,';
  }
  if (cid === 'anotherCreatureYouEntersStrict') {
    return 'Whenever another creature enters under your control,';
  }
  if (cid === 'anotherCreatureDies') {
    return 'Whenever another creature dies,';
  }
  if (cid === 'creatureYouAttacksOfSubtype') {
    return 'Whenever a ' + (params.sub || 'creature') + ' you control attacks,';
  }
  if (cid === 'anyCardDies')    return 'Whenever a creature dies,';
  if (cid === 'youCastSpell')   return 'Whenever you cast a spell,';
  if (cid === 'youCastCounterspell') return 'Whenever you counter a spell,';
  if (cid === 'youGainLife')    return 'Whenever you gain life,';
  // Fallbacks by event alone.
  if (ev === 'cardEntersBattlefield') return 'When this enters the battlefield,';
  if (ev === 'cardDies')              return 'When this dies,';
  if (ev === 'attacks')               return 'When this attacks,';
  return 'Whenever a relevant event occurs,';
}

// describeTrigger: render a full trigger clause as segments. Returns
// segments so empower-bumped values inside trigger effects (e.g., a stapled
// Bolt's ETB damage) get highlighted along with the body. tplTrig is the
// corresponding template trigger for diff comparison.
function describeTrigger(trig, tplTrig) {
  const preamble = triggerPreamble(trig);
  const tplEffs = tplTrig ? tplTrig.effects : undefined;
  const body = describeEffectList(trig.effects || [], null, tplEffs);
  // body's first segment was capitalized for sentence-start; we want
  // sentence-mid since preamble ends in a comma. Lowercase the first letter
  // of the first non-empty segment.
  const bodyLower = body.slice();
  for (let i = 0; i < bodyLower.length; i++) {
    if (bodyLower[i].text && bodyLower[i].text.length > 0) {
      bodyLower[i] = {
        text: bodyLower[i].text[0].toLowerCase() + bodyLower[i].text.slice(1),
        highlight: bodyLower[i].highlight,
      };
      break;
    }
  }
  return [plainSeg(preamble + ' ')].concat(bodyLower);
}

// abilityCostPhrase: convert an ability's cost into a player-readable prefix
// like "{T}: " or "{R}: " or "Sacrifice this: ".
function abilityCostPhrase(cost) {
  if (!cost) return '';
  const parts = [];
  if (cost.tap) parts.push('{T}');
  if (cost.mana) {
    let s = '';
    for (const [color, n] of Object.entries(cost.mana)) {
      for (let i = 0; i < n; i++) s += '{' + color + '}';
    }
    if (s) parts.push(s);
  }
  if (cost.sacrifice) {
    parts.push('Sacrifice ' + (cost.sacrifice === 'self' ? 'this' : 'a ' + cost.sacrifice));
  }
  return parts.join(', ');
}

// describeAbility: "<cost>: <effect>." — activated ability format. Returns
// segments; the body's bumpable fields propagate through. tplAb is the
// corresponding template ability.
function describeAbility(ab, tplAb) {
  const cost = abilityCostPhrase(ab.cost);
  const tplEffs = tplAb ? tplAb.effects : undefined;
  let body = describeEffectList(ab.effects || [], null, tplEffs);
  // Strip the trailing period segment — caller adds it.
  if (body.length > 0 && body[body.length - 1].text === '.') {
    body = body.slice(0, -1);
  }
  if (!cost) return body;
  // Lowercase the first character of body since it follows a colon.
  if (body.length > 0) {
    for (let i = 0; i < body.length; i++) {
      if (body[i].text && body[i].text.length > 0) {
        body[i] = {
          text: body[i].text[0].toLowerCase() + body[i].text.slice(1),
          highlight: body[i].highlight,
        };
        break;
      }
    }
  }
  return [plainSeg(cost + ': ')].concat(body);
}

// describeStaticBuff: render a lord-style continuous ability.
// Shape: { filter, subtype, power, toughness, keywords }
//   "Other <subtype>s you control get +P/+T and have <kw1>, <kw2>."
// The subtype + filter combination determines the noun phrase. Most lords
// use filter:{controller:'self'} which means "you control". We always use
// "Other" since a creature can't buff itself via staticBuffs (self is
// excluded by the engine's lord logic).
function describeStaticBuff(buff) {
  const sub = buff.subtype ? buff.subtype + 's' : 'creatures';
  let scope;
  if (buff.filter && (buff.filter.controller === 'self' || buff.filter.controller === 'you')) {
    scope = 'Other ' + sub + ' you control';
  } else if (buff.filter && buff.filter.controller === 'opp') {
    scope = 'Other ' + sub + ' an opponent controls';
  } else {
    scope = 'Other ' + sub;
  }
  const stats = (buff.power || buff.toughness)
    ? 'get +' + (buff.power || 0) + '/+' + (buff.toughness || 0)
    : '';
  // Lookup display names so "firstStrike" → "first strike", etc.
  const kwDisplay = {
    flying: 'flying', vigilance: 'vigilance', trample: 'trample', haste: 'haste',
    firstStrike: 'first strike', doubleStrike: 'double strike', deathtouch: 'deathtouch',
    lifelink: 'lifelink', reach: 'reach', menace: 'menace', defender: 'defender',
    flash: 'flash', hexproof: 'hexproof', indestructible: 'indestructible',
  };
  const kwList = (buff.keywords && buff.keywords.length)
    ? buff.keywords.map(k => 'have ' + (kwDisplay[k] || k)).join(' and ')
    : '';
  let body;
  if (stats && kwList) body = scope + ' ' + stats + ' and ' + kwList;
  else if (stats)      body = scope + ' ' + stats;
  else if (kwList)     body = scope + ' ' + kwList;
  else                 return '';
  return body + '.';
}

// keywordPreamble: list intrinsic keywords as a leading sentence.
// "Flying. Vigilance. <rest of text>".
function keywordPreamble(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return '';
  // Map internal keyword IDs to display names (matches KEYWORD_DISPLAY).
  const display = {
    flying: 'Flying', vigilance: 'Vigilance', trample: 'Trample', haste: 'Haste',
    firstStrike: 'First strike', doubleStrike: 'Double strike', deathtouch: 'Deathtouch',
    lifelink: 'Lifelink', reach: 'Reach', menace: 'Menace', defender: 'Defender',
    flash: 'Flash', hexproof: 'Hexproof', indestructible: 'Indestructible',
  };
  return keywords.map(k => display[k] || (k[0].toUpperCase() + k.slice(1))).join(', ');
}

// describeCardText: top-level card text generator. Returns a flat string
// (suitable for storage in card.text and for logging/console output).
// Visual highlighting of empower-bumped values is the renderer's concern —
// it calls describeCardSegments instead.
function describeCardText(card) {
  return segsToText(describeCardSegments(card));
}

// describeCardSegments: like describeCardText but returns segments with
// `highlight` flags on values that differ from the template baseline.
// opts.skipKeywords skips the leading "Flying, Lifelink." preamble (for UI
// that shows keywords as badges).
function describeCardSegments(card, opts) {
  opts = opts || {};
  const tpl = CARDS[card.tplId] || card;
  if (tpl.customText === true || tpl.special === true) {
    return [plainSeg(card.text || tpl.text || '')];
  }
  // Resolve the template baseline used for empower diffing. Stapled cards
  // need the synthesized template (so the staple half's effects exist in
  // the baseline) — otherwise we'd be diffing against just the base and
  // bumped values on the staple side would silently fail to highlight.
  let tplBaseline = tpl;
  if (card.stapledFrom && typeof ENGINE !== 'undefined' && ENGINE.synthesizeStapledTemplate) {
    try {
      tplBaseline = ENGINE.synthesizeStapledTemplate(
        card.stapledFrom.baseTplId, card.stapledFrom.stapledTpls);
    } catch (e) {
      tplBaseline = tpl;
    }
  }
  // Each "section" emits a segment list; we join sections with a single
  // space segment.
  const sections = [];
  // Keyword preamble — skipped for renderers that show keywords as badges.
  if (!opts.skipKeywords && (card.type === 'Creature' || tpl.type === 'Creature')) {
    const kw = keywordPreamble(card.keywords || tpl.keywords || []);
    if (kw) sections.push([plainSeg(kw + '.')]);
  }
  // Modal vs top-level effects (mutually exclusive in current pool).
  if (card.effects && card.effects.modes) {
    sections.push(describeModalSegs(card.effects.modes, tplBaseline.effects && tplBaseline.effects.modes));
  } else if (Array.isArray(card.effects) && card.effects.length > 0) {
    const tplEffs = Array.isArray(tplBaseline.effects) ? tplBaseline.effects : undefined;
    sections.push(describeEffectList(card.effects, card.name || tpl.name, tplEffs));
  }
  // Static buffs (lords) — render before triggers.
  if (Array.isArray(card.staticBuffs)) {
    for (const buff of card.staticBuffs) {
      const phrase = describeStaticBuff(buff);
      if (phrase) sections.push([plainSeg(phrase)]);
    }
  }
  // Triggers — each is a self-contained sentence.
  if (Array.isArray(card.triggers)) {
    const tplTriggers = Array.isArray(tplBaseline.triggers) ? tplBaseline.triggers : [];
    for (let i = 0; i < card.triggers.length; i++) {
      const trig = card.triggers[i];
      const tplTrig = tplTriggers[i];
      sections.push(describeTrigger(trig, tplTrig));
    }
  }
  // Abilities.
  if (Array.isArray(card.abilities)) {
    const tplAbilities = Array.isArray(tplBaseline.abilities) ? tplBaseline.abilities : [];
    for (let i = 0; i < card.abilities.length; i++) {
      const ab = card.abilities[i];
      const tplAb = tplAbilities[i];
      const abSegs = describeAbility(ab, tplAb);
      sections.push(abSegs.concat(plainSeg('.')));
    }
  }
  // Drop empty sections; join with single-space separators.
  const nonEmpty = sections.filter(s => s && s.length > 0);
  if (nonEmpty.length === 0) {
    // No rules content. For non-skip-keywords callers, fall back to flavor
    // text (vanilla creatures whose only rules content is intrinsic keywords
    // would otherwise render blank). For skip-keywords callers, the flavor
    // text IS just the keyword preamble (e.g., "Flying" for Cloud Pegasus),
    // which is redundant with the badges they're showing — skip the fallback
    // and return empty.
    if (opts.skipKeywords) return [];
    const flavor = tpl.text || '';
    return flavor ? [plainSeg(flavor)] : [];
  }
  const out = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    if (i > 0) out.push(plainSeg(' '));
    out.push(...nonEmpty[i]);
  }
  return out;
}

// describeModalSegs: render a "Choose one — A; or B; or C." block as
// segments. tplModes is the parallel template modes array; per-mode tpl
// effects are passed through to describeEffectList for the empower diff.
function describeModalSegs(modes, tplModes) {
  const out = [plainSeg('Choose one — ')];
  for (let i = 0; i < modes.length; i++) {
    if (i > 0) out.push(plainSeg('; or '));
    const tplMode = Array.isArray(tplModes) ? tplModes[i] : undefined;
    let modeSegs = describeEffectList(modes[i], null, tplMode);
    // Strip trailing period (the final period is added at the end).
    if (modeSegs.length > 0 && modeSegs[modeSegs.length - 1].text === '.') {
      modeSegs = modeSegs.slice(0, -1);
    }
    // Lowercase the first character for "; or" continuation. The first mode
    // gets a sentence-start capital from the "Choose one — " prefix's
    // emphatic dash; all subsequent modes follow a "; or" connector and
    // should be lowercase.
    if (i > 0 && modeSegs.length > 0) {
      for (let j = 0; j < modeSegs.length; j++) {
        if (modeSegs[j].text && modeSegs[j].text.length > 0) {
          modeSegs[j] = {
            text: modeSegs[j].text[0].toLowerCase() + modeSegs[j].text.slice(1),
            highlight: modeSegs[j].highlight,
          };
          break;
        }
      }
    }
    out.push(...modeSegs);
  }
  out.push(plainSeg('.'));
  return out;
}
