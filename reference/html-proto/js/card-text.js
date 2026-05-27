// CARD TEXT — generates rules text from card data. Pure read-only.
// Returns {text, highlight}[] segments — bumped values get highlight:true
// (empower visual emphasis). describeCardText is the flat-string wrapper.
// Cards with customText:true (Endomorph, Codex, Elystra) keep hand-authored text.
// Sole ENGINE dependency: synthesizeStapledTemplate (guarded for load order).

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const NUM_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

// HTML escape for text destined for innerHTML. Renders &<> safe; leaves
// braces alone so renderManaSymbols can find {R}/{T}/{X}/{1} tokens
// downstream. Quotes pass through because we never interpolate user-
// derived strings into attribute values, only into text content.
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// Substitute a card name into a trigger / effect template. The ~ token
// is the conventional placeholder used across MERCURIAL_TRIGGER_POOL
// (engine.js) and GENERATOR_EFFECTS / GENERATOR_CONDITIONS (trigger-
// generator.js). The cardName is HTML-escaped because the result lands
// in innerHTML — designer-authored templates may contain HTML (e.g.
// future <b>emphasis</b>), but card names are display data that should
// never be parsed as markup.
function formatTriggerText(template, cardName) {
  return (template || '').replace(/~/g, escapeHtml(cardName || ''));
}

// eff.target → noun phrase. 'player' = "target opponent" for damage/discard, "target player" for gainLife.
function targetPhrase(eff) {
  const t = eff.target;
  if (t === 'self')     return 'you';
  if (t === 'player') {
    if (eff.kind === 'gainLife') return 'target player';
    if (eff.kind === 'discard')  return 'target player';
    return 'target opponent';
  }
  if (t === 'creature') return 'target creature';
  // New target() taxonomy (§3.5).
  if (t === 'creature_or_player') return 'any target';
  if (t === 'your_creature') return 'target creature you control';
  if (t === 'opp_creature') return 'target creature an opponent controls';
  if (t === 'graveyard_creature') return 'target creature card';
  if (t === 'graveyardCreature') return 'target creature card';
  if (t === 'permanent')return 'target permanent';
  if (t === 'spell')    return 'target spell';
  if (t === 'any')      return 'any target';
  if (t === 'card')     return 'target card';
  return t || '';
}

