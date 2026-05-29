// CONTROLLER — UI state, AI scheduling, click-to-engine glue.

// Modal helper. Module-scope so render.js can call Modal.show/hide directly.
// Escape-to-close, focus restore, aria-modal, LIFO stack. dismissible:false for
// flow-gates (gameover/neow/postDraftOffer/reward) where Escape would softlock.
const Modal = {
  _stack: [],
  _escapeBound: false,
  show(id, opts) {
    opts = opts || {};
    const el = document.getElementById(id);
    if (!el) return;
    if (this._stack.some(e => e.id === id)) return;
    this._stack.push({
      id,
      dismissible: opts.dismissible !== false,
      onClose: opts.onClose || null,
      prevFocus: document.activeElement,
    });
    el.classList.add('vis');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (!this._escapeBound) {
      document.addEventListener('keydown', this._onEscape);
      this._escapeBound = true;
    }
  },
  hide(id, opts) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('vis');
      el.removeAttribute('role');
      el.removeAttribute('aria-modal');
    }
    const idx = this._stack.findIndex(e => e.id === id);
    if (idx === -1) return;
    const entry = this._stack[idx];
    this._stack.splice(idx, 1);
    if (entry.prevFocus && typeof entry.prevFocus.focus === 'function') {
      try { entry.prevFocus.focus(); } catch (_) {}
    }
    // Only fire onClose for user-initiated dismiss (render-loop hides know what they want).
    if (entry.onClose && opts && opts.userInitiated) entry.onClose();
  },
  _onEscape(e) {
    if (e.key !== 'Escape') return;
    const top = Modal._stack[Modal._stack.length - 1];
    if (!top || !top.dismissible) return;
    Modal.hide(top.id, { userInitiated: true });
  },
};

const CONTROLLER = (function() {

// In-flight UI selections.
let pendingTarget = null;       // {kind:'cast'|'ability', cardIid, abilityIdx?, modeIdx?}
let pendingModalChoice = null;  // {cardIid} — open mode picker
let uiAtk = [];                 // attacker selection
let uiBlk = new Map();          // blocker → attacker
let uiPickBlk = null;           // selected blocker awaiting attacker click
let aiScheduled = false;
let aiThinking = false;
let inDraft = false;
let lastGameRecorded = false;
let sandboxMode = false;              // true while a RUN-less card-test game is running
let sandboxSpawnTarget = 'you-hand';  // '<side>-<zone>' for the spawn panel

function updateThinkingUi() {
  if (aiThinking) {
    document.body.classList.add('ai-thinking');
  } else {
    document.body.classList.remove('ai-thinking');
  }
  render();
}

let _inited = false;
function init() {
  if (_inited) return;
  _inited = true;
  ENGINE.subscribe(onStateChange);
  // VERSION → header + game-log title (single source of truth).
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = VERSION;
  const logTitleEl = document.getElementById('log-title');
  if (logTitleEl) {
    logTitleEl.innerHTML =
      '<span>Game Log <span style="color:#ffd700">— ' + VERSION + '</span></span>' +
      '<button id="logCloseBtn" onclick="CONTROLLER.toggleLog()">close</button>';
  }
  // Settings modal close-button. Wired once at init since the modal HTML
  // is static (only the inner #settingsList is rebuilt per-open).
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  if (settingsCloseBtn) {
    settingsCloseBtn.onclick = () => { Modal.hide('settingsModal'); };
  }
  // Persistent in-game settings gear. Always visible top-left so the user
  // can adjust fonts / frames / etc. without going back to the start screen.
  const settingsBtnPersistent = document.getElementById('settingsBtnPersistent');
  if (settingsBtnPersistent) {
    settingsBtnPersistent.onclick = SETTINGS_PANEL.show;
  }
  showStartScreen();
}

// Sticker.appliesTo → human label (predicates can't be introspected; keep in sync with sticker kinds).
function stickerAppliesLabel(s) {
  switch (s.kind) {
    case 'stat_boost':     return 'creatures';
    case 'innate':        return 'lands';
    case 'grant_mana_ability':     return "lands that don't already produce {" + s.color + '} (deck must play ' + s.colorAdj + ')';
    case 'cost_mod':      return 'non-lands with at least one generic mana and total cost ≥ 2';
    case 'empower':       return 'cards with numeric effects (damage, damageAll, pump, counters, pumpAllYours, gain_life, draw, discard, affect_creature)';
    case 'subtype':       return 'creatures (rolls a random subtype from your deck)';
    case 'keyword': {
      const kw = s.keyword;
      if (kw === 'lifelink' || kw === 'deathtouch' || kw === 'trample') {
        return 'creatures, or instants/sorceries that deal damage';
      }
      if (kw === 'flash') return 'creatures or sorceries';
      if (kw === 'reach') return 'creatures without flying';
      return 'creatures';
    }
    default:              return '(unknown)';
  }
}

function appendStickerSectionToBrowser(inner) {
  const allStickers = Object.values(STICKERS);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:24px';

  const heading = document.createElement('h3');
  heading.textContent = 'Stickers — ' + allStickers.length + ' total';
  heading.style.cssText = 'color:#e0b060;font-size:13px;letter-spacing:.1em;margin:0 0 8px;border-left:3px solid #e0b060;padding:2px 0 2px 8px;text-transform:uppercase';
  wrap.appendChild(heading);

  // Card boosts = stat/cost/empower; Land mods = innate+landColor; Keyword grants = kw_*.
  const groups = {
    'Card boosts':       [],
    'Land mods':         [],
    'Keyword grants':    [],
  };
  for (const s of allStickers) {
    if (s.kind === 'innate' || s.kind === 'grant_mana_ability') groups['Land mods'].push(s);
    else if (s.kind === 'keyword')                     groups['Keyword grants'].push(s);
    else                                               groups['Card boosts'].push(s);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => (b.weight - a.weight) || a.name.localeCompare(b.name));
  }

  for (const [groupName, stickers] of Object.entries(groups)) {
    if (!stickers.length) continue;

    const sub = document.createElement('div');
    sub.textContent = groupName + ' · ' + stickers.length;
    sub.style.cssText = 'color:#888;font-size:10px;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.1em';
    wrap.appendChild(sub);

    for (const s of stickers) {
      const item = document.createElement('div');
      item.style.cssText = 'background:#1a1a25;border:1px solid #2c2c3a;border-left:3px solid #886622;border-radius:3px;padding:7px 10px;margin-bottom:5px;font-size:11px;line-height:1.5';

      const top = document.createElement('div');
      top.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:2px';
      const name = document.createElement('span');
      name.textContent = s.name;
      name.style.cssText = 'color:#ffcc44;font-weight:bold';
      const meta = document.createElement('span');
      meta.textContent = 'weight ' + s.weight + (s.stackable ? ' · stackable' : '');
      meta.style.cssText = 'color:#666;font-size:10px;white-space:nowrap';
      top.appendChild(name);
      top.appendChild(meta);
      item.appendChild(top);

      // renderManaSymbols → landColor sticker pips ({W}/{U}/etc).
      const text = document.createElement('div');
      text.innerHTML = renderManaSymbols(escapeHtml(s.text || ''));
      text.style.cssText = 'color:#bbb';
      item.appendChild(text);

      // Eligibility line — what cards this sticker can be applied to.
      const goes = document.createElement('div');
      goes.innerHTML = '<span style="color:#777">Goes on:</span> <span class="apply-text" style="color:#999"></span>';
      // Same {W}/{U}/etc treatment for the landColor eligibility blurb.
      goes.querySelector('.apply-text').innerHTML = renderManaSymbols(escapeHtml(stickerAppliesLabel(s)));
      goes.style.cssText = 'font-size:10px;margin-top:2px';
      item.appendChild(goes);

      wrap.appendChild(item);
    }
  }

  inner.appendChild(wrap);
}

function showCardBrowser() {
  const inner = document.getElementById('cardBrowserInner');
  inner.innerHTML = '';

  // Header — title + close. Sticky so it stays visible while scrolling
  // through what is potentially 100+ cards.
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:8px 4px;border-bottom:1px solid #444;position:sticky;top:-16px;background:rgba(0,0,0,.96);z-index:1';
  const title = document.createElement('h2');
  title.textContent = 'CARD BROWSER';
  title.style.cssText = 'color:#ffd700;margin:0;font-size:16px;letter-spacing:.08em';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'padding:6px 14px;background:#332;border:1px solid #663;color:#ccc;cursor:pointer;border-radius:3px;font-family:inherit;font-size:12px';
  closeBtn.onclick = () => { Modal.hide('cardBrowserModal'); };
  header.appendChild(title);
  header.appendChild(closeBtn);
  inner.appendChild(header);

  appendStickerSectionToBrowser(inner);

  const groups = {
    W: { label: 'White',     tone: '#cdb46a', cards: [] },
    U: { label: 'Blue',      tone: '#5588cc', cards: [] },
    B: { label: 'Black',     tone: '#a880c0', cards: [] },
    R: { label: 'Red',       tone: '#cc5544', cards: [] },
    G: { label: 'Green',     tone: '#5a8844', cards: [] },
    C: { label: 'Colorless', tone: '#aaa',    cards: [] },
    L: { label: 'Lands',     tone: '#88aa66', cards: [] },
  };

  for (const [tplId, tpl] of Object.entries(CARDS)) {
    if (hasType(tpl, 'Land')) groups.L.cards.push({ tplId, tpl });
    else if (tpl.color && groups[tpl.color]) groups[tpl.color].cards.push({ tplId, tpl });
    else groups.C.cards.push({ tplId, tpl });
  }

  for (const k of Object.keys(groups)) {
    groups[k].cards.sort((a, b) => {
      const ca = a.tpl.cost ? Object.values(a.tpl.cost).reduce((s, v) => s + v, 0) : 0;
      const cb = b.tpl.cost ? Object.values(b.tpl.cost).reduce((s, v) => s + v, 0) : 0;
      if (ca !== cb) return ca - cb;
      return a.tpl.name.localeCompare(b.tpl.name);
    });
  }

  const order = ['W', 'U', 'B', 'R', 'G', 'C', 'L'];
  for (const k of order) {
    const g = groups[k];
    if (!g.cards.length) continue;

    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:20px';

    const heading = document.createElement('h3');
    heading.textContent = g.label + ' — ' + g.cards.length + ' cards';
    heading.style.cssText = 'color:' + g.tone + ';font-size:13px;letter-spacing:.1em;margin:0 0 8px;border-left:3px solid ' + g.tone + ';padding:2px 0 2px 8px;text-transform:uppercase';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';

    for (const { tplId } of g.cards) {
      const card = ENGINE.makeCard(tplId);
      grid.appendChild(makeCardEl(card));
    }

    section.appendChild(grid);
    inner.appendChild(section);
  }

  Modal.show('cardBrowserModal');
  document.getElementById('cardBrowserModal').scrollTop = 0;
}

// Start-screen button styles, named so the factory below is the single place
// button construction (create → text → style → onclick → append) lives.
const START_BTN_STYLE = {
  primary:   'padding:10px 20px;background:#2a4a2a;border:1px solid #4a8a4a;color:#aaffaa;border-radius:4px;cursor:pointer;font-size:14px',
  cube:      'padding:10px 20px;background:#3a3a1a;border:1px solid #888844;color:#ddcc88;border-radius:4px;cursor:pointer;font-size:14px',
  discard:   'padding:8px 20px;background:#2a2a2a;border:1px solid #555;color:#aaa;border-radius:4px;cursor:pointer;font-size:12px',
  secondary: 'padding:8px 20px;background:#1a1a2a;border:1px solid #444;color:#aaa;border-radius:4px;cursor:pointer;font-size:12px',
  sandbox:   'padding:8px 20px;background:#2a1a3a;border:1px solid #8855aa;color:#ddb3ff;border-radius:4px;cursor:pointer;font-size:12px',
};
function makeStartBtn(parent, text, styleKey, onclick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = START_BTN_STYLE[styleKey];
  b.onclick = onclick;
  parent.appendChild(b);
  return b;
}

function showStartScreen() {
  const screen = document.getElementById('startScreen');
  // Fullscreen API needs a user gesture — capture-phase + once:true.
  screen.addEventListener('click', () => {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      try { req.call(el).catch(() => {}); } catch (_) {}
    }
  }, {capture: true, once: true});
  const btns = document.getElementById('startBtns');
  const sub = document.getElementById('startSub');
  btns.innerHTML = '';
  if (RUN.hasSave()) {
    sub.textContent = 'You have a run in progress.';
    makeStartBtn(btns, 'Continue Run', 'primary', continueRun);
    makeStartBtn(btns, 'New Run (discard save)', 'discard', () => {
      if (confirm('Discard your current run and start a new one?')) {
        RUN.clearSave();
        screen.style.display = 'none';
        newRun('classic');
      }
    });
    makeStartBtn(btns, 'New Desert Cube Run (discard save)', 'discard', () => {
      if (confirm('Discard your current run and start a new Desert Cube run?')) {
        RUN.clearSave();
        screen.style.display = 'none';
        newRun('desertCube');
      }
    });
  } else {
    sub.textContent = 'A card roguelike';
    makeStartBtn(btns, 'New Run', 'primary', () => {
      screen.style.display = 'none';
      newRun('classic');
    });
    // Desert Cube: lands in packs 1/3 per slot, player drafts own manabase.
    makeStartBtn(btns, 'New Desert Cube Run', 'cube', () => {
      screen.style.display = 'none';
      newRun('desertCube');
    });
  }
  // Stats keeps a little extra top gap from the run buttons above it.
  makeStartBtn(btns, '📊 Stats', 'secondary', toggleStats).style.marginTop = '6px';
  makeStartBtn(btns, '📖 Card Browser', 'secondary', showCardBrowser);
  makeStartBtn(btns, '⚙ Settings', 'secondary', SETTINGS_PANEL.show);
  makeStartBtn(btns, '🔬 Sandbox (test cards)', 'sandbox', startSandbox);

  screen.style.display = 'flex';
}

// ===== Sandbox (card-interaction test mode) =====
// A RUN-less, throwaway game for testing card interactions. Boots a real
// engine game (vs the normal AI) on basic-land decks, then lets you spawn any
// card into either player's hand or battlefield and top up mana/life via a
// floating panel. Deliberately bypasses the run meta (no draft/map/rewards) —
// gameOver and onStateChange are guarded by `sandboxMode` so it can't touch a
// saved run. NOTE: a static/passive opponent is a planned follow-up; for now
// the opponent is the normal AI (pair with Settings → Devtools → "Reveal AI
// opponent's hand" to watch what it holds).
function sandboxDeck() {
  // Basic lands only → no deck-out and no random spells cluttering draws.
  // You spawn the cards you want to test. Derived from CARDS so it can't drift.
  const basics = Object.keys(CARDS).filter(id => {
    const c = CARDS[id];
    return c && hasType(c, 'Land') && /^(plains|island|swamp|mountain|forest)$/.test(id);
  });
  const pool = basics.length ? basics : Object.keys(CARDS).slice(0, 1);
  const d = [];
  for (let i = 0; i < 40; i++) d.push(pool[i % pool.length]);
  return d;
}

function startSandbox() {
  sandboxMode = true;
  inDraft = false;
  lastGameRecorded = true;   // suppress the run-recording path entirely
  Modal.hide('gameover');
  Modal.hide('rewardModal');
  document.getElementById('startScreen').style.display = 'none';
  ENGINE.init(sandboxDeck(), sandboxDeck());
  sandboxRefillMana();       // also calls render()
  renderSandboxPanel();
}

function exitSandbox() {
  sandboxMode = false;
  const panel = document.getElementById('sandboxPanel');
  if (panel) panel.style.display = 'none';
  Modal.hide('gameover');
  showStartScreen();
}

function sandboxRefillMana() {
  const G = ENGINE.state();
  if (!G) return;
  for (const side of ['you', 'opp']) {
    G[side].mana = { W: 20, U: 20, B: 20, R: 20, G: 20, C: 20 };
  }
  render();
}

function sandboxBumpLife(side, delta) {
  const G = ENGINE.state();
  if (!G || !G[side]) return;
  G[side].life += delta;
  render();
}

function sandboxSpawn(tplId) {
  if (!sandboxMode) return;
  const G = ENGINE.state();
  if (!G) return;
  let card;
  try { card = ENGINE.makeCard(tplId); }
  catch (e) { console.warn('Sandbox spawn failed for', tplId, e); return; }
  const dash = sandboxSpawnTarget.indexOf('-');
  const side = sandboxSpawnTarget.slice(0, dash);   // 'you' | 'opp'
  const zone = sandboxSpawnTarget.slice(dash + 1);  // 'hand' | 'board'
  if (!G[side]) return;
  card.owner = side;
  card.controller = side;
  if (zone === 'board' && isPermanent(card)) {
    card.sick = false;  // ready to act immediately (sandbox convenience)
    G[side].battlefield.push(card);
  } else {
    // Sorceries (non-permanents) can't sit on the battlefield — route to hand.
    G[side].hand.push(card);
  }
  render();
}

