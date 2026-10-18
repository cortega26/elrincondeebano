# Plan 234: One Archivo file — dedupe the byte-identical font instances behind the five @font-face faces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- assets/fonts/ tools/fetch-fonts.mjs astro-poc/src/layouts/BaseLayout.astro`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`assets/fonts/archivo-{400,500,600,700,800}.woff2` are **five copies of the
same bytes** (md5 `cd56e2ec63d7a63df092f824f981253c`, 34 928 B each — it is
a _variable_ font; `fc-scan` reports wght instances Thin→Black). The
`@font-face` rules point at five distinct URLs, so a cold visit to a page
that uses several weights fetches up to 3–5 copies of the same file —
105–175 KB where 35 KB suffices — on the LCP-critical path.

The safe fix (verified against plan 216's constraints): keep the five
`@font-face` declarations with their per-weight `font-display`
(swap for 400/500/600, optional for 700/800 — deliberately different, do
NOT change) and simply point all five `src` URLs at **one** file. Browsers
fetch the URL once. Do **not** add a `<link rel="preload">` (plan 216
deferred preload explicitly: "sin preload en primera iteración — medir LH
antes") and do not collapse the faces into a single `font-weight: 100 900`
declaration (that would force one `font-display`).

## Current state

`assets/fonts/fonts.css` — five blocks, e.g.:

```css
@font-face {
  font-family: 'Archivo';
  src: url('./archivo-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* … 500 swap, 600 swap, 700 optional, 800 optional … */
```

`tools/fetch-fonts.mjs:206-230` — targets map one file per weight:

```js
const targets = [
  { family: 'Archivo', weight: '400', file: 'archivo-400.woff2' },
  ...
];
for (const t of targets) { /* find block → extractWoff2Url → fetchFontAsset → dest */ }
```

`astro-poc/src/layouts/BaseLayout.astro:93` loads
`/assets/fonts/fonts.css` (leave as is; the public files are build-synced
by `astro-poc/scripts/sync-data.mjs` — do not hand-edit
`astro-poc/public/assets/fonts/`).

Repo rules that must stay green: `npm run guardrails` (includes
`guardrails:assets`/orphan-assets) and `npm run lint:images`.

## Commands you will need

| Purpose    | Command                                                     | Provenance | Expected on success |
| ---------- | ----------------------------------------------------------- | ---------- | ------------------- |
| Install    | `npm ci`                                                    | declared   | exit 0              |
| Fonts tool | `ALLOW_REMOTE_FONTS=1 npm run fonts` (network; regenerates) | declared   | exit 0              |
| Fast build | `npm run build:fast`                                        | declared   | exit 0              |
| Guardrails | `npm run guardrails && npm run guardrails:assets`           | declared   | exit 0              |
| Tests      | `npm test`                                                  | declared   | all pass            |

## Scope

**In scope**:

- `assets/fonts/fonts.css`
- `assets/fonts/archivo.woff2` (renamed from `archivo-400.woff2`) and
  deletion of the other four files
- `tools/fetch-fonts.mjs`

**Out of scope**:

- `BaseLayout.astro` (no preload, no extra tags).
- `astro-poc/public/assets/fonts/**` (generated).
- Font weights/`font-display` values, `unicode-range`, any CSS consumer.

## Git workflow

- Branch: `advisor/234-fonts-single-file`
- Commit: `perf(fonts): single variable file behind the five faces (plan 234)`.

## Steps

### Step 0: Establish a green baseline

`npm ci` then `npm run guardrails && npm run guardrails:assets` on the
unmodified checkout. Red → STOP.

### Step 1: Repoint the CSS and dedupe the files

- `git mv assets/fonts/archivo-400.woff2 assets/fonts/archivo.woff2`.
- `git rm assets/fonts/archivo-{500,600,700,800}.woff2`.
- In `fonts.css`, change all five `src: url('./archivo-….woff2')` to
  `src: url('./archivo.woff2')`. Everything else stays identical.

**Verify**: `md5sum assets/fonts/archivo.woff2` equals
`cd56e2ec63d7a63df092f824f981253c`; `ls assets/fonts/*.woff2` → exactly one
file.

### Step 2: Teach `fetch-fonts.mjs` the single-destination shape

- Change all five targets to `file: 'archivo.woff2'`.
- Add an in-run dedupe so the URL is fetched/written once:

  ```js
  const processed = new Set();
  for (const t of targets) {
    ...
    const dest = path.join(outDir, t.file);
    if (processed.has(dest)) continue;
    processed.add(dest);
    await fetchFontAsset(url, cssPath, dest);
  }
  ```

  Keep the per-weight block lookup/warnings (a Google CSS change that drops
  a weight should still warn).

**Verify**: run `ALLOW_REMOTE_FONTS=1 npm run fonts` (network) → exit 0,
exactly one `.woff2` in `assets/fonts/` after it, and `git status` shows the
regenerated file **byte-identical** to the committed one (if Google serves
newer bytes, STOP and report — that is a separate decision).

### Step 3: Build + guards + behavior

- `npm run build:fast` → `ls astro-poc/dist/assets/fonts/` shows one file.
- `npm run guardrails && npm run guardrails:assets` → exit 0.
- `npm test` → all pass (the e2e/visual suites pin typography geometry; a
  font substitution failure would surface there — run `npm run test:e2e` if
  the fast build changed dist).

**Verify**: commands above green.

### Step 4: Optional evidence (not a gate)

If convenient, run `npm run lighthouse:audit` and compare against the last
recorded numbers (plan 216: mobile 71/100/100/100, desktop 100s). The change
strictly reduces bytes; if a metric regresses, STOP and report (do not
chase it here).

## Test plan

- No new unit tests warranted; the enforced nets are guardrails:assets
  (orphan/dead font detection), the e2e visual/tipography pins, and the
  build. If a fonts-related test exists (check `grep -rn "archivo-" test/`),
  update its file expectations.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls assets/fonts/*.woff2 | wc -l` = 1
- [ ] `grep -c "url('./archivo.woff2')" assets/fonts/fonts.css` = 5
- [ ] `grep -rn "archivo-[0-9]" assets/fonts/fonts.css tools/fetch-fonts.mjs test/ docs/` returns nothing (allow archived plans if any — report)
- [ ] `npm run guardrails && npm run guardrails:assets` exit 0
- [ ] `npm run build:fast` exit 0; `ls astro-poc/dist/assets/fonts/` = 1 woff2
- [ ] `npm test` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `md5sum` shows the five files are NOT identical on your checkout (the
  finding premise would be false — report hashes).
- `npm run fonts` regenerates different bytes (report; do not commit the
  new bytes without the owner deciding).
- Guardrails flag the removed files as orphans of a different kind (report
  the exact guard output).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- If a future font gets a genuinely different file per weight (not
  variable), the dedupe Set must key on the resolved URL, not the dest
  filename.
- Reviewer: confirm `font-display` values are untouched (swap/swap/swap/
  optional/optional).
- **Deferred:** font `preload` (plan 216's explicit deferral — revisit with
  measured LH).
