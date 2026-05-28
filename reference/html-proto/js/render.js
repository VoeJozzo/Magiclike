// UI / RENDER — reads ENGINE.state() and CONTROLLER UI state. No mutation.
function passLabel(G, expectedActor) {
  if (expectedActor !== 'you') return 'Pass';
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') return 'Pick Target';
  if (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you') return 'Pick a Number';
  if (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you') return 'Pick a Value';
  if (G.pendingEdictChoice && G.pendingEdictChoice.who === 'you') return 'Choose';
  if (G.priority && G.stack.length > 0) return 'No Reaction';
  if (G.phase === 'COMBAT_ATTACK' && G.activePlayer === 'you' && !G.attackersDeclared) return 'Skip Combat';
  if (G.phase === 'COMBAT_BLOCK'  && G.activePlayer === 'opp' && !G.blockersDeclared) return 'No Blocks';
  if (G.priority) {
    if (G.phase === 'MAIN1' && G.activePlayer === 'you') return 'To Combat';
    if (G.phase === 'MAIN2' && G.activePlayer === 'you') return 'To End Step';
    if (G.phase === 'COMBAT_ATTACK') return 'To Blocks';
    if (G.phase === 'COMBAT_BLOCK')  return 'To Damage';
    if (G.phase === 'END' && G.activePlayer === 'you') return 'End Turn';
    if (G.phase === 'END' && G.activePlayer === 'opp') return 'Pass';
    return 'Pass Priority';
  }
  return 'Pass';
}

// Codex-style trigger-build modal button (condition + effect steps).
function makeTriggerBuildOptionBtn(innerHtml, onClick) {
  const btn = document.createElement('button');
  btn.style.cssText = 'display:block;width:100%;background:#252030;border:1px solid #5a4a7a;color:#ddd;padding:10px 12px;margin:6px 0;font-family:inherit;font-size:12px;cursor:pointer;border-radius:5px;text-align:left;line-height:1.5;transition:background .15s';
  btn.onmouseover = () => btn.style.background = '#3a2f4a';
  btn.onmouseout = () => btn.style.background = '#252030';
  btn.innerHTML = innerHtml;
  btn.onclick = onClick;
  return btn;
}

function render() {
  const G = ENGINE.state();
  // Deep guard: any of these missing means we're not in-game (start
  // screen, post-game, settings panel before first draft, etc.). Callers
  // can fire-and-forget render() without needing to wrap in try/catch.
  if (!G || !G.you || !G.opp || !G.phase) return;
  CONTROLLER.clearUiOnPhaseChange();
  const pt = CONTROLLER.pendingTarget();

  setText('youLife', G.you.life); setText('oppLife', G.opp.life);
  setText('youLib', G.you.library.length); setText('oppLib', G.opp.library.length);
  setText('youGv', G.you.graveyard.length); setText('oppGv', G.opp.graveyard.length);
  setText('youEx', (G.you.exile || []).length); setText('oppEx', (G.opp.exile || []).length);
  setText('youHand2', G.you.hand.length); setText('oppHand', G.opp.hand.length);
  setText('youName', 'You' + (G.activePlayer === 'you' ? ' ◉' : ''));
  setText('oppName', 'Opponent' + (G.activePlayer === 'opp' ? ' ◉' : ''));

  renderManaPool('youMana', G.you.mana);
  renderManaPool('oppMana', G.opp.mana);

  const phaseNames = {UNTAP:'Untap',DRAW:'Draw',MAIN1:'M1',COMBAT_ATTACK:'Atk',COMBAT_BLOCK:'Blk',COMBAT_DAMAGE:'Dmg',MAIN2:'M2',END:'End',CLEANUP:'Clnp'};
  const phases = ['UNTAP','DRAW','MAIN1','COMBAT_ATTACK','COMBAT_BLOCK','COMBAT_DAMAGE','MAIN2','END','CLEANUP'];
  document.getElementById('phases').innerHTML = phases.map(p => `<div class="ph${G.phase === p ? ' on' : ''}">${phaseNames[p]}</div>`).join('');
  const runStats = (typeof RUN !== 'undefined' && RUN.getStats) ? RUN.getStats() : null;
  const gamePrefix = (runStats && runStats.gameNum) ? `<span style="color:#888;font-weight:normal">G${runStats.gameNum}</span> · ` : '';
  document.getElementById('turnlbl').innerHTML =
    `${gamePrefix}Turn ${G.turn} — ${G[G.activePlayer].name}'s turn`;

  const banner = document.getElementById('stackBanner');
  const bannerItems = document.getElementById('stackBannerItems');
  const bannerHint = document.getElementById('stackBannerHint');
  const bannerCancel = document.getElementById('stackBannerCancelBtn');
  // In-banner Cancel only for cancellable cast/activation. Triggers can't be cancelled.
  bannerCancel.style.display = pt ? 'inline-block' : 'none';
  if (!G.stack.length) {
    banner.classList.remove('vis');
  } else {
    // pt.cardIid: cast → hand; ability → battlefield.
    const ptCard = pt && (
      G.you.hand.find(c => c.iid === pt.cardIid) ||
      G.you.battlefield.find(c => c.iid === pt.cardIid)
    );
    // Effects via pt.modeIdx — counterspell check needs the chosen mode.
    const isCounterTarget = (() => {
      if (!pt || !ptCard) return false;
      if (pt.kind === 'cast') {
        const modeEffects = ENGINE.effectsForMode(ptCard, pt.modeIdx);
        return modeEffects.some(e => e.target === 'spell' || e.target === 'permanent_or_spell');
      }
      if (pt.kind === 'ability') {
        const ab = (ptCard.abilities || [])[pt.abilityIdx || 0];
        if (!ab) return false;
        return (ab.effects || []).some(e => e.target === 'spell' || e.target === 'permanent_or_spell');
      }
      return false;
    })();
    banner.classList.add('vis');
    // Splice vs counterspell — same click affordance, different text.
    const isSpliceTargetMode = (() => {
      if (!pt || !ptCard) return false;
      let effects = [];
      if (pt.kind === 'cast') {
        effects = ENGINE.effectsForMode(ptCard, pt.modeIdx) || [];
      } else if (pt.kind === 'ability') {
        const ab = (ptCard.abilities || [])[pt.abilityIdx || 0];
        effects = (ab && ab.effects) || [];
      }
      return effects.some(e => e.target === 'permanent_or_spell');
    })();
    bannerHint.textContent = isCounterTarget
      ? (isSpliceTargetMode ? '— click a spell or permanent to splice it' : '— click a spell to counter it')
      : (G.stack.length === 1 ? '— top resolves first' : `— ${G.stack.length} on stack, top resolves first`);
    bannerItems.innerHTML = '';
    G.stack.slice().reverse().forEach((it, displayIdx) => {
      const realIdx = G.stack.length - 1 - displayIdx;
      const tgtLabel = (it.targets && it.targets[0] && it.targets[0].label) ? ` → ${it.targets[0].label}` : '';
      let div;
      if (it.kind === 'trigger') {
        // Triggers have no card backing -- build a card-like with the
        // trigger text in the body.
        div = makeSyntheticCard({
          name: it.sourceName + ' triggers',
          type: 'Trigger',
          text: (it.trig.text || it.trig.event) + tgtLabel,
          art: '⚡',
          color: 'C',
          scale: 0.7,
        });
        const src = ENGINE.findCard(it.sourceIid);
        if (src) CONTROLLER.attachLongPress(div, src.card);
      } else {
        div = makeCardEl(it.card);
        div.style.setProperty('--scale', '0.7');
      }
      // stackIdx (real, not reversed) — target-line overlay indexes G.stack directly.
      div.dataset.stackIdx = String(realIdx);
      if (isCounterTarget) {
        div.classList.add('targetable');
        if (it.kind !== 'trigger') {
          div.onclick = () => CONTROLLER.clickStackTarget(realIdx);
        }
      }
      bannerItems.appendChild(div);
    });
  }

  renderHand('youHand', G.you.hand, 'you');
  renderOppHand(G.opp.hand);
  renderBf('youBf', G.you.battlefield, 'you');
  renderBf('oppBf', G.opp.battlefield, 'opp');

  const showDone = (G.activePlayer === 'you' && G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared)
                || (G.activePlayer === 'opp' && G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared);
  const btnDone = document.getElementById('btnDone');
  btnDone.style.display = showDone ? 'block' : 'none';
  btnDone.textContent = G.phase === 'COMBAT_ATTACK' ? 'Done Attacking' : 'Done Blocking';

  const expectedActor = ENGINE.expectedActor();
  const inReaction = !!(G.priority && G.stack.length > 0);

  const passBtn = document.getElementById('btnPass');
  passBtn.textContent = passLabel(G, expectedActor);
  passBtn.disabled = G.gameOver || !!pt || G.cleanupDiscarding
                  || (G.forcedDiscard && G.forcedDiscard.who === 'you')
                  || (G.pendingSearch && G.pendingSearch.who === 'you')
                  || (G.pendingTriggerBuild && G.pendingTriggerBuild.who === 'you')
                  || (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you')
                  || (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you')
                  || (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you')
                  || (G.pendingEdictChoice && G.pendingEdictChoice.who === 'you')
                  || expectedActor !== 'you';

  document.getElementById('btnEnd').disabled =
    G.gameOver || !!pt || G.activePlayer !== 'you' || G.stack.length > 0
    || inReaction || G.cleanupDiscarding
    || (G.forcedDiscard && G.forcedDiscard.who === 'you')
    || (G.pendingSearch && G.pendingSearch.who === 'you')
    || (G.pendingTriggerBuild && G.pendingTriggerBuild.who === 'you');

  const tb = document.getElementById('tgtbar');
  const ptt = G.pendingTriggerTarget;
  const tgtCancelBtn = document.getElementById('tgtCancelBtn');
  // Floating Cancel — covers top tgtbar when stack banner blocks it. Hidden for trigger targets (uncancellable).
  const statusCancelBtn = document.getElementById('statusCancelBtn');
  if (pt) {
    tb.classList.add('vis');
    tgtCancelBtn.style.display = '';
    statusCancelBtn.style.display = '';
    const card = G.you.hand.find(c => c.iid === pt.cardIid)
              || (ENGINE.findCard(pt.cardIid) || {}).card;
    if (pt.kind === 'abilitySac' && card) {
      setText('tgtname', `Sacrifice a creature for ${card.name}`);
    } else {
      setText('tgtname', card ? card.name : '?');
    }
  } else if (ptt && ptt.controller === 'you') {
    tb.classList.add('vis');
    tgtCancelBtn.style.display = 'none';
    statusCancelBtn.style.display = 'none';
    setText('tgtname', `${ptt.sourceName} (triggered)`);
  } else {
    tb.classList.remove('vis');
    statusCancelBtn.style.display = 'none';
  }

  const sb = document.getElementById('status');
  if (G.pendingSearch && G.pendingSearch.who === 'you') {
    Modal.show('searchModal', { dismissible: false });
    setText('searchTitle', `${G.pendingSearch.source.toUpperCase()} — PICK A CARD`);
    const list = document.getElementById('searchList');
    list.innerHTML = '';
    const filter = G.pendingSearch.filter || {};
    const matches = G.you.library.filter(c => !filter.type || c.type === filter.type);
    if (matches.length === 0) {
      list.innerHTML = '<div style="color:#888;font-size:11px">No matching cards.</div>';
    } else {
      for (const card of matches) {
        const btn = makeCardEl(card);
        btn.style.cursor = 'pointer';
        btn.onclick = () => CONTROLLER.searchPick(card.iid);
        list.appendChild(btn);
      }
    }
  } else {
    Modal.hide('searchModal');
  }
  // Codex 3-step: condition → effect → compare new vs current.
  if (G.pendingTriggerBuild && G.pendingTriggerBuild.who === 'you') {
    Modal.show('triggerBuildModal', { dismissible: false });
    const ptb = G.pendingTriggerBuild;
    let sourceName = 'this card';
    for (const z of ['hand','battlefield','library','graveyard','exile']) {
      const c = G.you[z]?.find(x => x.iid === ptb.cardIid);
      if (c) { sourceName = c.name; break; }
    }
    const titleEl = document.getElementById('triggerBuildTitle');
    const subtitleEl = document.getElementById('triggerBuildSubtitle');
    const list = document.getElementById('triggerBuildList');
    const keepWrap = document.getElementById('triggerBuildKeepWrap');
    list.innerHTML = '';
    keepWrap.style.display = 'none';

    if (ptb.step === 'condition') {
      titleEl.textContent = '📜 STEP 1 OF 2: CHOOSE WHEN';
      subtitleEl.textContent = `When should ${sourceName}'s ability fire?`;
      ptb.conditionOptions.forEach((cond, idx) => {
        const text = formatTriggerText(cond.text, sourceName);
        const html = `<span style="color:#ffd700;font-weight:bold">Option ${idx+1}</span><br>When ${text}…`;
        list.appendChild(makeTriggerBuildOptionBtn(html, () => CONTROLLER.triggerBuildPick(idx)));
      });
    } else if (ptb.step === 'effect') {
      titleEl.textContent = '📜 STEP 2 OF 2: CHOOSE WHAT';
      // textContent target: substitute raw (no HTML escape — entities
      // would render as literal '&amp;' text).
      const condText = (ptb.chosenCondition.text || '').replace(/~/g, sourceName);
      subtitleEl.textContent = `When ${condText} — what happens?`;
      ptb.effectOptions.forEach((eff, idx) => {
        const text = formatTriggerText(eff.describe, sourceName);
        const display = text.length > 0 ? (text[0].toUpperCase() + text.slice(1)) : text;
        const html = `<span style="color:#ffd700;font-weight:bold">Option ${idx+1}</span><br>${display}`;
        list.appendChild(makeTriggerBuildOptionBtn(html, () => CONTROLLER.triggerBuildPick(idx)));
      });
    } else if (ptb.step === 'compare') {
      titleEl.textContent = '📜 KEEP OR REPLACE?';
      subtitleEl.textContent = `Compare your new ability with the current one.`;
      // Render two side-by-side cards: current (left/top) vs new (right/bottom).
      const currentText = formatTriggerText(ptb.currentTrigger.text, sourceName);
      const newText = formatTriggerText(ptb.assembledTrigger.text, sourceName);
      const compareBox = document.createElement('div');
      compareBox.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin:8px 0';
      compareBox.innerHTML = `
        <div style="background:#1f1828;border:1px solid #5a4a7a;border-radius:5px;padding:12px">
          <div style="color:#aab;font-size:10px;letter-spacing:0.1em;margin-bottom:4px">CURRENT</div>
          <div style="color:#ddd;font-size:13px;line-height:1.5">${currentText}</div>
        </div>
        <div style="background:#2a2030;border:2px solid #ffd700;border-radius:5px;padding:12px">
          <div style="color:#ffd700;font-size:10px;letter-spacing:0.1em;margin-bottom:4px">NEW</div>
          <div style="color:#ddd;font-size:13px;line-height:1.5">${newText}</div>
        </div>
      `;
      list.appendChild(compareBox);
      // Two buttons: take new, keep current.
      const newBtn = document.createElement('button');
      newBtn.style.cssText = 'display:block;width:100%;background:#3a2f4a;border:2px solid #ffd700;color:#ffe7a0;padding:10px 12px;margin:8px 0 4px 0;font-family:inherit;font-size:13px;font-weight:bold;cursor:pointer;border-radius:5px';
      newBtn.textContent = 'Replace with new ability';
      newBtn.onclick = () => CONTROLLER.triggerBuildPick('new');
      list.appendChild(newBtn);
      const kBtn = document.createElement('button');
      kBtn.style.cssText = 'display:block;width:100%;background:#2a2a3a;border:1px solid #5a5a7a;color:#aab;padding:8px 12px;margin:0 0 4px 0;font-family:inherit;font-size:12px;cursor:pointer;border-radius:5px';
      kBtn.textContent = 'Keep current ability';
      kBtn.onclick = () => CONTROLLER.triggerBuildPick('keep');
      list.appendChild(kBtn);
    }
  } else {
    Modal.hide('triggerBuildModal');
  }
  if (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you') {
    Modal.show('numberChoiceModal', { dismissible: false });
    const p = G.pendingNumberChoice;
    document.getElementById('numberChoiceSubtitle').innerHTML =
      `${p.source}: choose a number from ${p.min} to ${p.max}.<br>` +
      `<span style="color:#888;font-size:11px">Higher = more stickers on the boss's permanents now,<br>` +
      `but also more on your permanents if it dies.</span>`;
    const btns = document.getElementById('numberChoiceButtons');
    btns.innerHTML = '';
    for (let n = p.min; n <= p.max; n++) {
      const b = document.createElement('button');
      b.textContent = n;
      b.style.cssText = 'background:#3a1840;border:2px solid #cc44aa;color:#ee88cc;padding:14px 22px;font-family:inherit;font-size:24px;font-weight:bold;cursor:pointer;border-radius:6px;min-width:60px;transition:transform .1s,background .1s';
      b.onmouseover = () => { b.style.background = '#5a2860'; b.style.transform = 'translateY(-2px)'; };
      b.onmouseout  = () => { b.style.background = '#3a1840'; b.style.transform = 'translateY(0)'; };
      b.onclick = () => CONTROLLER.numberChoice(n);
      btns.appendChild(b);
    }
  } else {
    Modal.hide('numberChoiceModal');
  }
  if (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you') {
    Modal.show('symmetricizeChoiceModal', { dismissible: false });
    const p = G.pendingSymmetricizeChoice;
    document.getElementById('symmetricizeChoiceSubtitle').innerHTML =
      `${p.source} targets <b>${p.targetName}</b> (currently ${p.values.power}/${p.values.toughness} for {${p.values.cost}}).<br>` +
      `<span style="color:#888;font-size:11px">Pick a value — the other two become it. Forever.</span>`;
    const btns = document.getElementById('symmetricizeChoiceButtons');
    btns.innerHTML = '';
    const labels = [
      { which: 'power',     label: 'Power',     value: p.values.power },
      { which: 'toughness', label: 'Toughness', value: p.values.toughness },
      { which: 'cost',      label: 'Cost',      value: p.values.cost },
    ];
    for (const entry of labels) {
      const b = document.createElement('button');
      b.innerHTML = `<div style="font-size:11px;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase">${entry.label}</div><div style="font-size:24px;font-weight:bold;margin-top:4px">${entry.value}</div>`;
      b.style.cssText = 'background:#152030;border:2px solid #88aacc;color:#aaccee;padding:12px 20px;font-family:inherit;cursor:pointer;border-radius:6px;min-width:90px;transition:transform .1s,background .1s';
      b.onmouseover = () => { b.style.background = '#1e2c44'; b.style.transform = 'translateY(-2px)'; };
      b.onmouseout  = () => { b.style.background = '#152030'; b.style.transform = 'translateY(0)'; };
      b.onclick = () => CONTROLLER.symmetricizeChoice(entry.which);
      btns.appendChild(b);
    }
  } else {
    Modal.hide('symmetricizeChoiceModal');
  }
  // Edict forced-sacrifice prompt (GAP 2). The targeted (human) player picks
  // which of their permanents to lose; the engine replays the trailing
  // sacrifice/annihilate/rip against the pick.
  if (G.pendingEdictChoice && G.pendingEdictChoice.who === 'you') {
    Modal.show('edictChoiceModal', { dismissible: false });
    const p = G.pendingEdictChoice;
    const noun = p.filter === 'permanent' ? 'permanent' : 'creature';
    document.getElementById('edictChoiceSubtitle').innerHTML =
      `${p.source} forces you to sacrifice a ${noun}.<br>` +
      `<span style="color:#888;font-size:11px">Choose which one to lose.</span>`;
    const btns = document.getElementById('edictChoiceButtons');
    btns.innerHTML = '';
    for (const c of p.pool) {
      const live = G.you.battlefield.find(x => x.iid === c.iid);
      let stats = '';
      if (live && live.type === 'Creature') { const [pw, to] = ENGINE.getStats(live); stats = `${pw}/${to}`; }
      const b = document.createElement('button');
      b.innerHTML = `<div style="font-size:13px;font-weight:bold">${c.label}</div>`
        + (stats ? `<div style="font-size:11px;opacity:0.7;margin-top:2px">${stats}</div>` : '');
      b.style.cssText = 'background:#201515;border:2px solid #cc8888;color:#eecccc;padding:12px 20px;font-family:inherit;cursor:pointer;border-radius:6px;min-width:90px;transition:transform .1s,background .1s';
      b.onmouseover = () => { b.style.background = '#2c1e1e'; b.style.transform = 'translateY(-2px)'; };
      b.onmouseout  = () => { b.style.background = '#201515'; b.style.transform = 'translateY(0)'; };
      b.onclick = () => CONTROLLER.edictChoice(c.iid);
      btns.appendChild(b);
    }
  } else {
    Modal.hide('edictChoiceModal');
  }
  // Modal-spell mode picker — illegal modes disabled but rendered for visibility.
  const pmc = CONTROLLER.pendingModalChoice();
  if (pmc) {
    const card = G.you.hand.find(c => c.iid === pmc.cardIid);
    if (card) {
      Modal.show('modalChoiceModal', { onClose: () => CONTROLLER.cancelModalChoice() });
      const inlineArt = isArtUrl(card.art) ? '🎴' : (card.art || '');
      setText('modalChoiceCardName', `${inlineArt} ${card.name}`);
      const list = document.getElementById('modalChoiceList');
      list.innerHTML = '';
      const modes = ENGINE.getModes(card);
      const mode_names = (card.effects && card.effects.mode_names) || [];
      for (let mIdx = 0; mIdx < modes.length; mIdx++) {
        const modeEffects = modes[mIdx];
        const targetedEff = (modeEffects || []).find(ENGINE.effectNeedsTarget);
        let fakeAction;
        if (targetedEff) {
          const valid = ENGINE.getValidTargets(targetedEff, 'you');
          const fakeTgt = valid[0] || {kind:'player', who:'you', label:'You'};
          fakeAction = {type:'castSpell', cardIid: pmc.cardIid, modeIdx: mIdx, targets:[fakeTgt]};
        } else {
          fakeAction = {type:'castSpell', cardIid: pmc.cardIid, modeIdx: mIdx};
        }
        const legal = ENGINE.isLegalAction('you', fakeAction);
        const btn = document.createElement('button');
        btn.className = 'modal-choice' + (legal ? '' : ' disabled');
        btn.textContent = mode_names[mIdx] || `Mode ${mIdx + 1}`;
        if (legal) {
          btn.onclick = () => CONTROLLER.pickModalMode(mIdx);
        }
        list.appendChild(btn);
      }
    } else {
      Modal.hide('modalChoiceModal');
    }
  } else {
    Modal.hide('modalChoiceModal');
  }
  if (G.gameOver) {
    sb.textContent = `Game over — ${G[G.winner].name} wins.`;
    Modal.show('gameover', { dismissible: false });
    const box = document.getElementById('gameover-box');
    box.classList.toggle('win', G.winner === 'you');
    box.classList.toggle('lose', G.winner === 'opp');
    setText('gameover-msg', G.winner === 'you' ? 'YOU WIN' : 'YOU LOSE');
    // Run stats and button label.
    const stats = RUN.getStats();
    const btn = document.getElementById('gameover-btn');
    const statsEl = document.getElementById('gameover-stats');
    if (stats) {
      if (stats.active) {
        statsEl.textContent = `Game ${stats.gameNum} — ${stats.wins} win${stats.wins === 1 ? '' : 's'} this run`;
        const mapState = RUN.getMapState && RUN.getMapState();
        const hasMapChoice = mapState && mapState.pendingChoice;
        btn.textContent = hasMapChoice ? 'Choose Path' : 'Next Game';
        btn.disabled = !!RUN.getReward();
      } else {
        statsEl.textContent = `Run over — ${stats.wins} win${stats.wins === 1 ? '' : 's'} across ${stats.gameNum} game${stats.gameNum === 1 ? '' : 's'}`;
        btn.textContent = 'Main Menu';
        btn.disabled = false;
      }
    } else {
      statsEl.textContent = '';
      btn.textContent = 'New Run';
      btn.disabled = false;
    }
  } else if (pt) {
    const slotsNeeded = slotsNeededForPending(pt);
    if (slotsNeeded.length > 1) {
      const pickedCount = (pt.pickedSlots && pt.pickedSlots.length) || 0;
      sb.textContent = `Pick target ${pickedCount + 1} of ${slotsNeeded.length}. Click highlighted creatures, the stack, or player buttons.`;
    } else {
      sb.textContent = `Choose a target. Click highlighted creatures, the stack, or player buttons.`;
    }
  } else if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
    sb.textContent = `${G.pendingTriggerTarget.sourceName} triggered — choose a target. Click highlighted creatures or player buttons.`;
  } else if (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you') {
    sb.textContent = `${G.pendingNumberChoice.source} — pick a number from ${G.pendingNumberChoice.min} to ${G.pendingNumberChoice.max}.`;
  } else if (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you') {
    sb.textContent = `${G.pendingSymmetricizeChoice.source} on ${G.pendingSymmetricizeChoice.targetName} — pick power, toughness, or cost.`;
  } else if (G.pendingEdictChoice && G.pendingEdictChoice.who === 'you') {
    sb.textContent = `${G.pendingEdictChoice.source} — choose a ${G.pendingEdictChoice.filter === 'permanent' ? 'permanent' : 'creature'} to sacrifice.`;
  } else if (G.forcedDiscard && G.forcedDiscard.who === 'you' && G.forcedDiscard.remaining > 0) {
    sb.textContent = `${G.forcedDiscard.source} — choose ${G.forcedDiscard.remaining} more card(s) to discard.`;
  } else if (G.cleanupDiscarding && G.activePlayer === 'you') {
    sb.textContent = `End of turn — your hand is ${G.you.hand.length}/7. Click a card in your hand to discard it.`;
  } else if (inReaction && expectedActor === 'you') {
    const top = G.stack[G.stack.length-1];
    const topName = top.kind === 'trigger' ? `${top.sourceName} (triggered)` : top.card.name;
    sb.textContent = `${G[top.controller].name} cast ${topName}. Click an instant to react, or "No Reaction".`;
  } else if (G.phase === 'COMBAT_ATTACK' && G.activePlayer === 'you' && !G.attackersDeclared) {
    sb.textContent = `Declare attackers — click your creatures, then "Done Attacking" (or "Skip Combat").`;
  } else if (G.phase === 'COMBAT_BLOCK' && G.activePlayer === 'opp' && !G.blockersDeclared) {
    sb.textContent = `Declare blockers — click yours, then click an attacker. "Done Blocking" when ready.`;
  } else if (G.priority && G.priorityHolder === 'you' && G.phase === 'COMBAT_ATTACK') {
    sb.textContent = `After attackers declared — instants/abilities, or pass to declare blocks.`;
  } else if (G.priority && G.priorityHolder === 'you' && G.phase === 'COMBAT_BLOCK') {
    sb.textContent = `Pre-damage step — instants/abilities, or pass to resolve damage.`;
  } else if (G.priority && G.priorityHolder === 'you' && G.phase === 'END' && G.activePlayer === 'opp') {
    sb.textContent = `End of opponent's turn — last instants? Or pass.`;
  } else if (G.priority && G.priorityHolder === 'you' && G.phase === 'END') {
    sb.textContent = `End step — last instants this turn? Or end the turn.`;
  } else if (G.priority && G.priorityHolder === 'you' && G.activePlayer === 'opp') {
    sb.textContent = `You have priority during opponent's ${phaseNames[G.phase] || G.phase}. Cast an instant, or pass.`;
  } else if (G.activePlayer === 'opp') {
    sb.textContent = `Opponent's turn. They are thinking...`;
  } else {
    sb.textContent = `Your turn — ${phaseNames[G.phase] || G.phase}. Click cards to play; click lands to tap.`;
  }

  document.getElementById('log').innerHTML = G.log.map(e => `<div class="le ${e.cls}">${escapeHtml(e.msg)}</div>`).join('');

  // Auto-open graveyard modal when a graveyard target is needed.
  if (!G.gameOver) {
    let graveTargets = null;
    if (G.pendingTriggerTarget
        && G.pendingTriggerTarget.controller === 'you'
        && G.pendingTriggerTarget.valid
        && G.pendingTriggerTarget.valid.length > 0
        && G.pendingTriggerTarget.valid[0].kind === 'graveyard_creature') {
      graveTargets = G.pendingTriggerTarget.valid;
    } else if (pt) {
      const eff = pendingTargetEffect(pt);
      if (eff && eff.target === 'graveyard_creature') {
        graveTargets = ENGINE.getValidTargets(eff, 'you');
      }
    }
    if (graveTargets) {
      openZoneTargeting('you', 'graveyard', graveTargets);
    }
  }
  requestAnimationFrame(drawTargetLines);
}

// Dashed SVG lines from stack pills to their targets. Red for counters/steal; orange neutral.
function drawTargetLines() {
  const svg = document.getElementById('targetLines');
  if (!svg) return;
  for (const child of [...svg.children]) {
    if (child.tagName !== 'defs') svg.removeChild(child);
  }
  const G = ENGINE.state();
  if (!G || !G.stack || G.stack.length === 0) return;
  G.stack.forEach((item, stackIdx) => {
    const targets = item.targets || [];
    if (targets.length === 0) return;
    const pillEl = document.querySelector(`[data-stack-idx="${stackIdx}"]`);
    if (!pillEl) return;
    const pillRect = pillEl.getBoundingClientRect();
    const sx = pillRect.left + pillRect.width / 2;
    const sy = pillRect.bottom;
    let effects = [];
    if (item.kind === 'trigger') {
      effects = (item.trig && item.trig.effects) || [];
    } else if (item.card) {
      effects = ENGINE.effectsForMode(item.card, item.modeIdx || 0) || [];
    }
    for (let ti = 0; ti < targets.length; ti++) {
      const tgt = targets[ti];
      if (!tgt) continue;
      // Player targets have no good DOM anchor — skip.
      let targetEl = null;
      if (tgt.kind === 'creature' || tgt.kind === 'permanent' || tgt.kind === 'graveyard_creature') {
        if (typeof tgt.iid === 'number') {
          targetEl = document.querySelector(`[data-iid="${tgt.iid}"]`);
        }
      } else if (tgt.kind === 'stack' && tgt.stackItem) {
        const idx = G.stack.indexOf(tgt.stackItem);
        if (idx >= 0) targetEl = document.querySelector(`[data-stack-idx="${idx}"]`);
      }
      if (!targetEl) continue;
      const tRect = targetEl.getBoundingClientRect();
      const tx = tRect.left + tRect.width / 2;
      const ty = tRect.top + tRect.height / 2;
      // Effects share targets[0] by default; target_slot:N picks targets[N].
      const slotEffects = effects.filter(e => (e.target_slot || 0) === ti);
      const valence = classifyValence(slotEffects, tgt, item.controller, G);
      const palette = VALENCE_PALETTE[valence];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midY = (sy + ty) / 2;
      const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
      line.setAttribute('d', d);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', palette.color);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6 4');
      line.setAttribute('opacity', '0.75');
      line.setAttribute('marker-end', `url(#${palette.marker})`);
      svg.appendChild(line);
    }
  });
}

// Valence → line color (red=harm, green=benefit, orange=neutral).
// Post-collapse (§3.5/§3.8) live kinds. move_card and pump are shape-dependent
// (draw vs bounce; buff vs weaken) — classified by from/to and sign in
// classifyValence, not by flat membership.
const HARMFUL_KINDS = new Set([
  'damage', 'affect_creature', 'change_control',
  'counter', 'rip', 'symmetricize', 'fight_target',
  'sacrifice', 'chooses', 'apply_sticker', 'discard',
]);
const BENEFICIAL_KINDS = new Set([
  'grant_keyword', 'untap', 'gain_life',
]);
const VALENCE_PALETTE = {
  harm:    { color: '#ff5544', marker: 'tgt-arrow-red' },
  benefit: { color: '#66dd66', marker: 'tgt-arrow-green' },
  neutral: { color: '#ff9966', marker: 'tgt-arrow' },
};

// Classify a (target-slot's effects, target, caster) tuple as 'harm',
// 'benefit', or 'neutral'. Rules:
//   - Any HARMFUL_KIND in the slot → harm (overrides benefits — Doom
//     Blade with a side-effect pump is still primarily a destroy).
//   - Else any BENEFICIAL_KIND in the slot → benefit.
//   - Else neutral.
// Refinement for ambiguous cases: if the target is the caster's OWN
// permanent and the effect is harmful, downgrade to neutral (the player
// is voluntarily targeting their own thing — likely a sacrifice or
// flicker-via-destroy, doesn't read as "attack"). Likewise a beneficial
// effect on an opp's permanent (e.g., player pumps opp's creature for
// some weird interaction) — neutral.
function classifyValence(slotEffects, target, casterSide, G) {
  let hasHarm = false, hasBenefit = false;
  for (const e of slotEffects) {
    if (e.kind === 'move_card') {
      // draw / graveyard-return = benefit; bounce / discard / shuffle / exile = harm.
      const draw = e.from_zone === 'library' && e.to_zone === 'hand';
      const ret = e.from_zone === 'graveyard' && e.to_zone === 'hand';
      if (draw || ret) hasBenefit = true; else hasHarm = true;
    } else if (e.kind === 'pump') {
      if ((e.power || 0) < 0 || (e.toughness || 0) < 0) hasHarm = true; else hasBenefit = true;
    } else if (HARMFUL_KINDS.has(e.kind)) hasHarm = true;
    else if (BENEFICIAL_KINDS.has(e.kind)) hasBenefit = true;
  }
  // Resolve target controller for self-vs-other check.
  let targetController = null;
  if (target.kind === 'creature' || target.kind === 'permanent') {
    if (typeof target.iid === 'number') {
      const f = ENGINE.findCard(target.iid);
      if (f) targetController = f.controller;
    }
  } else if (target.kind === 'stack' && target.stackItem) {
    targetController = target.stackItem.controller;
  }
  // Self-harm + opp-benefit collapse to neutral; otherwise effect-kind decides.
  if (hasHarm && targetController === casterSide) return 'neutral';
  if (hasBenefit && !hasHarm && targetController && targetController !== casterSide) return 'neutral';
  if (hasHarm) return 'harm';
  if (hasBenefit) return 'benefit';
  return 'neutral';
}

// Open zone modal with valid targets highlighted/clickable. Submits via CONTROLLER.
function openZoneTargeting(who, zone, validTargets) {
  const G = ENGINE.state();
  if (!G || !G[who]) return;
  const cards = G[who][zone] || [];
  const modal = document.getElementById('zoneModal');
  const titleEl = document.getElementById('zoneTitle');
  const listEl = document.getElementById('zoneList');
  const ZONE_LABELS = {graveyard:'GRAVEYARD', exile:'EXILE'};
  const playerLabel = (who === 'you') ? 'YOUR' : (G.opp.name || 'OPP') + "'S";
  titleEl.textContent = `${playerLabel} ${ZONE_LABELS[zone] || zone.toUpperCase()} — CHOOSE A TARGET`;
  listEl.innerHTML = '';
  if (cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zone-empty';
    empty.textContent = '(empty)';
    listEl.appendChild(empty);
  } else {
    const validIids = new Set(validTargets.map(t => t.iid));
    const display = cards.slice().reverse();
    for (const card of display) {
      const btn = makeCardEl(card);
      if (validIids.has(card.iid)) {
        btn.style.cursor = 'pointer';
        btn.classList.add('targetable');
        btn.onclick = () => submitGraveyardTarget(card.iid);
      } else {
        btn.style.opacity = '0.4';
      }
      listEl.appendChild(btn);
    }
  }
  modal.classList.add('vis');
}

function submitGraveyardTarget(iid) {
  const G = ENGINE.state();
  const card = G.you.graveyard.find(c => c.iid === iid);
  const target = {kind:'graveyard_creature', iid, label: card ? card.name : 'creature', controller: 'you'};
  if (CONTROLLER.submitTargetedAction(target)) {
    Modal.hide('zoneModal');
  }
}

function setText(id, v) { document.getElementById(id).textContent = v; }
// escapeHtml + formatTriggerText live in card-text.js (loads before this file).

// {text, highlight}[] → HTML, with .bumped spans for empower-emphasized values.
function segmentsToHtml(segs) {
  if (!Array.isArray(segs)) return '';
  return segs.map(s => {
    // escapeHtml runs first to keep raw text safe (e.g. <stripe> or
    // ampersands); renderManaSymbols then converts the still-intact
    // {R}/{T}/{1} tokens into pip spans. escapeHtml leaves braces alone,
    // so the order is correct.
    const safe = escapeHtml(s.text || '');
    const withPips = renderManaSymbols(safe);
    return s.highlight ? `<span class="bumped">${withPips}</span>` : withPips;
  }).join('');
}

function renderManaPool(id, mana) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (const c of ['W','U','B','R','G','C']) {
    for (let i=0; i<(mana[c]||0); i++) el.innerHTML += `<div class="mp mp${c}">${c}</div>`;
  }
}

function renderHand(id, hand, who) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  const G = ENGINE.state();
  for (const card of hand) {
    const div = makeCardEl(card, { inHand: true });
    if (canPlayFromUI(who, card)) div.classList.add('castable');
    if (G.cleanupDiscarding && G.activePlayer === who) div.classList.add('discardable');
    div.onclick = () => CONTROLLER.clickHand(card.iid);
    el.appendChild(div);
  }
}
function canPlayFromUI(who, card) {
  // Probe legality with placeholder targets per target_slot.
  if (card.type === 'Land') {
    return ENGINE.isLegalAction(who, {type:'playLand', cardIid: card.iid});
  }
  if (ENGINE.isModal(card)) {
    const modes = ENGINE.getModes(card);
    for (let mIdx = 0; mIdx < modes.length; mIdx++) {
      const modeEffects = modes[mIdx] || [];
      const hasTarget = modeEffects.some(ENGINE.effectNeedsTarget);
      if (hasTarget) {
        const fakeTargets = fakeTargetsForLegality(modeEffects, who);
        if (fakeTargets === null) continue;
        if (ENGINE.isLegalAction(who, {type:'castSpell', cardIid: card.iid, modeIdx: mIdx, targets: fakeTargets})) return true;
      } else {
        if (ENGINE.isLegalAction(who, {type:'castSpell', cardIid: card.iid, modeIdx: mIdx})) return true;
      }
    }
    return false;
  }
  // Non-modal spell. Route through the engine's canonical targeting API so the
  // highlight can't drift from the cast flow / trigger prompt (all three share
  // objectNeedsTarget/probeTargetsForObject — covers top-level target(),
  // ability-level target_slots, and legacy per-effect targets).
  if (ENGINE.objectNeedsTarget(card)) {
    const fakeTargets = ENGINE.probeTargetsForObject(card, who);
    if (!fakeTargets) return false;   // no legal target → not castable
    return ENGINE.isLegalAction(who, {type:'castSpell', cardIid: card.iid, targets: fakeTargets});
  }
  return ENGINE.isLegalAction(who, {type:'castSpell', cardIid: card.iid});
}

function renderOppHand(hand) {
  const el = document.getElementById('oppHandView');
  el.innerHTML = '';
  // Devtools (revealAiHand): show the AI's actual cards face-up for judging
  // its decisions. Read-only — no onclick, since the player can't play them.
  if (typeof SETTINGS !== 'undefined' && SETTINGS.get('revealAiHand')) {
    for (const card of hand) {
      const div = makeCardEl(card, { inHand: true });
      div.style.setProperty('--scale', '0.5');
      div.classList.add('ai-revealed');
      el.appendChild(div);
    }
    return;
  }
  for (let i = 0; i < hand.length; i++) {
    // Cardback: just the C-color frame at small scale, inner elements
    // hidden by .frame-cardback CSS. No name / no art / no cost rendered.
    el.innerHTML += '<div class="card-frame col-C frame-cardback" style="--scale: 0.35"></div>';
  }
}

function renderBf(id, bf, who) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  const G = ENGINE.state();
  const pt = CONTROLLER.pendingTarget();
  const uiAtk = CONTROLLER.uiAtk();
  const uiBlk = CONTROLLER.uiBlk();
  const uiPickBlk = CONTROLLER.uiPickBlk();

  // Display: creatures > artifacts > lands (WUBRG then C). Stable across rerenders.
  const typeOrder = (t) => {
    if (t === 'Creature') return 0;
    if (t === 'Artifact') return 1;
    return 2;
  };
  const colorOrder = {W:0, U:1, B:2, R:3, G:4, C:5};
  const landKey = (card) => {
    const c = card.mana || 'C';
    const co = (colorOrder[c] !== undefined) ? colorOrder[c] : 6;
    return co + '|' + (card.name || '');
  };
  const sorted = bf.slice().sort((a, b) => {
    const t = typeOrder(a.type) - typeOrder(b.type);
    if (t !== 0) return t;
    if (a.type === 'Land' && b.type === 'Land') {
      const ka = landKey(a), kb = landKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
    }
    return 0;
  });

  for (const card of sorted) {
    const div = makeCardEl(card);
    // In-progress combat UI state.
    if (uiAtk.includes(card.iid)) div.classList.add('atk');
    if (uiBlk.has(card.iid)) div.classList.add('blk');
    for (const aIid of uiBlk.values()) if (aIid === card.iid) div.classList.add('atk');
    if (uiPickBlk === card.iid) div.classList.add('pblk');
    // Committed engine combat state.
    if (G.attackers.includes(card.iid)) div.classList.add('atk');
    if (G.blockers.has(card.iid)) div.classList.add('blk');

    if (pt) {
      const eff = pendingTargetEffect(pt);
      if (eff && isValidTargetCreature(eff, card)) div.classList.add('targetable');
    }
    if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
      const ptt = G.pendingTriggerTarget;
      if (ptt.valid.some(v => v.kind === 'creature' && v.iid === card.iid)) {
        div.classList.add('targetable');
      }
    }
    // Subtle ambient glow on untapped lands you control -- signals "this
    // can be tapped for mana" without the full .activatable intensity.
    if (who === 'you' && card.type === 'Land' && !card.tapped) {
      div.classList.add('land-tappable');
    }
    // Eligibility glow for attackers/blockers during the declaration step.
    // Distinct (dimmer) from .atk/.blk so SELECTED creatures still pop
    // brighter than eligible-but-not-selected ones.
    if (G.phase === 'COMBAT_ATTACK' && G.activePlayer === 'you' && !G.attackersDeclared
        && who === 'you' && ENGINE.canCreatureAttack(card)) {
      div.classList.add('could-atk');
    }
    if (G.phase === 'COMBAT_BLOCK' && G.activePlayer === 'opp' && !G.blockersDeclared
        && who === 'you' && ENGINE.canCreatureBlock(card)) {
      div.classList.add('could-blk');
    }
    if (who === 'you' && card.type === 'Creature' && card.abilities && !card.tapped && !card.sick) {
      const hasAvail = card.abilities.some((ab, i) => {
        if (ab.effects[0].kind === 'add_mana') return true;
        const targetedEff = ab.effects.find(ENGINE.effectNeedsTarget);
        const probe = targetedEff
          ? {type:'activateAbility', cardIid: card.iid, abilityIdx: i,
             targets:[(ENGINE.getValidTargets(targetedEff, 'you')[0] || {kind:'player', who:'you', label:'You'})]}
          : {type:'activateAbility', cardIid: card.iid, abilityIdx: i};
        return ENGINE.isLegalAction('you', probe);
      });
      if (hasAvail) div.classList.add('activatable');
    }
    div.onclick = () => CONTROLLER.clickBattlefield(card.iid);
    el.appendChild(div);
  }

  let showPlayerTargetButton = false;
  if (pt) {
    const eff = pendingTargetEffect(pt);
    // Drive the player-target button off real legality, not a hardcoded target
    // list — the §3.5 taxonomy spells "any target" as creature_or_player and
    // opponent-only as opp, both of which the old literal check missed. This
    // also gets the per-player gating right (opp → only the opponent's button).
    if (eff && ENGINE.getValidTargets(eff, 'you').some(v => v.kind === 'player' && v.who === who)) {
      showPlayerTargetButton = true;
    }
  }
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
    const ptt = G.pendingTriggerTarget;
    if (ptt.valid.some(v => v.kind === 'player' && v.who === who)) {
      showPlayerTargetButton = true;
    }
  }
  if (showPlayerTargetButton) {
    const btn = document.createElement('button');
    btn.className = 'ptgt-btn';
    btn.textContent = `→ Target ${G[who].name}`;
    btn.onclick = () => CONTROLLER.clickPlayerTarget(who);
    el.appendChild(btn);
  }
}

