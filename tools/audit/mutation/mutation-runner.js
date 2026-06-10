#!/usr/bin/env node
// =============================================================================
// MUTATION RUNNER — hand-rolled mutant tester for the html-proto suite.
//
// Why not Stryker: the proto's tests do source-level pattern matching
// (tests/_setup.js getSource()) and the loader strips browser bootstrap with
// regexes, so schemata-style "instrument everything at once" breaks the dry
// run. This runner instead applies ONE small textual mutation at a time to a
// pristine sandbox copy and runs the real suite — slower per mutant, but
// fully compatible with the suite as it exists.
//
// Usage:
//   node tools/audit/mutation/mutation-runner.js [options]
//     --proto <dir>      html-proto dir (default: <repo>/reference/html-proto)
//     --out <file>       results JSON (default: ~/.config/magiclike/audit/mutation/results.json)
//     --files a.js,b.js  restrict to these js/ files
//     --workers N        parallel sandboxes (default 8)
//     --timeout <ms>     per-suite-run watchdog (default 240000)
//     --dry-run          generate + count mutants, run nothing
//     --force            ignore previous results (no incremental skip)
//     --report           regenerate MUTATION-MAP.md from results JSON and exit
//
// Incremental: results are keyed by mutant id (file + offset + replacement);
// a file whose content hash matches the previous run reuses its verdicts.
// Contract: docs/plans/plan-proto-audit.md -> Phase 0 step 3.
// =============================================================================

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync, execFileSync } = require('child_process');
const acorn = require('acorn');
const walk = require('acorn-walk');

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name) { return argv.includes('--' + name); }
function opt(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROTO_DIR = path.resolve(opt('proto', path.join(REPO_ROOT, 'reference', 'html-proto')));
const OUT_FILE = path.resolve(opt('out',
  path.join(os.homedir(), '.config', 'magiclike', 'audit', 'mutation', 'results.json')));
const MAP_FILE = path.join(path.dirname(OUT_FILE), 'MUTATION-MAP.md');
const WORKERS = parseInt(opt('workers', '8'), 10);
const RUN_TIMEOUT = parseInt(opt('timeout', '240000'), 10);

// Engine-side modules only. UI/render modules are out of audit scope (plan:
// "UI code is examined only where it masks engine bugs") and the suite
// doesn't exercise them, so their mutants would all survive at full cost.
const TARGET_FILES = [
  'engine.js', 'ai.js', 'run.js', 'card-text.js', 'draft.js', 'cards.js',
  'stickers.js', 'triggers.js', 'trigger-generator.js', 'picklog.js', 'types.js',
];

// ─── Mutant generation ───────────────────────────────────────────────────────
const BINARY_SWAPS = {
  '==': '!=', '!=': '==', '===': '!==', '!==': '===',
  '<': '<=', '<=': '<', '>': '>=', '>=': '>',
  '+': '-', '-': '+', '*': '/', '/': '*', '%': '*',
};
const LOGICAL_SWAPS = { '&&': '||', '||': '&&' };

function isStringy(node) {
  return (node.type === 'Literal' && typeof node.value === 'string') ||
         node.type === 'TemplateLiteral';
}

function mutantsForFile(relFile, code) {
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', locations: true });
  } catch (e) {
    console.error(`  PARSE FAILURE ${relFile}: ${e.message} — skipping file`);
    return [];
  }
  const out = [];
  function add(node, repl, op) {
    const orig = code.slice(node.start, node.end);
    if (orig === repl) return;
    const id = crypto.createHash('sha1')
      .update(`${relFile}:${node.start}:${op}:${repl}`).digest('hex').slice(0, 12);
    out.push({
      id, file: relFile, start: node.start, end: node.end,
      line: node.loc.start.line, op,
      orig: orig.length > 80 ? orig.slice(0, 77) + '...' : orig,
      repl: repl.length > 80 ? repl.slice(0, 77) + '...' : repl,
      _repl: repl,
    });
  }
  walk.full(ast, node => {
    if (node.type === 'BinaryExpression' && BINARY_SWAPS[node.operator]) {
      if (node.operator === '+' && (isStringy(node.left) || isStringy(node.right))) return;
      const opSrc = code.slice(node.left.end, node.right.start);
      const swapped = opSrc.replace(node.operator, BINARY_SWAPS[node.operator]);
      add(node, code.slice(node.start, node.left.end) + swapped + code.slice(node.right.start, node.end),
        `${node.operator}->${BINARY_SWAPS[node.operator]}`);
    } else if (node.type === 'LogicalExpression' && LOGICAL_SWAPS[node.operator]) {
      const opSrc = code.slice(node.left.end, node.right.start);
      const swapped = opSrc.replace(node.operator, LOGICAL_SWAPS[node.operator]);
      add(node, code.slice(node.start, node.left.end) + swapped + code.slice(node.right.start, node.end),
        `${node.operator}->${LOGICAL_SWAPS[node.operator]}`);
    } else if (node.type === 'UnaryExpression' && node.operator === '!' && node.prefix) {
      add(node, code.slice(node.argument.start, node.argument.end), 'drop-!');
    } else if (node.type === 'Literal' && typeof node.value === 'boolean') {
      add(node, String(!node.value), 'bool-flip');
    } else if (node.type === 'Literal' && typeof node.value === 'number') {
      add(node, String(node.value + 1), 'num+1');
    }
  });
  return out;
}