// Build the floating sandbox toolbar once, then reuse it. Search filters the
// full template list; clicking a row spawns it into the selected zone.
function renderSandboxPanel() {
  let panel = document.getElementById('sandboxPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'sandboxPanel';
    panel.style.cssText = 'position:fixed;right:8px;bottom:8px;width:240px;max-height:70vh;z-index:1200;'
      + 'background:#140d1e;border:1px solid #8855aa;border-radius:8px;font-family:Georgia,serif;'
      + 'color:#ddccff;font-size:12px;display:flex;flex-direction:column;box-shadow:0 0 18px rgba(136,85,170,.4)';
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  panel.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #503070;background:#1c1230;border-radius:8px 8px 0 0';
  header.innerHTML = '<span style="letter-spacing:.08em;color:#cba6ff">🔬 SANDBOX</span>';
  const exitBtn = document.createElement('button');
  exitBtn.textContent = '✕ Exit';
  exitBtn.style.cssText = 'background:#3a1a2a;border:1px solid #885566;color:#ffbbcc;border-radius:3px;cursor:pointer;font-family:inherit;font-size:11px;padding:2px 8px';
  exitBtn.onclick = exitSandbox;
  header.appendChild(exitBtn);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;overflow:hidden';
  panel.appendChild(body);

  // Spawn-target selector (2x2 of side × zone).
  const targetWrap = document.createElement('div');
  targetWrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px';
  const TARGETS = [
    ['you-hand', 'My hand'], ['you-board', 'My board'],
    ['opp-hand', 'Opp hand'], ['opp-board', 'Opp board'],
  ];
  const targetBtns = {};
  const paintTargets = () => {
    for (const [val, btn] of Object.entries(targetBtns)) {
      const on = val === sandboxSpawnTarget;
      btn.style.background = on ? '#5a3a8a' : '#241830';
      btn.style.color = on ? '#fff' : '#bba6d6';
    }
  };
  for (const [val, label] of TARGETS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'border:1px solid #6a4a8a;border-radius:3px;cursor:pointer;font-family:inherit;font-size:11px;padding:3px 4px';
    b.onclick = () => { sandboxSpawnTarget = val; paintTargets(); };
    targetBtns[val] = b;
    targetWrap.appendChild(b);
  }
  paintTargets();
  body.appendChild(targetWrap);

  // Resource buttons.
  const resWrap = document.createElement('div');
  resWrap.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap';
  const mkRes = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;background:#241830;border:1px solid #6a4a8a;border-radius:3px;cursor:pointer;font-family:inherit;font-size:11px;padding:3px 4px;color:#bba6d6;white-space:nowrap';
    b.onclick = fn;
    resWrap.appendChild(b);
  };
  mkRes('💧 Mana', sandboxRefillMana);
  mkRes('+5 me', () => sandboxBumpLife('you', 5));
  mkRes('+5 opp', () => sandboxBumpLife('opp', 5));
  mkRes('↻ New', startSandbox);
  body.appendChild(resWrap);

  // Search + scrollable card list.
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search cards…';
  search.style.cssText = 'background:#0d0814;border:1px solid #6a4a8a;border-radius:3px;color:#eee;font-family:inherit;font-size:12px;padding:4px 6px';
  body.appendChild(search);

  const listEl = document.createElement('div');
  listEl.style.cssText = 'overflow-y:auto;max-height:38vh;display:flex;flex-direction:column;gap:2px';
  body.appendChild(listEl);

  const allIds = Object.keys(CARDS).sort((a, b) => {
    const na = (CARDS[a].name || a).toLowerCase(), nb = (CARDS[b].name || b).toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  const paintList = () => {
    const q = search.value.trim().toLowerCase();
    listEl.innerHTML = '';
    let shown = 0;
    for (const id of allIds) {
      const tpl = CARDS[id];
      const name = tpl.name || id;
      if (q && !(name.toLowerCase().includes(q) || id.toLowerCase().includes(q)
                 || (governingType(tpl) || '').toLowerCase().includes(q))) continue;
      if (shown++ > 120) break;  // cap rows for responsiveness
      const row = document.createElement('button');
      row.style.cssText = 'text-align:left;background:#1a1226;border:1px solid #3a2a4a;border-radius:3px;cursor:pointer;font-family:inherit;font-size:11px;padding:3px 6px;color:#cdbbe6';
      const pt = (hasType(tpl, 'Creature')) ? ` ${tpl.power}/${tpl.toughness}` : '';
      row.innerHTML = `<span style="color:#fff">${name}</span> <span style="opacity:.6">${governingType(tpl) || ''}${pt}</span>`;
      row.onclick = () => sandboxSpawn(id);
      listEl.appendChild(row);
    }
  };
  search.oninput = paintList;
  paintList();
}

function continueRun() {
  if (!RUN.load()) {
    document.getElementById('startScreen').style.display = 'none';
    newRun();
    return;
  }
  document.getElementById('startScreen').style.display = 'none';
  // Three cases: pending reward, mid-game (forfeit + continue), or between games.
  try {
    const reward = RUN.getReward();
    if (reward) {
      renderReward();
    } else {
      RUN.rollbackForMidGameRestore();
      lastGameRecorded = false;
      if (RUN.getPostDraftOffer && RUN.getPostDraftOffer()) {
        renderPostDraftOffer();
        return;
      }
      const mapState = RUN.getMapState && RUN.getMapState();
      if (mapState) {
        renderMap();
      } else {
        startNextGameWithBossBanner();
      }
    }
  } catch (e) {
    // Unrecoverable save state → clear and bounce to start.
    console.error('Continue-run failed; clearing save and returning to start screen.', e);
    RUN.clearSave();
    showStartScreen();
  }
}
// Transient pre-run choice; runState.modifier holds the final value post-draft.
let pendingNeowModifier = null;
let pendingDraftMode = 'classic';

function newRun(mode) {
  // Desert Cube skips Neow (cube+boon interaction not designed).
  Modal.hide('gameover');
  pendingNeowModifier = null;
  pendingDraftMode = mode || 'classic';
  if (pendingDraftMode === 'desertCube') {
    DRAFT.startDraft(pendingDraftMode);
    inDraft = true;
    renderDraft();
    return;
  }
  showNeowChoice();
}

function showNeowChoice() {
  // alwaysOffered boons fill stable left positions; rest random-fill.
  const TARGET_BOONS = 3;
  const allIds = Object.keys(RUN_MODIFIERS);
  const alwaysIds = allIds.filter(id => RUN_MODIFIERS[id].alwaysOffered);
  const poolIds = allIds.filter(id => !RUN_MODIFIERS[id].alwaysOffered);

  const shuffledPool = poolIds.slice();
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }
  const fillCount = Math.max(0, TARGET_BOONS - alwaysIds.length);
  const randomIds = shuffledPool.slice(0, fillCount);

  const offered = [...alwaysIds, ...randomIds];

  const optsEl = document.getElementById('neowOptions');
  optsEl.innerHTML = '';
  for (const id of offered) {
    const m = RUN_MODIFIERS[id];
    // Boon art is derived from the card the boon grants -- every current
    // RUN_MODIFIERS entry's id matches the tplId of its granted card, so
    // CARDS[m.id].art is the source of truth.
    const boonArt = m.art || (CARDS[m.id] && CARDS[m.id].art) || '✦';
    let el;
    // Render the boon AS the card it grants (matches the visual style of
    // a draft pick). Falls back to a Boon-shaped placeholder for any
    // modifier whose id doesn't resolve to a real card.
    if (CARDS[m.id]) {
      const card = ENGINE.makeCard(m.id);
      el = makeCardEl(card);
      el.style.setProperty('--scale', '2');
    } else {
      el = makeSyntheticCard({
        name: m.name || '',
        type: 'Boon',
        text: m.text || '',
        art: boonArt,
        color: 'C',
        scale: 2,
      });
    }
    el.style.cursor = 'pointer';
    el.onclick = () => pickNeow(id);
    optsEl.appendChild(el);
  }
  Modal.show('neowModal', { dismissible: false });
}

function pickNeow(id) {
  pendingNeowModifier = id;
  Modal.hide('neowModal');
  DRAFT.startDraft(pendingDraftMode);
  inDraft = true;
  renderDraft();
}

function pickDraft(tplId) {
  if (!inDraft) return;
  DRAFT.pickPlayer(tplId);
  if (DRAFT.isComplete()) {
    inDraft = false;
    document.getElementById('draftScreen').classList.remove('vis');
    const playerDeck = DRAFT.getPlayerDeck();
    RUN.start(playerDeck, pendingNeowModifier);
    pendingNeowModifier = null;
    lastGameRecorded = false;
    if (RUN.getPostDraftOffer && RUN.getPostDraftOffer()) {
      renderPostDraftOffer();
      return;
    }
    startNextGameWithBossBanner();
  } else {
    renderDraft();
  }
}
function nextGame() {
  if (!RUN.isActive()) return;
  if (RUN.getReward()) return;
  const mapState = RUN.getMapState && RUN.getMapState();
  Modal.hide('gameover');
  Modal.hide('rewardModal');
  if (mapState) {
    renderMap();
    return;
  }
  lastGameRecorded = false;
  startNextGameWithBossBanner();
}
function gameOverClick() {
  // Sandbox: no run meta — just dismiss; the panel's ↻ New / ✕ Exit drive it.
  if (sandboxMode) { Modal.hide('gameover'); return; }
  // Won → nextGame; lost → start screen (don't silently re-launch into draft).
  if (RUN.isActive()) {
    nextGame();
  } else {
    Modal.hide('gameover');
    showStartScreen();
  }
}
function pickRewardCandidateClick(idx) {
  RUN.pickRewardCandidate(idx);
  renderReward();
}
function pickTransformReplacementClick(tplId) {
  RUN.pickTransformReplacement(tplId);
  renderReward();
}

// Tile color tint for splice/reward. Multi-color stapled slots get a 45° flag-stripe gradient.
const TILE_COLOR_HEX = { W:'#cdb46a', U:'#5588cc', B:'#7a4488', R:'#cc5544', G:'#5a8844' };

function applyTileColorFromTpl(div, tpl) {
  if (!tpl) return;
  const colors = (tpl.colors && tpl.colors.length > 0) ? tpl.colors
                : tpl.color ? [tpl.color]
                : [];
  if (colors.length === 0) return;
  if (colors.length === 1) {
    div.classList.add('col-' + colors[0]);
    return;
  }
  const stops = [];
  const step = 100 / colors.length;
  for (let i = 0; i < colors.length; i++) {
    const hex = TILE_COLOR_HEX[colors[i]] || '#888';
    const start = (i * step).toFixed(1);
    const end = ((i + 1) * step).toFixed(1);
    stops.push(`${hex} ${start}%`, `${hex} ${end}%`);
  }
  div.style.borderImage = `linear-gradient(45deg, ${stops.join(', ')}) 1`;
  div.style.borderImageSlice = '1';
}

function applyTileColor(div, slot) {
  const tpl = tplForSlot(slot);
  applyTileColorFromTpl(div, tpl);
}

// Build a small card-display element for the reward modal. Used by sticker
// pair, transform, and ripUp candidates — anywhere we show a slot's card.
// Returns a DOM element. `slot` is the runState slot (with current stickers);
// `tpl` is the resolved template.
// Reward-modal card tile. Delegates to makeCardEl (the same renderer used
// for hand/board cards). The slot (when present) carries stickers /
// staples / rolls; we build a runtime card with those baked in so the tile
// reflects the slot's actual state (effective cost, statBoost stats,
// sticker badges, granted keywords).
//
// Splice's "merged preview" passes slot=null with a synthesized template
// not in CARDS — that case is handled inline in renderReward via
// makeCard(baseTpl, [], ..., stapledTpls=[...]) so the merged card is a
// real runtime card with all stapled mechanics; it doesn't come through
// this function.
function makeRewardCardEl(tpl, slot) {
  const tplId = (slot && slot.tplId) || tpl.tplId;
  const card = ENGINE.makeCard(
    tplId,
    (slot && slot.stickers) || [],
    undefined,
    (slot && slot.empowerRolls) || [],
    undefined, undefined,
    (slot && slot.stapledTpls) || [],
    (slot && slot.subtypeRolls) || []
  );
  const el = makeCardEl(card, { inHand: true });
  // 2x scale for the reward picker -- same showcase size as draft picks.
  el.style.setProperty('--scale', '2');
  return el;
}

// Map node tooltip — tap shows briefly, long-press shows while held (mobile-friendly).
let mapTooltipHideTimer = null;
function showMapTooltip(nodeEl, label) {
  const tt = document.getElementById('mapTooltip');
  const canvas = document.getElementById('mapCanvas');
  if (!tt || !canvas) return;
  tt.textContent = label;
  tt.classList.add('vis');
  const cr = canvas.getBoundingClientRect();
  const nr = nodeEl.getBoundingClientRect();
  tt.style.left = '0px';
  tt.style.top  = '0px';
  const tr = tt.getBoundingClientRect();
  const cx = nr.left + nr.width / 2 - cr.left;
  const ty = nr.top - cr.top - tr.height - 8;
  tt.style.left = Math.max(4, cx - tr.width / 2) + 'px';
  tt.style.top  = Math.max(2, ty) + 'px';
  if (mapTooltipHideTimer) clearTimeout(mapTooltipHideTimer);
  mapTooltipHideTimer = setTimeout(() => {
    tt.classList.remove('vis');
    mapTooltipHideTimer = null;
  }, 1500);
}
function attachMapLongPress(el, label) {
  let pressTimer = null;
  let startX = 0, startY = 0;
  const start = (x, y) => {
    startX = x; startY = y;
    pressTimer = setTimeout(() => {
      showMapTooltip(el, label);
      pressTimer = null;
    }, 400);
  };
  const move = (x, y) => {
    if (!pressTimer) return;
    if (Math.abs(x - startX) > 8 || Math.abs(y - startY) > 8) {
      clearTimeout(pressTimer); pressTimer = null;
    }
  };
  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };
  el.addEventListener('touchstart', (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.addEventListener('touchmove',  (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.addEventListener('touchend',   cancel);
  el.addEventListener('touchcancel',cancel);
  el.addEventListener('mousedown',  (e) => start(e.clientX, e.clientY));
  el.addEventListener('mousemove',  (e) => move(e.clientX, e.clientY));
  el.addEventListener('mouseup',    cancel);
  el.addEventListener('mouseleave', cancel);
}

// Post-draft Innate offer: pick a basic land type to guarantee in opening hands.
function renderPostDraftOffer() {
  if (!RUN.getPostDraftOffer) return;
  const offer = RUN.getPostDraftOffer();
  if (!offer) { Modal.hide('postDraftOfferModal'); return; }
  Modal.show('postDraftOfferModal', { dismissible: false });
  const btns = document.getElementById('postDraftOfferButtons');
  btns.innerHTML = '';
  for (const tplId of offer.basics) {
    const tpl = CARDS[tplId];
    if (!tpl) continue;
    // Real basic-land card via makeCardEl. The land's color frame and
    // type line communicate which basic this is.
    const card = ENGINE.makeCard(tplId);
    const el = makeCardEl(card);
    el.style.setProperty('--scale', '2');
    el.style.cursor = 'pointer';
    el.onclick = () => pickPostDraftOfferClick(tplId);
    btns.appendChild(el);
  }
}

function pickPostDraftOfferClick(tplId) {
  if (!RUN.pickPostDraftOffer(tplId)) return;
  Modal.hide('postDraftOfferModal');
  lastGameRecorded = false;
  startNextGameWithBossBanner();
  render();
}

function renderMap() {
  const ms = RUN.getMapState();
  if (!ms) {
    Modal.hide('mapModal');
    return;
  }
  // Always show the map between levels. A forking node (2+ paths) is an
  // interactive choice; otherwise it's a "you are here" view with a Continue
  // button that auto-advances (single path) or drops into the next sector.
  const hasChoice = !!ms.pendingChoice;
  Modal.show('mapModal');
  const toRoman = n => {
    const r = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return r[n] || String(n);
  };
  setText('mapTitle', `Sector ${toRoman(ms.sectorNum)} — ${hasChoice ? 'Choose Your Path' : 'Your Path'}`);
  setText('mapSubtitle', hasChoice ? 'Pick the next node to face.' : 'Your journey so far.');
  const contBtn = document.getElementById('mapContinue');
  if (contBtn) {
    contBtn.style.display = hasChoice ? 'none' : 'block';
    contBtn.onclick = hasChoice ? null : advanceFromMap;
  }
  const legal = new Set(hasChoice ? ms.pendingChoice.options : []);
  const visited = new Set(ms.visitedNodeIds);
  const current = ms.currentNodeId;

  const byLevel = {};
  for (const n of ms.nodes) {
    if (!byLevel[n.level]) byLevel[n.level] = [];
    byLevel[n.level].push(n);
  }
  for (const lvl of Object.keys(byLevel)) {
    byLevel[lvl].sort((a, b) => a.col - b.col);
  }

  const levelsContainer = document.getElementById('mapLevels');
  levelsContainer.innerHTML = '';
  // Bottom-up render: root at bottom, exit at top (climbing-the-tower feel).
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => b - a);
  const iconFor = (node) => {
    if (node.type === 'boss') {
      if (node.constructedId) {
        const spec = (typeof DRAFT !== 'undefined' && DRAFT.getConstructedDeck)
          ? DRAFT.getConstructedDeck(node.constructedId) : null;
        if (spec && spec.icon) return spec.icon;
      }
      return '👹';
    }
    switch (node.type) {
      case 'combat': return '⚔';
      case 'elite':  return '☠';
      case 'shop':   return '$';
      case 'event':  return '?';
      case 'rest':   return '🛏';
      default:       return '?';
    }
  };
  // Tooltip combines type + color (e.g., "Red Draft Deck"). Constructed nodes use deck name.
  const COLOR_NAME = {W:'White', U:'Blue', B:'Black', R:'Red', G:'Green'};
  const labelForType = (type) => {
    switch (type) {
      case 'combat': return 'Draft Deck';
      case 'elite':  return 'Elite Enemy';
      case 'shop':   return 'Shop';
      case 'event':  return 'Event';
      case 'rest':   return 'Rest Site';
      case 'boss':   return 'Boss';
      default:       return 'Unknown';
    }
  };
  const tooltipFor = (node) => {
    if (node.constructedId) {
      const spec = (typeof DRAFT !== 'undefined' && DRAFT.getConstructedDeck)
        ? DRAFT.getConstructedDeck(node.constructedId) : null;
      if (spec) return spec.name;
    }
    const base = labelForType(node.type);
    if (node.color && COLOR_NAME[node.color]) {
      return `${COLOR_NAME[node.color]} ${base}`;
    }
    return base;
  };
  for (const lvl of levels) {
    const row = document.createElement('div');
    row.className = 'map-level';
    for (const n of byLevel[lvl]) {
      const el = document.createElement('div');
      el.className = 'map-node';
      el.id = 'map-' + n.id;
      el.textContent = iconFor(n);
      el.title = tooltipFor(n);
      // Constructed: ring = spec's first color + ★ badge. Boss: 👹 badge.
      let ringColor = n.color;
      let isConstructed = false;
      const isBoss = (n.type === 'boss');
      if (n.constructedId) {
        const spec = (typeof DRAFT !== 'undefined' && DRAFT.getConstructedDeck)
          ? DRAFT.getConstructedDeck(n.constructedId) : null;
        if (spec && spec.colors && spec.colors.length > 0) {
          ringColor = spec.colors[0];
          isConstructed = true;
        }
      }
      if (isBoss) el.classList.add('boss');
      if (ringColor) {
        el.classList.add('col-' + ringColor);
        const badge = document.createElement('div');
        badge.className = 'map-color-badge col-' + ringColor;
        badge.textContent = isBoss ? iconFor(n) : (isConstructed ? '★' : ringColor);
        el.appendChild(badge);
      }
      if (n.id === current) el.classList.add('current');
      else if (visited.has(n.id)) el.classList.add('visited');
      const label = tooltipFor(n);
      if (legal.has(n.id)) {
        el.classList.add('legal');
        el.onclick = () => pickMapNodeClick(n.id);
      } else {
        el.onclick = () => showMapTooltip(el, label);
      }
      attachMapLongPress(el, label);
      row.appendChild(el);
    }
    levelsContainer.appendChild(row);
  }

  // SVG edges — deferred a frame so node positions are laid out.
  requestAnimationFrame(() => {
    const svg = document.getElementById('mapEdges');
    const canvas = document.getElementById('mapCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    svg.setAttribute('width', canvasRect.width);
    svg.setAttribute('height', canvasRect.height);
    svg.innerHTML = '';
    for (const e of ms.edges) {
      const fromEl = document.getElementById('map-' + e.from);
      const toEl = document.getElementById('map-' + e.to);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const x1 = fr.left + fr.width / 2 - canvasRect.left;
      const y1 = fr.top + fr.height / 2 - canvasRect.top;
      const x2 = tr.left + tr.width / 2 - canvasRect.left;
      const y2 = tr.top + tr.height / 2 - canvasRect.top;
      const fromVisited = visited.has(e.from);
      const toLegal = legal.has(e.to);
      const stroke = (fromVisited && toLegal) ? '#66ddaa' :
                     fromVisited ? '#3a5a4a' : '#2a3540';
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    }
  });
}

function pickMapNodeClick(nodeId) {
  if (!RUN.pickMapNode(nodeId)) return;
  advanceFromMap();
}

// Leave the map and enter the next game. The fork path (pickMapNodeClick)
// resolves the node choice first; the non-fork Continue button advances
// directly — startNextGame() auto-advances a single successor or drops into
// the next sector's root (mirroring the no-choice path that used to skip the
// map). Both share this identical tail.
function advanceFromMap() {
  Modal.hide('mapModal');
  lastGameRecorded = false;
  startNextGameWithBossBanner();
  render();
}

// Wraps startNextGame to fire boss banner. All startNextGame callers route through here.
function startNextGameWithBossBanner() {
  const info = RUN.startNextGame();
  if (info && info.bossName) showBossBanner(info.bossName, info.bossIcon);
}

function showBossBanner(bossName, icon) {
  const glyph = icon || '👹';
  const existing = document.getElementById('bossBanner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'bossBanner';
  banner.style.cssText = `
    position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, #1a0820 0%, #2a0a30 50%, #1a0820 100%);
    border: 2px solid #cc44aa; border-radius: 10px;
    padding: 18px 28px; z-index: 2000; cursor: pointer;
    font-family: Georgia, serif; color: #ee88cc;
    box-shadow: 0 0 40px rgba(204, 68, 170, .45), 0 8px 24px rgba(0,0,0,.6);
    text-align: center; pointer-events: auto;
    animation: bossBannerIn 0.4s ease-out;
    max-width: 90vw;
  `;
  banner.innerHTML = `
    <div style="font-size: 10px; letter-spacing: 0.3em; opacity: 0.7; margin-bottom: 6px;">YOU FACE</div>
    <div style="font-size: 22px; font-weight: bold; letter-spacing: 0.05em;">${glyph} ${bossName}</div>
  `;
  if (!document.getElementById('bossBannerKeyframes')) {
    const style = document.createElement('style');
    style.id = 'bossBannerKeyframes';
    style.textContent = `
      @keyframes bossBannerIn {
        0%   { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.9); }
        100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      }
      @keyframes bossBannerOut {
        0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.95); }
      }
    `;
    document.head.appendChild(style);
  }
  const dismiss = () => {
    banner.style.animation = 'bossBannerOut 0.3s ease-in forwards';
    setTimeout(() => banner.remove(), 300);
  };
  banner.onclick = dismiss;
  document.body.appendChild(banner);
  setTimeout(dismiss, 3000);
}

function renderReward() {
  const reward = RUN.getReward();
  if (!reward) {
    Modal.hide('rewardModal');
    return;
  }
  Modal.show('rewardModal', { dismissible: false });
  renderColorHud('rewardColors', RUN.getSlots());
  const optionsEl = document.getElementById('rewardOptions');
  optionsEl.innerHTML = '';

  if (reward.phase === 'mixed') {
    setText('rewardTitle', 'Choose a Reward');
    setText('rewardSubtitle', 'Pick one option to apply between games.');
    const slots = RUN.getSlots();
    reward.candidates.forEach((cand, idx) => {
      const KNOWN_KINDS = ['sticker', 'twoStickers', 'transform', 'clone', 'ripUp', 'threeStickersBlind', 'splice'];
      if (!cand || !KNOWN_KINDS.includes(cand.kind)) {
        console.warn('Skipping reward candidate with unknown kind:', cand);
        return;
      }
      // Blind reward — slot identity is hidden until pick. Render with no
      // card portion, just a mystery placeholder + flavor. Has no slotIdx
      // by design, so the standard slot/tpl lookup below would null-bail
      // and the candidate would never render. Handle this kind first.
      if (cand.kind === 'threeStickersBlind') {
        const div = document.createElement('div');
        div.className = 'rwd-pair rwd-pair-blind';
        const labelEl = document.createElement('div');
        labelEl.className = 'rwd-kind-label rwd-kind-threeStickersBlind';
        labelEl.textContent = '3 STICKERS — RANDOM CARD';
        div.appendChild(labelEl);
        // Mystery card placeholder: build a "Mystery Creature" fake card
        // with no cost / no P/T.
        const mystery = makeSyntheticCard({
          name: 'Mystery Creature',
          type: 'Reward',
          text: 'A random creature in your deck',
          art: '❓',
          color: 'C',
          scale: 2,
        });
        div.appendChild(mystery);
        const connector = document.createElement('div');
        connector.className = 'rwd-pair-plus';
        connector.textContent = '+++';
        div.appendChild(connector);
        const flavor = document.createElement('div');
        flavor.className = 'rwd-pair-sticker';
        flavor.innerHTML =
          `<div class="name">3 Random Stickers</div>` +
          `<div class="text">Three surprise stickers on a random creature — slot and stickers both rolled when you pick.</div>`;
        div.appendChild(flavor);
        div.onclick = () => pickRewardCandidateClick(idx);
        optionsEl.appendChild(div);
        return;
      }
      // Splice — pre-rolled pair shown at offer time (v1.0.47+). Player sees
      // both input cards and the merged-result preview before deciding. The
      // candidate carries baseSlotIdx and stapleSlotIdx, both pre-validated;
      // we render three card thumbnails (base + staple + merged) in a row.
      if (cand.kind === 'splice') {
        const baseSlot = slots[cand.baseSlotIdx];
        const stapleSlot = slots[cand.stapleSlotIdx];
        const baseTpl = baseSlot ? CARDS[baseSlot.tplId] : null;
        const stapleTpl = stapleSlot ? CARDS[stapleSlot.tplId] : null;
        if (!baseTpl || !stapleTpl) return;
        // Build the merged-result card. The base may already be stapled
        // (multi-stapling supported), so include the full prior stapledTpls
        // plus the new staple. ENGINE.makeCard internally calls
        // synthesizeStapledTemplate when stapledTpls is non-empty, so the
        // resulting card is a real runtime card with all merged mechanics
        // applied -- name, cost, effects, etc. -- matching what
        // applySplice will produce once the player picks.
        const priorStaples = Array.isArray(baseSlot.stapledTpls) ? baseSlot.stapledTpls : [];
        const mergedCard = ENGINE.makeCard(
          baseSlot.tplId,
          [],                               // no stickers on merged preview
          undefined,
          [],                               // no empowerRolls
          undefined, undefined,
          priorStaples.concat([stapleSlot.tplId]),
          []
        );
        const div = document.createElement('div');
        div.className = 'rwd-pair rwd-pair-splice';
        const labelEl = document.createElement('div');
        labelEl.className = 'rwd-kind-label rwd-kind-splice';
        labelEl.textContent = 'SPLICE';
        div.appendChild(labelEl);
        // Base card (left).
        div.appendChild(makeRewardCardEl(baseTpl, baseSlot));
        // Connector: plus between inputs.
        const plus = document.createElement('div');
        plus.className = 'rwd-pair-plus';
        plus.textContent = '+';
        div.appendChild(plus);
        // Staple card (middle).
        div.appendChild(makeRewardCardEl(stapleTpl, stapleSlot));
        // Connector: arrow to result.
        const arrow = document.createElement('div');
        arrow.className = 'rwd-pair-plus';
        arrow.textContent = '→';
        div.appendChild(arrow);
        // Merged preview (right). Render via makeCardEl directly with the
        // pre-built mergedCard (which already has stapled mechanics baked
        // in). Sticker badges from the inputs don't show on the preview;
        // they DO transfer at resolve time (see applySplice).
        const mergedEl = makeCardEl(mergedCard, { inHand: true });
        mergedEl.style.setProperty('--scale', '2');
        div.appendChild(mergedEl);
        div.onclick = () => pickRewardCandidateClick(idx);
        optionsEl.appendChild(div);
        return;
      }
      const slot = slots[cand.slotIdx];
      const tpl = slot ? CARDS[slot.tplId] : null;
      if (!tpl) return;

      const div = document.createElement('div');
      div.className = 'rwd-pair';
      applyTileColor(div, slot);
      // Click handler depends on candidate kind, but we set it once below.

      // Top label so the player immediately sees what kind of choice this is.
      const labelEl = document.createElement('div');
      labelEl.className = 'rwd-kind-label rwd-kind-' + cand.kind;
      labelEl.textContent =
        cand.kind === 'sticker'     ? 'STICKER' :
        cand.kind === 'twoStickers' ? '2 STICKERS' :
        cand.kind === 'transform'   ? 'TRANSFORM' :
        cand.kind === 'clone'       ? 'CLONE' :
        cand.kind === 'ripUp'       ? 'RIP UP' : '';
      div.appendChild(labelEl);

      // Card portion.
      div.appendChild(makeRewardCardEl(tpl, slot));

      if (cand.kind === 'sticker') {
        const sticker = STICKERS[cand.sticker_id];
        if (!sticker) return;
        const connector = document.createElement('div');
        connector.className = 'rwd-pair-plus';
        connector.textContent = '+';
        div.appendChild(connector);
        const stickerEl = document.createElement('div');
        stickerEl.className = 'rwd-pair-sticker';
        // For Empower, show the pre-rolled target so the player knows exactly
        // what number gets bumped before they accept. Format mirrors the
        // sticker badge: "Empower (damage)" or "Empower (power, mode 2)".
        let stickerName = sticker.name;
        if (cand.sticker_id === 'empower' && cand.empowerRoll) {
          // Stapled-aware: the roll may target the staple-half's effect, so
          // resolve the label against the synthesized merged template
          // (matches stickerBadgesHtml's post-accept rendering). Without
          // this, a roll on a stapled slot would degrade from the
          // disambiguated "Empower (damage)" to the raw-field "Empower
          // (amount)" in the offer modal — confusing the player about what
          // they're picking.
          const labelTpl = tplForSlot(slot) || tpl;
          stickerName = `Empower (${empowerRollLabel(labelTpl, cand.empowerRoll)})`;
        }
        if (cand.sticker_id === 'subtype' && cand.subtypeRoll) {
          // Show the rolled subtype so the player knows what they're getting.
          stickerName = `Subtype: ${cand.subtypeRoll}`;
        }
        stickerEl.innerHTML =
          `<div class="name">${stickerName}</div>` +
          `<div class="text">${renderManaSymbols(escapeHtml(sticker.text || ''))}</div>`;
        div.appendChild(stickerEl);
      } else if (cand.kind === 'twoStickers') {
        const connector = document.createElement('div');
        connector.className = 'rwd-pair-plus';
        connector.textContent = '++';
        div.appendChild(connector);
        const flavor = document.createElement('div');
        flavor.className = 'rwd-pair-sticker';
        flavor.innerHTML =
          `<div class="name">2 Random Stickers</div>` +
          `<div class="text">Two surprise stickers — rolled when you pick this.</div>`;
        div.appendChild(flavor);
      } else if (cand.kind === 'transform') {
        const arrow = document.createElement('div');
        arrow.className = 'rwd-pair-plus rwd-pair-arrow';
        arrow.textContent = '↺';
        div.appendChild(arrow);
        const flavor = document.createElement('div');
        flavor.className = 'rwd-pair-sticker rwd-pair-flavor';
        flavor.innerHTML =
          `<div class="name">Transform</div>` +
          `<div class="text">Replace this card with one of three new options.</div>`;
        div.appendChild(flavor);
      } else if (cand.kind === 'clone') {
        const arrow = document.createElement('div');
        arrow.className = 'rwd-pair-plus rwd-pair-clone';
        arrow.textContent = '⧉';
        div.appendChild(arrow);
        const flavor = document.createElement('div');
        flavor.className = 'rwd-pair-sticker rwd-pair-flavor rwd-pair-clone-flavor';
        flavor.innerHTML =
          `<div class="name">Clone</div>` +
          `<div class="text">Add a fresh copy of this card to your deck.</div>`;
        div.appendChild(flavor);
      } else if (cand.kind === 'ripUp') {
        const arrow = document.createElement('div');
        arrow.className = 'rwd-pair-plus rwd-pair-rip';
        arrow.textContent = '✗';
        div.appendChild(arrow);
        const flavor = document.createElement('div');
        flavor.className = 'rwd-pair-sticker rwd-pair-flavor rwd-pair-rip-flavor';
        flavor.innerHTML =
          `<div class="name">Rip Up</div>` +
          `<div class="text">Permanently remove this card from your deck.</div>`;
        div.appendChild(flavor);
      }
      div.onclick = () => pickRewardCandidateClick(idx);
      optionsEl.appendChild(div);
    });
    return;
  }

  if (reward.phase === 'transformPick') {
    setText('rewardTitle', 'Choose a Replacement');
    const slots = RUN.getSlots();
    const slot = slots[reward.slotIdx];
    // Show the merged name for stapled slots so the player sees the full
    // identity of what they're replacing (Lions+Bolt, not just Lions).
    const oldTpl = slot ? tplForSlot(slot) : null;
    setText('rewardSubtitle',
      oldTpl ? `${oldTpl.name} will be replaced by your choice below.`
             : 'Pick a replacement for the transformed slot.');
    for (const tplId of reward.replacementPack) {
      const tpl = CARDS[tplId];
      if (!tpl) continue;
      const div = document.createElement('div');
      div.className = 'rwd-pair';
      applyTileColorFromTpl(div, tpl);
      div.appendChild(makeRewardCardEl(tpl, null));
      div.onclick = () => pickTransformReplacementClick(tplId);
      optionsEl.appendChild(div);
    }
    return;
  }

  if (reward.phase === 'twoStickersReveal') {
    const slots = RUN.getSlots();
    const slot = slots[reward.slotIdx];
    // Use the merged template for stapled slots so the reveal shows the
    // full identity ("Lions+Bolt gained Flying and Lifelink"). Also drives
    // the tile color via applyTileColor.
    const tpl = slot ? tplForSlot(slot) : null;
    setText('rewardTitle', 'Stickers Applied!');
    if (tpl && reward.appliedStickerIds.length > 0) {
      // For subtype stickers, surface the rolled subtype ("Beast") not
      // generic "Subtype". Just-applied rolls are the LAST N entries of
      // slot.subtypeRolls, in the order they appear in appliedStickerIds.
      const subtypeCount = reward.appliedStickerIds.filter(id => id === 'subtype').length;
      const newSubtypeRolls = (slot && Array.isArray(slot.subtypeRolls) && subtypeCount > 0)
        ? slot.subtypeRolls.slice(-subtypeCount)
        : [];
      let subtypeCursor = 0;
      const names = reward.appliedStickerIds.map(id => {
        if (id === 'subtype') {
          const r = newSubtypeRolls[subtypeCursor++];
          return r || (STICKERS[id] ? STICKERS[id].name : id);
        }
        return STICKERS[id] ? STICKERS[id].name : id;
      }).join(' and ');
      setText('rewardSubtitle', `${tpl.name} gained ${names}.`);
    } else {
      setText('rewardSubtitle', 'No stickers could be applied.');
    }
    // Single tile showing the slot's current state (post-application).
    const div = document.createElement('div');
    div.className = 'rwd-pair';
    if (slot) applyTileColor(div, slot);
    if (tpl) div.appendChild(makeRewardCardEl(tpl, slot));
    const btn = document.createElement('div');
    btn.className = 'rwd-pair-sticker';
    btn.style.cursor = 'pointer';
    btn.innerHTML = `<div class="name">Continue</div>`;
    div.appendChild(btn);
    div.onclick = () => {
      RUN.dismissReveal();
      renderReward();
    };
    optionsEl.appendChild(div);
    return;
  }
}
function renderDraft() {
  const screen = document.getElementById('draftScreen');
  screen.classList.add('vis');
  const progress = DRAFT.getProgress();
  document.getElementById('draftPickNum').textContent = (progress.picked + 1);
  // Total varies by mode — classic = 23 spell picks, Desert Cube = 40 full
  // deck picks. The subtitle also flips since auto-land allocation only
  // happens in classic.
  const totalEl = document.getElementById('draftPickTotal');
  if (totalEl) totalEl.textContent = progress.total;
  const subtitleEl = document.getElementById('draftSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = progress.total === 40
      ? 'Choose one card. Lands appear in packs — draft your own manabase.'
      : 'Choose one card. Lands will be added automatically based on your colors.';
  }
  const pack = DRAFT.getPlayerPack();
  const packEl = document.getElementById('draftPack');
  packEl.innerHTML = '';
  for (const tplId of pack) {
    // Use makeCardEl (the same renderer that builds hand/board cards).
    // Build a vanilla card instance from the template -- the draft pack
    // isn't slot-bound yet, no stickers or runtime state.
    const card = ENGINE.makeCard(tplId);
    const el = makeCardEl(card);
    // Showcase scale -- cards render at 2x (160x224) for the picker so
    // the player can read them. --scale is a no-op on the classic .card
    // (it's hardcoded 62x88); classic-mode draft picks render at hand
    // size, which is a tolerable fallback.
    el.style.setProperty('--scale', '2');
    el.style.cursor = 'pointer';
    el.onclick = () => pickDraft(tplId);
    // Long-press is wired by makeCardEl already (via attachLongPress).
    packEl.appendChild(el);
  }
  // Footer: list of picks so far. If the player picked a Neow boon, show
  // it as the first entry with a ✦ marker so it's visually distinct from
  // drafted picks — gives continuity with the deck the boon will join at
  // RUN.start time (whether that boon adds a card to the deck or modifies
  // existing slots, the player sees they've already "committed" to it).
  const picks = DRAFT._state() ? DRAFT._state().youPicks : [];
  const draftedNames = picks.map(id => CARDS[id].name);
  let boonName = null;
  if (pendingNeowModifier && RUN_MODIFIERS[pendingNeowModifier]) {
    boonName = '✦ ' + RUN_MODIFIERS[pendingNeowModifier].name;
  }
  const allEntries = boonName ? [boonName, ...draftedNames] : draftedNames;
  const summary = allEntries.join(', ');
  document.getElementById('draftPicksList').textContent = summary || '(none yet)';

  renderColorHud('draftColors', picks);
}

// Render a color-pip row showing how many of the given templates have each
// color in their cost. Lands and colorless cards don't contribute. Same
// visual used by the draft screen and the between-games reward screen so
// the player keeps continuity on what colors they're committed to.
//
// `tplIds` accepts either a list of tplId strings (from DRAFT picks) or a
// list of slot objects with .tplId (from RUN.getSlots()). The shape check
// is duck-typed: anything with .tplId is treated as a slot.
function renderColorHud(elementId, tplIds) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const colorCounts = { W:0, U:0, B:0, R:0, G:0 };
  for (const item of (tplIds || [])) {
    const id = (typeof item === 'string') ? item : item.tplId;
    const tpl = CARDS[id];
    if (!tpl) continue;
    // Spells: count each colored pip in cost. Lands: count their mana
    // type as a single pip. In Desert Cube, picking Mountain should be
    // visible on the color HUD just like picking a R-cost spell would —
    // they're both signals of "I'm building red." Without the land
    // branch, a player who picks 5 Mountains and 2 spells would see
    // their HUD as if they had only the spells.
    if (tpl.cost) {
      for (const c of ['W','U','B','R','G']) {
        if ((tpl.cost[c] || 0) > 0) colorCounts[c]++;
      }
    } else if (hasType(tpl, 'Land') && tpl.mana && colorCounts[tpl.mana] !== undefined) {
      colorCounts[tpl.mana]++;
    }
  }
  el.innerHTML = '';
  for (const c of ['W','U','B','R','G']) {
    const n = colorCounts[c];
    const pip = document.createElement('span');
    pip.className = 'draft-pip col-' + c + (n === 0 ? ' dim' : '');
    // renderManaSymbols turns the {W} token into the same pip span used
    // everywhere else (cost displays, card text), so the draft counters
    // get the emoji-glyph fallback / future PNG drop-in for free.
    pip.innerHTML = `${renderManaSymbols('{' + c + '}')}<span>${n}</span>`;
    el.appendChild(pip);
  }
}
function onStateChange() {
  render();
  const G = ENGINE.state();
  // Game just ended — record result for the run (idempotent via flag).
  // Sandbox is RUN-less: never record (also guarded by lastGameRecorded=true).
  if (G && G.gameOver && !lastGameRecorded && !sandboxMode) {
    lastGameRecorded = true;
    // Pass played-slots and claimed-keywords sets so RUN can snapshot
    // them before G is discarded. Both are consumed at sticker-reward
    // generation time — played-slots filters which slots are eligible,
    // claimed-keywords filters which keyword stickers are offered.
    const played = G.you && G.you.playedSlotIdxs;
    const claimed = G.you && G.you.claimedKeywords;
    RUN.recordResult(G.winner, played, claimed);
    renderReward();
  }
  const actor = ENGINE.expectedActor();
  // Dispatch AI if it's their turn.
  if (actor === 'opp' && !aiScheduled) {
    aiScheduled = true;
    aiThinking = true;
    updateThinkingUi();
    setTimeout(async () => {
      // Re-check state at fire time. The 100ms delay between scheduling and
      // firing is enough for a player action (or stack resolution from a
      // prior AI cast) to end the game. AI.decide also has its own gameOver
      // guard, but bailing here avoids the work entirely and avoids posting
      // a stale action into a finished game.
      const stateAtFire = ENGINE.state();
      if (!stateAtFire || stateAtFire.gameOver) {
        aiScheduled = false;
        aiThinking = false;
        updateThinkingUi();
        return;
      }
      let action = null;
      try {
        action = await AI.decide(stateAtFire, 'opp');
      } catch (e) {
        console.warn('AI dispatch failed unexpectedly:', e);
        action = {type: 'pass'};
      }
      // If the AI's pass would cause a stack item to resolve (i.e., the
      // player has already passed and the AI is about to make it both-
      // passed), inject a delay so the player has time to read the spell
      // that's about to resolve. Without this, the AI's pass and the
      // resolution happen in the same tick — text on the stack flashes
      // by before the player can register it.
      //
      // Detection: the action is a pass, the stack is non-empty, and the
      // opposing side ('you') is already in the passes set. If both are
      // true, this pass closes the round and resolves the top item.
      if (action && action.type === 'pass'
          && stateAtFire.stack.length > 0
          && stateAtFire.priority
          && stateAtFire.priority.passes
          && stateAtFire.priority.passes.has('you')) {
        await new Promise(r => setTimeout(r, 500));
        // Re-check world after the wait. Player could have cast a
        // response or the game could have ended.
        const post = ENGINE.state();
        if (!post || post.gameOver) {
          aiScheduled = false;
          aiThinking = false;
          updateThinkingUi();
          return;
        }
        if (ENGINE.expectedActor() !== 'opp') {
          aiScheduled = false;
          aiThinking = false;
          updateThinkingUi();
          return;
        }
      }
      // Always reset flags before the next executeAction so notify→render
      // sees the cleared "thinking" state.
      aiScheduled = false;
      aiThinking = false;
      updateThinkingUi();
      // Re-check gameOver one more time before executing. AI.decide is
      // synchronous in the heuristic implementation but the await is here
      // to support future async deciders (LLM, MCTS) — and a long-running
      // decide could see the game end out from under it.
      const stateNow = ENGINE.state();
      if (!stateNow || stateNow.gameOver) return;
      const ok = ENGINE.executeAction('opp', action);
      if (!ok) {
        console.warn('AI fell back to pass after illegal action: ' + JSON.stringify(action,
          (k, v) => v instanceof Map ? [...v.entries()] : v));
        ENGINE.executeAction('opp', {type: 'pass'});
      }
    }, 100);
    return;
  }
  // End Turn auto-pass: if the player has set the end-turn flag and currently
  // holds priority on an empty stack, auto-pass to roll forward. Anything
  // showing up on the stack (an AI cast) breaks the chain — player gets
  // control back and must explicitly act. Forced-action windows (search,
  // forced discard) also break the chain: those need explicit player input.
  if (!G) return;
  // True if the player is mid-modal — abort autopilot. ENGINE.playerOwesDecision
  // reads from PENDING_DECISIONS, so any new modal type added to the engine
  // automatically aborts the autopilot here.
  const inForced = ENGINE.playerOwesDecision('you');
  if (actor === 'you' && G.endTurnPending && G.priority && G.stack.length === 0 && !inForced) {
    setTimeout(() => {
      const cur = ENGINE.state();
      const stillForced = ENGINE.playerOwesDecision('you');
      if (cur.endTurnPending && cur.priority && cur.stack.length === 0
          && !stillForced && ENGINE.expectedActor() === 'you') {
        ENGINE.executeAction('you', {type:'pass'});
      }
    }, 150);
  }
  // Auto-yield over your own spell: if AI has already passed and the top of
  // the stack is yours, the player wouldn't normally interact with their own
  // pending spell — auto-pass to let it resolve. The standard "fast effects
  // shortcut" in digital MtG. The player can still preempt by casting another
  // instant during the brief window before this fires (the timer cancels if
  // the state changes before it runs).
  if (actor === 'you' && G.priority && G.stack.length > 0 && !inForced) {
    const top = G.stack[G.stack.length - 1];
    const aiPassed = G.priority.passes && G.priority.passes.has('opp');
    if (top.controller === 'you' && aiPassed) {
      setTimeout(() => {
        const cur = ENGINE.state();
        if (!cur.priority || cur.stack.length === 0) return;
        const curTop = cur.stack[cur.stack.length - 1];
        const curAiPassed = cur.priority.passes && cur.priority.passes.has('opp');
        const stillForced = ENGINE.playerOwesDecision('you');
        if (curTop.controller === 'you' && curAiPassed && !stillForced
            && ENGINE.expectedActor() === 'you') {
          ENGINE.executeAction('you', {type:'pass'});
        }
      }, 500);
    }
  }
}

// ----- Player click handlers -----

// §3.5 targeting: a spell/ability needs a target pick if it carries a top-level
// `target()` step OR (legacy/multi-target) any per-effect targeted effect.
// `probeTargetsFor` builds the fake target(s) used to legality-check before
// entering target-picking mode, honoring whichever form applies.
// Thin delegators to the engine's canonical targeting-shape API (single source
// of truth — see engine.js objectNeedsTarget/probeTargetsForObject). Kept as
// local names so the call sites below read naturally.
function objNeedsTarget(obj) { return ENGINE.objectNeedsTarget(obj); }
function probeTargetsFor(obj, effects, who) { return ENGINE.probeTargetsForObject(obj, who); }

function clickHand(iid) {
  const G = ENGINE.state();
  // Defensive: G is null until ENGINE.init completes. If a click event
  // somehow fires during the brief window before init (e.g., a stale UI
  // element from a previous render, or a load-time race), bail rather
  // than dereferencing null.
  if (!G || G.gameOver) return;

  // Cleanup discard mode
  if (G.cleanupDiscarding && G.activePlayer === 'you') {
    submit({type:'discard', cardIid: iid});
    return;
  }

  // Forced-discard prompt (Mind Rot etc.)
  if (G.forcedDiscard && G.forcedDiscard.who === 'you' && G.forcedDiscard.remaining > 0) {
    submit({type:'discard', cardIid: iid});
    return;
  }

  // Pending search modal — clicking hand cards is meaningless during search.
  if (G.pendingSearch && G.pendingSearch.who === 'you') return;

  if (pendingTarget) return;  // ignore hand clicks while picking a target

  const card = G.you.hand.find(c => c.iid === iid);
  if (!card) return;

  if (hasType(card, 'Land')) {
    submit({type:'playLand', cardIid: iid});
    return;
  }

  // Modal card: open the mode picker. We can't determine targetability
  // without knowing which mode the player wants — different modes may
  // have different targeting requirements (Smite targets any, Embolden
  // targets a creature, Sanctuary is untargeted). Defer the legal-action
  // check until a mode is chosen.
  if (ENGINE.isModal(card)) {
    // Pre-flight: at least ONE mode must be currently castable to bother
    // showing the picker. Walk the modes; for each, do the same legal-action
    // check that non-modal cards do, but with mode-appropriate fake targets.
    // Modal multi-target modes are supported via fakeTargetsForLegality —
    // each mode's targeted effects get fake fills, including per-slot fakes
    // for any slots-annotated effects in that mode.
    const modes = ENGINE.getModes(card);
    let anyCastable = false;
    for (let mIdx = 0; mIdx < modes.length; mIdx++) {
      const modeEffects = modes[mIdx];
      const fakeTargets = fakeTargetsForLegality(modeEffects, 'you');
      // fakeTargets === null means the mode has a slot with no valid targets
      // — skip it (legal-action check would fail anyway).
      if (fakeTargets === null) continue;
      const action = fakeTargets.length > 0
        ? {type:'castSpell', cardIid: iid, modeIdx: mIdx, targets: fakeTargets}
        : {type:'castSpell', cardIid: iid, modeIdx: mIdx};
      if (ENGINE.isLegalAction('you', action)) { anyCastable = true; break; }
    }
    if (!anyCastable) return;
    pendingModalChoice = { cardIid: iid };
    render();
    return;
  }

  // Spell. Needs a target pick if it has a top-level target() step (§3.5) or a
  // per-effect targeted effect (legacy/multi-target). probeTargetsFor builds the
  // legality fake-targets for whichever form applies.
  if (objNeedsTarget(card, card.effects)) {
    const fakeTargets = probeTargetsFor(card, card.effects, 'you');
    if (!fakeTargets) return;   // no valid target — uncastable
    if (!ENGINE.isLegalAction('you', {type:'castSpell', cardIid: iid, targets: fakeTargets})) {
      return;   // not castable right now
    }
    pendingTarget = {kind:'cast', cardIid: iid, pickedSlots: []};
    render();
    return;
  }
  submit({type:'castSpell', cardIid: iid});
}

// (fakeTargetsForLegality — module scope.)

function clickBattlefield(iid) {
  const G = ENGINE.state();
  // Defensive: G is null pre-init. Mirrors clickHand's guard.
  if (!G || G.gameOver) return;
  // Don't accept battlefield clicks while a non-targeting forced-action is open.
  if (G.pendingSearch && G.pendingSearch.who === 'you') return;
  if (G.forcedDiscard && G.forcedDiscard.who === 'you' && G.forcedDiscard.remaining > 0) return;
  const f = ENGINE.findCard(iid); if (!f) return;
  const card = f.card;

  // Trigger target prompt — clicking a creature submits it as the trigger target.
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
    const target = {kind:'creature', iid: card.iid, ctrl: f.controller, label: card.name};
    submit({type:'triggerTargetPick', target});
    return;
  }

  // Targeting mode — clicking a creature picks it as the target (or the sac).
  if (pendingTarget) {
    // abilitySac: clicking a creature picks it as the sacrifice target
    // for an ability with sacrifice cost (Carrion Feeder etc). Restrict
    // to the player's own creatures since sac costs target self-side only.
    if (pendingTarget.kind === 'abilitySac') {
      if (f.controller !== 'you' || !hasType(card, 'Creature')) return;
      const action = {type:'activateAbility',
                      cardIid: pendingTarget.cardIid,
                      abilityIdx: pendingTarget.abilityIdx,
                      sacIid: card.iid};
      if (ENGINE.isLegalAction('you', action)) {
        pendingTarget = null;
        submit(action);
      }
      return;
    }
    // Determine the right target descriptor kind. For effects targeting
    // 'permanent' or 'permanent_or_spell' we emit kind:'permanent' (the click
    // is on a battlefield card; stack-spell targets are handled by a
    // separate stack-click path). Otherwise default to 'creature'. Without
    // this, clicking a land while casting Steal would emit a kind:'creature'
    // descriptor that fails sameTarget against the valid-target list (which
    // uses kind:'permanent').
    const eff = pendingTargetEffect(pendingTarget);
    const targetKind = (eff && (eff.target === 'permanent' || eff.target === 'permanent_or_spell')) ? 'permanent' : 'creature';
    const action = buildPendingActionWithTarget({kind: targetKind, iid: card.iid, label: card.name});
    if (action && action.pending) {
      // Multi-target spell: accumulated this pick, more slots remain. Re-render
      // so the highlighter and prompt update to show the next slot's valid
      // targets. The pendingTarget state stays open.
      render();
      return;
    }
    if (action && ENGINE.isLegalAction('you', action)) {
      pendingTarget = null;
      submit(action);
    } else if (action) {
      // The accumulated targets don't form a legal action — back off the
      // last pick so the player can try again. Without this, an invalid
      // pick on a multi-target spell would silently roll back state to a
      // weird half-picked place. Pop and re-render.
      if (pendingTarget && Array.isArray(pendingTarget.pickedSlots)) {
        pendingTarget.pickedSlots.pop();
        render();
      }
    }
    return;
  }

  // Combat: attackers (only during pre-declaration)
  if (G.phase === 'COMBAT_ATTACK' && G.activePlayer === 'you' && !G.attackersDeclared && f.controller === 'you') {
    if (!ENGINE.canCreatureAttack(card)) return;
    const idx = uiAtk.indexOf(iid);
    if (idx >= 0) uiAtk.splice(idx, 1); else uiAtk.push(iid);
    render();
    return;
  }

  // Combat: blockers — pick a defender's creature (only during pre-declaration)
  if (G.phase === 'COMBAT_BLOCK' && G.activePlayer === 'opp' && !G.blockersDeclared && f.controller === 'you') {
    if (!ENGINE.canCreatureBlock(card)) return;
    uiPickBlk = (uiPickBlk === iid) ? null : iid;
    render();
    return;
  }
  // Combat: assign a defender's creature to block an attacker (only during pre-declaration)
  if (G.phase === 'COMBAT_BLOCK' && G.activePlayer === 'opp' && !G.blockersDeclared && f.controller === 'opp' && uiPickBlk !== null) {
    if (!G.attackers.includes(iid)) return;
    if (uiBlk.get(uiPickBlk) === iid) {
      uiBlk.delete(uiPickBlk);
    } else {
      const blkCard = ENGINE.findCard(uiPickBlk).card;
      if (card.keywords.includes('flying')
          && !blkCard.keywords.includes('flying')
          && !blkCard.keywords.includes('reach')) return;
      uiBlk.set(uiPickBlk, iid);
    }
    uiPickBlk = null;
    render();
    return;
  }

  // Lands have their own simpler tap-for-mana path (with color picker for
  // duals). Creatures and artifacts go through the unified ability-picker
  // path below.
  if (f.controller === 'you' && !card.tapped && hasType(card, 'Land')) {
    const producible = ENGINE.landProducibleColors(card);
    if (producible.length > 1) {  // §3.9: multi-color land → color picker
      const legal = producible.filter(c =>
        ENGINE.isLegalAction('you', {type:'tapLandForMana', cardIid: iid, color: c}));
      if (legal.length === 0) return;
      if (legal.length === 1) {
        submit({type:'tapLandForMana', cardIid: iid, color: legal[0]});
        return;
      }
      showManaColorPicker(card, legal, (color) => {
        submit({type:'tapLandForMana', cardIid: iid, color});
      });
      return;
    }
    if (ENGINE.isLegalAction('you', {type:'tapLandForMana', cardIid: iid})) {
      submit({type:'tapLandForMana', cardIid: iid});
      return;
    }
    return;
  }

  // Unified ability picker for non-land permanents (v1.0.64). Enumerate
  // every legal-to-activate ability and either fire directly (if 1 option)
  // or show a picker (2+ options). Previously the code only inspected
  // abilities[0] — missing stapled creature+land merges whose mana ability
  // is appended at index >= 1, and missing the multi-ability case entirely.
  if (f.controller === 'you' && Array.isArray(card.abilities) && card.abilities.length > 0) {
    const options = [];
    for (let i = 0; i < card.abilities.length; i++) {
      const ab = card.abilities[i];
      const isMana = ab.effects && ab.effects[0] && ab.effects[0].kind === 'add_mana';
      const abNeedsTarget = objNeedsTarget(ab, ab.effects);  // §3.5: top-level target() or per-effect
      const needsSac = ab.cost && ab.cost.sacrifice;
      // Probe legality. The probe action shape depends on cost/target shape;
      // build the minimum that satisfies isLegalAction.
      let probe;
      if (isMana) {
        probe = {type:'tapLandForMana', cardIid: iid, abilityIdx: i};
      } else if (needsSac) {
        const sacCandidates = G.you.battlefield.filter(c => hasType(c, 'Creature'));
        if (sacCandidates.length === 0) continue;
        probe = {type:'activateAbility', cardIid: iid, abilityIdx: i, sacIid: sacCandidates[0].iid};
        if (abNeedsTarget) {
          const fakeTargets = probeTargetsFor(ab, ab.effects, 'you');
          if (!fakeTargets) continue;
          probe.targets = fakeTargets;
        }
      } else if (abNeedsTarget) {
        const fakeTargets = probeTargetsFor(ab, ab.effects, 'you');
        if (!fakeTargets) continue;
        probe = {type:'activateAbility', cardIid: iid, abilityIdx: i, targets: fakeTargets};
      } else {
        probe = {type:'activateAbility', cardIid: iid, abilityIdx: i};
      }
      if (!ENGINE.isLegalAction('you', probe)) continue;
      // Build a human-readable label. For mana abilities, "Tap for {color}"
      // form is clearer than the raw text. For other abilities, use the
      // engine's describeAbility helper if available, else fall back to
      // raw text. Keep labels short — picker buttons are small.
      let label;
      if (isMana) {
        const am = ab.effects[0].amounts || {};
        const parts = [];
        for (const c of Object.keys(am)) {
          for (let n = 0; n < am[c]; n++) parts.push('{' + c + '}');
        }
        label = 'Tap for ' + (parts.join('') || 'mana');
      } else {
        // Use the ability's first effect's kind to synthesize a short label.
        // Cards already have full text in their hover/popup; this is just
        // for picker disambiguation.
        const eff = ab.effects[0];
        const costStr = (ab.cost && ab.cost.tap) ? '{T}' :
                        (ab.cost && ab.cost.mana) ?
                          Object.keys(ab.cost.mana).map(c => {
                            const n = ab.cost.mana[c];
                            return n === 1 ? '{' + c + '}' : '{' + n + '}'.replace('C', '');
                          }).join('') :
                        (ab.cost && ab.cost.sacrifice) ? 'Sacrifice' : '';
        const isDrawMove = eff.kind === 'move_card' && eff.from_zone === 'library' && eff.to_zone === 'hand';
        const effDesc = eff.kind === 'damage' ? 'Deal ' + (eff.amount || 1) + ' damage' :
                        eff.kind === 'pump' ? '+' + (eff.power || 0) + '/+' + (eff.toughness || 0) + ' EOT' :
                        (eff.kind === 'draw' || isDrawMove) ? 'Draw ' + (eff.amount || 1) :
                        eff.kind === 'untap' ? 'Untap a creature' :
                        eff.kind === 'gain_life' ? 'Gain ' + (eff.amount || 1) + ' life' :
                        eff.kind === 'apply_in_game_splice' ? 'Staple' :
                        eff.kind;
        label = (costStr ? costStr + ': ' : '') + effDesc;
      }
      // Action-builder: fires this specific ability when chosen.
      const fireAbility = () => {
        if (isMana) {
          submit({type:'tapLandForMana', cardIid: iid, abilityIdx: i});
        } else if (needsSac) {
          pendingTarget = {kind:'abilitySac', cardIid: iid, abilityIdx: i};
          render();
        } else if (abNeedsTarget) {
          pendingTarget = {kind:'ability', cardIid: iid, abilityIdx: i, pickedSlots: []};
          render();
        } else {
          submit({type:'activateAbility', cardIid: iid, abilityIdx: i});
        }
      };
      options.push({label, onPick: fireAbility, abilityIdx: i});
    }
    if (options.length === 0) return;
    if (options.length === 1) { options[0].onPick(); return; }
    showAbilityPicker(card, options);
    return;
  }
}

function clickStackTarget(stackIdx) {
  if (!pendingTarget) return;
  const G = ENGINE.state();
  const item = G.stack[stackIdx]; if (!item) return;
  // Triggers are never valid targets for counter; defensive guard.
  if (item.kind === 'trigger' || !item.card) return;
  const action = buildPendingActionWithTarget({kind:'stack', stackItem: item, label: item.card.name});
  if (action && action.pending) {
    render();
    return;
  }
  if (action && ENGINE.isLegalAction('you', action)) {
    pendingTarget = null;
    submit(action);
  } else if (action) {
    if (pendingTarget && Array.isArray(pendingTarget.pickedSlots)) {
      pendingTarget.pickedSlots.pop();
      render();
    }
  }
}

function clickPlayerTarget(who) {
  const G = ENGINE.state();
  // Trigger target prompt — clicking a player submits them as the target.
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
    const target = {kind:'player', who, label: G[who].name};
    submit({type:'triggerTargetPick', target});
    return;
  }
  if (!pendingTarget) return;
  const action = buildPendingActionWithTarget({kind:'player', who, label: G[who].name});
  if (action && action.pending) {
    // Multi-target spell, more slots to pick. Re-render and keep prompting.
    render();
    return;
  }
  if (action && ENGINE.isLegalAction('you', action)) {
    pendingTarget = null;
    submit(action);
  } else if (action) {
    // Invalid combination — undo the last pick and let the player retry.
    if (pendingTarget && Array.isArray(pendingTarget.pickedSlots)) {
      pendingTarget.pickedSlots.pop();
      render();
    }
  }
}

// Build the action to fire from the current pendingTarget state. For
// single-slot picks (the common case), this constructs the action with the
// just-picked target and submits immediately. For multi-slot picks, this
// accumulates the picked target into pendingTarget.pickedSlots and returns
// null until all slots are filled — caller stays in target-picking mode for
// the next slot. When the last slot is picked, builds the final action with
// targets[] indexed by slot value.
function buildPendingActionWithTarget(target) {
  if (!pendingTarget) return null;
  // Append the target to the pickedSlots accumulator. Initialize on first
  // pick if we haven't yet — older callers (single-slot path) didn't seed it.
  if (!Array.isArray(pendingTarget.pickedSlots)) pendingTarget.pickedSlots = [];
  pendingTarget.pickedSlots.push(target);
  const slotsNeeded = slotsNeededForPending(pendingTarget);
  if (pendingTarget.pickedSlots.length < slotsNeeded.length) {
    // More slots to pick — caller should re-render and stay in target mode.
    // Return a sentinel so the caller knows not to submit yet. We use
    // {pending:true} to distinguish from null (which means "invalid/no action").
    return {pending: true};
  }
  // All slots picked — assemble the final targets array. slotsNeeded is
  // sorted ascending; pickedSlots is in the same order. Place each pick
  // at its slot's index. Sparse slots (e.g., a future card using slots 0
  // and 2) get filled with placeholder copies of slot 0's pick so the
  // array length covers the highest slot value; the validator only reads
  // targets[slot] for each effect's actual slot, so placeholders are
  // harmless.
  const targets = [];
  for (let i = 0; i < slotsNeeded.length; i++) {
    targets[slotsNeeded[i]] = pendingTarget.pickedSlots[i];
  }
  for (let i = 0; i < targets.length; i++) {
    if (!targets[i]) targets[i] = pendingTarget.pickedSlots[0];
  }
  if (pendingTarget.kind === 'cast') {
    const action = {type:'castSpell', cardIid: pendingTarget.cardIid, targets};
    if (pendingTarget.modeIdx !== undefined) action.modeIdx = pendingTarget.modeIdx;
    return action;
  }
  if (pendingTarget.kind === 'ability') {
    return {type:'activateAbility', cardIid: pendingTarget.cardIid,
            abilityIdx: pendingTarget.abilityIdx, targets};
  }
  return null;
}

function cancelTarget() {
  pendingTarget = null;
  render();
}

// Player picked a mode for a modal spell. If the mode needs a target,
// transition to target-picking; otherwise submit immediately. Called from
// the UI's modal mode picker buttons.
function pickModalMode(modeIdx) {
  if (!pendingModalChoice) return;
  const cardIid = pendingModalChoice.cardIid;
  const G = ENGINE.state();
  const card = G.you.hand.find(c => c.iid === cardIid);
  if (!card) { pendingModalChoice = null; render(); return; }
  const modes = ENGINE.getModes(card);
  if (modeIdx < 0 || modeIdx >= modes.length) { pendingModalChoice = null; render(); return; }
  const modeEffects = modes[modeIdx];
  const hasTarget = (modeEffects || []).some(ENGINE.effectNeedsTarget);
  // Verify legality with this mode + fake target shape before committing. The
  // multi-slot helper covers single-slot modes too: it returns [fakeT] for a
  // one-slot mode, [fakeT0, fakeT1] for a multi-slot mode. null means some
  // slot has no valid target — mode isn't castable right now.
  const fakeTargets = hasTarget ? fakeTargetsForLegality(modeEffects, 'you') : [];
  if (hasTarget && fakeTargets === null) return;   // keep picker open
  const fakeAction = hasTarget
    ? {type:'castSpell', cardIid, modeIdx, targets: fakeTargets}
    : {type:'castSpell', cardIid, modeIdx};
  if (!ENGINE.isLegalAction('you', fakeAction)) {
    // This mode isn't currently castable (e.g. no creatures on board for
    // Embolden). Keep the picker open so the player can try another mode.
    return;
  }
  pendingModalChoice = null;
  if (hasTarget) {
    // Transition to targeting mode with the chosen modeIdx baked in. The
    // pickedSlots accumulator is initialized empty; subsequent target clicks
    // populate it via buildPendingActionWithTarget.
    pendingTarget = { kind:'cast', cardIid, modeIdx, pickedSlots: [] };
    render();
    return;
  }
  // Untargeted mode — submit directly.
  submit({type:'castSpell', cardIid, modeIdx});
}

function cancelModalChoice() {
  pendingModalChoice = null;
  render();
}

// ----- Buttons -----
function endTurn()       { submit({type:'endTurn'}); }
function passAction()    { submit({type:'pass'}); }
function doneDeclaring() {
  const G = ENGINE.state();
  if (G.phase === 'COMBAT_ATTACK' && G.activePlayer === 'you') {
    const action = {type:'declareAttackers', cardIids: uiAtk.slice()};
    uiAtk = [];
    submit(action);
  } else if (G.phase === 'COMBAT_BLOCK' && G.activePlayer === 'opp') {
    const action = {type:'declareBlockers', blockMap: new Map(uiBlk)};
    uiBlk = new Map();
    uiPickBlk = null;
    submit(action);
  }
}
function concede() { ENGINE.concede(); }

// =========================================================================
// Long-press → card popup. Implemented here so all card-render sites can
// share the same gesture wiring.
// =========================================================================
const LONG_PRESS_MS = 400;
const PRESS_CANCEL_PX = 10;
let longPressTimer = null;
let longPressStartX = 0;
let longPressStartY = 0;
let suppressNextClick = false;

function startPress(card, x, y, e) {
  cancelPress();
  longPressStartX = x;
  longPressStartY = y;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    suppressNextClick = true;
    openCardPopup(card);
  }, LONG_PRESS_MS);
}
function movePress(x, y) {
  if (longPressTimer === null) return;
  const dx = x - longPressStartX, dy = y - longPressStartY;
  if (Math.hypot(dx, dy) > PRESS_CANCEL_PX) cancelPress();
}
function cancelPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}
function attachLongPress(element, card) {
  // Touch events first; fall back to mouse for desktop / dev tools.
  element.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startPress(card, t.clientX, t.clientY, e);
  }, { passive: true });
  element.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    movePress(t.clientX, t.clientY);
  }, { passive: true });
  element.addEventListener('touchend', cancelPress);
  element.addEventListener('touchcancel', cancelPress);
  element.addEventListener('mousedown', (e) => startPress(card, e.clientX, e.clientY, e));
  element.addEventListener('mousemove', (e) => movePress(e.clientX, e.clientY));
  element.addEventListener('mouseup', cancelPress);
  element.addEventListener('mouseleave', cancelPress);
  // Click suppression after long-press.
  element.addEventListener('click', (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);   // capture phase so we run before the existing onclick
}

