// Post-deployment dashboard updater
// Run this after deploying to update README with live contract address
const fs = require('fs');
const path = require('path');

const DEPLOYMENTS_DIR = path.resolve(__dirname, '..', 'data', 'deployments');
const README_PATH = path.resolve(__dirname, '..', 'README.md');

function getLatestDeployment() {
  const files = fs.readdirSync(DEPLOYMENTS_DIR)
    .filter(f => f.startsWith('deployment-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const latest = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, files[0]), 'utf8'));
  return latest;
}

function updateREADME(deployment) {
  let readme = fs.readFileSync(README_PATH, 'utf8');
  
  // Replace placeholder contract address
  readme = readme.replace(
    /0x0000000000000000000000000000000000000000/g,
    deployment.contractAddress
  );
  
  // Add deployment section
  const deploymentSection = `
## Deployment

| Environment | Contract Address | Explorer |
|---|---|---|
| QDay Aevum Testnet | \`${deployment.contractAddress}\` | [Link](${deployment.explorerUrl}) |

Deployed at: ${deployment.deployedAt}
`;
  
  // Insert before ## License
  readme = readme.replace('## License', deploymentSection + '\n## License');
  
  fs.writeFileSync(README_PATH, readme);
  console.log('✅ README updated with deployment info');
}

const dep = getLatestDeployment();
if (dep) {
  console.log('Latest deployment:', dep.contractAddress);
  updateREADME(dep);
} else {
  console.log('⚠️ No deployment found. Deploy first using DEPLOY-GUIDE.md');
}
