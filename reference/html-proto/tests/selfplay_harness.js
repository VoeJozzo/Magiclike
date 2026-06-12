// =============================================================================
// SELF-PLAY HARNESS
//
// Boots the engine in node, has AI instances play both sides. Two modes:
//
//   bughunt (default) — player drafts randomly + all basic lands get every
//     non-native color sticker applied at run start. Eliminates color screw
//     so weird random decks still cast their spells; maximizes card-
//     interaction surface area for bug catching.
//
//   playtest — heuristic drafter on both sides, no extra stickers. Matched
//     draft strength so balance numbers reflect engine asymmetries (going
//     first, life trajectories, etc.) rather than draft quality gaps.
//
// Both modes log:
//   - crashes, invariant violations, stuck/runaway games, AI illegal actions
//     (same fidelity)
//   - balance summary: pacing, first-player edge, action mix, mana curve,
//     life trajectory, board presence, color commitment
//
// Usage: node selfplay_harness.js [numGames] [mode]
//
// Adapted from the prior-session bundle.
// =============================================================================

const setup = require('./_setup');

const NUM_GAMES = parseInt(process.argv[2]) || 200;
const MODE = (process.argv[3] || 'bughunt').toLowerCase();
if (MODE !== 'bughunt' && MODE !== 'playtest') {
  console.error(`Unknown mode: ${MODE}. Use 'bughunt' or 'playtest'.`);
  process.exit(1);
}
const TURN_CAP = 100;
const ACTION_CAP = 2000;

setup.loadEngine();