// Pixel-art card popup. Built per the 80x112 frame spec, rendered at 4x
// scale (320x448 actual) inside the existing #cardPopup dimmer overlay.

// Helper: builds the "Repertoire" (Mercurial triggerPool) and "Built
// Ability" (Codex build_on_draw) HTML sections for a card's popup. Returns
// empty string if neither applies. Reads the SLOT (RUN.getSlots()[card.slotIdx]),
// not the card, because the slot is the durable record across saves and
// the slot's bonusTrigger may have updated more recently than the in-game
// card instance (e.g. just before a re-draw triggers makeCard).
function buildPopupTriggerSections(card) {
  if (typeof card.slotIdx !== 'number') return '';
  if (typeof RUN === 'undefined' || !RUN.getSlots) return '';
  const slots = RUN.getSlots();
  const slot = slots && slots[card.slotIdx];
  if (!slot) return '';
  let html = '';
  // Mercurial-style repertoire.
  if (Array.isArray(slot.triggerPool) && slot.triggerPool.length > 0) {
    const activeLabels = (card.triggers || []).map(t => t.label).filter(Boolean);
    const items = slot.triggerPool.map(entry => {
      const isActive = activeLabels.includes(entry.label);
      const styleAttr = isActive
        ? 'color:#ffe7a0;font-weight:bold;background:#3a2f1a;border-left:3px solid #ffd700;padding-left:6px'
        : 'color:#888;padding-left:9px';
      const marker = isActive ? '◆ ' : '○ ';
      return `<div style="${styleAttr};font-size:11px;line-height:1.5;padding:3px 6px;margin:2px 0">${marker}<b>${entry.label}:</b> ${entry.text || ''}</div>`;
    }).join('');
    html += `
      <div class="pop-stickers">
        <div class="pop-stickers-title" style="color:#ffd700">Repertoire</div>
        <div style="text-align:left">${items}</div>
      </div>`;
  }
  // Codex-style built ability.
  const tpl = CARDS[card.tplId];
  if (tpl && tpl.build_on_draw) {
    let body;
    if (slot.bonusTrigger) {
      const text = formatTriggerText(slot.bonusTrigger.text, card.name);
      body = `<div style="color:#ffe7a0;font-size:12px;line-height:1.5;padding:6px 8px;background:#1f1828;border-left:3px solid #ffd700;border-radius:3px">${text}</div>`;
    } else {
      body = `<div style="color:#888;font-size:11px;line-height:1.5;padding:6px 8px;background:#181820;border-left:3px solid #555;border-radius:3px;font-style:italic">No ability built yet — draw this card to build one.</div>`;
    }
    html += `
      <div class="pop-stickers">
        <div class="pop-stickers-title" style="color:#ffd700">Built Ability</div>
        ${body}
      </div>`;
  }
  return html;
}

