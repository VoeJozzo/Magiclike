// Wave 2 flavor-pass reveal board. Blinded by default: per card, the bare
// mechanics + four unlabeled flavor options (A–D, judge's alphabetical
// order) with the judge's scores and pick. Joe picks; the REVEAL toggle
// then shows provenance (baseline vs proposer) and art notes.
// Data: wave2_flavorpass.json (+ anon specs, baseline) — all in this folder.
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const { proposals, rulings, batchNotes } = JSON.parse(fs.readFileSync(path.join(DIR, 'wave2_flavorpass.json'), 'utf8'));
const anon = JSON.parse(fs.readFileSync(path.join(DIR, 'wave2_flavor_anon.json'), 'utf8'));
const anonByKey = Object.fromEntries(anon.map(a => [a.key, a]));
const rByKey = Object.fromEntries(rulings.map(r => [r.key, r]));

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function pips(c){const out=[];for(const ch of String(c||'')){if(/[0-9]/.test(ch))out.push('<span class="pip pip-c">'+ch+'</span>');else if('WUBRG'.includes(ch))out.push('<span class="pip pip-'+ch+'"></span>');}return out.join('')||esc(c);}

let baseKept = 0;
const tiles = [];
for (const [key, opts] of Object.entries(proposals)) {
  const a = anonByKey[key], r = rByKey[key];
  if (!a || !r) continue;
  const sorted = [...opts].sort((x, y) => x.name < y.name ? -1 : 1);
  const pickIdx = 'ABCD'.indexOf(r.pick);
  const baseOpt = opts.find(o => o.src === 'B');
  const pickedIsBase = sorted[pickIdx] && baseOpt && sorted[pickIdx].name === baseOpt.name && sorted[pickIdx].typeLine === baseOpt.typeLine;
  if (pickedIsBase) baseKept++;
  const optHtml = sorted.map((o, i) => {
    const label = 'ABCD'[i];
    const isPick = i === pickIdx;
    const isBase = o.src === 'B';
    return `<div class="opt ${isPick ? 'is-pick' : ''}" data-base="${isBase ? '1' : '0'}">
      <div class="opthead"><span class="optlabel">${label}</span>
        <span class="optname">${esc(o.name)}</span>
        <span class="optscore">${r.scores && r.scores[i] != null ? r.scores[i] + '/10' : ''}</span>
        ${isPick ? '<span class="chip chip-ship">judge pick</span>' : ''}
        <span class="chip chip-src reveal-only">${isBase ? 'BASELINE (ours)' : 'proposer ' + esc(o.src)}</span>
      </div>
      <div class="opttype">${esc(o.typeLine)}${o.tribes ? ' · tribes: ' + esc(o.tribes) : ''}</div>
      ${o.artNote ? `<div class="optart reveal-only">art: ${esc(o.artNote)}</div>` : ''}
      <button type="button" class="vbtn optpick" data-card="${esc(key)}" data-opt="${label}">take ${label}</button>
    </div>`;
  }).join('');
  tiles.push({ key, html: `
<article class="card ${pickedIsBase ? 'v-ship' : 'v-hold'}" id="${esc(key)}">
  <div class="frame">
    <div class="mech"><span class="cost">${pips(a.cost)}</span><span class="mtype">${esc(a.type)}${a.stats ? ' · ' + esc(a.stats) : ''}</span></div>
    <p class="rules">${esc(a.rules)}</p>
  </div>
  <div class="meta">
    <div class="opts">${optHtml}</div>
    <p class="judgenote"><span class="klabel">judge</span> ${esc(r.note)}</p>
    <textarea class="vnote" rows="1" data-card="${esc(key)}" placeholder="note (optional, no limit)"></textarea>
  </div>
</article>` });
}