// Apply eff.filter to noun phrase. Pre-mods (color/tapped/subtype) inserted before noun; post-mods after.
function withFilter(noun, eff) {
  if (!eff.filter) return noun;
  const f = eff.filter;
  const pre = [];
  const post = [];
  if (f.tapped === true)  pre.push('tapped');
  if (f.tapped === false) pre.push('untapped');
  if (f.color)            pre.push(COLOR_NAMES[f.color] || f.color);
  if (f.notColor)         pre.push('non-' + (COLOR_NAMES[f.notColor] || f.notColor));
  if (f.subtype)          pre.push(f.subtype);
  if (f.hasKeyword)       post.push('with ' + f.hasKeyword);
  if (f.notKeyword)       post.push('without ' + f.notKeyword);
  if (f.controller === 'you' || f.controller === 'self') post.push('you control');
  if (f.controller === 'opp') post.push('an opponent controls');
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

// Numeric passthrough; {from:'<x>'} → player-readable phrase via dynMap.
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

// Emit a field as segment; highlight:true if live ≠ tplEff baseline (empower diff).
function bumpedSeg(field, eff, tplEff, fallback) {
  const v = eff[field] !== undefined ? eff[field] : fallback;
  const tplV = tplEff ? (tplEff[field] !== undefined ? tplEff[field] : fallback) : undefined;
  const bumped = tplEff != null
    && typeof v === 'number' && typeof tplV === 'number'
    && v !== tplV;
  return { text: String(v), highlight: bumped };
}

// Like bumpedSeg but with precomputed display text (e.g., severity → "destroy"/"exile").
function bumpedDerived(displayText, sourceField, eff, tplEff) {
  const v = eff[sourceField];
  const tplV = tplEff ? tplEff[sourceField] : undefined;
  const bumped = tplEff != null
    && typeof v === 'number' && typeof tplV === 'number'
    && v !== tplV;
  return { text: displayText, highlight: bumped };
}

function plainSeg(text) {
  return { text, highlight: false };
}

// Signed stat segment for pump (+N for buffs, -N for weaken/signed deltas),
// preserving the empower-bump highlight. "+2"/"-2".
function signedStat(field, eff, tplEff) {
  const v = eff[field] || 0;
  const tplV = tplEff ? (tplEff[field] || 0) : undefined;
  const bumped = tplEff != null && typeof v === 'number' && typeof tplV === 'number' && v !== tplV;
  return { text: (v < 0 ? '-' : '+') + Math.abs(v), highlight: bumped };
}

// §7b coverage: effect kinds intentionally WITHOUT a standalone describeEffect
// case — they only ever render inside a multi-effect idiom or via authored
// card.text, never as a lone segment. effectCoverageReport (engine.js) skips
// these when checking for the "[kind]" debug sentinel.
//   apply_sticker — the embargo/bleach idiom is rendered at the list level
//   steal         — internal; dispatched by change_control (which has text)
//   annihilate    — the rip/edict chain renders the whole phrase
//   bargainSticker* — Archdemon of Bargains uses authored card.text
const TEXT_IDIOM_ONLY = new Set([
  'apply_sticker', 'steal', 'annihilate', 'bargainStickerSelf', 'bargainStickerOther',
]);

// Render one effect to segments (lowercase-leading; caller capitalizes).
function describeEffect(eff, tplEff) {
  const t = withFilter(targetPhrase(eff), eff);
  const amtSeg = (() => {
    if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
      return plainSeg(describeAmount(eff.amount));
    }
    return bumpedSeg('amount', eff, tplEff);
  })();
  switch (eff.kind) {
    case 'damage':
      if (eff.target === 'self') return [plainSeg('you take '), amtSeg, plainSeg(' damage')];
      if (eff.scope === 'all_creatures') return [plainSeg('deal '), amtSeg, plainSeg(' damage to each creature')];
      return [plainSeg('deal '), amtSeg, plainSeg(' damage to ' + t)];
    case 'gainLife':
      if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
        const owner = (eff.who && eff.who.from === 'targetController') ? "its controller" : 'you';
        return [plainSeg(owner + ' gains life equal to ' + describeAmount(eff.amount))];
      }
      // §D4: a negative amount is life loss — render the sign as "lose N life".
      if (typeof eff.amount === 'number' && eff.amount < 0) {
        const n = -eff.amount;
        if (eff.target === 'self')   return [plainSeg('you lose ' + n + ' life')];
        if (eff.target === 'player') return [plainSeg(t + ' loses ' + n + ' life')];
        return [plainSeg('lose ' + n + ' life')];
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
      // duration:permanent → +1/+1 counter rendering (addCounter collapse).
      if (eff.duration === 'permanent') {
        const pSeg = bumpedSeg('power', eff, tplEff, 0);
        const tSeg = bumpedSeg('toughness', eff, tplEff, 0);
        const onWhom = eff.target === 'self' ? 'this' : t;
        return [plainSeg('put a +'), pSeg, plainSeg('/+'), tSeg, plainSeg(' counter on ' + onWhom)];
      }
      // Signed (weaken = negative deltas) + mass scope (pumpAllYours collapse).
      let subj, verb;
      if (eff.scope === 'all_yours') { subj = 'creatures you control'; verb = ' get '; }
      else if (eff.scope === 'all_creatures') { subj = 'all creatures'; verb = ' get '; }
      else if (eff.target === 'self') { subj = 'this creature'; verb = ' gets '; }
      else { subj = t; verb = ' gets '; }
      return [plainSeg(subj + verb), signedStat('power', eff, tplEff), plainSeg('/'),
              signedStat('toughness', eff, tplEff), plainSeg(' until end of turn')];
    }
    case 'addCounter': {
      const pSeg = bumpedSeg('power', eff, tplEff, 1);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 1);
      const tail = eff.target === 'self' ? ' counter on this' : ' counter on ' + t;
      return [plainSeg('put a +'), pSeg, plainSeg('/+'), tSeg, plainSeg(tail)];
    }
    case 'grantKeyword': {
      // 'eot' → EOT text; targeted → "as long as on bf" (source-tied); self → no duration.
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
      // 1=tap, 2=return, 3=destroy, 4=exile. Verb highlights when severity bumped.
      const sev = eff.severity || 1;
      const verb = sev >= 4 ? 'exile' : sev >= 3 ? 'destroy'
                 : sev >= 2 ? 'return' : 'tap';
      const verbSeg = bumpedDerived(verb, 'severity', eff, tplEff);
      // Mass scope (removeAll collapse).
      if (eff.scope) {
        const scopeStr = eff.scope === 'all_opps' ? 'all creatures an opponent controls'
                       : eff.scope === 'all_yours' ? 'all creatures you control'
                       : 'all creatures';
        if (sev >= 2 && sev < 3) return [verbSeg, plainSeg(' ' + scopeStr + " to their owners' hands")];
        return [verbSeg, plainSeg(' ' + scopeStr)];
      }
      if (sev >= 2 && sev < 3) return [verbSeg, plainSeg(' ' + t + " to its owner's hand")];
      return [verbSeg, plainSeg(' ' + t)];
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
      if (eff.count === 1) {
        return [plainSeg('create a ' + colorWord + stats + ' ' + niceName + ' token' + kwSuffix)];
      }
      const wordCount = NUM_WORDS[eff.count] || String(eff.count);
      const countSeg = bumpedDerived(wordCount, 'count', eff, tplEff);
      return [plainSeg('create '), countSeg, plainSeg(' ' + colorWord + stats + ' ' + niceName + ' tokens' + kwSuffix)];
    }
    case 'move_card': {
      // Generic card-movement primitive → English for the common collapsed
      // idioms (matches the legacy kinds' phrasing for parity).
      const fz = eff.from_zone, tz = eff.to_zone;
      if (fz === 'library' && tz === 'hand' && eff.selector === 'library_search') {  // collapsed searchCreature
        return [plainSeg('search your library for a ' + ((eff.filter && eff.filter.type) ? eff.filter.type.toLowerCase() : 'card') + ' card and put it into your hand')];
      }
      if (fz === 'library' && tz === 'battlefield') {  // collapsed searchLandTapped (auto fetch)
        return [plainSeg('search your library for a basic land and put it onto the battlefield' + ((eff.post && eff.post.tap) ? ' tapped' : ''))];
      }
      if (fz === 'library' && tz === 'hand') {  // collapsed draw
        if (eff.amount === 1) return [plainSeg('draw a card')];
        return [plainSeg('draw '), amtSeg, plainSeg(' cards')];
      }
      if (fz === 'hand' && tz === 'graveyard') {  // collapsed discard
        if (eff.target === 'player') {
          if (eff.amount === 1) return [plainSeg('target player discards a card')];
          return [plainSeg('target player discards '), amtSeg, plainSeg(' cards')];
        }
        if (eff.amount === 1) return [plainSeg('discard a card')];
        return [plainSeg('discard '), amtSeg, plainSeg(' cards')];
      }
      if (fz === 'graveyard' && tz === 'hand') return [plainSeg('return ' + t + ' from your graveyard to your hand')];
      if (fz === 'battlefield' && tz === 'library') return [plainSeg('shuffle ' + t + " into its owner's library")];
      if (fz === 'battlefield' && tz === 'hand') return [plainSeg('return ' + t + " to its owner's hand")];
      if (fz === 'battlefield' && tz === 'exile') return [plainSeg('exile ' + t)];          // flicker outgoing / exile removal
      if (fz === 'exile' && tz === 'battlefield') return [plainSeg('return it to the battlefield')];  // flicker return
      return [plainSeg('move ' + t)];
    }
    case 'untap': {
      if (eff.target === 'self') return [plainSeg('untap this creature')];
      const filterMinusTapped = eff.filter ? Object.assign({}, eff.filter, {tapped: undefined}) : null;
      const tNoTap = withFilter(targetPhrase(eff), filterMinusTapped ? Object.assign({}, eff, {filter: filterMinusTapped}) : eff);
      return [plainSeg('untap ' + tNoTap)];
    }
    case 'applyInGameSplice':
      return [plainSeg('staple the second target permanent onto the first')];
    case 'fightTarget':
      return [plainSeg('your strongest creature fights ' + t)];
    case 'schedule_delayed':
      // Standalone fallback; the exile-until-eot pair is rendered as one phrase
      // by describeEffectList (below).
      return [plainSeg('return it to the battlefield at end of turn')];
    case 'addMana': {
      if (eff.choose) {
        return [plainSeg(eff.choose === 'any'
          ? 'add one mana of any color'
          : 'add one mana of ' + eff.choose.map(c => '{' + c + '}').join(' or '))];
      }
      if (eff.amounts) {
        let symbols = '';
        for (const [color, n] of Object.entries(eff.amounts)) {
          for (let i = 0; i < n; i++) symbols += '{' + color + '}';
        }
        return [plainSeg('add ' + (symbols || '{C}'))];
      }
      return [plainSeg('add ' + (eff.mana || '{C}'))];
    }
    case 'chooses':
      // The targeted player's selection is rendered by the following sacrifice
      // clause (the edict idiom) — emit nothing here.
      return [];
    case 'sacrifice':
      // Edict: under a target(player) step, reads "target player/opponent
      // sacrifices a creature". Otherwise a self/own sacrifice.
      if (eff.target === 'player' || eff.target === 'creature_or_player') return [plainSeg(t + ' sacrifices a creature')];
      if (eff.target === 'self') return [plainSeg('sacrifice this creature')];
      return [plainSeg('sacrifice ' + (t || 'it'))];
    case 'change_control': {
      // Unified gainControl + steal. transfer_ownership renders the steal
      // trophy flavor; otherwise the gain-control text (+ duration / riders).
      if (eff.transfer_ownership) return [plainSeg('shuffle ' + t + ' into your library')];
      const parts = ['gain control of ' + t];
      if (eff.duration === 'eot') parts.push(' until end of turn');
      const segs = [plainSeg(parts.join(''))];
      const riders = [];
      if (eff.untap || eff.untap_on_take) riders.push('untap it');
      if (eff.grantHaste || eff.grant_haste) riders.push('it gains haste until end of turn');
      if (riders.length > 0) {
        const cap = riders.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join('. ');
        segs.push(plainSeg('. ' + cap));
      }
      return segs;
    }
    case 'endomorphAbsorb':
      return [plainSeg('gain a keyword from the slain creature, or +1/+1 if none')];
    case 'ripPermanent':
      return [plainSeg(t + ' rips a permanent they control')];
    case 'destroyAndStickerSlot':
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

