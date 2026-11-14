/**
 * OpenGraph + SEO meta tags generator for landing page
 * Ensures our link looks good when shared on Twitter, LinkedIn, Discord
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const ogHtml = `
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://autotasker-hub.vercel.app/">
  <meta property="og:title" content="AutoTasker Hub — Machine-Payable Data API for AI Agents">
  <meta property="og:description" content="Real-time China trending data & price intelligence. $0.05/call via x402 USDC on Base. Score 100/100. Free sample available.">
  <meta property="og:image" content="https://autotasker-hub.vercel.app/og-image.png">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="https://autotasker-hub.vercel.app/">
  <meta name="twitter:title" content="AutoTasker Hub — Machine-Payable Data API">
  <meta name="twitter:description" content="242 rows across 9 Chinese public boards. Pay $0.05/call in USDC. Built for AI agents.">
  <meta name="twitter:image" content="https://autotasker-hub.vercel.app/og-image.png">
  
  <!-- Additional SEO -->
  <meta name="robots" content="index, follow">
  <meta name="keywords" content="x402, AI agent, data API, China trends, Baidu hot search, price intelligence, USDC, Base blockchain, AgentPay, machine payment">
  <link rel="canonical" href="https://autotasker-hub.vercel.app/">
`;

console.log('=== SEO Meta Tags ===\n');
console.log(ogHtml);

// Save to file for reference
fs.writeFileSync(path.join(PUBLIC_DIR, 'seo-meta.txt'), ogHtml);
console.log('\n✅ Saved to public/seo-meta.txt');

// Generate a simple OG image description (actual PNG would need canvas/imagegen)
console.log('\n=== Suggested OG Image Specs ===\n');
console.log('Size: 1200x630px');
console.log('Background: Dark gradient (#0a0a0f → #1a1a2e)');
console.log('Title: "AutoTasker Hub" in large white text');
console.log('Subtitle: "Machine-Payable China Data API"');
console.log('Badges: "Score 100/100" | "$0.05/call" | "x402"');
console.log('Logo: Simple icon (robot + chart)');
console.log('URL at bottom: autotasker-hub.vercel.app');