const html = `<title>Wave 2 — Flavor Reveal</title>
<style>
:root{--bg:#eef0ec;--panel:#fbfcfa;--panel2:#f3f5f1;--ink:#20241f;--ink-soft:#5a6058;--line:#d7dbd3;--accent:#4a6570;--ship:#2f7d5a;--ship-bg:#e3efe7;--kill:#a53d35;--kill-bg:#f4e5e2;--hold:#b07f2e;--hold-bg:#f4ecdc;--shadow:0 1px 3px rgba(32,36,31,.08);}
@media (prefers-color-scheme: dark){:root{--bg:#171a1c;--panel:#212528;--panel2:#1c2022;--ink:#e3e1d8;--ink-soft:#9aa096;--line:#343a3e;--accent:#8fb2bf;--ship:#6cc59a;--ship-bg:#22362d;--kill:#e08a80;--kill-bg:#3a2725;--hold:#d9ab5f;--hold-bg:#38301f;--shadow:0 1px 3px rgba(0,0,0,.35);}}
:root[data-theme="dark"]{--bg:#171a1c;--panel:#212528;--panel2:#1c2022;--ink:#e3e1d8;--ink-soft:#9aa096;--line:#343a3e;--accent:#8fb2bf;--ship:#6cc59a;--ship-bg:#22362d;--kill:#e08a80;--kill-bg:#3a2725;--hold:#d9ab5f;--hold-bg:#38301f;--shadow:0 1px 3px rgba(0,0,0,.35);}
:root[data-theme="light"]{--bg:#eef0ec;--panel:#fbfcfa;--panel2:#f3f5f1;--ink:#20241f;--ink-soft:#5a6058;--line:#d7dbd3;--accent:#4a6570;--ship:#2f7d5a;--ship-bg:#e3efe7;--kill:#a53d35;--kill-bg:#f4e5e2;--hold:#b07f2e;--hold-bg:#f4ecdc;--shadow:0 1px 3px rgba(32,36,31,.08);}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
.wrap{max-width:1060px;margin:0 auto;padding:40px 24px 80px;}
h1,.rules,.optname{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;}
h1{font-size:2rem;margin:0 0 4px;text-wrap:balance}
.sub{color:var(--ink-soft);margin:0 0 20px;max-width:70ch}
.statstrip{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px;align-items:center}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:10px 16px;box-shadow:var(--shadow)}
.stat b{display:block;font-size:1.45rem;font-variant-numeric:tabular-nums;line-height:1.2}
.stat span{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft)}
.revealbtn{font:700 .9rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--hold);color:var(--panel);border:none;border-radius:6px;padding:12px 20px;cursor:pointer;margin-left:auto}
.revealbtn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
body:not(.revealed) .reveal-only{display:none}
body.revealed .opt[data-base="1"]{outline:2px solid var(--hold)}
.batchnotes{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 16px;font-size:.88rem;color:var(--ink-soft);margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:16px}
@media (max-width:560px){.grid{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
.card.v-ship{border-left:4px solid var(--ship)}
.card.v-hold{border-left:4px solid var(--hold)}
.frame{padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel2)}
.mech{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.mtype{font-size:.8rem;color:var(--ink-soft)}
.cost{display:inline-flex;gap:3px}
.pip{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 ui-monospace,monospace;color:#2b2b26;border:1px solid rgba(0,0,0,.25)}
.pip-c{background:#ccc7bd}.pip-W{background:#f5f0d0}.pip-U{background:#a8c9e0}.pip-B{background:#8f8a84}.pip-R{background:#e2926f}.pip-G{background:#97b985}
.rules{margin:0;font-size:.92rem}
.meta{padding:12px 16px 14px;display:flex;flex-direction:column;gap:8px;flex:1}
.opts{display:flex;flex-direction:column;gap:6px}
.opt{border:1px solid var(--line);border-radius:6px;padding:8px 10px;background:var(--panel2)}
.opt.is-pick{border-color:var(--ship)}
.opt.joe-pick{background:var(--ship-bg);border-color:var(--ship);box-shadow:0 0 0 1px var(--ship)}
.opthead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.optlabel{font:700 .75rem/1 ui-monospace,monospace;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:2px 6px}
.optname{font-size:1rem;font-weight:600}
.optscore{font:700 .75rem/1 ui-monospace,monospace;color:var(--accent)}
.opttype{font-size:.78rem;color:var(--ink-soft);margin:2px 0 4px}
.optart{font-size:.78rem;color:var(--ink-soft);font-style:italic;margin-bottom:4px}
.chip{font-size:.68rem;padding:1px 8px;border-radius:20px}
.chip-ship{background:var(--ship-bg);color:var(--ship)}
.chip-src{background:var(--hold-bg);color:var(--hold);font-weight:700}
.vbtn{font:700 .74rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:4px 12px;border-radius:20px;cursor:pointer;background:var(--panel);color:var(--ink-soft);border:1px solid var(--line)}
.vbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.judgenote{margin:0;font-size:.82rem;color:var(--ink-soft)}
.klabel{font:700 .66rem/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em;color:var(--ship);background:var(--ship-bg);border-radius:3px;padding:2px 6px;margin-right:6px}
.vnote{width:100%;min-height:36px;font:inherit;font-size:.84rem;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink);resize:vertical}
.tallybar{position:sticky;bottom:0;z-index:5;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel);border-top:2px solid var(--accent);box-shadow:0 -2px 10px rgba(0,0,0,.12);padding:10px 24px;margin:48px -24px -80px;font-variant-numeric:tabular-nums}
.copybtn{margin-left:auto;font:700 .85rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--accent);color:var(--panel);border:none;border-radius:6px;padding:9px 18px;cursor:pointer}
.copyhint{font-size:.75rem;color:var(--ink-soft);width:100%;margin:0}
</style>
<div class="wrap">
<h1>Wave 2 — Flavor Reveal</h1>
<p class="sub">Each card: the bare mechanics, then four flavor options in the judge's blind A–D order with its
scores and pick. Choose per card (the judge's pick is a recommendation, not a decision). Play blind first,
then hit REVEAL to see which option was our shipped baseline and read the proposers' art notes.</p>
<div class="statstrip">
  <div class="stat"><b>${tiles.length}</b><span>cards</span></div>
  <div class="stat"><b>${baseKept}/${tiles.length}</b><span>baselines kept by judge</span></div>
  <div class="stat"><b>${tiles.length - baseKept}</b><span>dethroned</span></div>
  <button type="button" class="revealbtn" id="revealbtn">REVEAL provenance</button>
</div>
<div class="batchnotes"><b>Judge's batch-coherence notes:</b> ${esc(batchNotes)}</div>
<div class="grid">
${tiles.map(t => t.html).join('\n')}
</div>
<div class="tallybar">
  <span><b id="n-picked">0</b>/${tiles.length} picked</span>
  <button type="button" class="copybtn" id="copybtn">Copy flavor picks for Claude</button>
  <p class="copyhint">Picks persist in this browser. Export lists your chosen option per card (with its name/typeline) + notes.</p>
</div>
</div>
<script>
(function () {
  var KEY = 'wave2_flavor_v1';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function paint() {
    document.querySelectorAll('.opt').forEach(function (el) {
      var btn = el.querySelector('.optpick');
      var card = btn.getAttribute('data-card'), opt = btn.getAttribute('data-opt');
      el.classList.toggle('joe-pick', (state[card] || {}).pick === opt);
    });
    var n = 0;
    var seen = {};
    document.querySelectorAll('.optpick').forEach(function (b) { seen[b.getAttribute('data-card')] = 1; });
    Object.keys(seen).forEach(function (c) { if ((state[c] || {}).pick) n++; });
    document.getElementById('n-picked').textContent = n;
  }
  document.querySelectorAll('.optpick').forEach(function (b) {
    b.addEventListener('click', function () {
      var card = b.getAttribute('data-card'), opt = b.getAttribute('data-opt');
      var cur = state[card] || {};
      cur.pick = (cur.pick === opt) ? null : opt;
      state[card] = cur; save(); paint();
    });
  });
  document.querySelectorAll('.vnote').forEach(function (ta) {
    var card = ta.getAttribute('data-card');
    if ((state[card] || {}).note) ta.value = state[card].note;
    ta.addEventListener('input', function (e) {
      var cur = state[card] || {}; cur.note = e.target.value; state[card] = cur; save();
    });
  });
  document.getElementById('revealbtn').addEventListener('click', function () {
    document.body.classList.toggle('revealed');
    this.textContent = document.body.classList.contains('revealed') ? 'HIDE provenance' : 'REVEAL provenance';
  });
  document.getElementById('copybtn').addEventListener('click', function () {
    var lines = ['WAVE 2 FLAVOR PICKS', ''];
    document.querySelectorAll('article.card').forEach(function (card) {
      var key = card.id;
      var cur = state[key] || {};
      if (!cur.pick && !cur.note) return;
      var name = '';
      if (cur.pick) {
        card.querySelectorAll('.opt').forEach(function (o) {
          if (o.querySelector('.optpick').getAttribute('data-opt') === cur.pick)
            name = o.querySelector('.optname').textContent + ' (' + o.querySelector('.opttype').textContent + ')';
        });
      }
      lines.push('## ' + key + (cur.pick ? ' — ' + cur.pick + ': ' + name : ''));
      if (cur.note) lines.push(cur.note);
      lines.push('');
    });
    if (lines.length === 2) lines.push('(no picks yet)');
    var text = lines.join('\\n');
    var done = function () {
      var btn = document.getElementById('copybtn');
      var old = btn.textContent; btn.textContent = 'Copied ✓';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fb(text); done(); });
    } else { fb(text); done(); }
    function fb(t) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); }
  });
  paint();
})();
</script>`;

const outDir = process.argv[2] || DIR;
fs.writeFileSync(path.join(outDir, 'wave2-flavor.html'), html);
console.log('wrote wave2-flavor.html', html.length, 'bytes | cards:', tiles.length, '| baseline kept:', baseKept);
