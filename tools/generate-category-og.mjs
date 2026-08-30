import {
  deleteCategoryAssets,
  ensureCategoryAssets,
  lookupTitleForSlug,
  syncCategoryAssets,
} from './utils/category-og.mjs';

if (process.env.PREFLIGHT_SKIP_OG === '1') {
  console.log('PREFLIGHT_SKIP_OG=1: skipping category OG image generation.');
  process.exit(0);
}

function parseArgs(argv) {
  const result = {
    sync: false,
    one: null,
    deleteSlug: null,
    title: null,
    dryRun: false,
    force: false,
    repoRoot: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sync') {
      result.sync = true;
    } else if (arg === '--one') {
      result.one = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--delete') {
      result.deleteSlug = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--title') {
      result.title = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--repo-root') {
      result.repoRoot = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }
  return result;
}

function printHelp() {
  console.log(`Category OG pipeline (Node, batch renderer per plan 156)
Usage:
  node tools/generate-category-og.mjs --sync [--dry-run] [--force] [--repo-root <path>]
  node tools/generate-category-og.mjs --one <slug> [--title <title>] [--dry-run] [--force] [--repo-root <path>]
  node tools/generate-category-og.mjs --delete <slug> [--dry-run] [--repo-root <path>]
`);
}

async function main() {
  const userArgs = process.argv.slice(2);
  const hasCommand =
    userArgs.includes('--sync') || userArgs.includes('--one') || userArgs.includes('--delete');
  const args = hasCommand ? userArgs : ['--sync', ...userArgs];
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const hasSync = parsed.sync;
  const hasOne = Boolean(parsed.one);
  const hasDelete = Boolean(parsed.deleteSlug);
  const commandCount = (hasSync ? 1 : 0) + (hasOne ? 1 : 0) + (hasDelete ? 1 : 0);
  if (commandCount !== 1) {
    console.error('ERROR: specify exactly one of --sync, --one <slug>, --delete <slug>');
    process.exit(2);
  }

  try {
    let result;
    if (parsed.sync) {
      result = await syncCategoryAssets({
        repoRoot: parsed.repoRoot,
        dryRun: parsed.dryRun,
        force: parsed.force,
      });
    } else if (parsed.one) {
      let title = parsed.title;
      if (!title) {
        try {
          title = lookupTitleForSlug(parsed.one, { repoRoot: parsed.repoRoot }) || parsed.one;
        } catch {
          title = parsed.one;
        }
      }
      result = await ensureCategoryAssets(parsed.one, {
        title,
        repoRoot: parsed.repoRoot,
        dryRun: parsed.dryRun,
        force: parsed.force,
      });
    } else {
      result = await deleteCategoryAssets(parsed.deleteSlug, {
        repoRoot: parsed.repoRoot,
        dryRun: parsed.dryRun,
      });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
