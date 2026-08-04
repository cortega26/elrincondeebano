# Cutover Plan — TypeScript Content Manager

- Plan: 055 Phase 12
- Date: 2026-07-16

## Current state

The TypeScript Content Manager (`admin/content-manager/`) is functional for the
covered workflows, but certification is **in progress, not complete**. The
newest certification report
(`reports/certification/certification-2026-07-16T15-36-32-416Z.json`) records
`summary: { total: 30, pass: 6, fail: 2, untested: 20, manual: 2 }` and its
exit gate is not met (line coverage below threshold, e2e smoke failing). The
parity report
(`reports/parity/parity-2026-07-16T16-10-34-672Z.json`) samples 9 of 184
products and its category row is missing ("Python golden category file not
found"). Closing the gap is tracked by plans 056–069 (Auditoría 6) and the
Wave 4 gate of the Auditoría 7 queue; this document must be revisited when
plan 069 lands.

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
