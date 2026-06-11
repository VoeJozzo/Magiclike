#!/usr/bin/env node
// Prototype: producer/consumer synergy graph -> seed-and-grow bucket generation.
// Mental model: a cohesive bucket is a micro-engine (producer -> consumer),
// not a pile of similar cards. Edges are labeled so buckets can EXPLAIN themselves.
const fs = require('fs');
const path = require('path');
const CARDS_DIR = path.resolve(__dirname, '../../../reference/html-proto/cards');
const manifest = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, '_manifest.json'), 'utf8'));
const SUPERTYPES = new Set(['Creature','Land','Instant','Sorcery','Artifact','Enchantment','Basic','Spell','Token']);
const PIPS = ['W','U','B','R','G'];

const CARDS = {};
for (const f of manifest) {
  try { CARDS[f] = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f, 'card.json'), 'utf8')); } catch {}
}

const colorsOf = c => {
  const cols = PIPS.filter(k => (c.cost || {})[k] > 0);
  return cols.length ? cols : [];      // empty = colorless, compatible with anything
};
const totalCost = c => Object.values(c.cost || {}).reduce((s, v) => s + v, 0);
const subtypesOf = c => (c.types || []).filter(t => !SUPERTYPES.has(t));
const isCreature = c => (c.types || []).includes('Creature');
const isSpell = c => (c.types || []).includes('Sorcery') || (c.types || []).includes('Instant');

function walk(o, kinds, conds) {
  if (Array.isArray(o)) { o.forEach(x => walk(x, kinds, conds)); return; }
  if (o && typeof o === 'object') {
    if (typeof o.kind === 'string') kinds.push(o);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'condition') (Array.isArray(v) ? v : [v]).forEach(s => typeof s === 'string' && conds.push(s));
      walk(v, kinds, conds);
    }
  }
}

// ---------- resource extraction: PROVIDES / WANTS, weighted ----------
function analyze(c) {
  const kinds = [], conds = [];
  walk(c, kinds, conds);
  const P = {}, W = {};                       // resource -> weight
  const add = (m, r, w) => { m[r] = Math.max(m[r] || 0, w); };

  // --- provides ---
  for (const st of subtypesOf(c)) add(P, `sub:${st}`, 1);
  for (const k of kinds) {
    if (k.kind === 'create_tokens') {
      const tribe = (k.token_id || '').split('_')[0];
      if (tribe) add(P, `sub:${tribe[0].toUpperCase()}${tribe.slice(1)}`, 1.2);
      add(P, 'fodder', 2); add(P, 'dies', 2); add(P, 'wide', 2);
    }
    if (k.kind === 'gain_life' && (k.amount || 0) > 0) add(P, 'lifegain', 2);
  }
  if ((c.keywords || []).includes('lifelink')) add(P, 'lifegain', 1.5);
  if (isCreature(c)) {
    add(P, 'dies', totalCost(c) <= 2 ? 1 : 0.3);          // cheap bodies are willing fodder
    if (totalCost(c) <= 1) add(P, 'fodder', 1);
  }
  if (isSpell(c)) add(P, 'spellcast', 1);

  // --- wants ---
  for (const s of conds) {
    const m = s.match(/card_has_subtype\((\w+)\)/);
    if (m) add(W, `sub:${m[1]}`, 3);
    if (/card_moves\(battlefield,\s*graveyard\)/.test(s)) add(W, 'dies', 3);
  }
  for (const sb of (c.static_buffs || [])) {
    if (sb.subtype) { add(W, `sub:${sb.subtype}`, 3); add(P, 'anthem', 1); }
    else add(W, 'wide', 2);                                // global anthem wants a wide board
  }
  for (const ab of (c.abilities || [])) {
    if (ab.cost && ab.cost.sacrifice) { add(W, 'fodder', 3); add(P, 'dies', 2); }  // sac outlets also PRODUCE deaths
  }
  for (const t of (c.triggers || [])) {
    if (t.event === 'life_changed') add(W, 'lifegain', 3);
    if (t.event === 'spell_cast') add(W, 'spellcast', 3);
  }
  // weak similarity tags (homophily): shared plan, not producer/consumer
  const H = new Set();
  if ((c.keywords || []).includes('flying')) H.add('flying');
  if ((c.keywords || []).includes('haste') || (c.triggers || []).some(t => t.event === 'attacks')) H.add('aggro');
  if (kinds.some(k => k.kind === 'affect_creature' || (k.kind === 'damage' && isSpell(c)))) H.add('removal');
  if (kinds.some(k => k.kind === 'move_card')) H.add('cardflow');
  return { id: c.card_id, P, W, H, colors: colorsOf(c), cost: totalCost(c), creature: isCreature(c) };
}

const POOL = Object.values(CARDS)
  .filter(c => c.card_id && !c.special && (c.draftWeight === undefined || c.draftWeight > 0))
  .filter(c => !(c.types || []).includes('Land'))
  .map(analyze);
const BY_ID = Object.fromEntries(POOL.map(a => [a.id, a]));

