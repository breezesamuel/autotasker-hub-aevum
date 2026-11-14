#!/usr/bin/env node
/**
 * Pre-compiles the Solidity contract using solc-js (no Foundry needed)
 * Then outputs artifacts for deployment
 */
const fs = require('fs');
const path = require('path');

// Minimal SolcJS compiler (embedded version would be ideal but we'll use remote)
async function compileWithRemote() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'AutoTaskerPaymentRouter.sol'), 'utf8');
  const testSource = fs.readFileSync(path.join(__dirname, '..', 'test', 'MockTUSD8.sol'), 'utf8');
  
  console.log('Compiling viaSolUI online compiler...\n');
  
  // Use SolUI API (free, no auth)
  const res = await fetch('https://sol-ui-api.vercel.app/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'Solidity',
      version: '0.8.20',
      sources: {
        'AutoTaskerPaymentRouter.sol': { content: source },
        'MockTUSD8.sol': { content: testSource },
      },
      settings: {
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
        optimizer: { enabled: true, runs: 200 },
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  
  if (!res.ok) {
    console.log('SolUI failed, trying alternative...');
    return null;
  }
  
  const data = await res.json();
  return data;
}

async function main() {
  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  
  // Try multiple compilation methods
  console.log('=== Contract Compilation ===\n');
  
  // Method 1: Check if foundry binary exists
  const { execSync } = require('child_process');
  try {
    execSync('forge --version', { stdio: 'ignore' });
    console.log('Foundry detected! Using forge build...\n');
    const result = execSync('forge build --contracts contracts/ --extra-output abi evm.bytecode object', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 60000,
    });
    console.log(result.slice(0, 500));
    console.log('\nArtifacts saved to out/');
    return;
  } catch (e) {}
  
  // Method 2: Try online compiler
  console.log('Foundry not found. Trying online compiler...\n');
  const result = await compileWithRemote();
  
  if (result && result.contracts) {
    for (const [file, contracts] of Object.entries(result.contracts)) {
      for (const [name, contract] of Object.entries(contracts)) {
        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
        const outputPath = path.join(outDir, `${safeName}.json`);
        fs.writeFileSync(outputPath, JSON.stringify({
          abi: contract.abi,
          bytecode: contract.evm?.bytecode?.object || '',
          deployedBytecode: contract.evm?.deployedBytecode?.object || '',
        }, null, 2));
        console.log(`✓ ${name} → ${outputPath}`);
      }
    }
  } else {
    console.log('\n✗ Online compiler also failed.');
    console.log('\nPlease use one of these alternatives:');
    console.log('1. Install Foundry: https://book.getfoundry.sh/getting-started/installation');
    console.log('2. Use Remix: https://remix.ethereum.org (paste contract, compile & deploy)');
    console.log('3. Use Tenderly: https://tenderly.co');
  }
}

main().catch(console.error);