// ─── Invariants (run after each action) ──────────────────────────────────────
// Each returns a string describing the violation, or null if state is fine.
const INVARIANTS = [
  function lifeInRange(G) {
    for (const who of ['you','opp']) {
      const life = G[who].life;
      if (typeof life !== 'number' || isNaN(life)) return `${who}.life not a number: ${life}`;
      if (life > 100) return `${who}.life too high: ${life}`;
      if (life < -50) return `${who}.life absurdly low: ${life}`;
    }
    return null;
  },

  function phaseDefined(G) {
    const valid = ['UNTAP','DRAW','MAIN1','COMBAT_ATTACK','COMBAT_BLOCK','COMBAT_DAMAGE','MAIN2','END','CLEANUP'];
    if (!valid.includes(G.phase)) return `unknown phase: ${G.phase}`;
    return null;
  },

  function activePlayerValid(G) {
    if (G.activePlayer !== 'you' && G.activePlayer !== 'opp') return `bad activePlayer: ${G.activePlayer}`;
    return null;
  },

  function cardsHaveIids(G) {
    for (const who of ['you','opp']) {
      for (const zone of ['hand','battlefield','library','graveyard','exile']) {
        const cards = G[who][zone];
        if (!Array.isArray(cards)) return `${who}.${zone} not an array`;
        for (const c of cards) {
          if (c.iid == null) return `${who}.${zone}: card without iid: ${c.name}`;
        }
      }
    }
    return null;
  },

  function noDuplicateIids(G) {
    const seen = new Set();
    for (const who of ['you','opp']) {
      for (const zone of ['hand','battlefield','library','graveyard','exile']) {
        for (const c of G[who][zone]) {
          if (seen.has(c.iid)) return `duplicate iid ${c.iid} (${c.name}) in ${who}.${zone}`;
          seen.add(c.iid);
        }
      }
    }
    return null;
  },

  function bfCreaturesHaveStats(G) {
    for (const who of ['you','opp']) {
      for (const c of G[who].battlefield) {
        if (!hasType(c, 'Creature')) continue;
        // Validate EFFECTIVE stats via getStats — an animated land (add_type with
        // P/T) legitimately carries no raw base power/toughness; its stats live in
        // the grant layer (permPower/tempPower) so the revert can zero them. The
        // sibling bfCreaturesAlive reads getStats for the same reason.
        const [p, t] = ENGINE.getStats(c);
        if (typeof p !== 'number') return `${c.name} on ${who}.bf: effective power not a number`;
        if (typeof t !== 'number') return `${c.name} on ${who}.bf: effective toughness not a number`;
        if (typeof c.damage !== 'number') return `${c.name} on ${who}.bf: damage not a number`;
      }
    }
    return null;
  },

  function bfCreaturesAlive(G) {
    for (const who of ['you','opp']) {
      for (const c of G[who].battlefield) {
        if (!hasType(c, 'Creature')) continue;
        const hasIndestructible = c.keywords && c.keywords.includes('indestructible');
        if (hasIndestructible) continue;
        const [, tou] = ENGINE.getStats(c);
        if (c.damage >= tou && tou > 0) {
          return `dead creature still on battlefield: ${c.name} (${c.damage} dmg vs ${tou} tou, who=${who})`;
        }
        if (tou <= 0 && !hasIndestructible) {
          return `0-toughness creature still on battlefield: ${c.name} (tou=${tou}, who=${who})`;
        }
      }
    }
    return null;
  },

  function manaInRange(G) {
    for (const who of ['you','opp']) {
      const pool = G[who].mana;
      if (!pool) return `${who} has no mana pool`;
      for (const color of ['W','U','B','R','G','C']) {
        const n = pool[color];
        if (typeof n !== 'number') return `${who}.mana.${color} not a number: ${n}`;
        if (n < 0) return `${who}.mana.${color} negative: ${n}`;
        if (n > 50) return `${who}.mana.${color} suspiciously high: ${n}`;
      }
    }
    return null;
  },

  function handSizesReasonable(G) {
    for (const who of ['you','opp']) {
      const sz = G[who].hand.length;
      if (sz < 0) return `${who}.hand.length negative: ${sz}`;
      if (sz > 30) return `${who}.hand has ${sz} cards (over limit)`;
    }
    return null;
  },

  function stackIsArray(G) {
    if (!Array.isArray(G.stack)) return `stack is not an array`;
    if (G.stack.length > 30) return `stack has ${G.stack.length} items`;
    return null;
  },

  function noOrphanRestrictions(G) {
    const allIids = new Set();
    for (const who of ['you','opp']) {
      for (const zone of ['hand','battlefield','library','graveyard','exile']) {
        for (const c of G[who][zone]) allIids.add(c.iid);
      }
    }
    for (const who of ['you','opp']) {
      for (const c of G[who].battlefield) {
        if (c.cantAttackBy instanceof Set) {
          for (const srcIid of c.cantAttackBy) {
            if (!allIids.has(srcIid)) return `${c.name} has orphan cantAttackBy iid=${srcIid}`;
          }
        }
        if (c.cantBlockBy instanceof Set) {
          for (const srcIid of c.cantBlockBy) {
            if (!allIids.has(srcIid)) return `${c.name} has orphan cantBlockBy iid=${srcIid}`;
          }
        }
      }
    }
    return null;
  },
];

