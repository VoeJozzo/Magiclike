// CARD TEXT — generates rules text from card data. Pure read-only.
// Returns {text, highlight}[] segments — bumped values get highlight:true
// (empower visual emphasis). describeCardText is the flat-string wrapper.
// Cards with custom_text:true (Endomorph, Codex, Elystra) keep hand-authored text.
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

// eff.target → noun phrase. 'player' = "target opponent" for damage/discard, "target player" for gain_life.
function targetPhrase(eff) {
  const t = eff.target;
  if (t === 'self')     return 'you';
  // Accurate, structural mapping (no kind/sign guessing): 'opp' is opponent-only
  // (what harmful effects target — text matches the one legal target); 'player'
  // is a free choice of any player (heals etc.). Cards mean exactly one of these.
  if (t === 'opp')    return 'target opponent';
  if (t === 'player') return 'target player';
  if (t === 'creature') return 'target creature';
  // New target() taxonomy (§3.5).
  if (t === 'creature_or_player') return 'any target';
  if (t === 'your_creature') return 'target creature you control';
  if (t === 'opp_creature') return 'target creature an opponent controls';
  if (t === 'graveyard_creature') return 'target creature card';
  if (t === 'opp_graveyard_card') return "target card from an opponent's graveyard";
  if (t === 'permanent')return 'target permanent';
  if (t === 'spell')    return 'target spell';
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
  if (f.not_color)         pre.push('non-' + (COLOR_NAMES[f.not_color] || f.not_color));
  if (f.subtype)          pre.push(f.subtype);
  if (f.has_keyword)       post.push('with ' + f.has_keyword);
  if (f.not_keyword)       post.push('without ' + f.not_keyword);
  if (f.not_token)         post.push("that isn't a token");
  if (f.controller === 'you' || f.controller === 'self') post.push('you control');
  if (f.controller === 'opp') post.push('an opponent controls');
  if (typeof f.max_tough === 'number') post.push('with toughness ' + f.max_tough + ' or less');
  if (typeof f.min_tough === 'number') post.push('with toughness ' + f.min_tough + ' or greater');
  if (typeof f.max_power === 'number') post.push('with power ' + f.max_power + ' or less');
  if (typeof f.min_power === 'number') post.push('with power ' + f.min_power + ' or greater');
  // A card-type restriction narrows the generic noun to that type:
  // "target permanent" + {type:'Land'} → "target land". The head noun is
  // whichever of creature/permanent the phrase used (each phrase has one);
  // pre-mods (color/tapped/…) then attach to that narrowed noun.
  let head = /\bpermanent\b/.test(noun) ? 'permanent' : (/\bcard\b/.test(noun) ? 'card' : 'creature');
  let out = noun;
  if (f.type) { out = out.replace(head, f.type.toLowerCase()); head = f.type.toLowerCase(); }
  if (f.not_type) { out = out.replace(head, 'non' + f.not_type.toLowerCase() + ' ' + head); }
  if (pre.length) out = out.replace(head, pre.join(' ') + ' ' + head);
  if (post.length) out += ' ' + post.join(' ');
  return out;
}

function searchFilterNoun(filter, includeCard) {
  const suffix = includeCard === false ? '' : ' card';
  if (!filter) return 'card';
  if (typeof filter === 'string') return filter.toLowerCase() + suffix;
  if (filter.subtype) return filter.subtype.toLowerCase() + suffix;
  if (filter.sub) return filter.sub.toLowerCase() + suffix;
  if (filter.type) return filter.type.toLowerCase() + suffix;
  return 'card';
}

// Phrase for one `fight` operand: {select} → "your strongest creature"; {slot:N}
// → the noun for that target slot (from the card's target_slots spec, or a
// top-level target() step). Used by describeEffectList's fight block.
function fightOperandPhrase(op, slotSpecs, stepTarget, stepFilter) {
  if (op && op.select) return 'your strongest creature';
  if (op && op.slot != null) {
    if (Array.isArray(slotSpecs) && slotSpecs[op.slot]) {
      const sp = slotSpecs[op.slot];
      return withFilter(targetPhrase({ target: sp.target }), sp.filter ? { filter: sp.filter } : {});
    }
    if (stepTarget) return withFilter(targetPhrase({ target: stepTarget }), stepFilter ? { filter: stepFilter } : {});
  }
  return 'a creature';
}