function openCardPopup(card) {
  const popup = document.getElementById('cardPopup');
  const inner = document.getElementById('cardPopupCard');

  // Shared display values (cost pips, art, oracle, stickers, P/T, type).
  // Popup always shows base cost (inHand:false) — there's no "cast" to
  // tax in popup context, so the effective-cost ↑ marker doesn't apply.
  const vm = cardToViewModel(card);
  const ptInner = vm.isCreature ? `<div class="frame-pt">${vm.pow}/${vm.tou}</div>` : '';

  // Repertoire (Mercurial) and Built Ability (Codex) sections appear
  // below the frame for cards that need them. Constrained to the frame's
  // 320px width so they line up visually with the card above.
  const extraSections = buildPopupTriggerSections(card);
  const extrasHtml = extraSections
    ? `<div style="width:320px;margin:8px auto 0;text-align:left">${extraSections}</div>`
    : '';

  // Strip the modal-box chrome from #cardPopupCard -- the frame IS the
  // visual now, no need for the box styling.
  inner.className = '';
  inner.style.cssText = 'background:transparent;border:none;box-shadow:none;padding:0;width:auto;max-width:none;text-align:center;cursor:default';
  inner.innerHTML = `
    <div class="card-frame in-popup col-${vm.colorKey}" style="--scale: 4">
      <div class="frame-title">
        <div class="frame-name">${escapeHtml(card.name || '')}</div>
        <div class="frame-cost">${vm.pipsHtml}</div>
      </div>
      <div class="frame-art">${vm.artInner}</div>
      <div class="frame-type">${escapeHtml(vm.typeText)}</div>
      <div class="frame-text">
        <div class="frame-oracle">${vm.oracleHtml}</div>
        ${vm.stickersInner ? '<div class="frame-stickers">' + vm.stickersInner + '</div>' : ''}
      </div>
      ${ptInner}
    </div>
    ${extrasHtml}
  `;
  popup.classList.add('vis');
}