function runOneGame(gameIdx) {
  const result = {
    gameIdx,
    crashed: false, crashError: null, crashStack: null, crashedDuringAction: null,
    invariantViolation: null, stuck: false, runaway: false,
    illegalAction: null,
    winner: null, turns: 0, actionsTaken: 0,
    cardsSeen: new Set(),
    firstPlayer: null,
    actionTypes: { you: {}, opp: {} },
    cardsByController: { you: new Set(), opp: new Set() },
    manaSpentByTurn: { you: [], opp: [] },
    lifeByTurn: { you: [], opp: [] },
    creaturesByTurn: { you: [], opp: [] },
    deckColors: { you: [], opp: [] },
    looseColors: { you: [], opp: [] },
  };

  try {
    DRAFT.startDraft('classic');
    const picksSoFar = [];
    let safety = 0;
    while (!DRAFT.isComplete() && safety < 50) {
      const pack = DRAFT.getPlayerPack();
      if (!pack || pack.length === 0) break;
      const pick = (MODE === 'playtest')
        ? DRAFT.pickFromPack(pack, picksSoFar)
        : pack[Math.floor(Math.random() * pack.length)];
      DRAFT.pickPlayer(pick);
      picksSoFar.push(pick);
      safety++;
    }
    const playerDeck = DRAFT.getPlayerDeck();
    if (!playerDeck) {
      result.crashed = true;
      result.crashError = 'DRAFT.getPlayerDeck returned null';
      result.crashedDuringAction = 'draft';
      return result;
    }
    RUN.start(playerDeck, null);

    if (MODE === 'bughunt') {
      const NATIVE_OF_TPL = { plains:'W', island:'U', swamp:'B', mountain:'R', forest:'G' };
      const slots = RUN.getSlots();
      for (let i = 0; i < slots.length; i++) {
        const native = NATIVE_OF_TPL[slots[i].tplId];
        if (!native) continue;
        for (const c of ['W','U','B','R','G']) {
          if (c === native) continue;
          RUN.applyStickerToSlot(i, 'landColor_' + c);
        }
      }
    }

    RUN.startNextGame();
    const initG = ENGINE.state();
    if (initG) {
      result.firstPlayer = initG.firstPlayer || initG.activePlayer;
      const COLORS = ['W','U','B','R','G'];
      for (const who of ['you','opp']) {
        const pips = { W:0, U:0, B:0, R:0, G:0 };
        const allCards = [...initG[who].library, ...initG[who].hand];
        for (const card of allCards) {
          if (hasType(card, 'Land')) continue;
          if (!card.cost) continue;
          for (const c of COLORS) {
            if (card.cost[c]) pips[c] += card.cost[c];
          }
        }
        result.looseColors[who] = COLORS.filter(c => pips[c] >= 1);
        result.deckColors[who] = COLORS.filter(c => pips[c] >= 2);
      }
    }
  } catch (e) {
    result.crashed = true;
    result.crashError = `draft/start: ${e.message}`;
    result.crashStack = e.stack;
    result.crashedDuringAction = 'draft-or-start';
    return result;
  }

  let actionsTaken = 0;
  let lastTurn = 0;
  let lastTurnKey = '';
  while (actionsTaken < ACTION_CAP) {
    let G;
    try { G = ENGINE.state(); }
    catch (e) {
      result.crashed = true;
      result.crashError = `state() threw: ${e.message}`;
      result.crashStack = e.stack;
      return result;
    }
    if (!G) {
      result.crashed = true;
      result.crashError = 'state() returned null mid-game';
      return result;
    }
    if (G.gameOver) {
      result.winner = G.winner;
      result.turns = G.turn || lastTurn;
      result.actionsTaken = actionsTaken;
      break;
    }

    for (const who of ['you','opp']) {
      for (const c of G[who].battlefield) {
        if (c.tplId) {
          result.cardsSeen.add(c.tplId);
          result.cardsByController[who].add(c.tplId);
        }
      }
    }

    const turnKey = `${G.activePlayer}-${G.turn}`;
    if (turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      const ap = G.activePlayer;
      result.lifeByTurn[ap].push(G[ap].life);
      result.creaturesByTurn[ap].push(
        G[ap].battlefield.filter(c => hasType(c, 'Creature')).length
      );
      result.manaSpentByTurn[ap].push(
        G[ap].battlefield.filter(c => hasType(c, 'Land')).length
      );
    }

    if ((G.turn || 0) > TURN_CAP) {
      result.runaway = true;
      result.turns = G.turn;
      result.actionsTaken = actionsTaken;
      break;
    }
    lastTurn = G.turn || lastTurn;

    for (const inv of INVARIANTS) {
      let violation;
      try { violation = inv(G); }
      catch (e) {
        result.invariantViolation = `invariant ${inv.name} threw: ${e.message}`;
        result.turns = G.turn || lastTurn;
        return result;
      }
      if (violation) {
        result.invariantViolation = `[${inv.name}] ${violation}`;
        result.turns = G.turn || lastTurn;
        result.actionsTaken = actionsTaken;
        return result;
      }
    }

    let actor;
    try { actor = ENGINE.expectedActor(); }
    catch (e) {
      result.crashed = true;
      result.crashError = `expectedActor threw: ${e.message}`;
      result.crashStack = e.stack;
      return result;
    }
    if (!actor) {
      result.stuck = true;
      result.crashError = 'expectedActor() returned null with game not over';
      result.turns = G.turn || lastTurn;
      result.actionsTaken = actionsTaken;
      return result;
    }

    let action;
    try { action = AI.decide(G, actor); }
    catch (e) {
      result.crashed = true;
      result.crashError = `AI.decide(${actor}) threw: ${e.message}`;
      result.crashStack = e.stack;
      result.crashedDuringAction = `decide:${actor}`;
      return result;
    }
    if (!action) {
      result.stuck = true;
      result.crashError = `AI.decide(${actor}) returned null`;
      result.turns = G.turn || lastTurn;
      return result;
    }

    // executeAction's contract: illegal → console.warn + return false, no
    // throw (the catch is for genuine crashes mid-execution). An AI that
    // proposes an illegal action is its own failure class — without this,
    // the deterministic re-propose loop marches to ACTION_CAP and gets
    // mislabeled "runaway", and the rejected no-ops pollute the
    // actionTypes/actionsTaken stats.
    let ok;
    try { ok = ENGINE.executeAction(actor, action); }
    catch (e) {
      result.crashed = true;
      result.crashError = `executeAction threw: ${e.message}`;
      result.crashStack = e.stack;
      result.crashedDuringAction = `${actor}:${action.type}`;
      return result;
    }
    if (!ok) {
      result.illegalAction = { actor, action };
      result.turns = G.turn || lastTurn;
      result.actionsTaken = actionsTaken;
      return result;
    }

    const at = result.actionTypes[actor];
    at[action.type] = (at[action.type] || 0) + 1;
    actionsTaken++;
  }

  if (actionsTaken >= ACTION_CAP) {
    result.runaway = true;
    result.actionsTaken = actionsTaken;
  }

  return result;
}

