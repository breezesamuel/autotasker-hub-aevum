// Push a local file to the ECS box by base64-over-ssh in chunks.
// Usage: node scripts/push-to-ecs.js <localFileAbs> <remoteAbsPath>
//        node scripts/push-to-ecs.js --cmd "<bash-cmd>"
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ECS_SSH = 'F:\\\\2026\\\\第二次点子\\\\scripts\\\\ecs-ssh.ps1';

function remoteRun(cmd) {
  const out = execFileSync(
    'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ECS_SSH, '-Cmd', cmd, '-TimeoutSec', '120'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, windowsHide: true, timeout: 150000 }
  );
  return out;
}

function upload(localAbs, remoteAbs) {
  if (!localAbs || !remoteAbs) throw new Error('usage: node push-to-ecs.js <localFileAbs> <remoteAbsPath>');
  const stats = fs.statSync(localAbs);
  console.log(`Uploading ${stats.size.toLocaleString()} bytes -> root@8.155.53.12:${remoteAbs}`);
  const b64 = fs.readFileSync(localAbs).toString('base64');
  const LINE_LEN = 76, BATCH_LINES = 20;
  const rawLines = [];
  for (let i = 0; i < b64.length; i += LINE_LEN) rawLines.push(b64.slice(i, i + LINE_LEN));
  for (let bi = 0; bi < rawLines.length; bi += BATCH_LINES) {
    const batch = rawLines.slice(bi, bi + BATCH_LINES);
    const blockNum = Math.floor(bi / BATCH_LINES) + 1;
    const totalBlocks = Math.ceil(rawLines.length / BATCH_LINES);
    const opener = bi === 0 ? '>' : '>>';
    const inner = batch.join('\\n');
    try {
      remoteRun("echo '" + inner + "' " + opener + " '" + remoteAbs + "'");
      if (blockNum % 10 === 0 || blockNum === totalBlocks) {
        process.stdout.write(`\r   block ${blockNum}/${totalBlocks} (${((bi+batch.length)/rawLines.length*100).toFixed(0)}%)`);
      }
    } catch (e) {
      console.error(`\nFAILED on block ${blockNum}:`, e.message.split('\n')[0]);
      process.exit(1);
    }
  }
  console.log('\nVerifying...');
  try {
    const v = remoteRun("wc -c '" + remoteAbs + "'; md5sum '" + remoteAbs + "'; ls -la '" + remoteAbs + "'");
    console.log(v.trim());
  } catch (e) {
    console.warn('Verify warning:', e.message.split('\n')[0]);
  }
  console.log('Upload complete.');
}

function runCmd(cmd) {
  console.log(`Running: ${cmd.substring(0, 80)}...`);
  const out = remoteRun(cmd);
  console.log(out.trim());
}

const [, , arg1, arg2, ...rest] = process.argv;
if (arg1 === '--cmd') {
  const cmd = arg2 || rest.join(' ');
  if (!cmd) { console.error('usage: node push-to-ecs.js --cmd "<command>"'); process.exit(1); }
  runCmd(cmd);
} else if (arg1 && arg2) {
  upload(arg1, arg2);
} else {
  console.error('usage: node push-to-ecs.js <localFileAbs> <remoteAbsPath>');
  console.error('       node push-to-ecs.js --cmd "<command>"');
  process.exit(1);
}