// Effects for the pending pick: chosen mode (cast) or ability (activate).
function pendingTargetEffects(pt) {
  if (!pt) return [];
  const G = ENGINE.state();
  if (pt.kind === 'cast') {
    const card = G.you.hand.find(c => c.iid === pt.cardIid);
    if (!card) return [];
    return ENGINE.effectsForMode(card, pt.modeIdx) || [];
  }
  if (pt.kind === 'ability') {
    const f = ENGINE.findCard(pt.cardIid);
    if (!f) return [];
    const ab = f.card.abilities[pt.abilityIdx];
    return (ab && ab.effects) || [];
  }
  return [];
}

// §3.5: the top-level target() filter for the pending cast/ability, if any.
function pendingTopTargetFilter(pt) {
  if (!pt) return null;
  const G = ENGINE.state();
  if (pt.kind === 'cast') {
    const card = G.you.hand.find(c => c.iid === pt.cardIid);
    return (card && card.target) || null;
  }
  if (pt.kind === 'ability') {
    const f = ENGINE.findCard(pt.cardIid);
    const ab = f && f.card.abilities[pt.abilityIdx];
    return (ab && ab.target) || null;
  }
  return null;
}
// The top-level step's optional restriction (target_filter) — drives target
// highlighting so a restricted spell only lights up legal targets.
function pendingTopTargetRestrict(pt) {
  if (!pt) return null;
  const G = ENGINE.state();
  if (pt.kind === 'cast') {
    const card = G.you.hand.find(c => c.iid === pt.cardIid);
    return (card && card.target_filter) || null;
  }
  if (pt.kind === 'ability') {
    const f = ENGINE.findCard(pt.cardIid);
    const ab = f && f.card.abilities[pt.abilityIdx];
    return (ab && ab.target_filter) || null;
  }
  return null;
}