// Numeric passthrough; {from:'<x>'} → player-readable phrase via dynMap.
function describeAmount(amount) {
  if (typeof amount === 'number') return String(amount);
  if (amount && typeof amount === 'object' && amount.from) {
    const dynMap = {
      target_power:     "the target's power",
      target_toughness: "the target's toughness",
      source_power:     "this creature's power",
      source_toughness: "this creature's toughness",
      mana_spent:       'mana spent on it',
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

// Indefinite article ("a"/"an") for a noun phrase. Letter-initial words go by
// the leading vowel (artifact → "an"); a leading number goes by how it's spoken
// (a P/T like "3/3" → "a three…", but "8/8"/"80" → "an eight…", and the teens
// "11"/"18" → "an"). Scoped to card type lines (types, creature types, small
// P/T) — deliberately NOT a general English solver: it won't catch "a unicorn"
// or "an honor", which don't occur in generated type text.
function indefiniteArticle(phrase) {
  const num = /^\s*(\d+)/.exec(phrase);
  if (num) {
    const s = num[1];
    return (s[0] === '8' || s === '11' || s === '18') ? 'an' : 'a';
  }
  return /^\s*[aeiou]/i.test(phrase) ? 'an' : 'a';
}

// Signed stat segment for pump (+N for buffs, -N for weaken/signed deltas),
// preserving the empower-bump highlight. "+2"/"-2".
function signedStat(field, eff, tplEff, negZero) {
  const v = eff[field] || 0;
  const tplV = tplEff ? (tplEff[field] || 0) : undefined;
  const bumped = tplEff != null && typeof v === 'number' && typeof tplV === 'number' && v !== tplV;
  // A zero stat takes the pump's overall sign so a debuff reads "-2/-0", not
  // "-2/+0" (negZero set by the caller when any stat is negative).
  const sign = (v < 0 || (v === 0 && negZero)) ? '-' : '+';
  return { text: sign + Math.abs(v), highlight: bumped };
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
  'apply_sticker', 'steal', 'annihilate', 'bargain_sticker_self', 'bargain_sticker_other',
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
      if (eff.scope === 'self') return [plainSeg('you take '), amtSeg, plainSeg(' damage')];
      if (eff.scope === 'all_creatures') return [plainSeg('deal '), amtSeg, plainSeg(' damage to each creature')];
      return [plainSeg('deal '), amtSeg, plainSeg(' damage to ' + t)];
    case 'gain_life':
      if (typeof eff.amount === 'object' && eff.amount && eff.amount.from) {
        const owner = (eff.who && eff.who.from === 'target_controller') ? "its controller" : 'you';
        return [plainSeg(owner + ' gains life equal to ' + describeAmount(eff.amount))];
      }
      // §D4: a negative amount is life loss — render the sign as "lose N life".
      if (typeof eff.amount === 'number' && eff.amount < 0) {
        const n = -eff.amount;
        if (eff.scope === 'self')   return [plainSeg('you lose ' + n + ' life')];
        if (eff.target === 'player' || eff.target === 'opp') return [plainSeg(t + ' loses ' + n + ' life')];
        return [plainSeg('lose ' + n + ' life')];
      }
      if (eff.scope === 'self')   return [plainSeg('you gain '), amtSeg, plainSeg(' life')];
      if (eff.target === 'player' || eff.target === 'opp') return [plainSeg(t + ' gains '), amtSeg, plainSeg(' life')];
      return [plainSeg('gain '), amtSeg, plainSeg(' life')];
    case 'draw':
      if (eff.target === 'player' || eff.target === 'opp') {
        if (eff.amount === 1) return [plainSeg(t + ' draws a card')];
        return [plainSeg(t + ' draws '), amtSeg, plainSeg(' cards')];
      }
      if (eff.amount === 1) return [plainSeg('draw a card')];
      return [plainSeg('draw '), amtSeg, plainSeg(' cards')];
    case 'discard':
      if (eff.target === 'player' || eff.target === 'opp') {
        if (eff.amount === 1) return [plainSeg(t + ' discards a card')];
        return [plainSeg(t + ' discards '), amtSeg, plainSeg(' cards')];
      }
      if (eff.amount === 1) return [plainSeg('discard a card')];
      return [plainSeg('discard '), amtSeg, plainSeg(' cards')];
    case 'pump': {
      // duration:permanent → +1/+1 counters (add_counter collapse). Counters
      // come in +1/+1 units, so a uniform +N/+N is "N +1/+1 counters" (a +2/+2
      // pump = two +1/+1 counters), not "a +2/+2 counter".
      if (eff.duration === 'permanent') {
        const onWhom = eff.scope === 'self' ? 'this' : t;
        const p = eff.power || 0, tg = eff.toughness || 0;
        if (p === tg && p >= 1) {
          if (p === 1) return [plainSeg('put a +1/+1 counter on ' + onWhom)];
          const countSeg = bumpedDerived(NUM_WORDS[p] || String(p), 'power', eff, tplEff);
          return [plainSeg('put '), countSeg, plainSeg(' +1/+1 counters on ' + onWhom)];
        }
        // Non-uniform permanent pump (rare) — keep the explicit +X/+Y form.
        const pSeg = bumpedSeg('power', eff, tplEff, 0);
        const tSeg = bumpedSeg('toughness', eff, tplEff, 0);
        return [plainSeg('put a +'), pSeg, plainSeg('/+'), tSeg, plainSeg(' counter on ' + onWhom)];
      }
      // Signed (weaken = negative deltas) + mass scope (pumpAllYours collapse).
      let subj, verb;
      if (eff.scope === 'all_yours') { subj = 'creatures you control'; verb = ' get '; }
      else if (eff.scope === 'all_creatures') { subj = 'all creatures'; verb = ' get '; }
      else if (eff.scope === 'self') { subj = 'this creature'; verb = ' gets '; }
      else { subj = t; verb = ' gets '; }
      const negZero = (eff.power || 0) < 0 || (eff.toughness || 0) < 0;
      return [plainSeg(subj + verb), signedStat('power', eff, tplEff, negZero), plainSeg('/'),
              signedStat('toughness', eff, tplEff, negZero), plainSeg(' until end of turn')];
    }
    case 'add_counter': {
      if (eff.counter) {
        const n = eff.amount || 1;
        const noun = n === 1 ? 'a ' + eff.counter + ' counter' : numWord(n) + ' ' + eff.counter + ' counters';
        return [plainSeg('put ' + noun + ' on ' + (eff.scope === 'self' ? 'this' : t))];
      }
      const pSeg = bumpedSeg('power', eff, tplEff, 1);
      const tSeg = bumpedSeg('toughness', eff, tplEff, 1);
      const tail = eff.scope === 'self' ? ' counter on this' : ' counter on ' + t;
      return [plainSeg('put a +'), pSeg, plainSeg('/+'), tSeg, plainSeg(tail)];
    }
    case 'grant_keyword': {
      // 'eot' → EOT text; targeted → "as long as on bf" (source-tied); self → no duration.
      let dur;
      if (eff.duration === 'eot') {
        dur = ' until end of turn';
      } else if (eff.target === 'creature' || eff.target === 'your_creature' || eff.target === 'opp_creature'
                 || eff.scope === 'all_yours' || eff.scope === 'all_creatures') {
        // Non-eot grants are source-linked (applyGrant tracks the source iid;
        // the keyword falls off when the source leaves play). The §3.5 migration
        // renamed the target 'creature'→'your_creature'/'opp_creature', which
        // had silently dropped this phrase.
        dur = ' as long as this is on the battlefield';
      } else {
        dur = '';
      }
      if (eff.scope === 'all_yours') {
        return [plainSeg('creatures you control gain ' + eff.keyword + dur)];
      }
      if (eff.scope === 'all_creatures') {
        return [plainSeg('each creature gains ' + eff.keyword + dur)];
      }
      if (eff.scope === 'self') return [plainSeg('this creature gains ' + eff.keyword + dur)];
      return [plainSeg(t + ' gains ' + eff.keyword + dur)];
    }
    case 'affect_creature': {
      // tap/bounce/destroy/exile. Verb highlights when severity is empower-bumped.
      const sev = ENGINE.sevToNum(eff.severity);
      const verb = sev >= 4 ? 'exile' : sev >= 3 ? 'destroy'
                 : sev >= 2 ? 'return' : 'tap';
      const bumped = tplEff != null && ENGINE.sevToNum(eff.severity) !== ENGINE.sevToNum(tplEff.severity);
      const verbSeg = { text: verb, highlight: bumped };
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
    case 'create_tokens': {
      const tok = eff.token_id || 'creature';
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
        const noun = searchFilterNoun(eff.filter, true);
        return [plainSeg('search your library for ' + indefiniteArticle(noun) + ' ' + noun + ' and put it into your hand')];
      }
      if (fz === 'library' && tz === 'battlefield') {  // collapsed searchLandTapped (auto fetch)
        // Derive the fetched-card noun from the filter (subtype > type > "card"),
        // mirroring the fetch-to-hand case above — a {type:'Land'} filter is "a
        // land", not the old hardcoded "basic land" (which was narrower than the
        // filter and drifted from what the card actually does).
        const noun = searchFilterNoun(eff.filter, false);
        return [plainSeg('search your library for ' + indefiniteArticle(noun) + ' ' + noun + ' and put it onto the battlefield' + ((eff.post && eff.post.tap) ? ' tapped' : ''))];
      }
      if (fz === 'library' && tz === 'hand') {  // collapsed draw
        if (eff.amount === 1) return [plainSeg('draw a card')];
        return [plainSeg('draw '), amtSeg, plainSeg(' cards')];
      }
      if (fz === 'hand' && tz === 'graveyard') {  // collapsed discard
        if (eff.target === 'player' || eff.target === 'opp') {
          if (eff.amount === 1) return [plainSeg(t + ' discards a card')];
          return [plainSeg(t + ' discards '), amtSeg, plainSeg(' cards')];
        }
        if (eff.amount === 1) return [plainSeg('discard a card')];
        return [plainSeg('discard '), amtSeg, plainSeg(' cards')];
      }
      if (fz === 'graveyard' && tz === 'battlefield') {  // reanimate
        // The superlative + cross-zone restriction (Deepseam Quarry's "greatest
        // total mana cost among all graveyards") and the take_control rider are
        // rendered here — withFilter can't name a superlative or span both yards.
        const gf = eff.filter || {};
        let noun;
        if (gf.greatest_total_cost) {
          noun = 'the creature card with the greatest total mana cost among '
            + (gf.all_graveyards ? 'all graveyards' : 'your graveyard');
        } else {
          noun = t + ' from ' + (gf.all_graveyards ? 'a graveyard' : 'your graveyard');
        }
        const ctrlRider = (eff.post && eff.post.take_control) ? ' under your control' : '';
        return [plainSeg('return ' + noun + ' to the battlefield' + ctrlRider)];
      }
      if (fz === 'graveyard' && tz === 'hand') return [plainSeg('return ' + t + ' from your graveyard to your hand')];
      if (fz === 'graveyard' && tz === 'exile') return [plainSeg('exile ' + t)];
      if (fz === 'battlefield' && tz === 'library') return [plainSeg('shuffle ' + t + " into its owner's library")];
      if (fz === 'battlefield' && tz === 'hand') return [plainSeg('return ' + t + " to its owner's hand")];
      if (fz === 'battlefield' && tz === 'exile') return [plainSeg('exile ' + t)];          // flicker outgoing / exile removal
      if (fz === 'exile' && tz === 'battlefield') {
        if (eff.selector === 'copy_source') return [plainSeg("return the exiled card to the battlefield under its owner's control")];
        return [plainSeg('return it to the battlefield')];  // flicker return
      }
      return [plainSeg('move ' + t)];
    }
    case 'untap': {
      if (eff.scope === 'self') return [plainSeg('untap this creature')];
      const filterMinusTapped = eff.filter ? Object.assign({}, eff.filter, {tapped: undefined}) : null;
      const tNoTap = withFilter(targetPhrase(eff), filterMinusTapped ? Object.assign({}, eff, {filter: filterMinusTapped}) : eff);
      return [plainSeg('untap ' + tNoTap)];
    }
    case 'add_type':
    case 'set_types': {
      const tags = Array.isArray(eff.types) ? eff.types : (eff.type ? [eff.type] : []);
      const dur = (eff.duration === 'permanent') ? '' : ' until end of turn';
      const pt = (eff.power || eff.toughness) ? (eff.power || 0) + '/' + (eff.toughness || 0) + ' ' : '';
      const body = pt + tags.join(' ');
      const verb = eff.kind === 'set_types' ? ' becomes ' : ' also becomes ';
      return [plainSeg(t + verb + indefiniteArticle(body) + ' ' + body + dur)];
    }
    case 'apply_in_game_splice':
      return [plainSeg('staple the second target permanent onto the first')];
    case 'fight': {
      // Fallback for bare describeEffect calls (no slot context). describeEffectList
      // renders the rich form (operand phrases from the card's slots) — see its
      // dedicated fight block. Here we can only spell a {select} operand.
      const ops = Array.isArray(eff.operands) ? eff.operands : [];
      const subj = ops[0] && ops[0].select ? 'your strongest creature' : (t || 'a creature');
      const obj = ops[1] && ops[1].select ? 'your strongest creature' : (t || 'a creature');
      return [plainSeg(subj + ' fights ' + obj)];
    }
    case 'schedule_delayed':
      // Standalone fallback; the exile-until-eot pair is rendered as one phrase
      // by describeEffectList (below).
      return [plainSeg('return it to the battlefield at end of turn')];
    case 'grant_cast_permission': {
      const dur = eff.duration === 'eot' ? 'until end of turn, ' : '';
      const mana = eff.spend_as_any_color
        ? ', and you may spend mana as though it were mana of any color to cast it'
        : '';
      return [plainSeg(dur + 'you may cast that card' + mana)];
    }
    case 'add_mana': {
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
      // sacrifices a <noun>". The noun comes from the chooses() filter carried
      // here as edictFilter ('creature' | 'permanent' | 'land'); default creature.
      if (eff.target === 'player' || eff.target === 'opp' || eff.target === 'creature_or_player')
        return [plainSeg(t + ' sacrifices a ' + (eff.edictFilter || 'creature'))];
      if (eff.scope === 'self') return [plainSeg('sacrifice this creature')];
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
      if (eff.grant_haste) riders.push('it gains haste until end of turn');
      if (riders.length > 0) {
        const cap = riders.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join('. ');
        segs.push(plainSeg('. ' + cap));
      }
      return segs;
    }
    case 'endomorph_absorb':
      return [plainSeg('gain a keyword from the slain creature, or +1/+1 if none')];
    case 'annihilate':
      // Rip-edict trailing chain — the whole phrase is carried by the `rip` clause.
      return [];
    case 'rip':
      if (eff.target === 'player' || eff.target === 'opp' || eff.target === 'creature_or_player')
        return [plainSeg(t + ' rips a permanent they control')];
      return [plainSeg('rip ' + (t || 'it'))];
    case 'become_copy_of': {
      // The False Witness doppelganger. Refers back to the just-exiled creature
      // ("that creature"); keep_subtypes renders the "except it's also …" rider.
      const keep = (Array.isArray(eff.keep_subtypes) && eff.keep_subtypes.length)
        ? eff.keep_subtypes.join(' ') : '';
      const rider = keep ? (", except it's also " + indefiniteArticle(keep) + ' ' + keep) : '';
      return [plainSeg('this becomes a copy of that creature' + rider)];
    }
    case 'symmetricize':
      return [plainSeg(t + "'s controller equalizes its power, toughness, or cost")];
    case 'apply_sticker': {
      // Standalone persistent rider (Bleach: set_color). The 2-effect balancer-
      // tax pattern (move_card + apply_sticker) is rendered at the list level.
      const sk = eff.sticker || {};
      const subj = t || 'it';
      if (sk.kind === 'set_color') {
        if (sk.color === 'C') return [plainSeg(subj + ' becomes colorless, including its mana cost, permanently')];
        const cn = (COLOR_NAMES[sk.color] || sk.color).toLowerCase();
        return [plainSeg(subj + ' becomes ' + cn + ' permanently')];
      }
      if (sk.kind === 'cost_mod') {
        const n = sk.amount || 0;
        return [plainSeg(subj + ' costs {' + Math.abs(n) + '} ' + (n < 0 ? 'less' : 'more') + ' permanently')];
      }
      if (sk.kind === 'stat_boost') {
        return [plainSeg(subj + ' gets +' + (sk.power || 0) + '/+' + (sk.toughness || 0) + ' permanently')];
      }
      if (sk.kind === 'set_types') {
        const tags = Array.isArray(sk.types) ? sk.types : (sk.type ? [sk.type] : []);
        const body = tags.join(' ');
        return [plainSeg(subj + ' becomes ' + indefiniteArticle(body) + ' ' + body + ' permanently')];
      }
      if (sk.kind === 'grant_activated_ability' && sk.ability) {
        return [plainSeg(subj + ' gains "' + segsToText(describeAbility(sk.ability)) + '" permanently')];
      }
      return [plainSeg(subj + ' gets a lasting change')];
    }
  }
  return [plainSeg('[' + eff.kind + ']')];
}

function segsToText(segs) {
  return segs.map(s => s.text).join('');
}

// Join effects into a sentence. Special-case: 2 damage effects use shared-subject phrasing.
// Subject key for buff coalescing — pump and grant_keyword (both scope/target)
// must map to the SAME key to share one clause.
function buffSubjectKey(eff) {
  if (eff.scope === 'all_yours') return 'all_yours';
  if (eff.scope === 'all_creatures') return 'all_creatures';
  if (eff.scope === 'self') return 'self';
  return 'tgt:' + (eff.target || '');
}
// Coalesce same-subject EOT buffs (pump + keyword grants) into one clause:
// "X gets +A/+B and gains KW1 and KW2 until end of turn" — instead of repeating
// the subject and "until end of turn" once per effect (overrun, strengthOfPack,
// predatorsSpeed). Returns segments, or null when the shape doesn't apply.
function coalesceEotBuffs(effects, tplOf) {
  if (effects.length < 2) return null;
  const pump = e => e.kind === 'pump' && e.duration !== 'permanent' && !('target_slot' in e);
  const grant = e => e.kind === 'grant_keyword' && e.duration === 'eot' && !('target_slot' in e);
  if (!effects.every(e => pump(e) || grant(e))) return null;
  const key = buffSubjectKey(effects[0]);
  if (!effects.every(e => buffSubjectKey(e) === key)) return null;
  let subject, plural;
  if (key === 'all_yours') { subject = 'creatures you control'; plural = true; }
  else if (key === 'all_creatures') { subject = 'all creatures'; plural = true; }
  else if (key === 'self') { subject = 'this creature'; plural = false; }
  else { subject = targetPhrase({ target: key.slice(4) }); plural = false; }
  const getV = plural ? 'get ' : 'gets ';
  const gainV = plural ? 'gain ' : 'gains ';
  const out = [plainSeg(subject + ' ')];
  const clauses = [];
  effects.filter(pump).forEach(e => {
    const tpl = tplOf(effects.indexOf(e));
    const neg = (e.power || 0) < 0 || (e.toughness || 0) < 0;
    clauses.push({ verb: getV, segs: [signedStat('power', e, tpl, neg), plainSeg('/'), signedStat('toughness', e, tpl, neg)] });
  });
  const grants = effects.filter(grant);
  if (grants.length) clauses.push({ verb: gainV, segs: [plainSeg(grants.map(e => e.keyword).join(' and '))] });
  clauses.forEach((c, i) => {
    if (i > 0) out.push(plainSeg(' and '));
    out.push(plainSeg(c.verb), ...c.segs);
  });
  out.push(plainSeg(' until end of turn'));
  // Trailing '.' as a SEPARATE seg so the modal joiner can strip it (mode bodies
  // drop a standalone '.' before joining with "; or").
  return capitalizeSegs(out).concat(plainSeg('.'));
}

// Effects whose rendered noun is governed by a preceding chooses() filter.
const EDICT_CHAIN_KINDS = new Set(['sacrifice', 'annihilate', 'rip']);

function describeEffectList(effects, cardName, tplEffects, stepTarget, stepFilter, slotSpecs) {
  if (!Array.isArray(effects) || effects.length === 0) return [];
  // Give each bare effect a synthetic `target` so targetPhrase + withFilter
  // render "...target non-black creature" etc. Two sources, matching how
  // resolution feeds the target: (1) multi-target — the effect's `target_slot`
  // indexes into `slotSpecs` (the canonical `target_slots` array, §5b); (2)
  // single — a top-level target() step (§3.5) shared by all bare effects.
  // The edict idiom: a chooses() step names the type the forced player loses
  // ('creature' | 'permanent' | 'land'); the noun is rendered by the trailing
  // sacrifice/annihilate/rip clause, so carry the chooses filter onto it.
  const edictFilter = (effects.find(e => e && e.kind === 'chooses') || {}).filter;
  if (stepTarget || (Array.isArray(slotSpecs) && slotSpecs.length)) {
    effects = effects.map(e => {
      if (!e || e.target || e.kind === 'chooses' || e.scope != null) return e;
      if (Array.isArray(slotSpecs) && e.target_slot != null && slotSpecs[e.target_slot]) {
        const spec = slotSpecs[e.target_slot];
        return Object.assign({}, e, spec.filter ? { target: spec.target, filter: spec.filter } : { target: spec.target });
      }
      if (!stepTarget) return e;
      const inj = { target: stepTarget };
      if (stepFilter) inj.filter = stepFilter;
      else if (typeof edictFilter === 'string' && EDICT_CHAIN_KINDS.has(e.kind)) inj.edictFilter = edictFilter;
      return Object.assign({}, e, inj);
    });
  }
  const tplOf = i => (Array.isArray(tplEffects) ? tplEffects[i] : undefined);
  const parts = effects.map((e, i) => describeEffect(e, tplOf(i)));
  // fight idiom: "<A> fights <B>", A/B = operand phrases (from the card's slots
  // or a {select} pick). When a PRIOR effect already named A's creature (Predate:
  // pump on the same slot), A becomes "it" and the two clauses join with ", then".
  // A standalone fight (Prey Upon / Beast's Fury) spells A out. Handled here,
  // before the single-effect early return, so a fight-only card is covered too.
  const fi = effects.findIndex(e => e && e.kind === 'fight' && Array.isArray(e.operands));
  if (fi >= 0) {
    const fe = effects[fi];
    const op0 = fe.operands[0], op1 = fe.operands[1];
    const objPhrase = fightOperandPhrase(op1, slotSpecs, stepTarget, stepFilter);
    const op0NamedBefore = op0 && op0.slot != null
      && effects.slice(0, fi).some(pe => pe && pe.target_slot === op0.slot);
    const subjPhrase = op0NamedBefore ? 'it' : fightOperandPhrase(op0, slotSpecs, stepTarget, stepFilter);
    const fightSeg = plainSeg(subjPhrase + ' fights ' + objPhrase);
    const others = effects.filter((e, i) => i !== fi && e
      && describeEffect(e, tplOf(i)).some(seg => seg && seg.text));
    if (others.length === 0) {
      return capitalizeSegs([fightSeg]).concat(plainSeg('.'));
    }
    if (others.length === 1) {
      const oi = effects.indexOf(others[0]);
      return capitalizeSegs(describeEffect(others[0], tplOf(oi)))
        .concat(plainSeg(', then ')).concat([fightSeg]).concat(plainSeg('.'));
    }
    // >1 other effects (not exercised today) falls through to the generic joiner.
  }
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
    if (e1.scope === 'self') {
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
      && effects[1].scope === 'self') {
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
  // Scarification idiom: an affect_creature removal + an apply_sticker(scarified)
  // persistent rider. The removal verb is rendered DYNAMICALLY via describeEffect
  // so an empower-promoted severity shows ("exile", not a frozen "destroy") and
  // bump-highlights — the whole reason this card stopped being custom_text, which
  // had hardcoded "Destroy" and hid the empower. (The scar rider prose is fixed —
  // the scarified life-loss isn't an empower target — so it's a literal here,
  // mirroring the balancer-tax idiom below.)
  if (effects.length === 2) {
    const acIdx = effects.findIndex(e => e.kind === 'affect_creature' && !e.scope);
    const apIdx = effects.findIndex(e => e.kind === 'apply_sticker' && e.sticker_id === 'scarified');
    if (acIdx >= 0 && apIdx >= 0) {
      return capitalizeSegs(describeEffect(effects[acIdx], tplOf(acIdx)))
        .concat(plainSeg('. Scar it: each time it enters the battlefield, its controller loses 1 life.'));
    }
  }
  // Balancer-tax pattern: a move_card removal + an apply_sticker persistent rider
  // (bleach: exile + set_color; embargo: bounce + cost_mod). Render the removal,
  // then the rider with a pronoun so the target isn't repeated.
  if (effects.length === 2) {
    const mc = effects.find(e => e.kind === 'move_card' && e.from_zone === 'battlefield');
    const ap = effects.find(e => e.kind === 'apply_sticker');
    if (mc && ap) {
      const sk = ap.sticker || {};
      let rider = null;
      if (sk.kind === 'set_color') {
        rider = sk.color === 'C'
          ? 'it becomes colorless, including its mana cost, permanently'
          : 'it becomes ' + (COLOR_NAMES[sk.color] || sk.color).toLowerCase() + ' permanently';
      } else if (sk.kind === 'cost_mod') {
        const n = sk.amount || 0;
        rider = 'it costs {' + Math.abs(n) + '} ' + (n < 0 ? 'less' : 'more') + ' permanently';
      } else if (sk.kind === 'stat_boost') {
        rider = 'it gets +' + (sk.power || 0) + '/+' + (sk.toughness || 0) + ' permanently';
      }
      if (rider) {
        const mcSeg = Object.assign({}, mc, stepTarget && !mc.target ? { target: stepTarget } : {});
        return capitalizeSegs(describeEffect(mcSeg)).concat(plainSeg('; ' + rider + '.'));
      }
    }
  }
  // Same-subject EOT buffs (pump + keyword grants) → one coalesced clause.
  const coalesced = coalesceEotBuffs(effects, tplOf);
  if (coalesced) return coalesced;
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
  if (cid === 'thisDealsCombatDamageToOpp') return 'Whenever this deals combat damage to an opponent,';
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
  if (cid === 'youCastCounterspell') return 'Whenever you cast a counterspell,';
  if (cid === 'youGainLife')    return 'Whenever you gain life,';
  if (ev === 'attacks') return 'When this attacks,';
  return 'Whenever a relevant event occurs,';
}

// Full trigger clause as segments (lowercase body since preamble ends in comma).
// A plain {W,U,B,R,G,C} cost -> brace string: generic first, then color pips
// (e.g. {R:1,C:2} -> "{2}{R}"). renderManaSymbols draws them.
function manaCostBraces(cost, opts) {
  opts = opts || {};
  const empty = opts.empty || '';
  if (!cost) return '';
  let s = '';
  if (cost.C) s += '{' + cost.C + '}';
  for (const c of ['W', 'U', 'B', 'R', 'G']) {
    for (let i = 0; i < (cost[c] || 0); i++) s += '{' + c + '}';
  }
  return s || empty;
}

function describeTrigger(trig, tplTrig) {
  const preamble = triggerPreamble(trig);
  const tplEffs = tplTrig ? tplTrig.effects : undefined;
  const body = describeEffectList(trig.effects || [], null, tplEffs, trig.target, trig.target_filter);
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
  // Optional paid trigger (Land+Spell staple ETB): "... you may pay {cost}: ...".
  if (trig.optional_cost) {
    return [plainSeg(preamble + ' you may pay ' + manaCostBraces(trig.optional_cost, {empty: '{0}'}) + ': ')].concat(bodyLower);
  }
  return [plainSeg(preamble + ' ')].concat(bodyLower);
}

// Single seam for a trigger's one-line LOG / stack-pill label. Returns the
// AUTHORED label if the trigger carries one — post-cutover only custom_text cards
// do (e.g. Archdemon's bespoke bargain effects that don't generate cleanly) — else
// the generated reminder text, with the raw event name as a last resort.
//
// PROTO-ONLY SHORTCUT / GODOT DIVERGENCE: the rules engine (engine.js) calls this
// to write its log, which couples the engine to the text layer. That's fine for
// this loose single-bundle prototype, but the Godot port keeps its engine UI-free
// (engine/, "no UI imports") — there the engine emits a structured "trigger fired"
// signal and the presentation layer renders the label. Do NOT replicate an
// engine→text call inside the Godot engine. Kept as ONE named call here so the
// migration is a clean swap (replace the call with a signal emit). See the
// "Patterns to NOT replicate" note in CLAUDE.md.
function triggerLogText(trig) {
  if (!trig) return '';
  if (typeof trig.text === 'string' && trig.text) return trig.text;
  let gen = '';
  try { gen = segsToText(describeTrigger(trig, trig)); } catch (_) { gen = ''; }
  if (gen && gen.trim() && !/\[[a-z_]+\]/.test(gen)) return gen;
  return trig.event || '';
}

// Small number words for generated rules text ("Remove three verse counters").
function numWord(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return (n >= 0 && n <= 10) ? words[n] : String(n);
}

// cost → "{T}: " / "{R}: " / "Sacrifice this: " prefix.
function abilityCostPhrase(cost) {
  if (!cost) return '';
  const parts = [];
  if (cost.tap) parts.push('{T}');
  if (cost.mana) {
    if (cost.mana.colors_of_source) {
      parts.push('one mana of each of this card\'s colors');
      return parts.join(', ');
    }
    let s = '';
    for (const [color, n] of Object.entries(cost.mana)) {
      for (let i = 0; i < n; i++) s += '{' + color + '}';
    }
    if (s) parts.push(s);
  }
  if (cost.sacrifice) {
    parts.push('Sacrifice ' + (cost.sacrifice === 'self' ? 'this' : 'a ' + cost.sacrifice));
  }
  if (cost.remove_counters) {
    for (const [name, n] of Object.entries(cost.remove_counters)) {
      parts.push('Remove ' + numWord(n) + ' ' + name + ' counter' + (n === 1 ? '' : 's'));
    }
  }
  return parts.join(', ');
}

// "<cost>: <effect>" — caller adds final period.
function describeAbility(ab, tplAb) {
  const cost = abilityCostPhrase(ab.cost);
  const tplEffs = tplAb ? tplAb.effects : undefined;
  let body = describeEffectList(ab.effects || [], null, tplEffs, ab.target, ab.target_filter);
  if (body.length > 0 && body[body.length - 1].text === '.') {
    body = body.slice(0, -1);
  }
  // The `main_phase_only` flag restricts an activated ability to the controller's
  // main phase (empty stack) — the non-default timing. Magiclike has no "sorcery"
  // timing concept (the Flash refactor made instant-speed = the `flash` keyword),
  // so the reminder reads "during your main phase", not "as a sorcery". Rendered
  // as a second sentence; the caller appends the final period.
  const speedClause = ab.main_phase_only ? [plainSeg('. Activate only during your main phase')] : [];
  if (!cost) return body.concat(speedClause);
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
  return [plainSeg(cost + ': ')].concat(body).concat(speedClause);
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
  // Lookup display names so "first_strike" → "first strike", etc.
  const kwDisplay = {
    flying: 'flying', vigilance: 'vigilance', trample: 'trample', haste: 'haste',
    first_strike: 'first strike', double_strike: 'double strike', deathtouch: 'deathtouch',
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

// Keywords meaningful on a non-creature spell. Today only `flash` (the
// retired-Instant marker that grants instant-speed casting). Combat keywords
// (flying/trample/...) never apply to a spell, so they're filtered out of a
// spell's preamble — otherwise a sorcery could nonsensically read "Trample."
const SPELL_LEGAL_KEYWORDS = new Set(['flash']);

// Keyword list as "Flying, Vigilance" prefix.
function keywordPreamble(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return '';
  // no_block is the hidden half of Pacifism's "can't attack or block" lockdown
  // (paired with defender); never surfaced as a keyword in its own right.
  keywords = keywords.filter(k => k !== 'no_block');
  if (keywords.length === 0) return '';
  const display = {
    flying: 'Flying', vigilance: 'Vigilance', trample: 'Trample', haste: 'Haste',
    first_strike: 'First strike', double_strike: 'Double strike', deathtouch: 'Deathtouch',
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
  // Authored text is keyed on `custom_text` ONLY — `special` is a gameplay flag
  // (draft-excluded / unspliceable) and must NOT force hand-written text, else a
  // special card whose effects ARE describable can silently drift from them.
  // Special cards that genuinely need authored text carry `custom_text: true`.
  if (tpl.custom_text === true) {
    // Hand-authored static text. Many special cards (City Guardian,
    // Archdemon Bargains) already mention their intrinsic keywords
    // inline, so we DON'T prepend the full keyword list -- that would
    // duplicate "First Strike" etc. But GRANTED keywords (from Elystra's
    // permanent_eot accumulator, Endomorph's absorb, runtime spell
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
    if (!opts.skipKeywords && (hasType(card,'Creature') || hasType(tpl,'Creature'))) {
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
  if (!opts.skipKeywords) {
    // Creatures show their full keyword line; a non-creature spell surfaces only
    // spell-legal keywords (flash) so "Flash" appears on a sorcery without
    // leaking combat keywords onto it.
    const isCreatureCard = hasType(card,'Creature') || hasType(tpl,'Creature');
    const allKw = card.keywords || tpl.keywords || [];
    const kw = keywordPreamble(isCreatureCard ? allKw : allKw.filter(k => SPELL_LEGAL_KEYWORDS.has(k)));
    if (kw) sections.push([plainSeg(kw + '.')]);
  }
  if (card.effects && card.effects.modes) {
    sections.push(describeModalSegs(card.effects.modes, tplBaseline.effects && tplBaseline.effects.modes));
  } else if (Array.isArray(card.effects) && card.effects.length > 0) {
    const tplEffs = Array.isArray(tplBaseline.effects) ? tplBaseline.effects : undefined;
    sections.push(describeEffectList(card.effects, card.name || tpl.name, tplEffs, card.target || tpl.target, card.target_filter || tpl.target_filter, card.target_slots || tpl.target_slots));
  }
  if (Array.isArray(card.static_buffs)) {
    for (const buff of card.static_buffs) {
      const phrase = describeStaticBuff(buff);
      if (phrase) sections.push([plainSeg(phrase)]);
    }
  }
  if (card.spend_mana_as_any_color || tpl.spend_mana_as_any_color) {
    sections.push([plainSeg('You may spend mana as though it were mana of any color.')]);
  }
  if (card.innate || tpl.innate) {
    sections.push([plainSeg('Innate.')]);
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
      if (hasType(card,'Land') && ab.cost && ab.cost.tap
          && ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana'
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
