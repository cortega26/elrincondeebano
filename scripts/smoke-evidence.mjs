import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    output: null,
    status: process.env.SMOKE_STATUS || 'pending',
    baseUrl: process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173',
    commit: process.env.GITHUB_SHA || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runUrl: process.env.SMOKE_RUN_URL || null,
    signedBy: process.env.SMOKE_SIGNED_BY || '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith('--')) continue;

    if (key === '--output' && next) {
      args.output = next;
      i += 1;
    } else if (key === '--status' && next) {
      args.status = next;
      i += 1;
    } else if (key === '--base-url' && next) {
      args.baseUrl = next;
      i += 1;
    } else if (key === '--commit' && next) {
      args.commit = next;
      i += 1;
    } else if (key === '--run-id' && next) {
      args.runId = next;
      i += 1;
    } else if (key === '--run-url' && next) {
      args.runUrl = next;
      i += 1;
    } else if (key === '--signed-by' && next) {
      args.signedBy = next;
      i += 1;
    }
  }

  return args;
}

function getGitCommitFallback() {
  try {
    return execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function createDefaultOutputPath(commit) {
  const shortCommit = (commit || 'unknown').slice(0, 8);
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  return path.join('reports', 'smoke', `smoke-evidence-${stamp}-${shortCommit}.md`);
}

function buildEvidenceContent({
  generatedAt,
  status,
  baseUrl,
  commit,
  runId,
  runUrl,
  signedBy,
}) {
  return [
    '# Smoke Evidence',
    '',
    `- Generated At (UTC): ${generatedAt}`,
    `- Status: ${status}`,
    `- Base URL: ${baseUrl}`,
    `- Commit: ${commit}`,
    `- CI Run ID: ${runId || 'n/a'}`,
    `- CI Run URL: ${runUrl || 'n/a'}`,
    `- Signed By: ${signedBy || 'pending'}`,
    '',
    '## Checklist',
    '',
    '- [ ] Homepage',
    '- [ ] Category navigation',
    '- [ ] Search/filter',
    '- [ ] Product detail interaction',
    '- [ ] Cart flow',
    '- [ ] Checkout/contact',
    '',
    '## Notes',
    '',
    '- Pending manual completion.',
    '',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const commit = args.commit || getGitCommitFallback();
  const outputPath = args.output || createDefaultOutputPath(commit);
  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
  const generatedAt = new Date().toISOString();

  const content = buildEvidenceContent({
    generatedAt,
    status: args.status,
    baseUrl: args.baseUrl,
    commit,
    runId: args.runId,
    runUrl: args.runUrl,
    signedBy: args.signedBy,
  });

  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, content, 'utf8');

  const relativePath = path.relative(process.cwd(), absoluteOutputPath).replace(/\\/g, '/');
  console.log(`Smoke evidence template generated: ${relativePath}`);
}

main();