// ─── Results store (incremental) ─────────────────────────────────────────────
function fileHash(code) {
  return crypto.createHash('sha1').update(code).digest('hex');
}
function loadPrevious() {
  if (flag('force')) return null;
  try { return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch (_) { return null; }
}
function saveResults(results) {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const tmp = OUT_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(results, null, 1));
  fs.renameSync(tmp, OUT_FILE);
}

// ─── Suite execution ─────────────────────────────────────────────────────────
function killTree(pid) {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch (_) {}
  }
}

function runSuite(sandbox) {
  return new Promise(resolve => {
    const child = spawn('node', ['tests/run_all.js'], {
      cwd: sandbox,
      env: { ...process.env, RUN_ALL_BAIL: '1', RUN_ALL_TEST_TIMEOUT_MS: '60000' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const t0 = Date.now();
    const timer = setTimeout(() => { killTree(child.pid); }, RUN_TIMEOUT);
    child.on('close', code => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      if (ms >= RUN_TIMEOUT - 500 && code !== 0) {
        resolve({ status: 'timeout', killedBy: 'watchdog', ms });
        return;
      }
      if (code === 0) { resolve({ status: 'survived', killedBy: null, ms }); return; }
      const m = out.match(/^=== (\S+) \.\.\. .*(?:FAILED|UNPARSEABLE)/m);
      resolve({ status: 'killed', killedBy: m ? m[1] : 'unknown', ms });
    });
  });
}

// ─── Sandboxes ───────────────────────────────────────────────────────────────
const SANDBOX_ROOT = path.join(os.tmpdir(), 'magiclike-mutation');
function makeSandbox(i) {
  const dir = path.join(SANDBOX_ROOT, 'sandbox-' + i);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(PROTO_DIR, dir, {
    recursive: true,
    filter: src => !src.includes('node_modules'),
  });
  return dir;
}

// ─── Report ──────────────────────────────────────────────────────────────────
function writeReport(results) {
  const lines = [];
  lines.push('# Mutation map — html-proto');
  lines.push('');
  lines.push(`> Generated ${results.generatedAt} @ proto SHA \`${results.protoSha}\`.`);
  lines.push('> Score = killed / (killed + survived); timeouts count as killed.');
  lines.push('> The ship gate reads this map as a JUDGMENT input, not a threshold');
  lines.push('> (docs/plans/plan-proto-audit.md -> autonomy ladder).');
  lines.push('');
  lines.push('| File | Mutants | Killed | Timeout | Survived | Score |');
  lines.push('|------|---------|--------|---------|----------|-------|');
  const fileNames = Object.keys(results.files).sort();
  let tk = 0, ts = 0, tt = 0, tot = 0;
  for (const f of fileNames) {
    const ms = results.files[f].mutants;
    const k = ms.filter(m => m.status === 'killed').length;
    const t = ms.filter(m => m.status === 'timeout').length;
    const s = ms.filter(m => m.status === 'survived').length;
    tk += k; ts += s; tt += t; tot += ms.length;
    const score = (k + t + s) ? Math.round(100 * (k + t) / (k + t + s)) : 0;
    lines.push(`| ${f} | ${ms.length} | ${k} | ${t} | ${s} | ${score}% |`);
  }
  const totScore = tot ? Math.round(100 * (tk + tt) / tot) : 0;
  lines.push(`| **total** | **${tot}** | **${tk}** | **${tt}** | **${ts}** | **${totScore}%** |`);
  lines.push('');
  lines.push('## Survived mutants (the coverage holes)');
  lines.push('');
  for (const f of fileNames) {
    const survived = results.files[f].mutants.filter(m => m.status === 'survived');
    if (!survived.length) continue;
    lines.push(`### ${f} (${survived.length})`);
    lines.push('');
    for (const m of survived.sort((a, b) => a.line - b.line)) {
      lines.push(`- L${m.line} \`${m.op}\`: \`${m.orig}\` -> \`${m.repl}\``);
    }
    lines.push('');
  }
  fs.writeFileSync(MAP_FILE, lines.join('\n'));
  console.log(`report: ${MAP_FILE}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (flag('report')) {
    const results = loadPrevious();
    if (!results) { console.error('no results JSON to report from'); process.exit(1); }
    writeReport(results);
    return;
  }

  let protoSha = 'unknown';
  try {
    protoSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: PROTO_DIR, encoding: 'utf8' })
      .stdout.trim();
  } catch (_) {}

  const onlyFiles = opt('files', null);
  const targets = onlyFiles ? onlyFiles.split(',').map(s => s.trim()) : TARGET_FILES;

  // Generate mutants + reuse previous verdicts for unchanged files.
  const prev = loadPrevious();
  const results = { generatedAt: new Date().toISOString(), protoSha, files: {} };
  const queue = [];
  for (const f of targets) {
    const code = fs.readFileSync(path.join(PROTO_DIR, 'js', f), 'utf8');
    const hash = fileHash(code);
    const mutants = mutantsForFile(f, code);
    const prevFile = prev && prev.files[f];
    const reusable = prevFile && prevFile.hash === hash
      ? new Map(prevFile.mutants.filter(m => m.status).map(m => [m.id, m]))
      : new Map();
    let reused = 0;
    for (const m of mutants) {
      const old = reusable.get(m.id);
      if (old) {
        m.status = old.status; m.killedBy = old.killedBy; m.ms = old.ms;
        reused++;
      } else {
        queue.push(m);
      }
    }
    results.files[f] = { hash, mutants };
    console.log(`${f}: ${mutants.length} mutants (${reused} reused)`);
  }
  console.log(`queue: ${queue.length} to run, workers: ${WORKERS}, est ${(queue.length * 16 / WORKERS / 60).toFixed(0)}-${(queue.length * 20 / WORKERS / 60).toFixed(0)} min`);
  if (flag('dry-run')) return;

  // Baseline: pristine sandbox must be green or every verdict is garbage.
  console.log('building sandboxes + baseline...');
  const sandboxes = [];
  for (let i = 0; i < WORKERS; i++) sandboxes.push(makeSandbox(i));
  const base = await runSuite(sandboxes[0]);
  if (base.status !== 'survived') {
    console.error(`BASELINE RED in pristine sandbox (${base.status}, by ${base.killedBy}) — aborting.`);
    process.exit(1);
  }
  console.log(`baseline green (${(base.ms / 1000).toFixed(1)}s). running ${queue.length} mutants...`);

  let done = 0, killed = 0, survived = 0, timeouts = 0;
  const t0 = Date.now();
  async function worker(sandbox) {
    while (queue.length) {
      const m = queue.shift();
      const filePath = path.join(sandbox, 'js', m.file);
      const original = fs.readFileSync(filePath, 'utf8');
      const mutated = original.slice(0, m.start) + m._repl + original.slice(m.end);
      fs.writeFileSync(filePath, mutated);
      const r = await runSuite(sandbox);
      fs.writeFileSync(filePath, original);
      m.status = r.status; m.killedBy = r.killedBy; m.ms = r.ms;
      done++;
      if (r.status === 'killed') killed++;
      else if (r.status === 'survived') survived++;
      else timeouts++;
      if (done % 20 === 0) {
        const rate = done / ((Date.now() - t0) / 60000);
        console.log(`${done} done (${killed} killed, ${survived} survived, ${timeouts} timeout) — ${rate.toFixed(0)}/min, ~${((queue.length) / rate).toFixed(0)} min left`);
        saveResults(results);
      }
    }
  }
  await Promise.all(sandboxes.map(worker));
  for (const m of Object.values(results.files).flatMap(f => f.mutants)) delete m._repl;
  saveResults(results);
  console.log(`DONE: ${done} run, ${killed} killed, ${survived} survived, ${timeouts} timeouts in ${((Date.now() - t0) / 60000).toFixed(0)} min`);
  writeReport(results);
}

main().catch(e => { console.error(e); process.exit(1); });
