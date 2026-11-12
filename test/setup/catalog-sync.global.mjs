// Plan 284: the Astro catalog copies are generated (gitignored). Root vitest
// imports astro-poc/src/lib/catalog.ts, which reads them, so regenerate the
// JSON projections once per run (no asset mirror).
import { runJsonSync } from '../../astro-poc/scripts/sync-data.mjs';

export default function setup() {
  runJsonSync();
}