// ---------- labeled edge weight ----------
function edge(a, b) {
  let w = 0; const reasons = [];
  for (const [r, pw] of Object.entries(a.P)) if (b.W[r]) { w += pw * b.W[r]; reasons.push(`${a.id} feeds ${b.id} [${r}]`); }
  for (const [r, pw] of Object.entries(b.P)) if (a.W[r]) { w += pw * a.W[r]; reasons.push(`${b.id} feeds ${a.id} [${r}]`); }
  for (const h of a.H) if (b.H.has(h)) { w += 0.5; reasons.push(`shared plan [${h}]`); }
  return { w, reasons };
}

// ---------- seed-and-grow ----------
function colorsCompatible(bucketCols, cardCols) {
  return new Set([...bucketCols, ...cardCols]).size <= 2;
}
function growBucket(seedId, deckIds = [], temperature = 0.7) {
  const seed = BY_ID[seedId];
  const bucket = [seed];
  const deck = deckIds.map(id => BY_ID[id]).filter(Boolean);
  const allReasons = [];
  while (bucket.length < 3) {
    const bucketCols = bucket.flatMap(x => x.colors);
    const cands = POOL.filter(c =>
      !bucket.includes(c) && colorsCompatible(bucketCols, c.colors) &&
      !bucket.some(b => b.cost === c.cost && bucket.length === 2));   // crude curve spread on last slot
    const scored = cands.map(c => {
      let s = 0; const rs = [];
      for (const b of bucket) { const e = edge(c, b); s += e.w; rs.push(...e.reasons); }
      for (const d of deck) { const e = edge(c, d); s += 0.25 * e.w; }          // deck coupling λ=0.25
      return { c, s, rs };
    }).filter(x => x.s > 0);
    if (!scored.length) break;
    // softmax sample for run-to-run variety (argmax would make every run identical)
    const max = Math.max(...scored.map(x => x.s));
    const weights = scored.map(x => Math.exp((x.s - max) / (temperature * Math.max(1, max / 4))));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = scored[0];
    for (let i = 0; i < scored.length; i++) { r -= weights[i]; if (r <= 0) { pick = scored[i]; break; } }
    bucket.push(pick.c); allReasons.push(...pick.rs);
  }
  // coherence = sum of internal edges
  let coh = 0;
  for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) coh += edge(bucket[i], bucket[j]).w;
  return { cards: bucket.map(b => b.id), coherence: coh.toFixed(1), why: [...new Set(allReasons)] };
}

// ---------- demo 1: standalone buckets from characterful seeds ----------
console.log('=== DEMO 1: seed-and-grow buckets (no deck context) ===');
for (const seed of ['blood_artist', 'goblin_chieftain', 'ajanis_pridemate', 'spirit_shepherd', 'carrion_feeder', 'apex_elder']) {
  if (!BY_ID[seed]) { console.log(`  (${seed} not in pool)`); continue; }
  const b = growBucket(seed);
  console.log(`\nseed: ${seed}  ->  [${b.cards.join(', ')}]  coherence=${b.coherence}`);
  b.why.slice(0, 4).forEach(r => console.log(`    ${r}`));
}

// ---------- demo 2: an offer against a mock BR deck ----------
console.log('\n=== DEMO 2: 3-bucket offer for a mock BR deck ===');
const mockDeck = ['raging_goblin', 'goblin_piercer', 'lightning_bolt', 'blood_artist', 'vampire_bat', 'shock'].filter(id => BY_ID[id]);
console.log('deck:', mockDeck.join(', '));
// identity seeds: pool cards with strongest total edge into the deck
const identScore = POOL.filter(c => !mockDeck.includes(c.id) && colorsCompatible(['B','R'], c.colors))
  .map(c => ({ c, s: mockDeck.reduce((s, d) => s + edge(c, BY_ID[d]).w, 0) }))
  .sort((a, b) => b.s - a.s);
const seeds = [identScore[0].c.id, identScore[2].c.id];
// adjacent: high want-weight payoff in deck colors NOT already synergizing with deck
const adjacent = identScore.filter(x => Object.keys(x.c.W).length && x.s < 2).map(x => x.c.id)[0];
for (const [label, seed] of [['identity', seeds[0]], ['identity', seeds[1]], ['adjacent', adjacent]]) {
  if (!seed) continue;
  const b = growBucket(seed, mockDeck);
  console.log(`\n[${label}] seed: ${seed}  ->  [${b.cards.join(', ')}]  coherence=${b.coherence}`);
  b.why.slice(0, 3).forEach(r => console.log(`    ${r}`));
}

// ---------- sanity: strongest producer/consumer pairs in the whole pool ----------
console.log('\n=== top 12 synergy pairs in the pool (graph sanity check) ===');
const pairs = [];
for (let i = 0; i < POOL.length; i++) for (let j = i + 1; j < POOL.length; j++) {
  const e = edge(POOL[i], POOL[j]);
  if (e.w >= 3) pairs.push({ a: POOL[i].id, b: POOL[j].id, w: e.w });
}
pairs.sort((x, y) => y.w - x.w).slice(0, 12).forEach(p => console.log(`  ${p.w.toFixed(1)}  ${p.a} <-> ${p.b}`));
console.log(`\npool analyzed: ${POOL.length} cards, ${pairs.length} pairs with edge >= 3`);