function segsToText(segs) {
  return segs.map(s => s.text).join('');
}

// Join effects into a sentence. Special-case: 2 damage effects use shared-subject phrasing.
function describeEffectList(effects, cardName, tplEffects, stepTarget) {
  if (!Array.isArray(effects) || effects.length === 0) return [];
  // New model (§3.5): a top-level target() step + bare effects. For rendering,
  // give each bare effect the step's target token so targetPhrase produces
  // "...target creature" etc. — matching how resolution feeds it the target.
  if (stepTarget) {
    effects = effects.map(e =>
      (e && !e.target && e.kind !== 'chooses' && e.scope == null) ? Object.assign({}, e, { target: stepTarget }) : e);
  }
  const tplOf = i => (Array.isArray(tplEffects) ? tplEffects[i] : undefined);
  const parts = effects.map((e, i) => describeEffect(e, tplOf(i)));
  if (parts.length === 1) {
    return capitalizeSegs(parts[0]).concat(plainSeg('.'));
  }
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
  // Loot pattern (draw then discard) — both are now collapsed move_card forms.
  if (effects.length === 2
      && effects[0].kind === 'move_card'
      && effects[0].from_zone === 'library' && effects[0].to_zone === 'hand'
      && effects[1].kind === 'move_card'
      && effects[1].from_zone === 'hand' && effects[1].to_zone === 'graveyard'
      && effects[1].target === 'self') {
    return capitalizeSegs(parts[0]).concat(plainSeg(', then ')).concat(parts[1]).concat(plainSeg('.'));
  }
  // Flicker pattern (exile then return) — collapsed flicker, one sentence.
  if (effects.length === 2
      && effects[0].kind === 'move_card'
      && effects[0].from_zone === 'battlefield' && effects[0].to_zone === 'exile'
      && effects[1].kind === 'move_card'
      && effects[1].from_zone === 'exile' && effects[1].to_zone === 'battlefield') {
    return capitalizeSegs(parts[0]).concat(plainSeg(', then ')).concat(parts[1]).concat(plainSeg('.'));
  }
  // Exile-until-eot pattern — move_card(bf→exile) + schedule_delayed(exile→bf).
  if (effects.length === 2
      && effects[0].kind === 'move_card'
      && effects[0].from_zone === 'battlefield' && effects[0].to_zone === 'exile'
      && effects[1].kind === 'schedule_delayed') {
    return capitalizeSegs(parts[0]).concat(plainSeg('; return it to the battlefield at end of turn.'));
  }
  // Drop effects that render to nothing (e.g. chooses() — its phrasing is
  // carried by the following sacrifice clause), so they don't leave stray ". ".
  const nonEmpty = parts.filter(p => Array.isArray(p) && p.some(s => s && s.text));
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return capitalizeSegs(nonEmpty[0]).concat(plainSeg('.'));
  const out = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    if (i > 0) out.push(plainSeg('. '));
    out.push(...capitalizeSegs(nonEmpty[i]));
  }
  out.push(plainSeg('.'));
  return out;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

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

