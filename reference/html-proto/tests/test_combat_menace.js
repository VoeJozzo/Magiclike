// Audit A2-15 — menace enforcement (a lone blocker is illegal; 2+ required) had
// ZERO regression coverage, at a site whose own comment records a prior silent
// failure (Object.entries string-key coercion). A future refactor reintroducing
// string keys would land green and repeat the bite. This pins the lone-block
// rejection. Tests only; the menace check (engine.js declareBlockers legality)
// is correct.
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  '+(ok?'PASS':'FAIL')+': '+label+(info?' -- '+info:'')); if(ok)pass++; else fail++; }
let nextIid = 9500;
function mk(tplId, controller){
  const inst = JSON.parse(JSON.stringify(CARDS[tplId]));
  return Object.assign(inst, { iid: nextIid++, tplId, controller, owner: controller,
    tapped:false, sick:false, damage:0, tempPower:0, tempTou:0, permPower:0, permTou:0,
    damagedBySources:new Set(), keywords:(inst.keywords||[]).slice() });
}
function newGame(){ RUN.clearSave && RUN.clearSave();
  RUN.start({ cards: Array(12).fill('plains'), colors:['R'] }, null); RUN.startNextGame(); return ENGINE.state(); }
function readyMain(G, who){ G.activePlayer=who; G.priorityHolder=who; G.phase='MAIN1'; G.stack=[]; G.gameOver=false; G.priority={passes:new Set()}; }
function giveHold(G, who){ G[who].battlefield.push(mk('mountain', who)); G[who].hand.push(mk('lightning_bolt', who)); }
function passUntil(G, done, max){ let s=max||30; while(!done() && s-->0){ const w=ENGINE.expectedActor(); if(!w)break; ENGINE.executeAction(w,{type:'pass'}); } }
const VANILLA = (()=>{ for (const [id,c] of Object.entries(CARDS)){ if (hasType(c,'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id; } return null; })();

if (!VANILLA || !CARDS['mountain'] || !CARDS['lightning_bolt']) { console.log('  (required templates missing)'); fail++; }
else {
  console.log('=== A2-15: menace requires 2+ blockers (lone block rejected) ===');
  {
    const G = newGame();
    const M = mk(VANILLA,'you'); M.power=2; M.toughness=2; M.sick=false; M.keywords=['menace'];
    G.you.battlefield.push(M); giveHold(G,'you'); readyMain(G,'you');
    const b1 = mk(VANILLA,'opp'); b1.power=1; b1.toughness=1; b1.sick=false;
    const b2 = mk(VANILLA,'opp'); b2.power=1; b2.toughness=1; b2.sick=false;
    G.opp.battlefield.push(b1, b2); giveHold(G,'opp');
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    ENGINE.executeAction('you', { type:'declareAttackers', cardIids:[M.iid] });
    check('menace attacker declared', G.attackers.includes(M.iid));
    passUntil(G, ()=>G.phase==='COMBAT_BLOCK' && !G.blockersDeclared, 10);
    check('reached block window', G.phase==='COMBAT_BLOCK' && !G.blockersDeclared, 'phase='+G.phase);
    check('a SINGLE blocker on a menace attacker is ILLEGAL',
      ENGINE.isLegalAction('opp', { type:'declareBlockers', blockMap:new Map([[b1.iid, M.iid]]) }) === false);
    check('TWO blockers on a menace attacker is LEGAL',
      ENGINE.isLegalAction('opp', { type:'declareBlockers', blockMap:new Map([[b1.iid, M.iid],[b2.iid, M.iid]]) }) === true);
    check('guard: declaring NO blocks against menace is legal',
      ENGINE.isLegalAction('opp', { type:'declareBlockers', blockMap:new Map() }) === true);
  }
  console.log('=== A2-15 guard: a NON-menace attacker accepts a single blocker ===');
  {
    const G = newGame();
    const A = mk(VANILLA,'you'); A.power=2; A.toughness=2; A.sick=false; // no menace
    G.you.battlefield.push(A); giveHold(G,'you'); readyMain(G,'you');
    const b = mk(VANILLA,'opp'); b.power=1; b.toughness=1; b.sick=false;
    G.opp.battlefield.push(b); giveHold(G,'opp');
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    ENGINE.executeAction('you', { type:'declareAttackers', cardIids:[A.iid] });
    passUntil(G, ()=>G.phase==='COMBAT_BLOCK' && !G.blockersDeclared, 10);
    check('single blocker on a NON-menace attacker is legal',
      ENGINE.isLegalAction('opp', { type:'declareBlockers', blockMap:new Map([[b.iid, A.iid]]) }) === true);
  }
}
console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
process.exit(fail>0?1:0);