// Object-level slot specs — one pick per `target_slots` entry. The canonical
// multi-target shape (§5b), on a hand-cast card OR an activated ability
// (Stapler). The slot's filter lives here, not on the effects.
function pendingObjectTargetSlots(pt) {
  if (!pt) return null;
  let obj = null;
  if (pt.kind === 'cast') obj = ENGINE.state().you.hand.find(c => c.iid === pt.cardIid);
  else if (pt.kind === 'ability') {
    const f = ENGINE.findCard(pt.cardIid);
    obj = f && f.card.abilities[pt.abilityIdx];
  }
  return (obj && Array.isArray(obj.target_slots) && obj.target_slots.length > 0) ? obj.target_slots : null;
}

// Unique sorted slots; one user pick per slot. A top-level target() step (§3.5)
// is a single slot [0]; an object's `target_slots` array is one pick per entry;
// otherwise fall back to per-effect target_slot values (legacy/staple-synth).
function slotsNeededForPending(pt) {
  if (pendingTopTargetFilter(pt)) return [0];
  const objSlots = pendingObjectTargetSlots(pt);
  if (objSlots) return objSlots.map((_, i) => i);
  const effects = pendingTargetEffects(pt);
  const slots = new Set();
  for (const eff of effects) {
    if (ENGINE.effectNeedsTarget(eff)) slots.add(eff.target_slot || 0);
  }
  return [...slots].sort((a, b) => a - b);
}