// "When/Whenever ..." prefix from event+condId. Falls back to event-only phrasing.
function triggerPreamble(trig) {
  const ev = trig.event;
  // Classify from condId (legacy) or composable condition (Slice 2 / E2).
  const cid = triggerArchetype(trig);
  const sub = triggerSubtype(trig) || 'creature';
  if (cid === 'thisEnters')  return 'When this enters the battlefield,';
  if (cid === 'thisDies')    return 'When this dies,';
  if (cid === 'thisAttacks') return 'When this attacks,';
  if (cid === 'thisLeaves')  return 'When this leaves the battlefield,';
  if (cid === 'thisKillsCreature') return 'Whenever a creature dealt damage by this dies,';
  if (cid === 'thisAttacksAfterOppLifeLoss') {
    return 'When this attacks, if an opponent has lost life this turn,';
  }
  if (cid === 'anotherCreatureYouEntersOfSubtype') {
    return 'Whenever another ' + sub + ' enters under your control,';
  }
  if (cid === 'anotherCreatureYouEntersStrict') {
    return 'Whenever another creature enters under your control,';
  }
  if (cid === 'anotherCreatureDies') {
    return 'Whenever another creature dies,';
  }
  if (cid === 'creatureYouAttacksOfSubtype') {
    return 'Whenever a ' + sub + ' you control attacks,';
  }
  if (cid === 'anyCardDies')    return 'Whenever a creature dies,';
  if (cid === 'youCastSpell')   return 'Whenever you cast a spell,';
  if (cid === 'youCastCounterspell') return 'Whenever you counter a spell,';
  if (cid === 'youGainLife')    return 'Whenever you gain life,';
  if (ev === 'attacks') return 'When this attacks,';
  return 'Whenever a relevant event occurs,';
}

