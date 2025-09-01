# AGENTS

This repository contains the source code for the static website **El Rincón de Ébano**. It is built with Node.js scripts, EJS templates and static assets. Follow the guidelines below when contributing.

## General Guidelines

- Keep changes focused and minimal; avoid unrelated edits in the same commit.
- Commit messages and pull request descriptions must be in **English**.
- All user-facing text (HTML, JSON, UI strings) must remain in **Spanish**.
- Ensure the working tree is clean (`git status` shows no changes) before finishing a task.

## Coding Conventions

- Use **two spaces** for indentation; never use tabs.
- End statements with semicolons.
- Prefer `const` and `let`; avoid `var`.
- Place `require`/`import` statements at the top of files.
- Use single quotes `'` for strings unless HTML requires double quotes.
- Keep functions small and descriptive. Extract helpers when logic becomes complex.
- Document non-trivial logic with comments.

## Directory Overview

- `assets/` – Static assets (JS, CSS, images, fonts).
  - `assets/js/` – Front-end scripts bundled via esbuild.
  - `assets/css/` – Stylesheets.
  - `assets/images/variants/` – Generated image variants.
- `templates/` – EJS templates for generating pages. Modify these instead of files in `pages/`.
- `pages/` – Generated HTML pages. **Do not edit directly**; run the build to regenerate.
- `scripts/` – Node build and maintenance scripts.
- `test/` – Node-based unit tests.
- `admin/`, `admin-panel/` – Administrative tools; follow existing patterns when editing.

## Testing and Build

- Install dependencies with `npm install` before running scripts.
- Run `npm test` after modifying any code. Add or update tests for new functionality.
- For changes affecting templates or assets, run `npm run build` to regenerate output.
- When adding or updating product images, run `npm run images:variants` to produce responsive variants and update manifests.
- Ensure all scripts complete successfully before committing.

## Commit & PR Guidelines

- Use concise, present-tense commit messages (e.g., `Add cart utility tests`).
- Group related changes into a single commit.
- Reference relevant files or issues in commit messages when helpful.
- Avoid committing temporary files, editor configs, or build artifacts outside version-controlled directories.
- Provide a clear summary of changes and testing steps in the PR description.

## Environment

- Target **Node.js 18** or later.
- Use `npm` for package management. Do not switch to `yarn` or `pnpm` without explicit instruction.
- Scripts assume a POSIX-like shell environment.

## Documentation

- Update `README.md` or other docs when behavior or setup steps change.
- Keep comments and documentation in sync with the code.

---

These instructions are intended for machine agents working on this repository. If you must deviate from them, explain why in your pull request.