// Effect describing the CURRENT slot — drives target highlighting + descriptor
// kind. For a top-level target() step, a synthetic {target: filter} effect.
function pendingTargetEffect(pt) {
  if (!pt) return null;
  const top = pendingTopTargetFilter(pt);
  if (top) {
    const restrict = pendingTopTargetRestrict(pt);
    return restrict ? { target: top, filter: restrict } : { target: top };
  }
  const objSlots = pendingObjectTargetSlots(pt);
  if (objSlots) {
    const pickedCount = (pt.pickedSlots && pt.pickedSlots.length) || 0;
    return objSlots[pickedCount] || objSlots[0];
  }
  const slots = slotsNeededForPending(pt);
  if (slots.length === 0) return null;
  const pickedCount = (pt.pickedSlots && pt.pickedSlots.length) || 0;
  const currentSlot = slots[pickedCount] !== undefined ? slots[pickedCount] : slots[0];
  const effects = pendingTargetEffects(pt);
  return effects.find(e => ENGINE.effectNeedsTarget(e) && (e.target_slot || 0) === currentSlot) || null;
}

function isValidTargetCreature(eff, card) {
  if (!eff) return false;
  // Normalize the target() taxonomy to an eligible card-type + an implied
  // controller restriction:
  //   creature / your_creature / opp_creature / creature_or_player → creatures
  //   permanent / permanent_or_spell → battlefield permanents (stack spells are
  //     highlighted via a separate path in renderStack).
  // (Player targets are highlighted elsewhere.) Name kept for its single caller.
  const t = eff.target;
  const CREATURE_KINDS = ['creature', 'your_creature', 'opp_creature', 'creature_or_player'];
  const PERM_KINDS = ['permanent', 'permanent_or_spell'];
  if (CREATURE_KINDS.includes(t)) {
    if (card.type !== 'Creature') return false;
  } else if (PERM_KINDS.includes(t)) {
    if (card.type !== 'Creature' && card.type !== 'Land' && card.type !== 'Artifact') return false;
  } else {
    return false;
  }
  if (t === 'creature_or_player') return true;
  // Build the effective restriction: the taxonomy's implied controller plus the
  // step's explicit target_filter (threaded onto eff.filter). Route the whole
  // thing through the canonical matchFilter so every key (not_color, has_keyword,
  // max_tough, tapped, not_token, spliceable…) is honored at highlight time
  // exactly as at cast — no more drifting between highlight and click legality.
  const restrict = Object.assign({}, eff.filter || null);
  if (t === 'your_creature') restrict.controller = 'self';
  if (t === 'opp_creature') restrict.controller = 'opp';
  if (Object.keys(restrict).length === 0) return true;
  return ENGINE.matchFilter(card, restrict, card.controller, 'you');
}

