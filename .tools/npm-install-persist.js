/**
 * npm-install-persist.js — Install packages AND update package.json in one shot.
 * Ensures @x402/* and other deps survive future npm operations.
 */
const fs = require('fs');
const { execSync } = require('child_process');

const PKG = require('./package.json');
const EXTERNALS = [
  'express', '@x402/express', '@x402/core', '@x402/evm', '@x402/svm', '@x402/extensions',
  'solarlunar', 'pinyin-pro',
];

for (const pkg of EXTERNALS) {
  const existing = PKG.dependencies?.[pkg] || PKG.devDependencies?.[pkg];
  if (!existing) {
    if (['@nomicfoundation/hardhat-toolbox'].includes(pkg)) continue;
    console.log(`Adding ${pkg} to dependencies`);
    if (!PKG.dependencies) PKG.dependencies = {};
    PKG.dependencies[pkg] = '*'; // latest
  } else {
    console.log(`${pkg}: already in dependencies (${existing})`);
  }
}

// Write updated package.json
fs.writeFileSync(require('path').join(__dirname, 'package.json'), JSON.stringify(PKG, null, 2), 'utf8');
console.log('\nPackage.json written. Run `npm install --production` next to lock it.');
