// Audit A2-6 — residual combat-coverage battery. The first-strike / trample /
// duplicate-attacker / change-control / deathtouch-lifelink cases already have
// dedicated files; sick (A2-13) and menace (A2-15) are split out. This covers
// the remaining dark live behavior: VIGILANCE no-tap on declaration and
// MULTI-BLOCK damage (both the all-die exchange and the kill-value ordering when
// the attacker can't kill every blocker). Tests only; behavior-neutral.
const setup = require('./_setup');
setup.loadEngine();

let pass = 0, fail = 0;
function check(label, ok, info){ console.log('  '+(ok?'PASS':'FAIL')+': '+label+(info?' -- '+info:'')); if(ok)pass++; else fail++; }
let nextIid = 9700;
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
function passUntil(G, done, max){ let s=max||40; while(!done() && s-->0){ const w=ENGINE.expectedActor(); if(!w)break; ENGINE.executeAction(w,{type:'pass'}); } }
const alive = (G, side, iid) => G[side].battlefield.some(c => c.iid === iid);
const VANILLA = (()=>{ for (const [id,c] of Object.entries(CARDS)){ if (hasType(c,'Creature') && !c.triggers && !c.abilities && !c.static_buffs) return id; } return null; })();

if (!VANILLA || !CARDS['mountain'] || !CARDS['lightning_bolt']) { console.log('  (required templates missing)'); fail++; }
else {
  console.log('=== A2-6: a vigilance attacker is NOT tapped on declaration ===');
  {
    const G = newGame();
    const V = mk(VANILLA, 'you'); V.power=2; V.toughness=2; V.sick=false; V.keywords=['vigilance'];
    G.you.battlefield.push(V); giveHold(G,'you'); readyMain(G,'you');
    const W = mk(VANILLA, 'opp'); W.power=0; W.toughness=3; W.sick=false; G.opp.battlefield.push(W);
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    ENGINE.executeAction('you', { type:'declareAttackers', cardIids:[V.iid] });
    check('vigilance attacker declared', G.attackers.includes(V.iid));
    check('vigilance attacker is NOT tapped after declaring', V.tapped === false, 'tapped='+V.tapped);
  }
  console.log('=== A2-6 control: a non-vigilance attacker IS tapped ===');
  {
    const G = newGame();
    const N = mk(VANILLA, 'you'); N.power=2; N.toughness=2; N.sick=false;
    G.you.battlefield.push(N); giveHold(G,'you'); readyMain(G,'you');
    const W = mk(VANILLA, 'opp'); W.power=0; W.toughness=3; W.sick=false; G.opp.battlefield.push(W);
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    ENGINE.executeAction('you', { type:'declareAttackers', cardIids:[N.iid] });
    check('non-vigilance attacker IS tapped after declaring', N.tapped === true, 'tapped='+N.tapped);
  }
  console.log('=== A2-6: multi-block damage exchange (3/3 vs 1/1 + 2/2 -> all die) ===');
  {
    const G = newGame();
    const A = mk(VANILLA,'you'); A.power=3; A.toughness=3; A.sick=false;
    G.you.battlefield.push(A); giveHold(G,'you'); readyMain(G,'you');
    const b1 = mk(VANILLA,'opp'); b1.power=1; b1.toughness=1; b1.sick=false;
    const b2 = mk(VANILLA,'opp'); b2.power=2; b2.toughness=2; b2.sick=false;
    G.opp.battlefield.push(b1, b2); giveHold(G,'opp');
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    ENGINE.executeAction('you', { type:'declareAttackers', cardIids:[A.iid] });
    passUntil(G, ()=>G.phase==='COMBAT_BLOCK' && !G.blockersDeclared, 12);
    ENGINE.executeAction('opp', { type:'declareBlockers', blockMap:new Map([[b1.iid, A.iid],[b2.iid, A.iid]]) });
    passUntil(G, ()=>G.phase==='MAIN2' || G.gameOver, 40);
    check('combat resolved (MAIN2)', G.phase==='MAIN2', 'phase='+G.phase);
    check('both blockers died (3 power assigned lethal to 1+2)', !alive(G,'opp',b1.iid) && !alive(G,'opp',b2.iid));
    check('attacker died (took 1+2=3 = its toughness)', !alive(G,'you',A.iid));
  }
  console.log('=== A2-6: multi-block kill-value ordering (2-power attacker can kill only one) ===');
  {
    const G = newGame();
    const A = mk(VANILLA,'you'); A.power=2; A.toughness=5; A.sick=false; // survives
    G.you.battlefield.push(A); giveHold(G,'you'); readyMain(G,'you');
    const small = mk(VANILLA,'opp'); small.power=1; small.toughness=1; small.sick=false; // declared FIRST
    const big   = mk(VANILLA,'opp'); big.power=1; big.toughness=2; big.sick=false;       // declared second
    G.opp.battlefield.push(small, big); giveHold(G,'opp');
    passUntil(G, ()=>G.phase==='COMBAT_ATTACK');
    ENGINE.executeAction('you', { type:'declareAttackers', cardIids:[A.iid] });
    passUntil(G, ()=>G.phase==='COMBAT_BLOCK' && !G.blockersDeclared, 12);
    ENGINE.executeAction('opp', { type:'declareBlockers', blockMap:new Map([[small.iid, A.iid],[big.iid, A.iid]]) });
    passUntil(G, ()=>G.phase==='MAIN2' || G.gameOver, 40);
    check('attacker survived (toughness 5 > 1+1 incoming)', alive(G,'you',A.iid));
    // Characterization: with 2 power vs a 1/1 + 1/2, the engine assigns lethal by
    // its kill-value re-sort. Pin the OBSERVED outcome so a kill-value retune that
    // silently changes RULES behavior red-flags. (Exactly one blocker dies.)
    const smallAlive = alive(G,'opp',small.iid), bigAlive = alive(G,'opp',big.iid);
    check('exactly one of the two blockers died', smallAlive !== bigAlive,
      'small.alive='+smallAlive+' big.alive='+bigAlive);
    check('the 1/2 (higher kill-value) died; the 1/1 survived', smallAlive === true && bigAlive === false,
      'small.alive='+smallAlive+' big.alive='+bigAlive);
  }
}
console.log('\n=== TOTAL: '+pass+' passed, '+fail+' failed ===');
process.exit(fail>0?1:0);
