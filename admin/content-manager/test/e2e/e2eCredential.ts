// Plan 183: single source for the harness credential in e2e specs. The
// value is generated per run by the playwright config (or exported manually
// for manual harness runs) — it is never committed anywhere in the tree.
export function e2eCredential(): string {
  const value = process.env.ADMIN_CREDENTIAL;
  if (!value) {
    throw new Error(
      'ADMIN_CREDENTIAL is not set — run the suite through its playwright ' +
        'config (it generates one per run) or export ADMIN_CREDENTIAL for ' +
        'manual harness runs.'
    );
  }
  return value;
}