console.log(`Running ${NUM_GAMES} self-play games [mode=${MODE}] (turn cap ${TURN_CAP}, action cap ${ACTION_CAP})...`);
console.log('');

const startTime = Date.now();
const results = [];

for (let i = 0; i < NUM_GAMES; i++) {
  const r = runOneGame(i);
  results.push(r);
  if ((i + 1) % 25 === 0) {
    process.stdout.write(`  ${i + 1}/${NUM_GAMES}\n`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('');
console.log(`Done in ${elapsed}s.`);
console.log('');

const crashes = results.filter(r => r.crashed);
const invariantHits = results.filter(r => r.invariantViolation);
const stuck = results.filter(r => r.stuck);
const runaway = results.filter(r => r.runaway);
const illegal = results.filter(r => r.illegalAction);
const clean = results.filter(r => !r.crashed && !r.invariantViolation && !r.stuck && !r.runaway && !r.illegalAction);

console.log('=== SUMMARY ===');
console.log(`Total games:           ${results.length}`);
console.log(`Clean finishes:        ${clean.length} (${(100*clean.length/results.length).toFixed(1)}%)`);
console.log(`Crashes:               ${crashes.length}`);
console.log(`Invariant violations:  ${invariantHits.length}`);
console.log(`Stuck:                 ${stuck.length}`);
console.log(`Runaway (>${TURN_CAP}t):       ${runaway.length}`);
console.log(`Illegal AI actions:    ${illegal.length}`);
console.log('');

if (clean.length > 0) {
  const youWins = clean.filter(r => r.winner === 'you').length;
  const oppWins = clean.filter(r => r.winner === 'opp').length;
  const draws = clean.length - youWins - oppWins;
  const avgTurns = (clean.reduce((s, r) => s + (r.turns || 0), 0) / clean.length).toFixed(1);
  console.log('=== CLEAN-GAME STATS ===');
  console.log(`  you wins: ${youWins} (${(100*youWins/clean.length).toFixed(1)}%)`);
  console.log(`  opp wins: ${oppWins} (${(100*oppWins/clean.length).toFixed(1)}%)`);
  if (draws > 0) console.log(`  draws/other: ${draws}`);
  console.log(`  avg turns: ${avgTurns}`);
  console.log('');

  console.log('=== PACING ===');
  const turnCounts = clean.map(r => r.turns || 0);
  const histBuckets = [
    [1, 4, '1-4'], [5, 6, '5-6'], [7, 8, '7-8'], [9, 10, '9-10'],
    [11, 13, '11-13'], [14, 17, '14-17'], [18, 25, '18-25'], [26, 999, '26+'],
  ];
  for (const [lo, hi, label] of histBuckets) {
    const n = turnCounts.filter(t => t >= lo && t <= hi).length;
    if (n === 0) continue;
    const pct = (100*n/clean.length).toFixed(1);
    const bar = '#'.repeat(Math.round(40*n/clean.length));
    console.log(`  turn ${label.padEnd(6)} ${String(n).padStart(4)} (${pct.padStart(4)}%) ${bar}`);
  }
  console.log('');
}

function dumpFailures(label, list, fieldExtractor) {
  if (list.length === 0) return;
  console.log(`=== ${label} (${list.length}) ===`);
  const groups = new Map();
  for (const r of list) {
    const reason = fieldExtractor(r);
    if (!groups.has(reason)) groups.set(reason, []);
    groups.get(reason).push(r);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [reason, gameList] of sorted) {
    console.log(`  ${gameList.length}x: ${reason}`);
    const sample = gameList[0];
    if (sample.crashedDuringAction) {
      console.log(`        sample: during ${sample.crashedDuringAction}, turn ${sample.turns}`);
    } else {
      console.log(`        sample: turn ${sample.turns}`);
    }
    const cardCounts = new Map();
    for (const r of gameList) {
      for (const tpl of r.cardsSeen) {
        cardCounts.set(tpl, (cardCounts.get(tpl) || 0) + 1);
      }
    }
    const cardsByFreq = [...cardCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (cardsByFreq.length > 0 && gameList.length >= 3) {
      const cardLine = cardsByFreq.map(([t, n]) => `${t}(${n})`).join(' ');
      console.log(`        top cards in these games: ${cardLine}`);
    }
  }
  console.log('');
}

dumpFailures('CRASHES', crashes, r => r.crashError);
dumpFailures('INVARIANT VIOLATIONS', invariantHits, r => r.invariantViolation);
dumpFailures('STUCK', stuck, r => r.crashError || 'expectedActor returned null with game not over');
dumpFailures('RUNAWAY', runaway, r => `>${TURN_CAP} turns`);
dumpFailures('ILLEGAL AI ACTIONS', illegal,
  r => `${r.illegalAction.actor}: ${JSON.stringify(r.illegalAction.action)}`);

if (crashes.length > 0) {
  console.log('=== CRASH STACK SAMPLES (one per unique error) ===');
  const seenErrors = new Set();
  for (const r of crashes) {
    if (seenErrors.has(r.crashError)) continue;
    seenErrors.add(r.crashError);
    console.log(`\n--- ${r.crashError} ---`);
    if (r.crashStack) {
      const lines = r.crashStack.split('\n').slice(0, 6);
      console.log(lines.join('\n'));
    }
  }
  console.log('');
}

const anyFailure = crashes.length + invariantHits.length + stuck.length + runaway.length + illegal.length;
process.exit(anyFailure > 0 ? 1 : 0);
