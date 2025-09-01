// Prunes product_data.json backups, keeping only the most recent N (default 3)
// Looks in common locations used in this repo.

const fs = require('fs');
const path = require('path');

const LOCATIONS = [
  path.resolve(__dirname, '..', '_products'),
  path.resolve(process.env.USERPROFILE || process.env.HOME || '', 'OneDrive', 'Tienda Ebano', '_products'),
];

const FILENAME_PREFIX = 'product_data.backup_';
const KEEP = parseInt(process.env.PRUNE_KEEP || '3', 10) || 3;

function listBackups(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.startsWith(FILENAME_PREFIX))
      .map((e) => {
        const p = path.join(dir, e.name);
        const stat = fs.statSync(p);
        return { path: p, name: e.name, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
  } catch (e) {
    return [];
  }
}

function prune(dir) {
  const backups = listBackups(dir);
  if (backups.length <= KEEP) return { dir, removed: [] };
  const toRemove = backups.slice(0, backups.length - KEEP);
  toRemove.forEach((b) => {
    try {
      fs.unlinkSync(b.path);
      console.log(`Removed ${b.path}`);
    } catch (e) {
      console.warn(`Failed to remove ${b.path}: ${e.message}`);
    }
  });
  return { dir, removed: toRemove.map((b) => b.path) };
}

function main() {
  const results = LOCATIONS.map(prune);
  const totalRemoved = results.reduce((sum, r) => sum + r.removed.length, 0);
  console.log(`Prune completed. Removed ${totalRemoved} old backups.`);
}

main();

