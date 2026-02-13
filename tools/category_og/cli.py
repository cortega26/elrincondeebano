"""CLI for category OG pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import (
    CategoryOgPipelineError,
    delete_category_assets,
    ensure_category_assets,
    lookup_title_for_slug,
    sync_category_assets,
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Category OG asset pipeline")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--sync", action="store_true", help="Sync all category OG assets")
    group.add_argument("--one", metavar="SLUG", help="Generate/update one category OG asset")
    group.add_argument("--delete", dest="delete_slug", metavar="SLUG", help="Delete one category OG asset")
    parser.add_argument("--title", help="Optional title override for --one")
    parser.add_argument("--dry-run", action="store_true", help="Preview operations without writing")
    parser.add_argument("--force", action="store_true", help="Force regeneration")
    parser.add_argument("--repo-root", help="Repository root path override")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve() if args.repo_root else None

    try:
        if args.sync:
            result = sync_category_assets(
                repo_root=repo_root,
                dry_run=bool(args.dry_run),
                force=bool(args.force),
            )
        elif args.one:
            title = args.title
            if not title:
                title = lookup_title_for_slug(args.one, repo_root=repo_root) or args.one
            result = ensure_category_assets(
                args.one,
                title=title,
                repo_root=repo_root,
                dry_run=bool(args.dry_run),
                force=bool(args.force),
            )
        else:
            result = delete_category_assets(
                args.delete_slug,
                repo_root=repo_root,
                dry_run=bool(args.dry_run),
            )
    except (CategoryOgPipelineError, FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0