// Full trigger clause as segments (lowercase body since preamble ends in comma).
function describeTrigger(trig, tplTrig) {
  const preamble = triggerPreamble(trig);
  const tplEffs = tplTrig ? tplTrig.effects : undefined;
  const body = describeEffectList(trig.effects || [], null, tplEffs, trig.target);
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

// cost → "{T}: " / "{R}: " / "Sacrifice this: " prefix.
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

// "<cost>: <effect>" — caller adds final period.
function describeAbility(ab, tplAb) {
  const cost = abilityCostPhrase(ab.cost);
  const tplEffs = tplAb ? tplAb.effects : undefined;
  let body = describeEffectList(ab.effects || [], null, tplEffs, ab.target);
  if (body.length > 0 && body[body.length - 1].text === '.') {
    body = body.slice(0, -1);
  }
  if (!cost) return body;
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

// Lord buff: "Other <subtype>s you control get +P/+T and have <kw>."
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

// Keyword list as "Flying, Vigilance" prefix.
function keywordPreamble(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return '';
  // no_block is the hidden half of Pacifism's "can't attack or block" lockdown
  // (paired with defender); never surfaced as a keyword in its own right.
  keywords = keywords.filter(k => k !== 'no_block');
  if (keywords.length === 0) return '';
  const display = {
    flying: 'Flying', vigilance: 'Vigilance', trample: 'Trample', haste: 'Haste',
    firstStrike: 'First strike', doubleStrike: 'Double strike', deathtouch: 'Deathtouch',
    lifelink: 'Lifelink', reach: 'Reach', menace: 'Menace', defender: 'Defender',
    flash: 'Flash', hexproof: 'Hexproof', indestructible: 'Indestructible',
  };
  return keywords.map(k => display[k] || (k[0].toUpperCase() + k.slice(1))).join(', ');
}

// Flat string for storage/logging. UI uses describeCardSegments for highlights.
// skipKeywords:true keeps the stored text free of the keyword preamble so
// successive engine regenerations (line 567 of engine.js fires on every
// makeCard / makeCard-after-grant) don't bake "Trample. " into card.text
// and double up with the render-time preamble. The keyword preamble is a
// UI concern, added fresh by the card frame's describeCardSegments call.
function describeCardText(card) {
  return segsToText(describeCardSegments(card, {skipKeywords: true}));
}

// Segments with highlight flags. opts.skipKeywords for badge-rendering UI.
function describeCardSegments(card, opts) {
  opts = opts || {};
  const tpl = CARDS[card.tplId] || card;
  if (tpl.customText === true || tpl.special === true) {
    // Hand-authored static text. Many special cards (City Guardian,
    // Archdemon Bargains) already mention their intrinsic keywords
    // inline, so we DON'T prepend the full keyword list -- that would
    // duplicate "First Strike" etc. But GRANTED keywords (from Elystra's
    // permanentEot accumulator, Endomorph's absorb, runtime spell
    // effects) aren't in the static text and need to be surfaced. We
    // compute granted = card.keywords \ tpl.keywords and prepend just
    // those, mirroring how non-special cards inline their full preamble.
    // Skipped when opts.skipKeywords (the classic frame renders its own
    // keyword badges via nativeKeywordBadgesHtml).
    //
    // Sections must be flattened before return because consumers
    // (segmentsToHtml, the test harness) expect a flat array of segment
    // objects, not array-of-arrays. The non-special branch below has
    // its own flatten loop; we mirror it.
    const sections = [];
    if (!opts.skipKeywords && (card.type === 'Creature' || tpl.type === 'Creature')) {
      const intrinsic = new Set(tpl.keywords || []);
      const granted = (card.keywords || []).filter(kw => !intrinsic.has(kw) && kw !== 'no_block');
      if (granted.length > 0) {
        const kw = keywordPreamble(granted);
        if (kw) sections.push([plainSeg(kw + '.')]);
      }
    }
    const staticText = card.text || tpl.text || '';
    if (staticText) sections.push([plainSeg(staticText)]);
    const out = [];
    for (let i = 0; i < sections.length; i++) {
      if (i > 0) out.push(plainSeg(' '));
      out.push(...sections[i]);
    }
    return out;
  }
  // Stapled cards diff against synthesized template (so staple-half bumps highlight).
  let tplBaseline = tpl;
  if (card.stapledFrom && typeof ENGINE !== 'undefined' && ENGINE.synthesizeStapledTemplate) {
    try {
      tplBaseline = ENGINE.synthesizeStapledTemplate(
        card.stapledFrom.baseTplId, card.stapledFrom.stapledTpls);
    } catch (e) {
      tplBaseline = tpl;
    }
  }
  const sections = [];
  if (!opts.skipKeywords && (card.type === 'Creature' || tpl.type === 'Creature')) {
    const kw = keywordPreamble(card.keywords || tpl.keywords || []);
    if (kw) sections.push([plainSeg(kw + '.')]);
  }
  if (card.effects && card.effects.modes) {
    sections.push(describeModalSegs(card.effects.modes, tplBaseline.effects && tplBaseline.effects.modes));
  } else if (Array.isArray(card.effects) && card.effects.length > 0) {
    const tplEffs = Array.isArray(tplBaseline.effects) ? tplBaseline.effects : undefined;
    sections.push(describeEffectList(card.effects, card.name || tpl.name, tplEffs, card.target || tpl.target));
  }
  if (Array.isArray(card.staticBuffs)) {
    for (const buff of card.staticBuffs) {
      const phrase = describeStaticBuff(buff);
      if (phrase) sections.push([plainSeg(phrase)]);
    }
  }
  if (Array.isArray(card.triggers)) {
    const tplTriggers = Array.isArray(tplBaseline.triggers) ? tplBaseline.triggers : [];
    for (let i = 0; i < card.triggers.length; i++) {
      const trig = card.triggers[i];
      const tplTrig = tplTriggers[i];
      sections.push(describeTrigger(trig, tplTrig));
    }
  }
  if (Array.isArray(card.abilities)) {
    const tplAbilities = Array.isArray(tplBaseline.abilities) ? tplBaseline.abilities : [];
    for (let i = 0; i < card.abilities.length; i++) {
      const ab = card.abilities[i];
      // A basic land's fixed tap-for-mana ability is intrinsic (shown via the
      // type line, not rules text) — suppress it so basics render empty. A
      // choose-form mana land (City of Brass / duals) keeps its ability text.
      if (card.type === 'Land' && ab.cost && ab.cost.tap
          && ab.effects && ab.effects[0] && ab.effects[0].kind === 'addMana'
          && ab.effects[0].amounts) {
        continue;
      }
      const tplAb = tplAbilities[i];
      const abSegs = describeAbility(ab, tplAb);
      sections.push(abSegs.concat(plainSeg('.')));
    }
  }
  const nonEmpty = sections.filter(s => s && s.length > 0);
  if (nonEmpty.length === 0) {
    // Vanilla keyword-only creatures fall back to tpl.text; skipKeywords callers get nothing (badges suffice).
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

// "Choose one — A; or B; or C." block.
function describeModalSegs(modes, tplModes) {
  const out = [plainSeg('Choose one — ')];
  for (let i = 0; i < modes.length; i++) {
    if (i > 0) out.push(plainSeg('; or '));
    const tplMode = Array.isArray(tplModes) ? tplModes[i] : undefined;
    let modeSegs = describeEffectList(modes[i], null, tplMode);
    if (modeSegs.length > 0 && modeSegs[modeSegs.length - 1].text === '.') {
      modeSegs = modeSegs.slice(0, -1);
    }
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
