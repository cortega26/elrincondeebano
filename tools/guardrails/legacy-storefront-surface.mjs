import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DOC_TARGETS = [
  'README.md',
  'AGENTS.md',
  'docs/INCIDENTS.md',
  'docs/repo/STRUCTURE.md',
  'docs/operations/QUALITY_GUARDRAILS.md',
];

const DEFAULT_RUNNER_TARGETS = ['test/run-all.js'];
const LEGACY_ROOT_PATHS = [
  'templates',
  'tools/build.js',
  'tools/build-pages.js',
  'tools/build-index.js',
  'tools/build-components.js',
  'tools/copy-static.js',
  'test/buildIndex.lcp.test.js',
  'test/template.seo-accessibility.test.js',
  'test/noFlicker.stylesheetLoading.test.js',
];

const DOC_RULES = {
  'README.md': [
    {
      label: 'legacy templates presented as active storefront surface',
      regex: /templates\/|\.ejs\b/,
    },
    {
      label: 'legacy storefront builders presented in active README path',
      regex: /tools\/build(?:-pages|-index|-components)?\.js|tools\/copy-static\.js/,
    },
  ],
  'AGENTS.md': [
    {
      label: 'legacy templates mentioned in active PR guidance',
      regex: /templates\/\*\*/,
    },
  ],
  'docs/INCIDENTS.md': [
    {
      label: 'legacy navbar incident path',
      regex: /templates\/partials\/navbar\.ejs/,
    },
  ],
  'docs/repo/STRUCTURE.md': [
    {
      label: 'legacy templates described as active storefront surface',
      regex: /`templates\/`:\s*EJS templates for landing,\s*category pages,\s*and partials\./,
    },
  ],
  'docs/operations/QUALITY_GUARDRAILS.md': [
    {
      label: 'legacy routing surface described as active production area',
      regex: /Routing and category URLs \(`templates\/`,\s*`tools\/build-pages\.js`,/s,
    },
  ],
};

const RUNNER_RULES = [
  'buildIndex.lcp.test.js',
  'template.seo-accessibility.test.js',
  'noFlicker.stylesheetLoading.test.js',
];

function readTarget(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return fs.readFileSync(absolutePath, 'utf8');
}

function scanTargets(repoRoot, targets, ruleMap) {
  const findings = [];

  for (const relativePath of targets) {
    const content = readTarget(repoRoot, relativePath);
    if (content === null) {
      continue;
    }

    const rules = ruleMap[relativePath] ?? [];
    for (const rule of rules) {
      if (rule.regex.test(content)) {
        findings.push({
          file: relativePath,
          label: rule.label,
        });
      }
    }
  }

  return findings;
}

function scanRunnerTargets(repoRoot, targets, blockedEntries) {
  const findings = [];

  for (const relativePath of targets) {
    const content = readTarget(repoRoot, relativePath);
    if (content === null) {
      continue;
    }

    for (const entry of blockedEntries) {
      if (content.includes(entry)) {
        findings.push({
          file: relativePath,
          label: `legacy test entry ${entry}`,
        });
      }
    }
  }

  return findings;
}

export function findLegacyStorefrontSurfaceReferences({
  repoRoot = process.cwd(),
  docTargets = DEFAULT_DOC_TARGETS,
  runnerTargets = DEFAULT_RUNNER_TARGETS,
} = {}) {
  return [
    ...LEGACY_ROOT_PATHS.filter((relativePath) =>
      fs.existsSync(path.join(repoRoot, relativePath))
    ).map((relativePath) => ({
      file: relativePath,
      label: 'legacy storefront path still present in repository root',
    })),
    ...scanTargets(repoRoot, docTargets, DOC_RULES),
    ...scanRunnerTargets(repoRoot, runnerTargets, RUNNER_RULES),
  ];
}

function formatFindings(findings) {
  return findings.map((finding) => `- ${finding.file}: ${finding.label}`).join('\n');
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const findings = findLegacyStorefrontSurfaceReferences();
  if (findings.length > 0) {
    console.error(
      [
        'Active docs/test runner still reference legacy storefront surfaces.',
        formatFindings(findings),
        'Move those references to audit/inventory docs or the manual legacy test script.',
      ].join('\n')
    );
    process.exit(1);
  }

  console.log('Legacy storefront surface guardrails passed.');
}
