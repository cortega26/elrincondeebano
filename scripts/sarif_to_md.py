#!/usr/bin/env python3
import argparse
import json
import os
from collections import defaultdict
from datetime import datetime, timezone

SEVERITIES = ("error", "warning", "note", "none")


def normalize_level(level):
    if isinstance(level, str):
        level = level.strip().lower()
    else:
        level = ""
    if level not in SEVERITIES:
        return "warning"
    return level


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def safe_text(value, fallback):
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed if trimmed else fallback
    return fallback


def load_sarif(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def extract_help_map(run):
    help_map = {}
    tool = run.get("tool") if isinstance(run, dict) else None
    driver = tool.get("driver") if isinstance(tool, dict) else None
    rules = driver.get("rules") if isinstance(driver, dict) else None
    if isinstance(rules, list):
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            rule_id = rule.get("id") or rule.get("name")
            help_uri = rule.get("helpUri")
            if rule_id and help_uri and rule_id not in help_map:
                help_map[rule_id] = help_uri
    return help_map


def extract_location(location):
    path = "unknown-file"
    line = 0
    if isinstance(location, dict):
        physical = location.get("physicalLocation")
        if isinstance(physical, dict):
            artifact = physical.get("artifactLocation")
            if isinstance(artifact, dict):
                uri = artifact.get("uri")
                if isinstance(uri, str) and uri:
                    path = uri
            region = physical.get("region")
            if isinstance(region, dict):
                line = to_int(region.get("startLine"))
    return path, line


def build_report(data):
    grouped = {severity: defaultdict(list) for severity in SEVERITIES}
    help_by_rule = {}
    counts = {severity: 0 for severity in SEVERITIES}
    total = 0

    runs = data.get("runs") if isinstance(data, dict) else None
    if not isinstance(runs, list):
        return grouped, help_by_rule, counts, total

    for run in runs:
        if not isinstance(run, dict):
            continue
        help_map = extract_help_map(run)
        results = run.get("results")
        if not isinstance(results, list):
            continue
        for result in results:
            if not isinstance(result, dict):
                continue
            level = normalize_level(result.get("level"))
            rule_id = safe_text(result.get("ruleId"), "unknown-rule")
            message = result.get("message")
            if isinstance(message, dict):
                message_text = message.get("text") or message.get("markdown")
            else:
                message_text = message
            message_text = safe_text(message_text, "(no message)").replace("\n", " ")

            if rule_id in help_map and rule_id not in help_by_rule:
                help_by_rule[rule_id] = help_map[rule_id]

            locations = result.get("locations")
            if not isinstance(locations, list) or not locations:
                locations = [None]

            for location in locations:
                path, line = extract_location(location)
                grouped[level][rule_id].append((path, line, message_text))
                counts[level] += 1
                total += 1

    return grouped, help_by_rule, counts, total


def format_report(grouped, help_by_rule, counts, total, repo, sha, status_note):
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "# Codacy Report",
        "",
        f"Repository: {repo}",
        f"Commit: {sha}",
        f"Generated (UTC): {generated_at}",
    ]
    if status_note:
        lines.append(f"Status: {status_note}")
    lines.extend(
        [
            "",
            "## Summary",
            f"Total: {total}",
            f"Error: {counts['error']}",
            f"Warning: {counts['warning']}",
            f"Note: {counts['note']}",
            f"None: {counts['none']}",
            "",
        ]
    )

    for severity in SEVERITIES:
        lines.append(f"## {severity.title()}")
        rules = grouped.get(severity) or {}
        if not rules:
            lines.append("No findings.")
            lines.append("")
            continue
        for rule_id in sorted(rules.keys()):
            lines.append(f"### {rule_id}")
            help_uri = help_by_rule.get(rule_id)
            if help_uri:
                lines.append(f"Help: {help_uri}")
            occurrences = sorted(
                rules[rule_id],
                key=lambda item: (item[0], item[1], item[2]),
            )
            for path, line, message in occurrences:
                lines.append(f"- {path}:{line} - {message}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Convert SARIF to a deterministic Markdown report."
    )
    parser.add_argument("sarif_path", help="Input SARIF file path")
    parser.add_argument("output_path", help="Output Markdown file path")
    args = parser.parse_args()

    repo = os.environ.get("GITHUB_REPOSITORY", "unknown-repo")
    sha = os.environ.get("GITHUB_SHA", "unknown-sha")

    data = load_sarif(args.sarif_path)
    status_note = None
    if data is None:
        status_note = (
            "SARIF file missing or unreadable; analysis was skipped or no SARIF was produced."
        )
        data = {}

    grouped, help_by_rule, counts, total = build_report(data)
    report = format_report(grouped, help_by_rule, counts, total, repo, sha, status_note)

    output_dir = os.path.dirname(os.path.abspath(args.output_path))
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output_path, "w", encoding="utf-8") as handle:
        handle.write(report)


if __name__ == "__main__":
    main()
