const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const workflow = fs.readFileSync('.github/workflows/live-contract-monitor.yml', 'utf8');

test('live contract workflow routes report status instead of raw process outcome', () => {
  assert.match(workflow, /echo "status=\$monitor_status" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /steps\.monitor\.outputs\.status == 'failed'/);
  assert.match(workflow, /steps\.monitor\.outputs\.status == 'inconclusive'/);
  assert.match(workflow, /steps\.monitor\.outputs\.status == 'passed'/);
  assert.doesNotMatch(workflow, /steps\.monitor\.outcome/);
});

test('live contract workflow updates one incident and only blocks confirmed failures', () => {
  assert.match(workflow, /gh issue edit "\$ISSUE_NUMBER"/);
  assert.equal((workflow.match(/gh issue comment "\$ISSUE_NUMBER"/g) || []).length, 1);
  assert.match(workflow, /Monitor recovered in run/);
  assert.match(
    workflow,
    /name: Fail job when monitor fails[\s\S]*?if: \$\{\{ steps\.monitor\.outputs\.status == 'failed' \}\}/
  );
  assert.match(workflow, /Cloudflare challenged the GitHub-hosted observer/);
});

test('live contract workflow passes the WAF bypass secret to the monitor step', () => {
  assert.match(
    workflow,
    /LIVE_MONITOR_BYPASS_TOKEN: \$\{\{ secrets\.LIVE_MONITOR_BYPASS_TOKEN \}\}/
  );
});
