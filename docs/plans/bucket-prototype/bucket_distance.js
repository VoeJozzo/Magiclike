#!/usr/bin/env node
// Archetype distance matrix: mean cross-edge mass between card groups.
// Reuses the extraction/edge machinery from bucket_proto.js (inlined).
const fs = require('fs'); const path = require('path');
const CARDS_DIR = path.resolve(__dirname, '../../../reference/html-proto/cards');
const manifest = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, '_manifest.json'), 'utf8'));
const SUPERTYPES = new Set(['Creature','Land','Instant','Sorcery','Artifact','Enchantment','Basic','Spell','Token']);
const PIPS = ['W','U','B','R','G'];
const CARDS = {};
for (const f of manifest) { try { CARDS[f] = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f, 'card.json'), 'utf8')); } catch {} }
const colorsOf = c => PIPS.filter(k => (c.cost||{})[k] > 0);
const totalCost = c => Object.values(c.cost||{}).reduce((s,v)=>s+v,0);
const subtypesOf = c => (c.types||[]).filter(t => !SUPERTYPES.has(t));
const isCreature = c => (c.types||[]).includes('Creature');
const isSpell = c => (c.types||[]).includes('Sorcery') || (c.types||[]).includes('Instant');
function walk(o,kinds,conds){ if(Array.isArray(o)){o.forEach(x=>walk(x,kinds,conds));return;}
  if(o&&typeof o==='object'){ if(typeof o.kind==='string')kinds.push(o);
    for(const[k,v]of Object.entries(o)){ if(k==='condition')(Array.isArray(v)?v:[v]).forEach(s=>typeof s==='string'&&conds.push(s)); walk(v,kinds,conds);}}}
function analyze(c){
  const kinds=[],conds=[]; walk(c,kinds,conds);
  const P={},W={}; const add=(m,r,w)=>{m[r]=Math.max(m[r]||0,w);};
  for(const st of subtypesOf(c)) add(P,`sub:${st}`,1);
  for(const k of kinds){
    if(k.kind==='create_tokens'){ const tribe=(k.token_id||'').split('_')[0];
      if(tribe) add(P,`sub:${tribe[0].toUpperCase()}${tribe.slice(1)}`,1.2);
      add(P,'fodder',2); add(P,'dies',2); add(P,'wide',2); }
    if(k.kind==='gain_life'&&(k.amount||0)>0) add(P,'lifegain',2); }
  if((c.keywords||[]).includes('lifelink')) add(P,'lifegain',1.5);
  if(isCreature(c)){ add(P,'dies', totalCost(c)<=2?1:0.3); if(totalCost(c)<=1) add(P,'fodder',1); }
  if(isSpell(c)) add(P,'spellcast',1);
  for(const s of conds){ const m=s.match(/card_has_subtype\((\w+)\)/); if(m) add(W,`sub:${m[1]}`,3);
    if(/card_moves\(battlefield,\s*graveyard\)/.test(s)) add(W,'dies',3); }
  for(const sb of (c.static_buffs||[])){ if(sb.subtype){add(W,`sub:${sb.subtype}`,3); add(P,'anthem',1);} else add(W,'wide',2); }
  for(const ab of (c.abilities||[])) if(ab.cost&&ab.cost.sacrifice){ add(W,'fodder',3); add(P,'dies',2); }
  for(const t of (c.triggers||[])){ if(t.event==='life_changed')add(W,'lifegain',3); if(t.event==='spell_cast')add(W,'spellcast',3); }
  const H=new Set();
  if((c.keywords||[]).includes('flying'))H.add('flying');
  if((c.keywords||[]).includes('haste')||(c.triggers||[]).some(t=>t.event==='attacks'))H.add('aggro');
  // the one-line lesson: damage that can go to the face = part of the race plan
  if(kinds.some(k=>k.kind==='damage') && /player|opp|any/.test(c.target||''))H.add('aggro');
  if(kinds.some(k=>k.kind==='affect_creature'||(k.kind==='damage'&&isSpell(c))))H.add('removal');
  if(kinds.some(k=>k.kind==='move_card'))H.add('cardflow');
  return {id:c.card_id,P,W,H,raw:c,kinds};
}
function edge(a,b){ let w=0;
  for(const[r,pw]of Object.entries(a.P)) if(b.W[r]) w+=pw*b.W[r];
  for(const[r,pw]of Object.entries(b.P)) if(a.W[r]) w+=pw*a.W[r];
  for(const h of a.H) if(b.H.has(h)) w+=0.5;
  return w; }

const POOL = Object.values(CARDS).filter(c=>c.card_id&&!(c.types||[]).includes('Land')).map(analyze);

// ---- archetype groups, defined the same way themes are ----
const GROUPS = {
  'Goblins':       a => subtypesOf(a.raw).includes('Goblin'),
  'Burn spells':   a => isSpell(a.raw) && a.kinds.some(k=>k.kind==='damage'),
  'Counterspells': a => a.kinds.some(k=>k.kind==='counter'),
  'Lifegain':      a => a.P['lifegain'] > 0 || a.W['lifegain'] > 0,
  'Death-matters': a => a.W['dies'] > 0 || (a.P['dies']||0) >= 2,
  'Spirits':       a => subtypesOf(a.raw).includes('Spirit'),
  'Fliers':        a => (a.raw.keywords||[]).includes('flying'),
};
const members = {};
for (const [g, fn] of Object.entries(GROUPS)) members[g] = POOL.filter(fn);

// mean cross-edge mass between groups (diagonal = internal cohesion)
const names = Object.keys(GROUPS);
console.log('group sizes:', names.map(n=>`${n}=${members[n].length}`).join('  '), '\n');
const cell = (A,B,same) => {
  let sum=0, n=0;
  for(const a of A) for(const b of B){ if(a.id===b.id) continue; sum+=edge(a,b); n++; }
  return n ? (sum/n) : 0;
};
const colw = 15;
console.log(' '.repeat(colw) + names.map(n=>n.slice(0,13).padStart(14)).join(''));
for(const r of names){
  let row = r.slice(0,13).padEnd(colw);
  for(const c of names) row += cell(members[r],members[c],r===c).toFixed(2).padStart(14);
  console.log(row);
}
console.log('\nreading: higher = closer. diagonal = internal cohesion of the archetype.');
