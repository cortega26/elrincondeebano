# Documentation Policy

Verified: 2026-07-15

This policy keeps documentation concise, current, and useful to humans and
agents. The repository remains the source of truth; documentation explains the
executable contract but does not override it.

## Source-of-truth order

When two sources disagree, resolve the discrepancy in this order:

1. versioned executable configuration, tests, and workflow files;
2. `docs/repo/ACTIVE_SURFACES.json` and accepted ADRs;
3. `README.md`, `CONTRIBUTING.md`, and `docs/START_HERE.md`;
4. focused architecture and operations docs;
5. audit, migration, incident, and release records.

Historical records describe what was true at a point in time. Do not silently
rewrite their old commands or outcomes; label or supersede them when readers
might mistake them for current guidance.

## Document classes

| Class               | Examples                                             | Maintenance rule                                             |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Entry point         | `README.md`, `CONTRIBUTING.md`, `docs/START_HERE.md` | Short, task-oriented, and updated with every contract change |
| Canonical reference | architecture, onboarding, operations, ADRs           | Own one topic and link rather than duplicate                 |
| Generated evidence  | reports and scan summaries                           | Regenerate from the owning command; do not hand-edit results |
| Historical record   | `docs/audit/`, `docs/migration/`, incidents          | Preserve evidence and date; add a status note if superseded  |

## Freshness rules

- Update docs in the same pull request as changes to commands, paths, supported
  runtimes, ownership, public contracts, or validation requirements.
- Use `Verified: YYYY-MM-DD` only on volatile operational or provider-dependent
  guidance. Change the date only after checking the content against its source.
- Treat a doc as suspect when it names a missing path or script, conflicts with
  `package.json`, describes a removed workflow, or points to an old runtime as
  current.
- Review entry points and operational docs at least quarterly, and after every
  runtime migration, release-gate change, deployment incident, or major
  dependency upgrade.
- Prefer deletion or replacement of stale instructions over accumulating
  warnings and exceptions.

## Writing for humans

- Lead with the outcome and the safe default command.
- State prerequisites before steps and expected results after them.
- Use tables for exact mappings, lists for choices, and prose for rationale.
- Expand uncommon acronyms on first use. Use the same term for the same concept.
- Keep examples copyable and platform caveats beside the affected command.
- Separate required steps from optional or manual-only work.
- Link to detail instead of copying it. A fact should have one canonical owner.
- Preserve accents and product naming: **El Rincón de Ébano**.

## Review checklist

- [ ] Commands and paths exist and match `package.json` or the owning workflow.
- [ ] Runtime versions match `.nvmrc`, `.node-version`, `.tool-versions`, and CI.
- [ ] Required, optional, live-network, and destructive steps are distinguishable.
- [ ] Entry points link to the new or changed document.
- [ ] No canonical fact is maintained in multiple detailed copies.
- [ ] Examples are minimal, safe, and copyable.
- [ ] Historical evidence was preserved rather than rewritten as current truth.
- [ ] Markdown lint and the relevant repository validation pass.

## Ownership

The author of a behavior change owns the corresponding doc update. Reviewers
should treat stale commands and broken navigation as defects, not follow-up
polish. For complex doc work, record scope, decisions, and validation in a
versioned plan under `docs/audit/`.
