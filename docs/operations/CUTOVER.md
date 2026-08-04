# Cutover Plan — TypeScript Content Manager

- Plan: 055 Phase 12
- Date: 2026-07-16

## Current state

The TypeScript Content Manager (`admin/content-manager/`) is fully functional
for all product, category, storefront, media, import, conflict, history, and
publication workflows. It has been certified with 21/21 parity rows passing.

The Python Tkinter manager (`admin/product_manager/`) remains the active read
fallback.

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