function closeCardPopup(e) {
  // Only close if the click is on the dimmer itself, not on the card content.
  if (e && e.target.id !== 'cardPopup') return;
  document.getElementById('cardPopup').classList.remove('vis');
}

// Zone viewer — opens a modal listing every card in the named zone for the
// named player. Click a card row to drill in and see full text via the
// existing card popup. Library is closed information for both players —
// you don't peek at your own library either, since drawing order matters
// to deck construction skill (knowing the next 5 cards trivializes
// sequencing decisions). Only graveyard and exile are viewable.
function openZone(who, zone) {
  // Library is closed info — never viewable, even your own.
  if (zone === 'library') return;
  const G = ENGINE.state();
  if (!G || !G[who]) return;
  const cards = G[who][zone] || [];
  const titleEl = document.getElementById('zoneTitle');
  const listEl = document.getElementById('zoneList');
  const ZONE_LABELS = {graveyard:'GRAVEYARD', exile:'EXILE'};
  const playerLabel = (who === 'you') ? 'YOUR' : (G.opp.name || 'OPP') + "'S";
  titleEl.textContent = `${playerLabel} ${ZONE_LABELS[zone] || zone.toUpperCase()} — ${cards.length}`;
  listEl.innerHTML = '';
  if (cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'zone-empty';
    empty.textContent = '(empty)';
    listEl.appendChild(empty);
  } else {
    // Graveyard and exile are shown newest → oldest (top of pile first),
    // which matches MtG conventions where the most recent addition sits
    // on top and is most visually prominent.
    const display = cards.slice().reverse();
    for (const card of display) {
      const btn = document.createElement('div');
      btn.className = 'zone-card';
      // Show card name with a small color/type hint.
      const typeHint = governingType(card) ? governingType(card).charAt(0) : '?';
      const cost = card.cost ? renderManaSymbols(formatCostBraced(card.cost)) : '';
      btn.innerHTML = `<span style="opacity:0.6">[${typeHint}]</span> <span class="card-name"></span>${cost ? ' <span style="opacity:0.7;font-size:10px">' + cost + '</span>' : ''}`;
      btn.querySelector('.card-name').textContent = card.name;
      btn.onclick = () => openCardPopup(card);
      listEl.appendChild(btn);
    }
  }
  Modal.show('zoneModal');
}