// Render sticker badges. `big` = larger styling for the reward modal.
// empowerRolls/tplId/stapledTpls let individual Empower badges be labeled
// with the rolled field. subtypeRolls lets subtype badges show rolled type.
function stickerBadgesHtml(stickers, big, empowerRolls, tplId, stapledTpls, subtypeRolls) {
  if (!stickers || !stickers.length) return '';
  const parts = [];
  const counts = new Map();
  let empowerIdx = 0;
  let subtypeIdx = 0;
  // For empower-roll labeling, use the synthesized template if the slot is
  // stapled. Without this, a roll that targets the staple half's effect (e.g.
  // location='triggers' on an ETB-Bolt) would have its field looked up against
  // the base tpl alone, where that effect doesn't exist — degrading to the
  // raw field name fallback instead of the disambiguating "ETB damage" label.
  const tpl = tplId
    ? (Array.isArray(stapledTpls) && stapledTpls.length > 0
        ? ENGINE.synthesizeStapledTemplate(tplId, stapledTpls)
        : CARDS[tplId])
    : null;
  for (const sId of stickers) {
    const s = STICKERS[sId];
    if (!s) continue;
    if (s.kind === 'empower') {
      const cls = 'skw';
      const roll = empowerRolls ? empowerRolls[empowerIdx] : null;
      empowerIdx++;
      let label = 'Empower';
      if (roll && roll.field) {
        // Use the disambiguating helper when we have a template; otherwise
        // fall back to the raw field name (still better than nothing).
        if (tpl) {
          label = `Empower (${empowerRollLabel(tpl, roll)})`;
        } else {
          const modeSuffix = (roll.modeIdx != null) ? `, mode ${roll.modeIdx + 1}` : '';
          label = `Empower (${roll.field}${modeSuffix})`;
        }
      }
      parts.push(`<span class="stk-badge ${cls}" title="${s.text}">${label}</span>`);
      continue;
    }
    if (s.kind === 'subtype') {
      // Each subtype sticker carries an individual rolled subtype on the
      // parallel subtypeRolls array. Unlike statBoost (which counts up),
      // subtype rolls can each be a different value, so we render one
      // badge per roll.
      const rolled = subtypeRolls ? subtypeRolls[subtypeIdx] : null;
      subtypeIdx++;
      const label = rolled || 'Subtype';
      parts.push(`<span class="stk-badge skw" title="${s.text}">${label}</span>`);
      continue;
    }
    counts.set(sId, (counts.get(sId) || 0) + 1);
  }
  for (const [sId, n] of counts) {
    const s = STICKERS[sId];
    if (!s) continue;
    const cls = s.kind === 'stat_boost' ? 'stat'
              : s.kind === 'innate'    ? 'innate'
              : 'skw';
    let label;
    if (s.kind === 'stat_boost') label = '+1/+1';
    else if (s.kind === 'innate') label = 'Innate';
    // landColor badge label is "+{W}"-style — route the brace token
    // through renderManaSymbols so it shows the color pip / future PNG
    // instead of literal {W} text. The label gets injected into
    // innerHTML below, so an HTML span is fine here.
    else if (s.kind === 'grant_mana_ability') label = '+' + renderManaSymbols('{' + s.color + '}');
    else if (s.kind === 'cost_mod') label = ((s.amount || 0) < 0 ? (s.amount || 0) : '+' + (s.amount || 0)) + ' cost';
    else if (s.kind === 'trigger') label = s.name || 'Trigger';
    else if (s.kind === 'keyword') label = s.keyword;
    else label = s.name || s.kind;   // defensive — never render 'undefined'
    if (n > 1) label += ` ×${n}`;
    const html = `<span class="stk-badge ${cls}" title="${s.text}">${label}</span>`;
    // Innate is a status marker — surface first so it's scannable.
    if (s.kind === 'innate') parts.unshift(html);
    else                     parts.push(html);
  }
  return `<div class="stickers-row${big ? '-big' : ''}">${parts.join('')}</div>`;
}

