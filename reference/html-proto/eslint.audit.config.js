// Tier-two AUDIT lint — advisory duplication scan, run on demand via
// `npm run lint:audit` and TRIAGED by a human+AI pass, never enforced.
// Kept separate from eslint.config.js (the tier-one gate) on purpose: mixing
// judgment-required rules into the gate trains everyone to ignore the gate.
// Origin: the isSpliceableBase/isSpliceableStaple identical twins (v2.2.49)
// were invisible to tier one, which hunts bugs, not maintenance risks.
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
      'sonarjs/no-identical-functions': 'warn',
    },
  },
];
