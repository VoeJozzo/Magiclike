// Audit A2-13 — summoning sickness had no DIRECT test; its only fence was an
// accidental choreography-coupled assertion in test_rules_infra.js (an A1-7
// empty-combat-skip rework could silently delete the sick gate and stay green).
// This pins the gate at both layers: the canCreatureAttack predicate and the
// declareAttackers legality surface. Tests only; the gate (engine.js:942) is
// correct. Land before any A1-7 remediation so enforcement can't vanish silently.
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  '+(ok?'PASS':'FAIL')+': '+label+(info?' -- '+info:'')); if(ok)pass++; else fail++; }
let nextIid = 9600;
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
  console.log('=== A2-13: canCreatureAttack respects summoning sickness ===');
  {
    const sick = mk(VANILLA,'you'); sick.power=2; sick.toughness=2; sick.sick=true;
    check('sick creature cannot attack', ENGINE.canCreatureAttack(sick) === false);
    const hasty = mk(VANILLA,'you'); hasty.power=2; hasty.toughness=2; hasty.sick=true; hasty.keywords=['haste'];
    check('sick + haste CAN attack', ENGINE.canCreatureAttack(hasty) === true);
    const ready = mk(VANILLA,'you'); ready.power=2; ready.toughness=2; ready.sick=false;
    check('guard: non-sick creature can attack', ENGINE.canCreatureAttack(ready) === true);
  }
  console.log('=== A2-13: declareAttackers legality rejects a sick attacker ===');
  {
    const G = newGame();
    const S = mk(VANILLA,'you'); S.power=2; S.toughness=2; S.sick=true;
    // A ready creature keeps a legal attacker available so COMBAT_ATTACK pauses
    // (an all-sick board has no legal attacker -> the phase auto-skips, A1-7).
    const R = mk(VANILLA,'you'); R.power=2; R.toughness=2; R.sick=false;
    G.you.battlefield.push(S, R); giveHold(G,'you'); readyMain(G,'you');
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    check('reached COMBAT_ATTACK', G.phase==='COMBAT_ATTACK', 'phase='+G.phase);
    check('declareAttackers([sick]) is ILLEGAL',
      ENGINE.isLegalAction('you', { type:'declareAttackers', cardIids:[S.iid] }) === false);
    S.sick = false;
    check('legal once sickness clears',
      ENGINE.isLegalAction('you', { type:'declareAttackers', cardIids:[S.iid] }) === true);
  }
}
console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
process.exit(fail>0?1:0);