// Build a row of restriction badges for runtime debuffs applied to a creature
// (e.g., Bonds of Faith makes a creature unable to attack and block). Only
// shown for cards on the battlefield — templates don't have these flags.
function restrictionBadgesHtml(card, big) {
  if (!card.cantAttack && !card.cantBlock) return '';
  const parts = [];
  if (card.cantAttack && card.cantBlock) {
    parts.push(`<span class="stk-badge restrict" title="This creature can't attack or block.">Can't atk/blk</span>`);
  } else if (card.cantAttack) {
    parts.push(`<span class="stk-badge restrict" title="This creature can't attack.">Can't attack</span>`);
  } else if (card.cantBlock) {
    parts.push(`<span class="stk-badge restrict" title="This creature can't block.">Can't block</span>`);
  }
  return `<div class="stickers-row${big ? '-big' : ''}">${parts.join('')}</div>`;
}

function nativeKeywordBadgesHtml(card, big) {
  // Tag each kw by source: 'intrinsic' (template, blue) vs 'granted' (in
  // grantedBy from another permanent, cyan — disappears if source leaves).
  // Both intrinsic AND granted → render as intrinsic (granting is redundant).
  const entries = [];
  let templateKw = [];
  // Tokens have their template in TOKENS, not CARDS. Read from the right
  // table so token-intrinsic keywords (e.g., flying on Spirit tokens) get
  // the intrinsic badge instead of being hidden.
  const tplTable = card.isToken ? TOKENS : CARDS;
  if (card.tplId && tplTable[card.tplId]) {
    templateKw = (tplTable[card.tplId].keywords || []).slice();
    for (const kw of templateKw) entries.push({ kw, source: 'intrinsic' });
    if (card.grantedBy instanceof Map) {
      for (const [kw, sources] of card.grantedBy) {
        if (sources.size === 0) continue;
        if (templateKw.includes(kw)) continue;
        const names = [];
        for (const srcIid of sources) {
          const f = ENGINE.findCard(srcIid);
          if (f) names.push(f.card.name);
        }
        entries.push({ kw, source: 'granted', grantSources: names });
      }
    }
  } else {
    // Synthetic card-shaped object (card browser preview) — no grant tracking.
    for (const kw of (card.keywords || [])) entries.push({ kw, source: 'intrinsic' });
  }
  if (!entries.length) return '';
  const parts = [];
  for (const { kw, source, grantSources } of entries) {
    if (kw === 'no_block') continue;  // hidden kw (restrict→grant_keyword)
    const label = KEYWORD_DISPLAY[kw] || (kw.charAt(0).toUpperCase() + kw.slice(1));
    // Defender = downside ability — render red like restrictions.
    let cls;
    if (kw === 'defender')        cls = 'restrict';
    else if (source === 'granted') cls = 'kw-granted';
    else                           cls = 'kw';
    const tooltip = (source === 'granted' && grantSources && grantSources.length)
      ? `${label} (granted by ${grantSources.join(', ')})`
      : label;
    parts.push(`<span class="stk-badge ${cls}" title="${tooltip}">${label}</span>`);
  }
  return `<div class="stickers-row${big ? '-big' : ''}">${parts.join('')}</div>`;
}

