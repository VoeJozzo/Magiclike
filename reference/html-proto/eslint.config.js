// Dev-only static analysis for the html-proto JS — NOT part of the runtime
// (the engine has no build step; GitHub Pages serves the raw files). Run with
// `npm run lint` from reference/html-proto/.
//
// Scope is deliberately narrow: high-signal BUG smells (identical operands and
// conditions, duplicate keys/args/cases, unreachable code), not style. The
// motivating case was `grant_haste || grant_haste` (v2.0.33) — a regex can't
// tell that from `x && x !== y`, but sonarjs/no-identical-expressions can.
//
// The js/ files are plain <script>s that share globals across files (no ES
// modules), so `no-undef` is intentionally NOT enabled — a reference to
// `ENGINE` from another file isn't an "undefined variable" here. We also start
// from an empty rule set (no eslint:recommended) to avoid drowning a 20k-LOC
// organic codebase in stylistic findings.
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = [
  {
    files: ['js/**/*.js', 'tests/**/*.js'],
    plugins: { sonarjs },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    rules: {
      // The class that motivated this tooling.
      'sonarjs/no-identical-expressions': 'error',   // x || x, x && x, x === x, …
      'sonarjs/no-identical-conditions': 'error',     // if (a) … else if (a)
      'sonarjs/no-all-duplicated-branches': 'error',  // every branch does the same thing

      // ESLint core bug detectors (no stylistic rules).
      'no-dupe-else-if': 'error',
      'no-self-compare': 'error',
      'no-constant-binary-expression': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-cond-assign': ['error', 'always'],
      'no-unsafe-negation': 'error',
      'no-compare-neg-zero': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
