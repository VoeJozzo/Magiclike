// =========================================================================
// UI / RENDER — reads ENGINE.state() and CONTROLLER UI state. No mutation.
// =========================================================================
function passLabel(G, expectedActor) {
  // Contextual label for the unified Pass button. Same action under the hood
  // (doPass → passPriority or empty-declaration), but the wording reflects
  // what passing means right now.
  if (expectedActor !== 'you') return 'Pass';
  // A pending target prompt outranks priority/reaction labelling — the player
  // owes a target click before anything else can happen. Button is disabled
  // in this state (see render), but the label still reads correctly if shown.
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') return 'Pick Target';
  if (G.pendingRipSelect && G.pendingRipSelect.who === 'you') return 'Rip a Permanent';
  if (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you') return 'Pick a Number';
  if (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you') return 'Pick a Value';
  // Reacting to something on the stack.
  if (G.priority && G.stack.length > 0) return 'No Reaction';
  // Pre-declaration phases (priority not yet open).
  if (G.phase === 'COMBAT_ATTACK' && G.activePlayer === 'you' && !G.attackersDeclared) return 'Skip Combat';
  if (G.phase === 'COMBAT_BLOCK'  && G.activePlayer === 'opp' && !G.blockersDeclared) return 'No Blocks';
  // Empty-stack priority round — label by phase.
  if (G.priority) {
    if (G.phase === 'MAIN1' && G.activePlayer === 'you') return 'To Combat';
    if (G.phase === 'MAIN2' && G.activePlayer === 'you') return 'To End Step';
    if (G.phase === 'COMBAT_ATTACK') return 'To Blocks';
    if (G.phase === 'COMBAT_BLOCK')  return 'To Damage';
    if (G.phase === 'END' && G.activePlayer === 'you') return 'End Turn';
    if (G.phase === 'END' && G.activePlayer === 'opp') return 'Pass';   // your end-of-opp window
    return 'Pass Priority';
  }
  return 'Pass';
}

// Build a trigger-build option button (Codex-style modal). Used in both
// condition and effect picker steps — identical styling and hover.
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
  if (!G) return;
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
  // Surface the current game number as a small tag prefix. RUN may be
  // null in dev/test contexts; the label degrades gracefully in that case.
  const runStats = (typeof RUN !== 'undefined' && RUN.getStats) ? RUN.getStats() : null;
  const gamePrefix = (runStats && runStats.gameNum) ? `<span style="color:#888;font-weight:normal">G${runStats.gameNum}</span> · ` : '';
  document.getElementById('turnlbl').innerHTML =
    `${gamePrefix}Turn ${G.turn} — ${G[G.activePlayer].name}'s turn`;

  const banner = document.getElementById('stackBanner');
  const bannerItems = document.getElementById('stackBannerItems');
  const bannerHint = document.getElementById('stackBannerHint');
  const bannerCancel = document.getElementById('stackBannerCancelBtn');
  // Show the in-banner Cancel only when the player has a cancellable
  // spell-cast or ability-activation in progress (pt). Triggered abilities
  // (ptt) require a target and can't be cancelled, so we don't surface
  // Cancel for those. The banner itself is only visible when the stack is
  // non-empty, so this button is the in-context backup for when the stack
  // banner is covering the top tgtbar's Cancel button.
  bannerCancel.style.display = pt ? 'inline-block' : 'none';
  if (!G.stack.length) {
    banner.classList.remove('vis');
  } else {
    // pt.cardIid is the source card of the pending target action. For
    // spell casts, that's a card in hand. For ability activations
    // (Stapler), it's a card on the battlefield. Search both zones.
    const ptCard = pt && (
      G.you.hand.find(c => c.iid === pt.cardIid) ||
      G.you.battlefield.find(c => c.iid === pt.cardIid)
    );
    // Read effects from the chosen mode (pt.modeIdx) — for non-modal cards
    // this returns the flat effects list; for modal cards, just the mode the
    // player picked. We can't tell if a card is "a counterspell" until we
    // know which mode is being cast, since a modal card's counter-mode might
    // not be the chosen one.
    const isCounterTarget = (() => {
      if (!pt || !ptCard) return false;
      // Spell-cast path: read the chosen mode's effects.
      if (pt.kind === 'cast') {
        const modeEffects = ENGINE.effectsForMode(ptCard, pt.modeIdx);
        return modeEffects.some(e => e.target === 'spell' || e.target === 'permanentOrSpell');
      }
      // Ability-activation path: read the activated ability's effects so
      // Stapler (target: permanentOrSpell) lights up stack items too.
      if (pt.kind === 'ability') {
        const ab = (ptCard.abilities || [])[pt.abilityIdx || 0];
        if (!ab) return false;
        return (ab.effects || []).some(e => e.target === 'spell' || e.target === 'permanentOrSpell');
      }
      return false;
    })();
    banner.classList.add('vis');
    // Detect whether the pending action is a Stapler-style splice (target
    // 'permanentOrSpell') vs a counterspell (target 'spell'). Same UI
    // affordance (click stack item), different framing.
    const isSpliceTargetMode = (() => {
      if (!pt || !ptCard) return false;
      let effects = [];
      if (pt.kind === 'cast') {
        effects = ENGINE.effectsForMode(ptCard, pt.modeIdx) || [];
      } else if (pt.kind === 'ability') {
        const ab = (ptCard.abilities || [])[pt.abilityIdx || 0];
        effects = (ab && ab.effects) || [];
      }
      return effects.some(e => e.target === 'permanentOrSpell');
    })();
    bannerHint.textContent = isCounterTarget
      ? (isSpliceTargetMode ? '— click a spell or permanent to splice it' : '— click a spell to counter it')
      : (G.stack.length === 1 ? '— top resolves first' : `— ${G.stack.length} on stack, top resolves first`);
    bannerItems.innerHTML = '';
    G.stack.slice().reverse().forEach((it, displayIdx) => {
      const realIdx = G.stack.length - 1 - displayIdx;
      const tgtLabel = (it.targets && it.targets[0] && it.targets[0].label) ? ` → ${it.targets[0].label}` : '';
      const div = document.createElement('div');
      div.className = 'bnr-item' + (isCounterTarget ? ' tgt' : '');
      // data-stack-idx: lets the target-line overlay locate this pill
      // when drawing lines to its declared targets. Real-index (not the
      // reversed display index) so the layer can index G.stack directly.
      div.dataset.stackIdx = String(realIdx);
      // Display differs for triggers vs spells — triggers don't have a card.
      if (it.kind === 'trigger') {
        div.innerHTML =
          `<div class="topline">⚡ ${it.sourceName} triggers</div>` +
          `<div class="botline">${it.trig.text || it.trig.event}${tgtLabel}</div>`;
        // Long-press a trigger pill: show the source card.
        const src = ENGINE.findCard(it.sourceIid);
        if (src) CONTROLLER.attachLongPress(div, src.card);
      } else {
        // For modal cards on the stack, show the chosen mode in the
        // top line so the player can see what the spell will actually
        // do if it resolves — especially important when deciding whether
        // to counter it.
        let modeLabel = '';
        if (ENGINE.isModal(it.card)) {
          const mn = (it.card.effects.modeNames || [])[it.modeIdx || 0];
          if (mn) modeLabel = ` <span style="color:#aaccee;font-size:10px">(${mn})</span>`;
        }
        // Stack pill is small/inline — show emoji art directly, skip for
        // URL art (would force-stretch an <img> into a narrow pill).
        const isUrlArt = typeof it.card.art === 'string'
          && (it.card.art.startsWith('data:') || it.card.art.startsWith('http'));
        const inlineArt = isUrlArt ? '🎴' : (it.card.art || '');
        div.innerHTML =
          `<div class="topline">${inlineArt} ${it.card.name}${modeLabel}</div>` +
          `<div class="botline">cast by ${G[it.controller].name}${tgtLabel}</div>`;
        CONTROLLER.attachLongPress(div, it.card);
      }
      // Counter targeting only applies to spells, not triggers.
      if (isCounterTarget && it.kind !== 'trigger') {
        div.onclick = () => CONTROLLER.clickStackTarget(realIdx);
      }
      bannerItems.appendChild(div);
    });
  }

  renderHand('youHand', G.you.hand, 'you');
  renderOppHandBacks(G.opp.hand.length);
  renderBf('youBf', G.you.battlefield, 'you');
  renderBf('oppBf', G.opp.battlefield, 'opp');

  const showDone = (G.activePlayer === 'you' && G.phase === 'COMBAT_ATTACK' && !G.attackersDeclared)
                || (G.activePlayer === 'opp' && G.phase === 'COMBAT_BLOCK' && !G.blockersDeclared);
  const btnDone = document.getElementById('btnDone');
  btnDone.style.display = showDone ? 'block' : 'none';
  btnDone.textContent = G.phase === 'COMBAT_ATTACK' ? 'Done Attacking' : 'Done Blocking';

  const expectedActor = ENGINE.expectedActor();
  const inReaction = !!(G.priority && G.stack.length > 0);

  // Single Pass button: label varies by context, enabled whenever the engine
  // is waiting on the player and 'pass' is a meaningful move.
  const passBtn = document.getElementById('btnPass');
  passBtn.textContent = passLabel(G, expectedActor);
  passBtn.disabled = G.gameOver || !!pt || G.cleanupDiscarding
                  || (G.forcedDiscard && G.forcedDiscard.who === 'you')
                  || (G.pendingSearch && G.pendingSearch.who === 'you')
                  || (G.pendingTriggerBuild && G.pendingTriggerBuild.who === 'you')
                  || (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you')
                  || (G.pendingRipSelect && G.pendingRipSelect.who === 'you')
                  || (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you')
                  || (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you')
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
  // Floating Cancel button anchored to the bottom-right. Shown alongside
  // the top tgtbar so the player can always cancel an in-flight target
  // even when the stack banner is covering the top of the screen.
  // Triggered abilities (pendingTriggerTarget) can't be cancelled — you
  // must choose a target — so we hide it in that case.
  const statusCancelBtn = document.getElementById('statusCancelBtn');
  if (pt) {
    tb.classList.add('vis');
    tgtCancelBtn.style.display = '';
    statusCancelBtn.style.display = '';
    const card = G.you.hand.find(c => c.iid === pt.cardIid)
              || (ENGINE.findCard(pt.cardIid) || {}).card;
    // abilitySac: show "Sacrifice for {cardName}" so the player knows they
    // need to click a creature to sacrifice rather than pick a target for
    // the effect itself.
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
  // Search modal — show/hide and populate.
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
        const btn = document.createElement('button');
        btn.className = 'search-card';
        // textContent only — strip URL art to avoid showing the data: prefix.
        const isUrlArt = typeof card.art === 'string'
          && (card.art.startsWith('data:') || card.art.startsWith('http'));
        const inlineArt = isUrlArt ? '🎴' : (card.art || '');
        btn.textContent = `${inlineArt} ${card.name}`;
        btn.onclick = () => CONTROLLER.searchPick(card.iid);
        list.appendChild(btn);
      }
    }
  } else {
    Modal.hide('searchModal');
  }
  // Trigger-build modal — Codex-style procedural-trigger pickers.
  // Three-step flow: condition → effect → (optional) compare new vs current.
  if (G.pendingTriggerBuild && G.pendingTriggerBuild.who === 'you') {
    Modal.show('triggerBuildModal', { dismissible: false });
    const ptb = G.pendingTriggerBuild;
    // Look up the source card's name for displays.
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
    keepWrap.style.display = 'none';   // re-shown only on the compare step

    if (ptb.step === 'condition') {
      titleEl.textContent = '📜 STEP 1 OF 2: CHOOSE WHEN';
      subtitleEl.textContent = `When should ${sourceName}'s ability fire?`;
      ptb.conditionOptions.forEach((cond, idx) => {
        const text = (cond.text || '').replace(/~/g, sourceName);
        const html = `<span style="color:#ffd700;font-weight:bold">Option ${idx+1}</span><br>When ${text}…`;
        list.appendChild(makeTriggerBuildOptionBtn(html, () => CONTROLLER.triggerBuildPick(idx)));
      });
    } else if (ptb.step === 'effect') {
      titleEl.textContent = '📜 STEP 2 OF 2: CHOOSE WHAT';
      const condText = (ptb.chosenCondition.text || '').replace(/~/g, sourceName);
      subtitleEl.textContent = `When ${condText} — what happens?`;
      ptb.effectOptions.forEach((eff, idx) => {
        const text = (eff.describe || '').replace(/~/g, sourceName);
        const display = text.length > 0 ? (text[0].toUpperCase() + text.slice(1)) : text;
        const html = `<span style="color:#ffd700;font-weight:bold">Option ${idx+1}</span><br>${display}`;
        list.appendChild(makeTriggerBuildOptionBtn(html, () => CONTROLLER.triggerBuildPick(idx)));
      });
    } else if (ptb.step === 'compare') {
      titleEl.textContent = '📜 KEEP OR REPLACE?';
      subtitleEl.textContent = `Compare your new ability with the current one.`;
      // Render two side-by-side cards: current (left/top) vs new (right/bottom).
      const currentText = (ptb.currentTrigger.text || '').replace(/~/g, sourceName);
      const newText = (ptb.assembledTrigger.text || '').replace(/~/g, sourceName);
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
  // Number-choice modal — Archdemon of Bargains. Player picks an integer
  // in [min, max]. Each integer is a button; clicking submits the action.
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
  // Symmetricize modal. Target's controller picks one of three labels;
  // each shows the value that all three will become. Click sends the
  // symmetricizeChoice action through CONTROLLER.
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
  // Modal-spell mode picker. Shown when player clicks a modal card from
  // hand. One button per mode, each labeled with the modeName from the
  // card template. Modes that aren't currently legal (no valid target,
  // can't pay cost, etc.) are visually disabled but still rendered so
  // the player sees what the card CAN do, even if not right now.
  const pmc = CONTROLLER.pendingModalChoice();
  if (pmc) {
    const card = G.you.hand.find(c => c.iid === pmc.cardIid);
    if (card) {
      Modal.show('modalChoiceModal', { onClose: () => CONTROLLER.cancelModalChoice() });
      const isUrlArt = typeof card.art === 'string'
        && (card.art.startsWith('data:') || card.art.startsWith('http'));
      const inlineArt = isUrlArt ? '🎴' : (card.art || '');
      setText('modalChoiceCardName', `${inlineArt} ${card.name}`);
      const list = document.getElementById('modalChoiceList');
      list.innerHTML = '';
      const modes = ENGINE.getModes(card);
      const modeNames = (card.effects && card.effects.modeNames) || [];
      for (let mIdx = 0; mIdx < modes.length; mIdx++) {
        const modeEffects = modes[mIdx];
        const targetedEff = (modeEffects || []).find(ENGINE.effectNeedsTarget);
        // Legality check: can this specific mode be cast right now?
        // For targeted effects, we need any legal target to test castability;
        // get one from getValidTargets, falling back to a player target.
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
        btn.textContent = modeNames[mIdx] || `Mode ${mIdx + 1}`;
        if (legal) {
          btn.onclick = () => CONTROLLER.pickModalMode(mIdx);
        }
        list.appendChild(btn);
      }
    } else {
      // Card no longer in hand (shouldn't happen, but defensive).
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
        // Won this game; run continues.
        statsEl.textContent = `Game ${stats.gameNum} — ${stats.wins} win${stats.wins === 1 ? '' : 's'} this run`;
        // Label reflects what the player will see next. If there's a map
        // fork pending after the reward is resolved, surface that. Reward
        // modal still overlays first; this is a hint for the post-reward
        // state.
        const mapState = RUN.getMapState && RUN.getMapState();
        const hasMapChoice = mapState && mapState.pendingChoice;
        btn.textContent = hasMapChoice ? 'Choose Path' : 'Next Game';
        // While a reward is pending, the button is disabled until the player
        // completes the sticker pick (the reward modal will overlay anyway).
        btn.disabled = !!RUN.getReward();
      } else {
        // Run is over — gameOverClick will return the player to the start
        // screen rather than silently launching a new draft. Label matches.
        statsEl.textContent = `Run over — ${stats.wins} win${stats.wins === 1 ? '' : 's'} across ${stats.gameNum} game${stats.gameNum === 1 ? '' : 's'}`;
        btn.textContent = 'Main Menu';
        btn.disabled = false;
      }
    } else {
      // No run state (shouldn't happen post-bootstrap, but be defensive).
      statsEl.textContent = '';
      btn.textContent = 'New Run';
      btn.disabled = false;
    }
  } else if (pt) {
    // For multi-target spells/abilities, show "Pick target N of M" so the
    // player knows where they are in the sequence. Single-target picks fall
    // through to the original prompt.
    const slotsNeeded = slotsNeededForPending(pt);
    if (slotsNeeded.length > 1) {
      const pickedCount = (pt.pickedSlots && pt.pickedSlots.length) || 0;
      sb.textContent = `Pick target ${pickedCount + 1} of ${slotsNeeded.length}. Click highlighted creatures, the stack, or player buttons.`;
    } else {
      sb.textContent = `Choose a target. Click highlighted creatures, the stack, or player buttons.`;
    }
  } else if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
    sb.textContent = `${G.pendingTriggerTarget.sourceName} triggered — choose a target. Click highlighted creatures or player buttons.`;
  } else if (G.pendingRipSelect && G.pendingRipSelect.who === 'you') {
    sb.textContent = `${G.pendingRipSelect.source} — choose a permanent of yours to rip. It will be destroyed AND removed from your deck for the rest of the run.`;
  } else if (G.pendingNumberChoice && G.pendingNumberChoice.who === 'you') {
    sb.textContent = `${G.pendingNumberChoice.source} — pick a number from ${G.pendingNumberChoice.min} to ${G.pendingNumberChoice.max}.`;
  } else if (G.pendingSymmetricizeChoice && G.pendingSymmetricizeChoice.who === 'you') {
    sb.textContent = `${G.pendingSymmetricizeChoice.source} on ${G.pendingSymmetricizeChoice.targetName} — pick power, toughness, or cost.`;
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

  // Auto-open the graveyard modal in targeting mode when a graveyard target
  // is needed. Two routes lead here:
  //   - pendingTriggerTarget with valid = graveyardCreature[] (e.g., Grave
  //     Digger ETB asking for a graveyard creature to recur)
  //   - pendingTarget (spell cast) where the spell's effect targets a
  //     graveyard creature (no such spell yet, but the path is supported)
  // The modal renders with click handlers that submit the target. Outside
  // targeting mode, openZone is a passive viewer (existing behavior).
  if (!G.gameOver) {
    let graveTargets = null;
    if (G.pendingTriggerTarget
        && G.pendingTriggerTarget.controller === 'you'
        && G.pendingTriggerTarget.valid
        && G.pendingTriggerTarget.valid.length > 0
        && G.pendingTriggerTarget.valid[0].kind === 'graveyardCreature') {
      graveTargets = G.pendingTriggerTarget.valid;
    } else if (pt) {
      const eff = pendingTargetEffect(pt);
      if (eff && eff.target === 'graveyardCreature') {
        graveTargets = ENGINE.getValidTargets(eff, 'you');
      }
    }
    if (graveTargets) {
      openZoneTargeting('you', 'graveyard', graveTargets);
    }
  }
  // Draw target lines from stack items to their declared targets. Deferred
  // via requestAnimationFrame so the browser has applied layout for every
  // card div before we measure positions. The handler clears the SVG and
  // redraws on every call — stale lines from previous renders don't leak.
  requestAnimationFrame(drawTargetLines);
}

// Draw thin dashed lines from each stack item to its declared target(s).
// Reads G.stack and resolves each target's iid to its on-screen DOM
// element (via data-iid attribute set by makeCardEl). Stack pills are
// located via data-stack-idx. Skips targets we can't visualize (players,
// off-screen cards, gone-from-board targets).
//
// Color: red for counterspells/Steal (target: spell/permanentOrSpell),
// soft orange for everything else. An arrowhead at the target end makes
// the direction explicit.
function drawTargetLines() {
  const svg = document.getElementById('targetLines');
  if (!svg) return;
  // Clear previous lines but keep <defs> (which holds the arrowhead markers).
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
    // Compute effects this stack item will run (chosen mode for modals,
    // flat effects for spells, the trigger's effects for triggers).
    let effects = [];
    if (item.kind === 'trigger') {
      effects = (item.trig && item.trig.effects) || [];
    } else if (item.card) {
      effects = ENGINE.effectsForMode(item.card, item.modeIdx || 0) || [];
    }
    for (let ti = 0; ti < targets.length; ti++) {
      const tgt = targets[ti];
      if (!tgt) continue;
      // Resolve target to a DOM element. Player targets have no good DOM
      // anchor — skip those.
      let targetEl = null;
      if (tgt.kind === 'creature' || tgt.kind === 'permanent' || tgt.kind === 'graveyardCreature') {
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
      // Pick effects that consume THIS target slot. By default effects
      // share targets[0]; an effect can declare targetSlot:N to consume
      // targets[N] instead. So filter effects whose targetSlot matches
      // this loop's index.
      const slotEffects = effects.filter(e => (e.targetSlot || 0) === ti);
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

// Effect-kind valence buckets. Used by drawTargetLines to color the line
// red (harm), green (benefit), or orange (neutral/mixed). The harmful set
// includes counterspells, removal, bounce, debuffs, color erasure,
// equalization, stealing, etc. The beneficial set is buffs/heals/untap/
// recursion. Everything else falls through to neutral.
const HARMFUL_KINDS = new Set([
  'damage', 'damageAll', 'removeCreature', 'removeAll', 'destroyAndStickerSlot',
  'weaken', 'restrict', 'discard', 'edict', 'bleach', 'embargo',
  'gainControl', 'steal', 'counter', 'shuffleIntoLibrary', 'exileUntilEOT',
  'ripPermanent', 'symmetricize', 'fightTarget',
]);
const BENEFICIAL_KINDS = new Set([
  'pump', 'pumpAllYours', 'addCounter', 'grantKeyword', 'untap',
  'flicker', 'returnFromGraveyard', 'gainLife',
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
    if (HARMFUL_KINDS.has(e.kind)) hasHarm = true;
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
  // Self-target harmful = neutral. Opp-target beneficial = neutral.
  // Otherwise honor the effect-kind classification.
  if (hasHarm && targetController === casterSide) return 'neutral';
  if (hasBenefit && !hasHarm && targetController && targetController !== casterSide) return 'neutral';
  if (hasHarm) return 'harm';
  if (hasBenefit) return 'benefit';
  return 'neutral';
}

// Targeting-mode wrapper around openZone — shows the graveyard with valid
// target cards highlighted and clickable. Cards that aren't valid are still
// shown but not selectable. Clicking a valid card submits the target via
// the appropriate path (trigger target pick OR spell cast action).
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
      const btn = document.createElement('div');
      btn.className = 'zone-card';
      const typeHint = card.type ? card.type.charAt(0) : '?';
      const cost = card.cost ? formatCost(card.cost) : '';
      btn.innerHTML = `<span style="opacity:0.6">[${typeHint}]</span> <span class="card-name"></span>${cost ? ' <span style="opacity:0.5;font-size:10px">' + cost + '</span>' : ''}`;
      btn.querySelector('.card-name').textContent = card.name;
      if (validIids.has(card.iid)) {
        // Valid target — highlight and wire up submission.
        btn.style.cursor = 'pointer';
        btn.style.borderColor = '#ffcc44';
        btn.style.background = '#332';
        btn.onclick = () => submitGraveyardTarget(card.iid);
      } else {
        // Not a valid target (e.g., a non-creature card in the same graveyard).
        // Show but don't highlight; click does nothing.
        btn.style.opacity = '0.4';
      }
      listEl.appendChild(btn);
    }
  }
  modal.classList.add('vis');
}

// Submits a chosen graveyard target. Routes through whichever pending
// prompt is active — trigger target pick OR spell cast action.
function submitGraveyardTarget(iid) {
  const G = ENGINE.state();
  const card = G.you.graveyard.find(c => c.iid === iid);
  const target = {kind:'graveyardCreature', iid, label: card ? card.name : 'creature', controller: 'you'};
  // Delegate to CONTROLLER — submit() and pendingTarget live inside the
  // CONTROLLER IIFE and aren't accessible from this scope. The helper
  // routes the chosen target through the right path (trigger pick vs
  // pending spell cast) and returns true if it submitted.
  if (CONTROLLER.submitTargetedAction(target)) {
    Modal.hide('zoneModal');
  }
}

function setText(id, v) { document.getElementById(id).textContent = v; }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// Render an array of {text, highlight} segments to HTML, wrapping
// highlighted segments in <span class="bumped">. Used for card text where
// empower-bumped values get visual emphasis. The describeCardSegments
// generator at module scope produces these arrays; this is the renderer.
function segmentsToHtml(segs) {
  if (!Array.isArray(segs)) return '';
  return segs.map(s => {
    const escaped = escapeHtml(s.text || '');
    return s.highlight ? `<span class="bumped">${escaped}</span>` : escaped;
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
  // Probe legality with placeholder targets. Multi-target spells need one
  // fake target per targetSlot — castSpell's legality check enforces it.
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
  const hasTarget = (card.effects || []).some(ENGINE.effectNeedsTarget);
  if (hasTarget) {
    const fakeTargets = fakeTargetsForLegality(card.effects, who);
    if (fakeTargets === null) return false;
    return ENGINE.isLegalAction(who, {type:'castSpell', cardIid: card.iid, targets: fakeTargets});
  }
  return ENGINE.isLegalAction(who, {type:'castSpell', cardIid: card.iid});
}

function renderOppHandBacks(n) {
  const el = document.getElementById('oppHandView');
  el.innerHTML = '';
  for (let i=0; i<n; i++) el.innerHTML += '<div class="cardback"></div>';
}

function renderBf(id, bf, who) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  const G = ENGINE.state();
  const pt = CONTROLLER.pendingTarget();
  const uiAtk = CONTROLLER.uiAtk();
  const uiBlk = CONTROLLER.uiBlk();
  const uiPickBlk = CONTROLLER.uiPickBlk();

  // Display order: creatures (most clickable), artifacts (active perms —
  // Stapler), lands grouped by WUBRG-then-colorless and then by name.
  // Stable across rerenders.
  const typeOrder = (t) => {
    if (t === 'Creature') return 0;
    if (t === 'Artifact') return 1;
    return 2;
  };
  // Multi-color lands sort by primary mana only — keeps a Forest+Plains
  // staple sitting with the Forests.
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
    // Highlight in-progress combat selections (player's UI state)
    if (uiAtk.includes(card.iid)) div.classList.add('atk');
    if (uiBlk.has(card.iid)) div.classList.add('blk');
    for (const aIid of uiBlk.values()) if (aIid === card.iid) div.classList.add('atk');
    if (uiPickBlk === card.iid) div.classList.add('pblk');
    // Highlight committed engine combat state too (during damage phase, etc.)
    if (G.attackers.includes(card.iid)) div.classList.add('atk');
    if (G.blockers.has(card.iid)) div.classList.add('blk');

    // Targetable highlight (spell-cast OR trigger-target prompt)
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
    // Rip-select highlight — every permanent on YOUR battlefield is a
    // valid rip target. Opp's permanents stay unhighlighted.
    if (G.pendingRipSelect && G.pendingRipSelect.who === 'you' && who === 'you') {
      div.classList.add('targetable');
    }
    // Activatable highlight
    if (who === 'you' && card.type === 'Creature' && card.abilities && !card.tapped && !card.sick) {
      const hasAvail = card.abilities.some((ab, i) => {
        if (ab.effects[0].kind === 'addMana') return true;
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

  // Player-target buttons during target selection (spell or trigger).
  let showPlayerTargetButton = false;
  if (pt) {
    const eff = pendingTargetEffect(pt);
    if (eff && (eff.target === 'any' || eff.target === 'player')) showPlayerTargetButton = true;
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

// Read the relevant effects array for a pending pick state. For spell casts,
// this is the chosen mode's effects (or the flat list for non-modal). For
// activated abilities, it's the ability's effects. Returns [] if the state
// is malformed (defensive).
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

// Sorted unique list of targetSlot values used by the pending pick. Multi-
// target spells need one user pick per unique slot; same-slot effects share
// a single target (Strength of the Pack: pump and grant-trample both at
// slot 0 → slotsNeeded === [0], one pick).
function slotsNeededForPending(pt) {
  const effects = pendingTargetEffects(pt);
  const slots = new Set();
  for (const eff of effects) {
    if (ENGINE.effectNeedsTarget(eff)) slots.add(eff.targetSlot || 0);
  }
  return [...slots].sort((a, b) => a - b);
}

// The effect describing what the CURRENT slot expects to target. Used by the
// valid-target highlighter and the prompt label. For a multi-target spell
// mid-pick, this reads the slot we're currently asking the player to fill.
// Falls back to the first targeted effect for the slot, since multiple
// effects on the same slot share one target (the highlighter only needs to
// know the target shape, which is consistent across same-slot effects).
function pendingTargetEffect(pt) {
  if (!pt) return null;
  const slots = slotsNeededForPending(pt);
  if (slots.length === 0) return null;
  const pickedCount = (pt.pickedSlots && pt.pickedSlots.length) || 0;
  const currentSlot = slots[pickedCount] !== undefined ? slots[pickedCount] : slots[0];
  const effects = pendingTargetEffects(pt);
  return effects.find(e => ENGINE.effectNeedsTarget(e) && (e.targetSlot || 0) === currentSlot) || null;
}

function isValidTargetCreature(eff, card) {
  if (!eff) return false;
  // Determine eligible card types based on the effect's target shape.
  //   creature/any        → creatures only
  //   permanent           → creatures, lands, or artifacts (anything on the battlefield)
  //   permanentOrSpell    → same as permanent for the battlefield-card check
  //                         (stack spells are highlighted via a separate UI path
  //                         in renderStack — they're not battlefield cards).
  // Names retained as `isValidTargetCreature` for backwards-compat with the
  // single existing caller; broader semantics now that lands can be targeted.
  if (eff.target === 'creature' || eff.target === 'any') {
    if (card.type !== 'Creature') return false;
  } else if (eff.target === 'permanent' || eff.target === 'permanentOrSpell') {
    if (card.type !== 'Creature' && card.type !== 'Land' && card.type !== 'Artifact') return false;
  } else {
    return false;
  }
  if (eff.target === 'any') return true;
  if (eff.filter) {
    if (eff.filter.tapped !== undefined && card.tapped !== eff.filter.tapped) return false;
    if (eff.filter.notColor && card.color === eff.filter.notColor) return false;
    // Stapler's filters (spliceableBase / spliceableStaple) must apply at
    // highlight time too — otherwise we'd highlight cards the click handler
    // would reject (e.g., already-stapled creatures). Routes through the
    // canonical matchFilter helper, accessed via ENGINE since matchFilter
    // lives inside the engine IIFE.
    if (eff.filter.spliceableBase || eff.filter.spliceableStaple) {
      if (!ENGINE.matchFilter(card, eff.filter, null, null)) return false;
    }
  }
  return true;
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
    const cls = s.kind === 'statBoost' ? 'stat'
              : s.kind === 'innate'    ? 'innate'
              : 'skw';
    let label;
    if (s.kind === 'statBoost') label = '+1/+1';
    else if (s.kind === 'innate') label = 'Innate';
    else if (s.kind === 'landColor') label = '+{' + s.color + '}';
    else if (s.kind === 'costReduction') label = '-' + (s.amount || 1) + ' cost';
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
function artHtml(art, fallback) {
  if (!art) return fallback || '';
  // Heuristic: anything that looks like a URL or an image file path is a
  // src for <img>. Emoji and short glyph strings render as text.
  //   - data:           — inline base64 (legacy embeds, e.g. the old dragon)
  //   - http            — full URL
  //   - ends in .png/.jpg/.jpeg/.gif/.webp/.svg — relative file path,
  //     resolved against magiclike_engine.html (cards/<tplId>/art.png)
  // Emoji are 1-4 chars and never match these.
  const isUrl = typeof art === 'string' && (
    art.startsWith('data:') ||
    art.startsWith('http') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(art)
  );
  if (isUrl) {
    // pixelated rendering preserves the chunky look of small pixel-art
    // sources. For higher-res art this is a no-op (browser ignores it
    // when the source is already > display size). alt="" because the
    // card name is rendered separately — duplicating it in alt text
    // creates noise for screen readers.
    return `<img src="${art}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;image-rendering:pixelated">`;
  }
  return art;
}

function makeCardEl(card, opts) {
  const div = document.createElement('div');
  // data-iid: lets the target-line overlay find this card's DOM element
  // by iid. Set on every card render (hand + battlefield + zones) so the
  // line layer can resolve any target referenced from a stack item.
  div.dataset.iid = String(card.iid);
  const [p, t] = card.type === 'Creature'
    ? ENGINE.getStats(card)
    : [card.power || 0, card.toughness || 0];
  div.className = `card c${card.type.toLowerCase()}${card.tapped ? ' tapped' : ''}${card.sick ? ' sick' : ''}`;
  // skipKeywords — keywords show as badges below.
  const tileSegs = describeCardSegments(card, {skipKeywords: true});
  const displayHtml = segmentsToHtml(tileSegs);
  // Cost display: in hand, show the EFFECTIVE cost (base + static bumps
  // from City Guardian etc.) so the player sees what they'd pay. Anywhere
  // else (battlefield/zones) we show the base cost — there's no "cast" to
  // tax. When the cost is bumped, add a small ↑ marker so the player
  // understands the increase isn't intrinsic to the card.
  let costHtml = '';
  if (card.cost) {
    if (opts && opts.inHand) {
      const eff = ENGINE.effectiveCastCost(card);
      const effC = eff && eff.C || 0;
      const baseC = card.cost.C || 0;
      const bumped = effC > baseC;
      costHtml = `<div class="ccost">${formatCost(eff)}${bumped ? ' <span style="color:#ffaa44;font-size:9px">↑</span>' : ''}</div>`;
    } else {
      costHtml = `<div class="ccost">${formatCost(card.cost)}</div>`;
    }
  }
  div.innerHTML = `
    <div class="cname" title="${card.name}">${card.name}</div>
    <div class="cart">${artHtml(card.art)}</div>
    <div class="ctype">${card.sub || card.type}</div>
    ${displayHtml ? `<div class="ctext">${displayHtml}</div>` : ''}
    ${card.type === 'Creature' ? `<div class="cstats">${p}/${t}</div>` : ''}
    ${costHtml}
    ${card.damage ? `<div class="cdmg">${card.damage}</div>` : ''}
    ${nativeKeywordBadgesHtml(card, false)}
    ${stickerBadgesHtml(card.stickers, false, card.empowerRolls, card.tplId, card.stapledFrom && card.stapledFrom.stapledTpls, card.subtypeRolls)}
    ${restrictionBadgesHtml(card, false)}
  `;
  CONTROLLER.attachLongPress(div, card);
  return div;
}
function formatCost(c) {
  let s = '';
  if (c.C) s += c.C;
  for (const k of ['W','U','B','R','G']) s += k.repeat(c[k] || 0);
  return s || '0';
}