// Render a card's art field as HTML. Detects image URLs (data: URLs and
// http(s) URLs) and emits an <img>; falls back to the literal string for
// emoji glyphs (the legacy art format). The wrapping container provides
// its own sizing via CSS (font-size for emoji, max-width/height for img),
// so the helper only emits the right element shape — no inline sizing.
//
// `fallback` is what to render when art is missing/empty (defaults to ''
// since most callers handle empty gracefully).
// Pick the right art for a card based on its current power+toughness.
//
// Cards with a static art simply have an "art" string in their template
// and return early. Cards with an `art_ladder` array on their template
// (currently only Elystra) evolve their portrait as they grow — each
// ladder entry is `{min_pt, art}`, and we walk the ladder picking the
// highest threshold the card's current p+t meets.
//
// Stats come from ENGINE.getStats so live modifiers + sticker pumps +
// static_buffs + permanent EOT bumps all count. For non-Creatures (no
// stats to compute), fall back to the base art unconditionally.
//
// Called by makeCardEl (hand/board) and openCardPopup (zoom). Draft,
// reward, and card-browser views work off templates and don't get
// runtime stats, so they use the base `art` field directly — that's
// the "show the early/base form" default for browse contexts.
function effectiveArt(card) {
  if (!card) return '';
  // Ladder lives on the template, not the instance — makeCard doesn't
  // copy it across, and rather than add an engine change to do so, we
  // look it up here. This is a render-only concern; the engine never
  // needs to know about art variants.
  const tpl = (typeof CARDS !== 'undefined') ? CARDS[card.tplId] : null;
  const ladder = (tpl && Array.isArray(tpl.art_ladder)) ? tpl.art_ladder : card.art_ladder;
  if (!Array.isArray(ladder) || ladder.length === 0) return card.art;
  if (card.type !== 'Creature') return card.art;
  let p = 0, t = 0;
  try {
    const stats = ENGINE.getStats(card);
    if (Array.isArray(stats)) { p = stats[0] || 0; t = stats[1] || 0; }
  } catch (_) {
    p = card.power || 0; t = card.toughness || 0;
  }
  const sum = (p || 0) + (t || 0);
  let pick = card.art;
  for (const rung of ladder) {
    if (rung && sum >= (rung.min_pt || 0)) pick = rung.art;
  }
  return pick;
}

// Is this art value something the browser should resolve as an image
// source? Used by artHtml (to decide between <img> and inline text) AND
// by the small inline-art callers (stack pill, library search, zone
// modal) which substitute a generic 🎴 glyph rather than try to render
// a real image inside a narrow text pill. Centralized here so a new
// flavor of art source (e.g. data:image/svg+xml, or a future blob URL)
// gets recognized in every site at once.
//   - data:           — inline base64 (legacy embeds, e.g. the old dragon)
//   - http            — full URL
//   - ends in .png/.jpg/.jpeg/.gif/.webp/.svg — relative file path,
//     resolved against magiclike_engine.html (cards/<tplId>/art.png)
// Emoji are 1-4 chars and never match.
function isArtUrl(art) {
  return typeof art === 'string' && (
    art.startsWith('data:') ||
    art.startsWith('http') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(art)
  );
}

