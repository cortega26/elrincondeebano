# Plan 052: Rebuild the Content Manager as a task-oriented workspace

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/ui admin/product_manager/category_gui.py admin/product_manager/content_manager.py admin/product_manager/tests`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 039–051
- **Category**: direction
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

The current interface spreads Products, Categories, Combos, Favorites, Media,
Sync, and Publishing across menus, modal dialogs, two dense horizontal bars,
status widgets, and a deploy toolbar. The redesign should optimize the operator
workflow—find content, edit with context, review changes, validate, publish—not
merely restyle the same structure.

## Current state

- `main_window.py:450-519` distributes feature entry points across menus.
- `main_window.py:560-678` packs search, category, price, quick views, archive,
  and deployment horizontally.
- `main_window.py:680-774` packs CRUD, seven bulk actions, undo, and redo along
  the bottom.
- Categories and storefront content open separate modal applications at
  `main_window.py:1364-1429`.
- `components.py:278-313` positions dashboard cards with fixed pixel geometry.

## Commands

| Purpose    | Command                                                                                                                                                                              | Expected |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| UI tests   | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q -k ui`                                                                                              | pass     |
| Full tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                    | pass     |
| Lint/type  | `admin/product_manager/.venv/bin/ruff check admin/product_manager && admin/product_manager/.venv/bin/python -m mypy admin/product_manager --no-incremental --cache-dir=/tmp/pm-mypy` | exit 0   |

## Scope

**In scope**: Tk UI modules, theme/components, presenter view adapters, keyboard
navigation, preferences/help, and UI tests. Retain the existing service layer.

**Out of scope**: framework rewrite, web/Electron port, storefront changes,
new business capabilities beyond the staged workflow, or data-schema migration.

## Git workflow

- Branch: `advisor/052-content-workspace`
- Use feature-slice commits; keep the app runnable after every slice.

## Target information architecture

- Persistent navigation: **Products**, **Categories**, **Storefront**, **Media**,
  **Changes**, **Publish**.
- Header: global search/command entry, current catalog/environment, sync health.
- Main collection pane: saved views, filters in a collapsible panel, list/gallery.
- Inspector pane: non-modal details and quick edits for current selection.
- Contextual action bar: actions change with selection; bulk actions move into a
  labeled menu with preview rather than seven always-visible abbreviations.
- Changes/Publish: exact staged diff, validation issues, artifacts, branch/remote,
  and primary Review/Publish action.

## Steps

1. Write interaction contracts and wireframes as comments/tests before widgets:
   navigation, focus order, empty/loading/error/dirty states, destructive actions,
   and small-window behavior.
2. Build the persistent application shell with resizable panes and a minimum
   supported window size. Remove fixed placement where content should determine size.
3. Move Products into collection + inspector without changing presenter APIs.
   Preserve list/gallery, saved filters, selection, inline edit, and history.
4. Move Categories and Storefront editors into workspace pages; keep modal
   dialogs only for focused confirmation or compact creation tasks.
5. Add Media and Changes pages backed by plans 041 and 051. Expose missing,
   orphaned, moved, generated, and pending assets.
6. Make Publish a review destination backed by plan 045, not a permanent toolbar.
7. Complete keyboard navigation, focus visibility, labels, shortcut discovery,
   scalable fonts, light/dark theme tokens, and reduced-motion behavior.
8. Update embedded Help to describe workflows and recovery, not merely list features.

## Test plan

Test navigation state, focus traversal, keyboard-only CRUD, responsive pane
behavior, selection preservation between pages, loading/error/empty states,
theme/font scaling, staged changes, and publish review. Use presenter/view
contract tests rather than pixel snapshots.

## Done criteria

- [ ] All six workspace destinations exist with one navigation model.
- [ ] Core edit/review/publish flow requires no menu hunting.
- [ ] Layout remains usable at documented minimum and with maximum font size.
- [ ] Keyboard-only workflow covers browse, edit, review, and publish confirmation.
- [ ] No business logic returns to widget classes.
- [ ] UI/full tests, Ruff, and mypy pass; README updated.

## STOP conditions

- Plan 050 presenter boundaries are incomplete.
- Redesign requires changing domain behavior without a separate plan/test.
- The executor starts a framework rewrite or touches code outside the folder.
- A visual decision lacks a defined workflow or state requirement.

## Maintenance notes

Optimize for frequent operator tasks and recovery from errors. New features get
a workspace destination only if they represent a durable content domain; small
actions belong in contextual commands.
