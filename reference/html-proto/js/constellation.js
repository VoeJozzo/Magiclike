// CONSTELLATION — the in-game synergy-graph viewer (🔭 button, top-left).
// Joe's origin-session item 13 ("de-neuralese realized-synergy + constellation
// view"), prototyped naive-first (audience of 1): two tabs —
//   Deck: the current run's slots, named stars, edges with reason tooltips.
//   Pool: every nonland card (327 nodes / ~1k strong edges), hover to light
//         a neighborhood. Computed once per boot and cached.
// Pure presentation: reads BUCKETS.edgeBetween / analyzeCard + RUN.getSlots,
// writes nothing. Physics = the Synergy Observatory artifact's sim, ported
// verbatim (settle offline, redraw on hover; no rAF loop, reduced-motion
// friendly). Not in tests/_setup EXPOSED — UI-only, verified in-browser per
// the CLAUDE.md testing note.
const CONSTELLATION = (() => {
  const MTG = { W: '#e8dfae', U: '#5598e7', B: '#9a8fb0', R: '#e66767',
    G: '#57a15a', M: '#d9a53f', C: '#a8a49c' };
  let modal = null, canvas = null, ctx = null, tipEl = null, tabBtns = {};
  let mode = 'deck';         // 'deck' | 'pool'
  let nodes = [], edges = [], adj = [];
  let poolCache = null;      // {nodes, edges} — 53k edgeBetween calls, once
  let w, h, dpr, cx, cy, scale, dragging = null;

  function colorOf(tplId) {
    const cost = CARDS[tplId].cost || {};
    const cs = ['W', 'U', 'B', 'R', 'G'].filter(k => cost[k] > 0);
    return cs.length > 1 ? 'M' : (cs[0] || 'C');
  }

  // minW: deck view shows w>=1 (a 12-card deck deserves its faint edges —
  // pyromaniac↔vanishing_act at 1.69 is a real story); pool stays at the
  // strong threshold 2 or it becomes yarn.
  function buildGraph(tplIds, minW) {
    const counts = {};
    for (const id of tplIds) counts[id] = (counts[id] || 0) + 1;
    const ids = Object.keys(counts).filter(id => CARDS[id] && !hasType(CARDS[id], 'Land'));
    const ns = ids.map((id, i) => ({
      id, i, name: CARDS[id].name, col: colorOf(id), copies: counts[id], deg: 0,
      x: Math.cos(i * 2.399) * (60 + (i % 9) * 16),
      y: Math.sin(i * 2.399) * (60 + (i % 9) * 16), vx: 0, vy: 0,
    }));
    const es = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const e = BUCKETS.edgeBetween(ids[i], ids[j]);
      if (e && e.w >= minW) {
        es.push([i, j, e.w, (e.reasons && e.reasons[0]) || '']);
        ns[i].deg++; ns[j].deg++;
      }
    }
    return { nodes: ns, edges: es };
  }

  function settle() {
    const N = nodes, E = edges;
    const step = (alpha) => {
      for (const [a, b, wt] of E) {
        const A = N[a], B = N[b];
        let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
        const f = (d - 46) / d * .012 * Math.min(wt, 6) * alpha;
        A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f;
      }
      for (let i = 0; i < N.length; i++) {
        const A = N[i];
        for (let j = i + 1; j < N.length; j++) {
          const B = N[j];
          let dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
          if (d2 > 4900 || d2 === 0) continue;
          const f = alpha * 60 / (d2 + 30);
          dx *= f; dy *= f; A.vx -= dx; A.vy -= dy; B.vx += dx; B.vy += dy;
        }
        A.vx -= A.x * .0016 * alpha; A.vy -= A.y * .0016 * alpha;
      }
      for (const A of N) { A.x += A.vx; A.y += A.vy; A.vx *= .82; A.vy *= .82; }
    };
    for (let it = 0; it < 260; it++) step(1 - it / 300);
  }

  function fit() {
    dpr = devicePixelRatio || 1;
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    scale = Math.min(w / (maxX - minX + 140), h / (maxY - minY + 140));
    cx = w / 2 - (minX + maxX) / 2 * scale;
    cy = h / 2 - (minY + maxY) / 2 * scale;
  }

  function draw(hot) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const [a, b, wt] of edges) {
      const A = nodes[a], B = nodes[b];
      const lit = hot != null && (a === hot || b === hot);
      ctx.strokeStyle = lit ? 'rgba(159,196,255,.9)'
        : 'rgba(130,152,205,' + Math.min(.45, .15 + wt * .045) + ')';
      ctx.lineWidth = lit ? 1.5 : .8;
      ctx.beginPath();
      ctx.moveTo(cx + A.x * scale, cy + A.y * scale);
      ctx.lineTo(cx + B.x * scale, cy + B.y * scale);
      ctx.stroke();
    }
    const showNames = nodes.length <= 45;
    for (const n of nodes) {
      const r = 2 + Math.sqrt(n.deg) * (mode === 'deck' ? 1.6 : .9);
      const X = cx + n.x * scale, Y = cy + n.y * scale;
      ctx.beginPath(); ctx.arc(X, Y, r, 0, 7);
      ctx.fillStyle = MTG[n.col];
      ctx.globalAlpha = hot == null ? 1
        : (n.i === hot || adj[n.i].some(k => edges[k][0] === hot || edges[k][1] === hot) ? 1 : .25);
      ctx.fill(); ctx.globalAlpha = 1;
      if (n.i === hot) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (showNames) {
        ctx.fillStyle = n.i === hot ? '#fff' : 'rgba(200,208,226,.85)';
        ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'center';
        ctx.fillText(n.name + (n.copies > 1 ? ' ×' + n.copies : ''), X, Y + r + 11);
      }
    }
  }

  function load() {
    if (mode === 'deck' && typeof RUN !== 'undefined' && RUN.isActive && RUN.isActive()) {
      const g = buildGraph(RUN.getSlots().map(s => s.tplId), 1);
      nodes = g.nodes; edges = g.edges;
    } else if (mode === 'deck') {
      nodes = []; edges = [];
    } else {
      if (!poolCache) {
        poolCache = buildGraph(Object.keys(CARDS).filter(id => !hasType(CARDS[id], 'Land')), 2);
      }
      nodes = poolCache.nodes; edges = poolCache.edges;
    }
    adj = nodes.map(() => []);
    edges.forEach((e, k) => { adj[e[0]].push(k); adj[e[1]].push(k); });
    if (nodes.length) { settle(); fit(); }
    draw(null);
    const empty = document.getElementById('constEmpty');
    if (empty) empty.style.display = (mode === 'deck' && !nodes.length) ? 'block' : 'none';
  }

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best = null, bd = 196;
    for (const n of nodes) {
      const dx = cx + n.x * scale - px, dy = cy + n.y * scale - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function build() {
    modal = document.createElement('div');
    modal.id = 'constellationModal';
    modal.innerHTML =
      '<div id="constPanel">' +
      '<div id="constHead"><span id="constTitle">🔭 Constellation</span>' +
      '<button data-tab="deck" class="constTab on">Deck</button>' +
      '<button data-tab="pool" class="constTab">Pool</button>' +
      '<span id="constHint">hover a star for its pulls · drag to stir</span>' +
      '<button id="constClose" aria-label="Close">✕</button></div>' +
      '<canvas id="constCanvas"></canvas>' +
      '<div id="constEmpty">No run in progress — start a run to grow a deck constellation, or view the Pool.</div>' +
      '<div id="constTip"></div></div>';
    document.body.appendChild(modal);
    canvas = document.getElementById('constCanvas');
    ctx = canvas.getContext('2d');
    tipEl = document.getElementById('constTip');
    document.getElementById('constClose').onclick = hide;
    modal.addEventListener('click', e => { if (e.target === modal) hide(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'flex') hide();
    });
    for (const b of modal.querySelectorAll('.constTab')) {
      tabBtns[b.dataset.tab] = b;
      b.onclick = () => {
        mode = b.dataset.tab;
        for (const k in tabBtns) tabBtns[k].classList.toggle('on', k === mode);
        tipEl.style.display = 'none';
        load();
      };
    }
    canvas.addEventListener('mousemove', e => {
      if (dragging) {
        const rect = canvas.getBoundingClientRect();
        dragging.x = (e.clientX - rect.left - cx) / scale;
        dragging.y = (e.clientY - rect.top - cy) / scale;
        draw(dragging.i);
        return;
      }
      const n = pick(e);
      if (!n) { tipEl.style.display = 'none'; draw(null); return; }
      draw(n.i);
      const tops = adj[n.i].map(k => edges[k]).sort((a, b) => b[2] - a[2]).slice(0, 4)
        .map(ed => '<span class="constRsn">' + (ed[3] ||
          (nodes[ed[0]].name + ' ↔ ' + nodes[ed[1]].name)) + '</span>').join('');
      tipEl.innerHTML = '<b>' + n.name + '</b> · ' + n.deg + ' hook' + (n.deg === 1 ? '' : 's') + tops;
      tipEl.style.display = 'block';
      const rect = canvas.getBoundingClientRect();
      tipEl.style.left = Math.min(e.clientX - rect.left + 18, rect.width - 300) + 'px';
      tipEl.style.top = Math.min(e.clientY - rect.top + 16, rect.height - 90) + 'px';
    });
    canvas.addEventListener('mousedown', e => { dragging = pick(e); });
    document.addEventListener('mouseup', () => { dragging = null; });
    canvas.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; draw(null); });
    window.addEventListener('resize', () => {
      if (modal.style.display === 'flex' && nodes.length) { fit(); draw(null); }
    });
  }

  function show() {
    if (!modal) build();
    mode = (typeof RUN !== 'undefined' && RUN.isActive && RUN.isActive()) ? 'deck' : 'pool';
    for (const k in tabBtns) tabBtns[k].classList.toggle('on', k === mode);
    modal.style.display = 'flex';
    load();
  }
  function hide() { modal.style.display = 'none'; tipEl.style.display = 'none'; }

  return { show, hide };
})();
