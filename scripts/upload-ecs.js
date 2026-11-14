/**
 * Upload a local file to ECS via SSH (no scp, no pipe tricks).
 * Uses ssh2 library if available, otherwise falls back to child_process ssh.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
let localFile, remotePath;

if (args[0] === '--cmd') {
  // Mode B: run a remote command
  const cmd = args.slice(1).join(' ');
  const key = path.join(process.env.USERPROFILE || '', '.ssh', 'id_ed25519');
  const out = execSync(
    `ssh -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=30 root@8.155.53.12 "${cmd.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
  );
  console.log(out);
  process.exit(0);
} else {
  localFile = args[0];
  remotePath = args[1];
}

if (!localFile || !remotePath) {
  console.error('usage: node upload-ecs.js <localFileAbs> <remotePath>');
  console.error('       node upload-ecs.js --cmd "<bash-cmd>"');
  process.exit(1);
}

const stat = fs.statSync(localFile);
console.log(`Uploading ${stat.size.toLocaleString()} bytes -> root@8.155.53.12:${remotePath}`);

// Base64 encode in chunks, write each batch to remote via append
const b64 = fs.readFileSync(localFile).toString('base64');
const CHUNK = 3000; // chars per ssh call — stays well under Windows arg limit
const totalChunks = Math.ceil(b64.length / CHUNK);
const key = path.join(process.env.USERPROFILE || '', '.ssh', 'id_ed25519');
const sshBin = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';

for (let i = 0; i < totalChunks; i++) {
  const chunk = b64.substring(i * CHUNK, (i + 1) * CHUNK);
  const op = i === 0 ? '>' : '>>';
  // Use single quotes around the base64 chunk to avoid any shell interpretation
  const cmd = `printf '%s' '${chunk}' ${op} '${remotePath}.b64'`;
  try {
    execSync(`"${sshBin}" -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=15 root@8.155.53.12 "${cmd.replace(/'/g, "'\\''")}"`, {
      encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000
    });
    if (i % 10 === 0 || i === totalChunks - 1) {
      console.log(`  chunk ${i + 1}/${totalChunks} (${Math.round((i + 1) / totalChunks * 100)}%)`);
    }
  } catch (e) {
    console.error(`FAILED on chunk ${i + 1}: ${e.message.split('\n')[0]}`);
    process.exit(1);
  }
}

// Decode on remote
console.log('Decoding on remote...');
try {
  const decCmd = `base64 -d '${remotePath}.b64' > '${remotePath}' && rm '${remotePath}.b64' && wc -c '${remotePath}' && md5sum '${remotePath}'`;
  const out = execSync(
    `"${sshBin}" -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=30 root@8.155.53.12 "${decCmd.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000 }
  );
  console.log(out.trim());
} catch (e) {
  console.error(`Decode failed: ${e.message.split('\n')[0]}`);
  process.exit(1);
}

console.log('Upload complete.');
