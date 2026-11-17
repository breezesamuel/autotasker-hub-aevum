/**
 * oss-proxy unit tests
 */
const assert = require('assert');
const { registerTool, runTool, getRegistryStatus } = require('../lib/oss-proxy');

// Test 1: Register and query status
registerTool({ id: 'test_cli_001', handle: 'test/tool', strategy: 'cli_wrapper', cmd: 'echo', args: ['hello'], blocked: false });
const status = getRegistryStatus();
assert.strictEqual(status.total, 1, 'should have 1 tool');
assert.strictEqual(status.blocked, 0, 'tool should not be blocked');
console.log('PASS: registerTool + getRegistryStatus (total=' + status.total + ' available=' + status.available + ' blocked=' + status.blocked + ')');

// Test 2: Blocked tool detection (different ID)
registerTool({ id: 'test_blocked_002', handle: 'test/blocked', strategy: 'cli_wrapper', blocked: true });
const status2 = getRegistryStatus();
assert.strictEqual(status2.blocked, 1, 'should have 1 blocked tool (got ' + status2.blocked + ')');
assert.strictEqual(status2.available, 1, 'should have 1 available tool');
console.log('PASS: blocked tool detection (total=' + status2.total + ' available=' + status2.available + ' blocked=' + status2.blocked + ')');

// Test 3: Unknown tool throws
(async () => {
  try {
    await runTool('nonexistent_tool_xyz', {});
    console.log('FAIL: should have thrown for unknown tool');
    process.exit(1);
  } catch (e) {
    assert(e.message.includes('unknown tool'), 'expected "unknown tool" error, got: ' + e.message);
    console.log('PASS: unknown tool rejection');
    console.log('\nAll OSS proxy tests passed (' + status2.total + ' tools in registry)');
    process.exit(0);
  }
})();