function closeZone(e) {
  if (e && e.target && e.target.id !== 'zoneModal' && e.target.id !== 'zoneCloseBtn') return;
  Modal.hide('zoneModal');
}

function toggleLog() {
  document.getElementById('sidebar').classList.toggle('vis');
}

// Color picker modal for tapping a dual-typed land. `colors` is the list
// of producible colors to offer (already filtered to legal). `onPick` is
// invoked with the chosen color string. Tapping the dimmer cancels.
function showManaColorPicker(card, colors, onPick) {
  const COLOR_INFO = {
    W: { bg:'#fffbcc', fg:'#7a5a00',  label:'White ({W})' },
    U: { bg:'#cce0ff', fg:'#1a3a7a',  label:'Blue ({U})' },
    B: { bg:'#cccccc', fg:'#1a1a1a',  label:'Black ({B})' },
    R: { bg:'#ffcccc', fg:'#7a1a1a',  label:'Red ({R})' },
    G: { bg:'#ccffcc', fg:'#1a5a1a',  label:'Green ({G})' },
  };
  const dimmer = document.createElement('div');
  dimmer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:1300;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1a1a26;border:2px solid #5a5a7a;border-radius:10px;padding:18px 16px;text-align:center;font-family:Georgia,serif;max-width:300px;width:100%';
  const title = document.createElement('div');
  title.style.cssText = 'color:#ffe7a0;font-size:14px;font-weight:bold;margin-bottom:4px';
  title.textContent = 'Tap ' + card.name + ' for:';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#aaa;font-size:11px;margin-bottom:14px;font-style:italic';
  sub.textContent = 'Choose a color to add to your mana pool.';
  box.appendChild(title);
  box.appendChild(sub);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap';
  for (const color of colors) {
    const info = COLOR_INFO[color] || { bg:'#888', fg:'#000', label: color };
    const b = document.createElement('button');
    b.textContent = info.label;
    b.style.cssText = `background:${info.bg};color:${info.fg};border:1px solid #444;border-radius:5px;padding:8px 14px;font-size:13px;font-weight:bold;cursor:pointer;font-family:inherit`;
    b.onclick = () => {
      document.body.removeChild(dimmer);
      onPick(color);
    };
    btnRow.appendChild(b);
  }
  box.appendChild(btnRow);
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'margin-top:14px;background:#222;color:#aaa;border:1px solid #444;border-radius:5px;padding:6px 12px;font-size:11px;cursor:pointer;font-family:inherit';
  cancel.onclick = () => document.body.removeChild(dimmer);
  box.appendChild(cancel);
  dimmer.appendChild(box);
  // Click outside the box to cancel.
  dimmer.addEventListener('click', (e) => {
    if (e.target === dimmer) document.body.removeChild(dimmer);
  });
  document.body.appendChild(dimmer);
}

// Ability picker modal — for cards with multiple activatable abilities
// (the common case being a creature+land staple where the creature has an
// existing ability and the staple appended a "tap for mana" ability).
// `options` is an array of {label, onPick} objects. The picker shows each
// as a button; clicking invokes the onPick callback. Tapping the dimmer
// cancels. v1.0.64.
function showAbilityPicker(card, options) {
  const dimmer = document.createElement('div');
  dimmer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:1300;padding:24px';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1a1a26;border:2px solid #5a5a7a;border-radius:10px;padding:18px 16px;text-align:center;font-family:Georgia,serif;max-width:340px;width:100%';
  const title = document.createElement('div');
  title.style.cssText = 'color:#ffe7a0;font-size:14px;font-weight:bold;margin-bottom:4px';
  title.textContent = card.name;
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#aaa;font-size:11px;margin-bottom:14px;font-style:italic';
  sub.textContent = 'Choose an ability to activate.';
  box.appendChild(title);
  box.appendChild(sub);
  const btnCol = document.createElement('div');
  btnCol.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  for (const opt of options) {
    const b = document.createElement('button');
    // Picker labels can carry {T}/{W}/etc. brace tokens (e.g. "Tap for
    // {W}", "{T}: Draw 1"). Route through renderManaSymbols so the
    // pips render instead of literal {X} text.
    b.innerHTML = renderManaSymbols(escapeHtml(opt.label));
    b.style.cssText = 'background:#2a2a36;color:#ddd;border:1px solid #555;border-radius:5px;padding:10px 12px;font-size:12px;cursor:pointer;font-family:inherit;text-align:left';
    b.onclick = () => {
      document.body.removeChild(dimmer);
      opt.onPick();
    };
    btnCol.appendChild(b);
  }
  box.appendChild(btnCol);
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'margin-top:14px;background:#222;color:#aaa;border:1px solid #444;border-radius:5px;padding:6px 12px;font-size:11px;cursor:pointer;font-family:inherit';
  cancel.onclick = () => document.body.removeChild(dimmer);
  box.appendChild(cancel);
  dimmer.appendChild(box);
  dimmer.addEventListener('click', (e) => {
    if (e.target === dimmer) document.body.removeChild(dimmer);
  });
  document.body.appendChild(dimmer);
}
// Toggles a fullscreen overlay with summary numbers, top/bottom cards, and
// export/clear actions.
function toggleStats() {
  const m = document.getElementById('statsModal');
  const isOpen = m.style.display === 'flex';
  if (isOpen) { m.style.display = 'none'; return; }
  renderStatsContent();
  m.style.display = 'flex';
}

// Module-level state for stats screen UI: which tables are expanded
// to show their full row count (vs the default top-N truncation).
// Keyed by a stable table id. Persists across renders within a session
// but resets on reload — that's fine since the screen is always re-renderable.
const STATS_UI = {
  expanded: {},
};

// Table metadata for tables that support copy + show-all. Each entry:
//   id      — unique stable id used for STATS_UI.expanded keying and DOM ids
//   defaultN — how many rows to show when collapsed (top-N)
//   columns — list of {key, header, fmt(row)} for both TSV and HTML rendering
// Defined inline in renderStatsContent below.

// Render a table with toolbar. Toolbar has: copy-as-TSV button, show-all toggle.
// rows are pre-sorted; we slice to defaultN unless expanded.
function renderTableWithToolbar(opts) {
  const { id, title, subtitle, rows: allRows, color, columns, defaultN } = opts;
  if (!allRows.length) return `<div style="color:#666;font-size:10px;font-style:italic">${title}: no data yet</div>`;

  const expanded = !!STATS_UI.expanded[id];
  const visibleRows = expanded ? allRows : allRows.slice(0, defaultN);
  const canExpand = allRows.length > defaultN;

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px;gap:8px;flex-wrap:wrap">`;
  html += `<div style="color:${color};font-size:10px;font-weight:bold;letter-spacing:.1em">${title.toUpperCase()}</div>`;
  html += `<div style="display:flex;gap:4px">`;
  html += `<button onclick="CONTROLLER.copyTableAsTsv('${id}')" style="background:#1a2a3a;border:1px solid #335;color:#88ccff;font-size:9px;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit">copy</button>`;
  if (canExpand) {
    html += `<button onclick="CONTROLLER.toggleStatsTable('${id}')" style="background:#1a1a2a;border:1px solid #335;color:#aaa;font-size:9px;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit">${expanded ? 'show top ' + defaultN : 'show all (' + allRows.length + ')'}</button>`;
  }
  html += `</div></div>`;

  if (subtitle) {
    html += `<div style="color:#666;font-size:9px;margin-bottom:4px;font-style:italic">${subtitle}</div>`;
  }

  // Hidden textarea holding the TSV form, used by copyTableAsTsv. We
  // render the full data here, not just the visible slice — copying always
  // copies everything regardless of show-all state. The textarea has
  // position:absolute + opacity:0 so it doesn't take layout space.
  // Columns may define a separate `tsvFmt` if their `fmt` returns HTML
  // (e.g., the color-combo column renders pip badges in HTML but should
  // emit plain text in the TSV).
  const tsv = [
    columns.map(c => c.header).join('\t'),
    ...allRows.map(r => columns.map(c => (c.tsvFmt || c.fmt)(r)).join('\t')),
  ].join('\n');
  // HTML-escape the TSV before putting it in the textarea value attribute.
  // (Less critical since textarea content isn't parsed as HTML, but the
  // attribute does need escaping for &, <, >, ", '.)
  const escapeAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  html += `<textarea id="statsTsv-${id}" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" aria-hidden="true">${escapeAttr(tsv)}</textarea>`;

  // The actual visible table.
  const gridCols = columns.map(c => c.width || '1fr').join(' ');
  html += '<div style="background:#0a0a14;border-radius:3px;overflow:hidden">';
  html += `<div style="display:grid;grid-template-columns:${gridCols};gap:5px;padding:5px 8px;background:#181828;font-size:9px;color:#888;letter-spacing:.05em">`;
  for (const c of columns) {
    const align = c.align === 'right' ? 'text-align:right' : '';
    html += `<div style="${align}"${c.title ? ' title="' + c.title + '"' : ''}>${c.header}</div>`;
  }
  html += `</div>`;
  for (const r of visibleRows) {
    html += `<div style="display:grid;grid-template-columns:${gridCols};gap:5px;padding:4px 8px;font-size:10px;border-top:1px solid #1a1a2a">`;
    for (const c of columns) {
      const align = c.align === 'right' ? 'text-align:right;' : '';
      // Per-column color: explicit `c.color`, or `c.colorize(row, tableColor)`
      // (used when a particular column should take the table's accent color),
      // else neutral grey. The first column (typically NAME) defaults to a
      // brighter readable color.
      let cellColor;
      if (c.colorize) cellColor = c.colorize(r, color);
      else if (c.color) cellColor = c.color;
      else if (c.key === 'name' || c.key === 'combo') cellColor = '#ddd';
      else cellColor = '#aaa';
      const v = c.fmt(r);
      html += `<div style="${align}color:${cellColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</div>`;
    }
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

// Toggle the expanded state of a table and re-render the stats panel.
function toggleStatsTable(id) {
  STATS_UI.expanded[id] = !STATS_UI.expanded[id];
  renderStatsContent();
}

// Copy the full TSV for a table to the clipboard. Tries the modern
// Clipboard API first (faster, less fragile), falls back to execCommand
// on a hidden textarea — that's what works in the Claude in-app browser
// sandbox where Permissions-Policy blocks the modern API.
function copyTableAsTsv(id) {
  const ta = document.getElementById('statsTsv-' + id);
  if (!ta) return;
  copyTextToClipboard(ta.value, `button[onclick="CONTROLLER.copyTableAsTsv('${id}')"]`);
}

// Copy `text` to the clipboard via whichever path works. Tries the modern
// Clipboard API first, then falls back to execCommand on a temporary
// textarea — the legacy DOM path isn't gated by Permissions-Policy
// (which blocks the modern API in the Claude in-app browser sandbox).
// `btnSelector` is a CSS selector for the button that triggered the copy;
// we flash success/failure feedback on that button.
function copyTextToClipboard(text, btnSelector) {
  const finish = (ok) => flashCopyButton(btnSelector, ok);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => finish(true),
      () => fallbackCopyText(text, finish)
    );
  } else {
    fallbackCopyText(text, finish);
  }
}

