# Cutover Plan — TypeScript Content Manager

- Plan: 055 Phase 12
- Date: 2026-07-16

## Current state

The TypeScript Content Manager (`admin/content-manager/`) is functional for the
covered workflows and its automated certification checks are green: `Admin
Tools CI` runs typecheck, vitest, coverage, build, shadow-read, parity, E2E
smoke (15 tests) and doctor on every `admin/**` change, and the certification
report gates on those checks (`npm run certify -- --ci`). The parity rows
(20 of 30) remain operator-signed artifacts of the migration: they are
evaluated by the full gate (`npm run admin:certify`, which requires
`untested == 0`) and are not expected to be green on a fresh runner. Closing
that remaining gap is tracked by plans 056–069 (Auditoría 6) and the Wave 4
gate of the Auditoría 7 queue; this document must be revisited when plan 069
lands.

> The certification/parity reports are **local evidence artifacts**, generated
> by `npm run admin:certify` / `admin:parity` (they are not committed — the
> root `.gitignore` excludes `reports/`). The exact filenames above are the
> newest ones present at audit time; re-run the commands to regenerate them.

The Python Tkinter manager (`admin/product_manager/`) remains the active read
fallback during the transition window (plan 069).

## Cutover steps

### Step 1: Make TypeScript the canonical entry point

```bash
# New canonical command
npm run admin:dev     # Start TypeScript Content Manager in dev mode
npm run admin:start   # Production start
```

### Step 2: Archive Python compatibility evidence

```bash
npm run admin:certify   # Generate certification report
npm run admin:parity    # Verify Python/TS output equivalence
```

### Step 3: Verify standalone operation

```bash
# From a clean clone:
npm ci
npm run admin:validate   # typecheck + test + build + parity
npm run admin:start      # verify server starts
npm run build            # verify storefront still builds
```

### Step 4: Fallback window (1 week minimum)

During this period:

- Python manager remains runnable as fallback
- Operators use TypeScript manager for all active work
- Any Python-only operations are identified and migrated
- Review diffs between Python and TypeScript output

### Step 5: Python Tk retirement (after fallback window + approval)

After maintainer approval:

- Remove `admin/product_manager/` from the active tree
- Tag the last commit with Python as `v1.x-python-final`
- Remove Python-specific CI jobs and dependencies
- Update all documentation to reference only the TypeScript manager

## Rollback instructions

### Before Python deletion

```bash
# Revert to Python as canonical entry
git revert <python-retirement-commit>
npm run admin:start  # still works (no Python needed for validate)
python admin/product_manager/content_manager.py  # fallback manager
```

### After Python deletion (within fallback window)

```bash
# Restore Python from the tagged release
git checkout v1.x-python-final -- admin/product_manager/
# Reinstall Python dependencies
cd admin/product_manager && python -m venv .venv && .venv/bin/pip install -r requirements.txt
# Verify Python manager works
.venv/bin/python content_manager.py
```

### No reverse data migration needed

The TypeScript manager writes to the same canonical `data/product_data.json`
format as Python. No schema downgrade or data transformation is required to
roll back.

## Post-cutover

- `npm run admin:start` is the canonical documented entry point
- No documentation or CI path references Python/Tk as active
- `data/backups/` contains pre-cutover snapshots for recovery
