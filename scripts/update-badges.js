#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function coverageColor(pct) {
  if (pct >= 90) return 'brightgreen';
  if (pct >= 75) return 'yellow';
  if (pct >= 50) return 'orange';
  return 'red';
}

function encode(str) {
  return encodeURIComponent(str).replace(/-/g, '--').replace(/_/g, '__');
}

function badgeUrl(label, value, color) {
  return `https://img.shields.io/badge/${encode(label)}-${encode(value)}-${color}`;
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);
const testResults = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'coverage', 'test-results.json'), 'utf8')
);
const coverage = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'coverage', 'coverage-summary.json'),
    'utf8'
  )
);

let readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

// Version
readme = readme.replace(
  /!\[version\]\([^)]+\)/,
  `![version](${badgeUrl('version', pkg.version, 'blue')})`
);

// Tests
const passed = testResults.numPassedTests;
const failed = testResults.numFailedTests;
const total = testResults.numTotalTests;
const testText = failed > 0 ? `${passed}/${total} passed` : `${passed} passed`;
const testColor =
  failed === 0 ? 'brightgreen' : passed / total >= 0.9 ? 'yellow' : 'red';
readme = readme.replace(
  /!\[tests\]\([^)]+\)/,
  `![tests](${badgeUrl('tests', testText, testColor)})`
);

// Coverage per metric
for (const metric of ['statements', 'lines', 'functions', 'branches']) {
  const pct = coverage.total[metric].pct;
  readme = readme.replace(
    new RegExp(`!\\[${metric}\\]\\([^)]+\\)`),
    `![${metric}](${badgeUrl(`coverage: ${metric}`, `${pct}%`, coverageColor(pct))})`
  );
}

fs.writeFileSync(path.join(ROOT, 'README.md'), readme);
console.log('Badges updated in README.md');