function fallbackCopyText(text, finish) {
  // Build a throwaway textarea, select, execCommand('copy'), then remove.
  // This works in iframe sandboxes where the modern Clipboard API is
  // Permissions-Policy-blocked but the legacy execCommand path isn't.
  const ta = document.createElement('textarea');
  ta.value = text;
  // Has to be in the DOM and focusable to work. Position off-screen but
  // still rendered — opacity:0 + fixed-position works on most mobile browsers.
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  finish(ok);
}

function flashCopyButton(selector, ok) {
  const btn = document.querySelector(selector);
  if (!btn) return;
  const orig = btn.textContent;
  const origColor = btn.style.color || '#88ccff';
  btn.textContent = ok ? 'copied!' : 'copy failed';
  btn.style.color = ok ? '#aaffaa' : '#ff8888';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.color = origColor;
  }, 1400);
}

// Dump drafts[startIdx..endIdx) as TSV: draft_id, pick_n, picked, offered,
// colors_so_far, final_colors, result, games. colors_so_far is recomputed
// per pick (picklog only stores final); "committed" = ≥2 cards of color.
function buildDraftsBatchTsv(drafts, startIdx, endIdx) {
  const lines = ['draft_id\tpick_n\tpicked\toffered\tcolors_so_far\tfinal_colors\tresult\tgames'];
  for (let i = startIdx; i < endIdx && i < drafts.length; i++) {
    const d = drafts[i];
    const draftId = i + 1;
    const finalColors = (Array.isArray(d.colors) && d.colors.length)
      ? d.colors.slice().sort().join('')
      : '';
    const result = d.result || '';
    const games = d.gamesPlayed || 0;
    // Running color tally as we walk picks. A color is "committed" once
    // we've picked ≥2 cards of that color — same threshold the draft UI
    // uses elsewhere. (DRAFT.summarizeColors is a similar idea but uses a
    // 1+ threshold, so the two aren't interchangeable.)
    const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    const committedSoFar = () => Object.entries(colorCounts)
      .filter(([, n]) => n >= 2)
      .map(([c]) => c)
      .sort()
      .join('');
    (d.picks || []).forEach((p, pickIdx) => {
      const pickN = pickIdx + 1;
      const before = committedSoFar();
      // Tally THIS pick's colors AFTER reading the "before" state, so the
      // colors_so_far column reflects what was committed when this pick
      // was being made.
      const pickedName = nameOf(p.picked);
      const offeredNames = (p.offered || []).map(nameOf).join('|');
      lines.push([
        draftId,
        pickN,
        pickedName,
        offeredNames,
        before || '—',
        finalColors || '—',
        result,
        games,
      ].join('\t'));
      // Now update the tally with this pick. Spells: count colored cost keys
      // (C is colorless, doesn't commit). Lands: `mana` field commits.
      const pickedTpl = CARDS[p.picked];
      if (pickedTpl) {
        if (pickedTpl.cost) {
          for (const ch of Object.keys(pickedTpl.cost)) {
            if (colorCounts.hasOwnProperty(ch)) colorCounts[ch]++;
          }
        }
        if (pickedTpl.mana) {
          for (const ch of String(pickedTpl.mana)) {
            if (colorCounts.hasOwnProperty(ch)) colorCounts[ch]++;
          }
        }
      }
    });
  }
  return lines.join('\n');
}

function nameOf(tplId) {
  if (!tplId) return '';
  return (CARDS[tplId] && CARDS[tplId].name) || tplId;
}

// Click handler: builds and copies one batch.
function copyDraftsBatch(startIdx, endIdx) {
  const data = PICKLOG.exportData();
  const drafts = data.drafts || [];
  const tsv = buildDraftsBatchTsv(drafts, startIdx, endIdx);
  const selector = `button[onclick="CONTROLLER.copyDraftsBatch(${startIdx},${endIdx})"]`;
  copyTextToClipboard(tsv, selector);
}

function renderStatsContent() {
  const data = PICKLOG.exportData();
  const drafts = data.drafts || [];
  const totalGames = drafts.reduce((s, d) => s + (d.gamesPlayed || 0), 0);
  const losses = drafts.filter(d => d.result === 'lost').length;

  // Per-card stats: pickRate (picks/offers), pickOverRate (head-to-head pick
  // rate from pairs matrix), avgRunGames (avg games of drafts containing this
  // card — proxy for deck strength), avgPickPos (1-based pick number),
  // offerCount, pickInDraftsContainingCard (sample size for avgRunGames).
  const stats = PICKLOG.getCardStats();
  const runLengthsByCard = {};   // tplId -> [gamesPlayed of each draft containing it]
  const pickPositionsByCard = {};   // tplId -> [pick numbers, 1-based, when picked]
  for (const d of drafts) {
    const seen = new Set();
    (d.picks || []).forEach((p, i) => {
      const id = p.picked;
      if (!pickPositionsByCard[id]) pickPositionsByCard[id] = [];
      pickPositionsByCard[id].push(i + 1);
      seen.add(id);
    });
    // For each unique card in this draft, record the draft's game length.
    for (const id of seen) {
      if (!runLengthsByCard[id]) runLengthsByCard[id] = [];
      runLengthsByCard[id].push(d.gamesPlayed || 0);
    }
  }

  const rows = Object.entries(stats)
    .filter(([, s]) => s.offers >= 3)
    .map(([id, s]) => {
      const runs = runLengthsByCard[id] || [];
      const positions = pickPositionsByCard[id] || [];
      const avgRunGames = runs.length > 0
        ? runs.reduce((a, b) => a + b, 0) / runs.length
        : null;
      const avgPickPos = positions.length > 0
        ? positions.reduce((a, b) => a + b, 0) / positions.length
        : null;
      return {
        id,
        name: (CARDS[id] && CARDS[id].name) || id,
        picks: s.picks,
        offers: s.offers,
        pickRate: s.pickRate,
        pickOverRate: s.winRate,        // renamed in the UI; same number
        avgRunGames,                     // null if never picked
        avgPickPos,                      // null if never picked
        runSampleSize: runs.length,
      };
    });

  // Top/bottom by avg run length of drafts containing the card. This is
  // the closest thing to "deck performance per card" we can compute without
  // an actual win condition. Filter to ≥3 picks so the avg isn't noisy.
  const rowsWithRunData = rows
    .filter(r => r.avgRunGames != null && r.runSampleSize >= 3)
    .sort((a, b) => (b.avgRunGames || 0) - (a.avgRunGames || 0));

  const summary = `
    <div style="background:#1a1a2a;border-radius:4px;padding:8px 10px;margin-bottom:10px;font-size:11px">
      <div><span style="color:#888">Drafts logged:</span> <span style="color:#ffd700">${drafts.length}</span></div>
      <div><span style="color:#888">Games played:</span> <span style="color:#ffd700">${totalGames}</span></div>
      <div><span style="color:#888">Runs ended:</span> <span style="color:#ff8888">${losses}</span> <span style="color:#666;font-size:10px">(no win condition yet)</span></div>
      <div><span style="color:#888">Cards with ≥3 offers:</span> <span style="color:#ffd700">${rows.length}</span></div>
    </div>
  `;

  // Column definitions for the run-length tables (used by Top/Bottom/Overlooked).
  // Use `colorize` to make the RUN-LEN column take the table's accent color
  // (green for Top, red for Bottom) — this makes it pop visually as the
  // primary metric.
  const runLenColumns = [
    { key: 'name', header: 'NAME', fmt: r => r.name, width: '1fr' },
    { key: 'runLen', header: 'RUN-LEN', fmt: r => r.avgRunGames != null ? r.avgRunGames.toFixed(1) : '—', align: 'right', width: '52px', title: 'Avg games of drafts containing this card', colorize: (r, tableColor) => tableColor },
    { key: 'pickPct', header: 'PICK%', fmt: r => r.pickRate != null ? Math.round(r.pickRate * 100) + '%' : '—', align: 'right', width: '50px', title: 'Picks divided by offers' },
    { key: 'avgPos', header: 'AVG POS', fmt: r => r.avgPickPos != null ? r.avgPickPos.toFixed(1) : '—', align: 'right', width: '54px', title: 'Avg pick number (1-23) when picked' },
    { key: 'sample', header: 'N', fmt: r => String(r.runSampleSize), align: 'right', width: '28px', title: 'Sample size (drafts containing this card)' },
  ];

  // Sort descending for top, reversed-asc for bottom. Bottom uses sliced
  // tail so the order is "worst first" within the visible slice.
  const topByRun = rowsWithRunData;                              // already sorted desc
  const botByRun = rowsWithRunData.slice().reverse();            // ascending = worst first

  const empty = drafts.length === 0
    ? '<div style="color:#888;text-align:center;padding:20px;font-style:italic">No drafts logged yet. Pick cards in the draft screen to start building data.</div>'
    : '';

  document.getElementById('statsContent').innerHTML =
    summary + empty
    + renderTableWithToolbar({
        id: 'topByRun',
        title: 'Top by run length',
        subtitle: 'Drafts containing these cards lasted longest. Real deck-strength signal.',
        rows: topByRun,
        color: '#88ee88',
        columns: runLenColumns,
        defaultN: 10,
      })
    + renderTableWithToolbar({
        id: 'botByRun',
        title: 'Bottom by run length',
        subtitle: 'Drafts containing these cards ended fastest. Weak inclusions or symptom-of-bad-deck cards.',
        rows: botByRun,
        color: '#ff8888',
        columns: runLenColumns,
        defaultN: 10,
      })
    + insightsHtml(drafts, rows);
}