function artHtml(art, fallback) {
  if (!art) return fallback || '';
  if (isArtUrl(art)) {
    // pixelated rendering preserves the chunky look of small pixel-art
    // sources (the 64x32 native size is intentionally low-res). Per-
    // context sizing (.cart img, .pop-art img, etc.) lives in CSS so
    // each render site can integer-scale the source to suit its frame.
    // alt="" because the card name is rendered separately — duplicating
    // it in alt text creates noise for screen readers.
    return `<img src="${art}" alt="">`;
  }
  return art;
}

// Pre-computed display values for a card, consumed by both makeCardEl
// (in-hand / on-board frame) and openCardPopup (4x popup frame in
// controller.js). Centralizing here keeps cost-pip rendering, type-line
// assembly, art resolution, and sticker-badge construction in one place
// — both consumers used to inline these and were prone to drift.
//
// opts.inHand        — show effective cost (cast tax) with ↑ marker.
//                      Default: show base cost (board/zone view).
// opts.overrideOracleText — bypass describeCardSegments; render the
//                      literal string through escape + mana pipeline.
//                      Used by makeSyntheticCard for boons / mystery
//                      placeholders / cardbacks that aren't engine cards.
function cardToViewModel(card, opts) {
  opts = opts || {};
  const inHand = !!opts.inHand;
  const overrideOracleText = opts.overrideOracleText;

  // Frame color: cost colors > card.color > land's produced color
  // (Plains -> W) > Colorless. Multicolor uses first WUBRG-order color;
  // dual-color frame design is a future tweak.
  const colorKey = (card.colors && card.colors[0])
    || card.color
    || (card.type === 'Land' && card.mana)
    || 'C';

  const isCreature = card.type === 'Creature';
  const [pow, tou] = isCreature
    ? ENGINE.getStats(card)
    : [card.power || 0, card.toughness || 0];

  const displayCost = inHand
    ? ENGINE.effectiveCastCost(card)
    : card.cost;
  let pipsHtml = '';
  if (displayCost) {
    if (displayCost.C) {
      pipsHtml += '<span class="frame-pip col-num">' + displayCost.C + '</span>';
    }
    for (const c of ['W','U','B','R','G']) {
      const n = displayCost[c] || 0;
      for (let i = 0; i < n; i++) {
        pipsHtml += '<span class="frame-pip col-' + c + '"></span>';
      }
    }
  }
  let bumpedMarker = '';
  if (inHand && card.cost) {
    const baseC = card.cost.C || 0;
    const effC = (displayCost && displayCost.C) || 0;
    if (effC > baseC) bumpedMarker = '<span class="frame-bumped">↑</span>';
  }

  const typeText = card.type + (card.sub ? ' — ' + card.sub : '');

  let oracleHtml;
  if (overrideOracleText !== undefined) {
    oracleHtml = renderManaSymbols(escapeHtml(overrideOracleText));
  } else {
    const segs = describeCardSegments(card, {skipKeywords: false});
    oracleHtml = segmentsToHtml(segs);
  }

  const artVal = effectiveArt(card);
  const artInner = isArtUrl(artVal)
    ? '<img src="' + artVal + '" alt="">'
    : escapeHtml(artVal || '');

  const stickersInner = (card.stickers && card.stickers.length)
    ? stickerBadgesHtml(card.stickers, false, card.empowerRolls, card.tplId, card.stapledFrom && card.stapledFrom.stapledTpls, card.subtypeRolls)
    : '';

  return {
    colorKey, isCreature, pow, tou,
    pipsHtml, bumpedMarker, typeText, oracleHtml,
    artInner, stickersInner,
  };
}

// Pixel-art in-hand / on-board card. Builds the 80x112 frame at 1x scale
// (so it renders at native 80x112 pixels). State classes (.tapped/.castable/
// .targetable/etc.) get applied AFTER the element is returned; the .card-frame
// CSS handles each via .card-frame.{state}.
function makeCardEl(card, opts) {
  const div = document.createElement('div');
  div.dataset.iid = String(card.iid);

  const vm = cardToViewModel(card, opts);

  div.className = 'card-frame col-' + vm.colorKey +
    (card.tapped ? ' tapped' : '') +
    (card.sick ? ' sick' : '');

  // Restrictions render only on the in-hand/board frame, not on the
  // popup or on fake cards. Inlined here because the popup intentionally
  // doesn't surface restrictions in the frame body.
  const restrictInner = restrictionBadgesHtml(card, false);
  const stickerSection = (vm.stickersInner || restrictInner)
    ? '<div class="frame-stickers">' + vm.stickersInner + restrictInner + '</div>'
    : '';

  const ptInner = vm.isCreature ? '<div class="frame-pt">' + vm.pow + '/' + vm.tou + '</div>' : '';
  const damageInner = card.damage ? '<div class="frame-damage">' + card.damage + '</div>' : '';

  div.innerHTML =
    '<div class="frame-title">' +
      '<div class="frame-name">' + escapeHtml(card.name || '') + '</div>' +
      '<div class="frame-cost">' + vm.pipsHtml + vm.bumpedMarker + '</div>' +
    '</div>' +
    '<div class="frame-art">' + vm.artInner + '</div>' +
    '<div class="frame-type">' + escapeHtml(vm.typeText) + '</div>' +
    '<div class="frame-text">' +
      '<div class="frame-oracle">' + vm.oracleHtml + '</div>' +
      stickerSection +
    '</div>' +
    ptInner + damageInner;

  CONTROLLER.attachLongPress(div, card);
  return div;
}

// Build a card frame for things that aren't engine-shaped cards (Neow
// boons, mystery placeholders, sticker rewards, cardbacks, etc.). Caller
// supplies a flat object; we fabricate just enough of the card-shape that
// makeCardEl doesn't crash, and pass the literal text through opts so
// describeCardSegments is bypassed.
function makeSyntheticCard({ name, type, sub, text, art, color, cost, power, toughness, scale }) {
  const fakeCard = {
    name: name || '',
    type: type || '',
    sub: sub || '',
    art: art || '',
    color: color || 'C',
    cost: cost || null,
    power: power || 0,
    toughness: toughness || 0,
    abilities: [], effects: [], triggers: [], static_buffs: [],
    stickers: [], keywords: [], colors: [],
    iid: -1,
  };
  const el = makeCardEl(fakeCard, { overrideOracleText: text || '' });
  if (scale !== undefined) el.style.setProperty('--scale', String(scale));
  return el;
}

// Mana-cost in MtG-canonical braced notation: {R:2, C:4} -> "{4}{R}{R}".
// Plain text — caller pipes through renderManaSymbols() to get pip HTML.
function formatCostBraced(c) {
  if (!c) return '';
  let s = '';
  if (c.C) s += '{' + c.C + '}';
  for (const k of ['W','U','B','R','G']) s += ('{' + k + '}').repeat(c[k] || 0);
  return s || '{0}';
}

// Convert `{X}` patterns embedded in card text or formatCostBraced output
// into mana-pip HTML spans. The pipeline:
//   card text "{R}: gets +1/+0" -> escapeHtml -> renderManaSymbols
//   cost {R:2,C:4} -> formatCostBraced -> renderManaSymbols
//
// CSS in magiclike_engine.html defines a default colored-circle look for
// .mana / .mana-W / .mana-R / etc. The pathway is set up so a future
// `.mana-R { background-image: url('assets/mana/R.png'); color:
// transparent; }` swap will replace text pips with PNG art globally.
//
// Recognized symbols: WUBRGC (color/colorless pips), T (tap), X (variable
// cost), and any pure-number sequence (generic mana). Unrecognized braces
// are returned untouched so existing text like "{1.5}" or "{foo}" can't
// break rendering.
// Per-color glyph used as the FALLBACK rendering (no PNG art yet). The
// five Unicode circle emoji are coincidentally the right shape and color
// for mana symbols, so they look recognizable without shipping any image
// files. When real PNGs land in assets/mana/, the .mana-W / .mana-U / ...
// CSS overrides will hide the emoji via color:transparent and show the
// art instead. C (colorless) has no canonical emoji match — keep it
// as a letter pip until art ships.
const MANA_GLYPH = { W: '⚪', U: '🔵', B: '⚫', R: '🔴', G: '🟢', C: 'C' };

function renderManaSymbols(text) {
  if (text == null) return '';
  return String(text).replace(/\{([^}]+)\}/g, (whole, sym) => {
    const upper = sym.toUpperCase();
    if (/^[WUBRGC]$/.test(upper)) {
      const glyph = MANA_GLYPH[upper];
      return '<span class="mana mana-' + upper + '" title="' + upper + '">' + glyph + '</span>';
    }
    if (upper === 'T') return '<span class="mana mana-T" title="Tap">T</span>';
    if (upper === 'X') return '<span class="mana mana-X" title="X">X</span>';
    if (/^\d+$/.test(sym)) return '<span class="mana mana-num" title="' + sym + '">' + sym + '</span>';
    return whole;
  });
}
