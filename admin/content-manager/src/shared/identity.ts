export function generateUuidV7(): string {
  const ms = Date.now();

  // 48-bit timestamp: upper 16 bits + lower 32 bits = 12 hex chars
  const tHi = Math.floor(ms / 0x100000000);
  const tLo = ms % 0x100000000;
  const ts = tHi.toString(16).padStart(4, '0') + tLo.toString(16).padStart(8, '0');

  // Plan 125: crypto random for the 74 random bits (was Math.random — these
  // ids gate unauthenticated read endpoints). getRandomValues works in
  // Node 24 and browsers (secure contexts); the UUIDv7 layout is unchanged.
  const rand = new Uint8Array(11);
  globalThis.crypto.getRandomValues(rand);

  // rand_a: 12 bits = 3 hex chars
  const randA = (((rand[0] << 4) | (rand[1] >> 4)) & 0xfff).toString(16).padStart(3, '0');

  // Variant byte (10xxxxxx) + 8 random bits: 4 hex chars
  const variantByte = 0x80 | (rand[1] & 0x3f);
  const variantPair =
    variantByte.toString(16).padStart(2, '0') + rand[2].toString(16).padStart(2, '0');

  // Remaining random: 64 bits = 16 hex chars
  const randRemaining = Array.from({ length: 8 }, (_, i) =>
    rand[3 + i].toString(16).padStart(2, '0')
  ).join('');

  const hex = ts + '7' + randA + variantPair + randRemaining;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function generateProductId(): string {
  return generateUuidV7();
}
export function isUuidV7(value: string): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return false;
  }
  return true;
}

/**
 * Rejects ids that could escape a directory when interpolated into a path.
 * Generated ids (cs-<ts>-<rand>, timestamps, uuids) all satisfy the regex.
 */
export function isSafeId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 128 &&
    !id.includes('/') &&
    !id.includes('\\') &&
    !id.includes('..') &&
    /^[A-Za-z0-9._-]+$/.test(id)
  );
}

// Plan 090: path-segment containment — true when `candidate` is strictly
// inside `root`. Replaces string-prefix checks, which accept sibling
// directories (e.g. data/.media-staging2/ passes a startsWith check on
// data/.media-staging). Pure string logic (shared with the web bundle, no
// node:path imports); posix-style paths.
export function isContainedWithin(root: string, candidate: string): boolean {
  const rootParts = root.split('/').filter((s) => s.length > 0);
  const candParts = candidate.split('/').filter((s) => s.length > 0);
  if (candParts.length < rootParts.length) return false;
  for (let i = 0; i < rootParts.length; i++) {
    if (rootParts[i] !== candParts[i]) return false;
  }
  return !candParts.slice(rootParts.length).some((s) => s === '..');
}