// Build the "Insights" section: color combos, loss histogram, overlooked
// cards, pick-position bias, pick rivalry. Most tables route through
// renderTableWithToolbar so they get per-table copy + show-all toggles —
// the per-table copy is small enough to fit in the in-app browser
// clipboard even when the full picklog JSON export is too big.
function insightsHtml(drafts, perCardRows) {
  if (drafts.length === 0) return '';
  let html = '';

  // ── Color combinations ────────────────────────────────────────
  const comboStats = {};
  for (const d of drafts) {
    const cols = Array.isArray(d.colors) && d.colors.length
      ? d.colors.slice().sort().join('')
      : '(unknown)';
    if (!comboStats[cols]) comboStats[cols] = { drafts: 0, games: 0 };
    comboStats[cols].drafts++;
    comboStats[cols].games += d.gamesPlayed || 0;
  }
  const comboRows = Object.entries(comboStats)
    .map(([combo, s]) => ({
      combo,
      drafts: s.drafts,
      games: s.games,
      avgGamesPerDraft: s.drafts > 0 ? (s.games / s.drafts) : 0,
    }))
    .sort((a, b) => (b.avgGamesPerDraft || 0) - (a.avgGamesPerDraft || 0));

  if (comboRows.length > 0) {
    html += renderTableWithToolbar({
      id: 'colorCombos',
      title: 'Color combos — avg games per draft',
      subtitle: "More games = run lasted longer. Compare combos to see what's surviving.",
      rows: comboRows,
      color: '#88ccff',
      // The combo column renders pretty pip badges in HTML but we want
      // the TSV to be readable plain text. Pass the raw combo string for
      // both — the renderer just dumps fmt() into a div, so we use a
      // custom rendering for HTML by checking the combo string.
      // Slightly hacky but keeps the renderer simple.
      columns: [
        {
          key: 'combo',
          header: 'COMBO',
          fmt: r => r.combo === '(unknown)'
            ? '<span style="color:#666;font-style:italic">unknown</span>'
            : r.combo.split('').map(c => `<span class="draft-pip col-${c}" style="padding:0 4px;font-size:10px">${c}</span>`).join(' '),
          // Override TSV format so we don't get HTML in the copied output.
          tsvFmt: r => r.combo,
          width: '1fr',
        },
        { key: 'drafts', header: 'DRAFTS', fmt: r => String(r.drafts), align: 'right', width: '54px' },
        { key: 'avgGames', header: 'AVG GAMES', fmt: r => r.avgGamesPerDraft.toFixed(1), align: 'right', width: '74px', colorize: (r, tableColor) => tableColor },
      ],
      defaultN: 12,
    });
  }

  // ── Game-number-when-lost histogram ────────────────────────────
  // Not a regular table; keep the bar-chart rendering inline. We do
  // build a TSV-style copy button below it though, since the data is
  // small and worth being able to share.
  const lossDist = {};
  let totalLosses = 0;
  let totalLossGames = 0;
  for (const d of drafts) {
    if (d.result !== 'lost') continue;
    const g = d.gamesPlayed || 0;
    lossDist[g] = (lossDist[g] || 0) + 1;
    totalLosses++;
    totalLossGames += g;
  }
  if (totalLosses > 0) {
    const avgLossGame = (totalLossGames / totalLosses).toFixed(1);
    const games = Object.keys(lossDist).map(Number).sort((a, b) => a - b);
    const maxCount = Math.max(...Object.values(lossDist));
    // TSV form for the copy button.
    const lossTsv = ['GAME\tLOSSES', ...games.map(g => `${g}\t${lossDist[g]}`)].join('\n');
    const escapeAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px;gap:8px;flex-wrap:wrap">`;
    html += `<div style="color:#ff8888;font-size:10px;font-weight:bold;letter-spacing:.1em">LOSSES BY GAME #</div>`;
    html += `<button onclick="CONTROLLER.copyTableAsTsv('lossHist')" style="background:#1a2a3a;border:1px solid #335;color:#88ccff;font-size:9px;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit">copy</button>`;
    html += `</div>`;
    html += `<div style="color:#666;font-size:9px;margin-bottom:4px;font-style:italic">When did losses happen? Avg loss at game ${avgLossGame} (${totalLosses} loss${totalLosses === 1 ? '' : 'es'} total).</div>`;
    html += `<textarea id="statsTsv-lossHist" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" aria-hidden="true">${escapeAttr(lossTsv)}</textarea>`;
    html += '<div style="background:#0a0a14;border-radius:3px;padding:6px 8px;display:flex;flex-direction:column;gap:3px">';
    for (const g of games) {
      const count = lossDist[g];
      const barWidth = Math.round((count / maxCount) * 100);
      html += `<div style="display:flex;align-items:center;gap:6px;font-size:10px">
        <div style="width:48px;color:#aaa">Game ${g}</div>
        <div style="flex:1;background:#1a0a14;border-radius:2px;overflow:hidden;height:14px">
          <div style="background:#cc4444;height:100%;width:${barWidth}%"></div>
        </div>
        <div style="width:24px;text-align:right;color:#ddd">${count}</div>
      </div>`;
    }
    html += '</div>';
  }

  // ── Overlooked: high run-length, low pick rate ─────────────────
  const cardsWithRun = perCardRows.filter(r => r.avgRunGames != null && r.runSampleSize >= 3);
  if (cardsWithRun.length > 0) {
    const meanRun = cardsWithRun.reduce((s, r) => s + r.avgRunGames, 0) / cardsWithRun.length;
    const overlooked = cardsWithRun
      .filter(r => r.avgRunGames > meanRun * 1.15 && r.pickRate != null && r.pickRate < 0.4)
      .sort((a, b) => (b.avgRunGames || 0) - (a.avgRunGames || 0));
    if (overlooked.length > 0) {
      html += renderTableWithToolbar({
        id: 'overlooked',
        title: 'Overlooked ★ — long runs, low pick%',
        subtitle: `Drafts containing these last ${(meanRun * 1.15).toFixed(1)}+ games (vs ${meanRun.toFixed(1)} avg), but you pick them under 40%. Consider grabbing them more.`,
        rows: overlooked,
        color: '#ffaa44',
        columns: [
          { key: 'name', header: 'NAME', fmt: r => r.name, width: '1fr' },
          { key: 'runLen', header: 'RUN-LEN', fmt: r => r.avgRunGames.toFixed(1), align: 'right', width: '54px', colorize: (r, tableColor) => tableColor },
          { key: 'pickPct', header: 'PICK%', fmt: r => Math.round(r.pickRate * 100) + '%', align: 'right', width: '50px' },
          { key: 'avgPos', header: 'AVG POS', fmt: r => r.avgPickPos != null ? r.avgPickPos.toFixed(1) : '—', align: 'right', width: '54px' },
          { key: 'sample', header: 'N', fmt: r => String(r.runSampleSize), align: 'right', width: '28px' },
        ],
        defaultN: 10,
      });
    }
  }

  // ── Pick-position bias ─────────────────────────────────────────
  const cardsWithPos = perCardRows.filter(r => r.avgPickPos != null && r.picks >= 3);
  if (cardsWithPos.length > 0) {
    const earliest = cardsWithPos.slice().sort((a, b) => a.avgPickPos - b.avgPickPos);
    const latest = cardsWithPos.slice().sort((a, b) => b.avgPickPos - a.avgPickPos);
    const posColumns = [
      { key: 'name', header: 'NAME', fmt: r => r.name, width: '1fr' },
      { key: 'avgPos', header: 'AVG POS', fmt: r => r.avgPickPos.toFixed(1), align: 'right', width: '54px', colorize: (r, tableColor) => tableColor },
      { key: 'picks', header: 'PICKS', fmt: r => String(r.picks), align: 'right', width: '46px' },
    ];
    html += renderTableWithToolbar({
      id: 'pickPosEarliest',
      title: 'Pick priority — earliest',
      subtitle: 'Avg pick number (1-23) when picked. Cards you reach for first when you see them.',
      rows: earliest,
      color: '#aaccff',
      columns: posColumns,
      defaultN: 10,
    });
    html += renderTableWithToolbar({
      id: 'pickPosLatest',
      title: 'Pick priority — latest',
      subtitle: 'Cards you tend to grab only when nothing else is left.',
      rows: latest,
      color: '#aaccff',
      columns: posColumns,
      defaultN: 10,
    });
  }

  // ── Pick-rivalry table ─────────────────────────────────────────
  const rivalryRows = perCardRows
    .filter(r => r.pickOverRate != null && r.offers >= 5)
    .sort((a, b) => (b.pickOverRate || 0) - (a.pickOverRate || 0));
  if (rivalryRows.length >= 5) {
    const rivColumns = [
      { key: 'name', header: 'NAME', fmt: r => r.name, width: '1fr' },
      { key: 'pickPct', header: 'PICK%', fmt: r => Math.round((r.pickRate || 0) * 100) + '%', align: 'right', width: '50px' },
      { key: 'prefPct', header: 'PREF%', fmt: r => Math.round(r.pickOverRate * 100) + '%', align: 'right', width: '50px', colorize: (r, tableColor) => tableColor },
      { key: 'offers', header: 'OFF', fmt: r => String(r.offers), align: 'right', width: '34px' },
    ];
    html += renderTableWithToolbar({
      id: 'rivalryMost',
      title: 'Pick rivalry — most preferred',
      subtitle: 'Head-to-head: when offered alongside other cards, how often you chose this one. Pure draft instinct.',
      rows: rivalryRows,
      color: '#cc99ff',
      columns: rivColumns,
      defaultN: 8,
    });
    html += renderTableWithToolbar({
      id: 'rivalryLeast',
      title: 'Pick rivalry — least preferred',
      subtitle: 'Cards you systematically pass on when offered alongside others.',
      rows: rivalryRows.slice().reverse(),
      color: '#cc99ff',
      columns: rivColumns,
      defaultN: 8,
    });
  }

  // Raw draft batches: pick-by-pick data, ~20KB chunks for clipboard transport
  // (Claude in-app browser truncates around 18-20KB). 10 drafts/batch ≈ 16KB.
  if (drafts.length > 0) {
    const BATCH_SIZE = 10;
    const numBatches = Math.ceil(drafts.length / BATCH_SIZE);
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px;gap:8px;flex-wrap:wrap">`;
    html += `<div style="color:#ffaa66;font-size:10px;font-weight:bold;letter-spacing:.1em">RAW DRAFTS — BY BATCH</div>`;
    html += `</div>`;
    html += `<div style="color:#666;font-size:9px;margin-bottom:6px;font-style:italic">Pick-by-pick TSV. One row per pick: draft_id, pick_n, picked, offered (3 cards, pipe-joined), colors_so_far, final_colors, result, games. Each batch ≈ ${BATCH_SIZE} drafts. Size shown on button — if it shows "copied!" but pasting truncates, batch is too big for clipboard transport.</div>`;
    html += `<div style="background:#0a0a14;border-radius:3px;padding:8px;display:flex;flex-wrap:wrap;gap:6px">`;
    for (let b = 0; b < numBatches; b++) {
      const startIdx = b * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, drafts.length);
      const startId = startIdx + 1;
      const endId = endIdx;
      // Pre-compute approximate batch size so the user knows what they're
      // about to copy. This is an estimate; the actual TSV may be slightly
      // larger or smaller depending on card name lengths.
      const batchTsv = buildDraftsBatchTsv(drafts, startIdx, endIdx);
      const sizeKb = (batchTsv.length / 1024).toFixed(1);
      html += `<button onclick="CONTROLLER.copyDraftsBatch(${startIdx},${endIdx})" style="background:#1a2218;border:1px solid #4a5a3a;color:#ccddaa;font-size:10px;padding:5px 10px;border-radius:3px;cursor:pointer;font-family:inherit">drafts ${startId}–${endId} (${sizeKb}KB)</button>`;
    }
    html += `</div>`;
  }

  return html;
}

function statsExport() {
  // Claude in-app browser blocks Clipboard API (Permissions-Policy) and
  // sandboxed downloads. Reliable path: textarea + execCommand('copy').
  // For 200KB+ picklogs, also offers gzip+base64 (~10-20× compression).
  const data = PICKLOG.exportData();
  const jsonPretty = JSON.stringify(data, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `magiclike-picklog-${stamp}.json`;
  showStatsExportPicker(jsonPretty, filename);
}

// Gzip+base64 a string. Returns null if CompressionStream unavailable
// (Chrome 80+, FF 113+, Safari 16.4+ have it).
async function gzipBase64(str) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  // btoa works on latin-1; chunk the fromCharCode to avoid stack overflow.
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Modal that surfaces every working export path so the user can choose
// what works on their device. Buttons that aren't supported are hidden.
function showStatsExportPicker(jsonPretty, filename) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10001;
    display:flex;align-items:center;justify-content:center;padding:16px`;
  const box = document.createElement('div');
  box.style.cssText = `
    background:#161620;border:1px solid #444;border-radius:8px;padding:16px;
    max-width:420px;width:100%;display:flex;flex-direction:column;gap:10px`;

  const sizeKb = (jsonPretty.length / 1024).toFixed(1);
  const title = document.createElement('div');
  title.textContent = `Export stats (${sizeKb} KB)`;
  title.style.cssText = 'color:#ffd700;font-size:14px;font-weight:bold;letter-spacing:1px';
  box.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'color:#aaa;font-size:11px;line-height:1.5';
  subtitle.textContent =
    'The Claude in-app browser blocks several download paths. ' +
    'The compressed copy works in the sandbox; use it if your data is large.';
  box.appendChild(subtitle);

  const mkBtn = (label, hint, onClick) => {
    const b = document.createElement('button');
    b.style.cssText = `
      background:#222;border:1px solid #444;color:#ddd;padding:10px 14px;
      border-radius:5px;cursor:pointer;font-size:12px;font-family:inherit;
      text-align:left;line-height:1.5`;
    b.innerHTML = `<div class="btn-label" style="color:#88ccff;font-weight:bold"></div>` +
                  `<div class="btn-hint" style="color:#888;font-size:10px;margin-top:2px"></div>`;
    b.querySelector('.btn-label').textContent = label;
    b.querySelector('.btn-hint').textContent = hint;
    b.onclick = onClick;
    return b;
  };

  // Path 1: Compressed copy. Compresses to ~5-15% of original size, then
  // shows in textarea + tries execCommand('copy') for a one-tap copy.
  // This is the recommended path for large datasets in the in-app browser.
  if (typeof CompressionStream !== 'undefined') {
    box.appendChild(mkBtn(
      'Compressed copy ★',
      `Recommended. Compresses to ~10-20× smaller, copies via system clipboard.`,
      async () => {
        const b64 = await gzipBase64(jsonPretty);
        if (!b64) { alert('Compression failed.'); return; }
        const wrapped = `MAGICLIKE_PICKLOG_GZIP_B64:${b64}`;
        overlay.remove();
        showStatsExportTextarea(wrapped, /*compressed=*/true);
      }
    ));
  }

  // Path 2: Raw download. Desktop and some browsers honor it.
  box.appendChild(mkBtn(
    'Download as .json',
    'Direct file save. Works on desktop browsers; usually blocked in the in-app viewer.',
    () => {
      try {
        const blob = new Blob([jsonPretty], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        overlay.remove();
      } catch (err) {
        console.warn('Download failed:', err);
        alert('Download failed. Try Compressed copy instead.');
      }
    }
  ));

  // Path 3: Raw textarea. Last resort if compression isn't supported.
  box.appendChild(mkBtn(
    'Show as raw text',
    'Display full JSON for manual long-press → Select All → Copy. Slow for large data.',
    () => {
      overlay.remove();
      showStatsExportTextarea(jsonPretty, /*compressed=*/false);
    }
  ));

  // Cancel.
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = `
    background:transparent;border:1px solid #555;color:#888;padding:8px 14px;
    border-radius:4px;cursor:pointer;font-size:11px;margin-top:4px`;
  cancel.onclick = () => overlay.remove();
  box.appendChild(cancel);

  overlay.appendChild(box);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// Last-resort fallback: show the JSON in a modal textarea so the user can
// long-press → select all → copy manually. Used only when both Clipboard
// API and blob downloads have failed.
function showStatsExportTextarea(payload, compressed) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10001;
    display:flex;align-items:center;justify-content:center;padding:16px`;
  const box = document.createElement('div');
  box.style.cssText = `
    background:#161620;border:1px solid #444;border-radius:8px;padding:14px;
    max-width:520px;width:100%;max-height:80vh;display:flex;flex-direction:column;gap:10px`;
  const sizeKb = (payload.length / 1024).toFixed(1);
  const title = document.createElement('div');
  title.style.cssText = 'color:#ddd;font-size:12px;line-height:1.5';
  title.innerHTML = compressed
    ? `<div style="color:#ffd700;font-weight:bold;margin-bottom:4px">Compressed picklog (${sizeKb} KB)</div>` +
      `Tap <b>Copy</b> below. If that fails, long-press the text → Select All → Copy. ` +
      `Then paste the whole block to Claude — including the prefix.`
    : `<div style="color:#ffd700;font-weight:bold;margin-bottom:4px">Raw picklog (${sizeKb} KB)</div>` +
      `Tap <b>Copy</b> below. If that fails, long-press the text → Select All → Copy.`;
  const ta = document.createElement('textarea');
  ta.value = payload;
  // Not readOnly — readOnly textareas sometimes refuse focus on mobile,
  // breaking execCommand('copy'). We keep it editable so selection works.
  ta.style.cssText = `
    width:100%;flex:1;min-height:200px;background:#0a0a10;color:#bbb;
    border:1px solid #333;border-radius:4px;padding:8px;font-family:monospace;
    font-size:11px;resize:none;word-break:break-all`;
  const status = document.createElement('div');
  status.style.cssText = 'color:#888;font-size:10px;min-height:14px';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px';
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.style.cssText = `
    background:#1a3a1a;border:1px solid #66bb6a;color:#aaffaa;padding:8px 16px;
    border-radius:4px;cursor:pointer;font-size:12px;flex:1`;
  copyBtn.onclick = () => {
    // execCommand('copy') uses the system clipboard via the legacy DOM
    // path, which (unlike the modern Clipboard API) is NOT gated by the
    // Permissions-Policy that the Claude in-app browser sets on artifact
    // iframes. So this works in the sandbox where navigator.clipboard
    // doesn't.
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);   // mobile-friendly select-all
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    status.style.color = ok ? '#aaffaa' : '#ff8888';
    status.textContent = ok
      ? `Copied ${sizeKb} KB. Paste it into the chat.`
      : 'Copy command not allowed. Long-press the text → Select All → Copy manually.';
  };
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.style.cssText = `
    background:#222;border:1px solid #444;color:#ddd;padding:8px 16px;
    border-radius:4px;cursor:pointer;font-size:12px`;
  close.onclick = () => overlay.remove();
  btnRow.appendChild(copyBtn);
  btnRow.appendChild(close);

  box.appendChild(title);
  box.appendChild(ta);
  box.appendChild(status);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // Auto-select for convenience on desktop. Mobile usually requires a tap.
  setTimeout(() => { ta.focus(); ta.select(); }, 50);
}

function statsClear() {
  if (!confirm('Wipe all draft history and stats? This cannot be undone.')) return;
  PICKLOG.clearAll();
  renderStatsContent();
}

function searchPick(cardIid) {
  submit({type: 'searchPick', cardIid});
}

function triggerBuildPick(choice) {
  submit({type: 'triggerBuildPick', choice});
}

function numberChoice(number) {
  submit({type: 'numberChoice', number});
}

function symmetricizeChoice(which) {
  submit({type: 'symmetricizeChoice', which});
}

function edictChoice(iid) {
  submit({type: 'edictChoice', iid});
}

function optionalCost(pay) {
  submit({type: 'optionalCost', pay});
}

function submit(action) {
  ENGINE.executeAction('you', action);
}

// Reset UI selections when phase changes so stale state doesn't bleed into the next turn.
function clearUiOnPhaseChange() {
  // Called from render(); cheap to do every frame.
  const G = ENGINE.state();
  if (G.phase !== 'COMBAT_ATTACK') uiAtk = [];
  if (G.phase !== 'COMBAT_BLOCK')  { uiBlk = new Map(); uiPickBlk = null; }
}

// Submit a chosen target through the right path — trigger pick or pending
// spell/ability cast. Exists so that out-of-IIFE code (notably the graveyard
// targeting modal in openZoneTargeting / submitGraveyardTarget below the
// CONTROLLER IIFE) doesn't have to touch IIFE-private state (submit,
// pendingTarget, buildPendingActionWithTarget). Mirrors the same routing
// logic clickStackTarget uses for in-game targets.
function submitTargetedAction(target) {
  const G = ENGINE.state();
  if (G.pendingTriggerTarget && G.pendingTriggerTarget.controller === 'you') {
    submit({type:'triggerTargetPick', target});
    return true;
  }
  if (pendingTarget) {
    const action = buildPendingActionWithTarget(target);
    if (action && ENGINE.isLegalAction('you', action)) {
      pendingTarget = null;
      submit(action);
      return true;
    }
  }
  return false;
}

return {
  init, gameOverClick, clickHand, clickBattlefield, clickStackTarget, clickPlayerTarget,
  closeCardPopup, attachLongPress,
  openZone, closeZone,
  cancelTarget, endTurn, passAction, doneDeclaring, concede, searchPick, triggerBuildPick, numberChoice, symmetricizeChoice, edictChoice, optionalCost, toggleLog,
  pickModalMode, cancelModalChoice,
  pendingModalChoice: () => pendingModalChoice,
  toggleStats, statsExport, statsClear,
  // Map navigation click handler — used by the map modal's clickable nodes.
  pickMapNodeClick,
  // Stats screen interactivity. Inline onclick handlers in the rendered
  // tables call these via CONTROLLER.* (functions live inside this IIFE
  // and aren't on window, so we have to expose them explicitly).
  toggleStatsTable, copyTableAsTsv, copyDraftsBatch,
  // Submit a target chosen from out-of-IIFE UI (graveyard targeting modal).
  submitTargetedAction,
  // Read accessors for UI
  pendingTarget: () => pendingTarget,
  uiAtk: () => uiAtk,
  uiBlk: () => uiBlk,
  uiPickBlk: () => uiPickBlk,
  clearUiOnPhaseChange,
};
})();
