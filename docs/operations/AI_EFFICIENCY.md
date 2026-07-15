# AI and API Efficiency

Verified: 2026-07-15

Guidance for repository work performed with coding agents or language-model
APIs. The goal is to minimize input, output, retries, and latency while
preserving correctness, security, and the repository's validation contract.

## Principles

1. **Retrieve before reading.** Search for the relevant symbol, path, or literal
   before loading files. Use CodeGraph for relationships and `rg` for literal
   text. Read focused ranges instead of entire trees.
2. **Send the smallest sufficient context.** Include the task, constraints,
   relevant diff, and acceptance criteria. Do not repeatedly send generated
   files, lockfiles, historical audits, or unrelated logs.
3. **Keep reusable context stable.** Put durable instructions and tool schemas
   first; put the request-specific material last. Current provider prompt
   caches work best when requests share an exact, stable prefix.
4. **Batch independent work.** Combine related searches and file reads, and run
   independent checks together when they do not contend for generated output.
   Keep `build` and browser tests sequential on Windows.
5. **Persist conclusions, not transcripts.** Record durable decisions in code,
   focused docs, ADRs, or versioned plans. Do not make future sessions recover
   decisions from long chat histories.
6. **Verify proportionally.** Start with the narrowest relevant check, then run
   the required repository gate. Token savings never justify skipping tests,
   security review, or release checks.

## Efficient request shape

A good task request contains four compact blocks:

```text
Outcome: the observable result to deliver
Scope: files or subsystem in bounds
Constraints: contracts that must not change
Done when: commands and behavior that prove completion
```

Prefer a diff, failing assertion, or exact error excerpt over a complete log.
When output is large, capture the command, exit code, and the smallest useful
failure section. Avoid asking the model to restate files it has just edited.

## Context and caching strategy

- Keep agent instructions concise, non-duplicated, and linked to focused docs.
- Put changing catalog rows, user input, diffs, and error messages after stable
  instructions so cached prefixes remain reusable.
- Reuse a conversation only while its context remains relevant. At a phase
  boundary, retain a compact state summary: decisions, changed files, open
  risks, and validation results.
- Prefer references to versioned repository files over pasting their full
  contents. Load the referenced section only when needed.
- Do not add a retrieval layer, cache, or model router until measurements show
  repeated work. Infrastructure that costs more to understand than it saves
  violates KISS.

## Model and tool routing

- Use the least expensive model that reliably meets the task's reasoning and
  code-quality needs; escalate on ambiguity, security impact, or failed review.
- Use deterministic tools for deterministic work: formatters, linters, schema
  validators, search, and tests should not be replaced by model inference.
- Cap tool output and narrow queries early. A targeted second read is usually
  cheaper than loading an entire repository or unbounded CI log.
- Avoid duplicate verification. Trust successful deterministic output unless
  inputs changed or a second method covers a distinct risk.

## Measure before optimizing

Track by task type, model, and workflow:

| Signal                                   | Why it matters                                                |
| ---------------------------------------- | ------------------------------------------------------------- |
| Input and output tokens                  | Reveals oversized context and verbose responses               |
| Cached-input tokens or cache-hit rate    | Shows whether stable prefixes are actually reused             |
| Tool calls, retries, and failed calls    | Exposes poor routing and avoidable loops                      |
| Wall time and cost per accepted change   | Prevents optimizing tokens while increasing latency or rework |
| First-pass validation and review success | Protects quality from false economy                           |

Set budgets from a measured baseline. Investigate regressions rather than
enforcing a single token cap across documentation, debugging, and architecture
work, which have different context needs.

## Repository-specific checklist

- Start at `docs/START_HERE.md`; do not rediscover the repository layout.
- Use `docs/repo/ACTIVE_SURFACES.json` for canonical machine-readable paths.
- Exclude `astro-poc/dist/`, dependency trees, reports, and archived docs unless
  the task explicitly concerns them.
- Keep one canonical command per workflow and one source of truth per fact.
- Run `npm run validate` for the local baseline and
  `npm run validate:release` only when its live and browser stages are required.
- Report changed files, decisions, and validation outcomes; omit a narration of
  every read-only command.

## Current provider references

These primary references describe the caching behavior behind the stable-prefix
recommendation. Recheck them when provider behavior or pricing affects a design:

- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Gemini context caching](https://ai.google.dev/gemini-api/docs/caching)
