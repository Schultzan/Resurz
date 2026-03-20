#!/usr/bin/env bash
# One-time: log in, create public repo "Resurz" on your GitHub, push main.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Run this first and finish in the browser:"
  echo "  gh auth login -h github.com -p https -w"
  exit 1
fi

if git remote get-url origin &>/dev/null; then
  echo "Remote 'origin' already set. Pushing..."
  git push -u origin main
else
  echo "Creating GitHub repo Resurz and pushing..."
  gh repo create Resurz --public --source=. --remote=origin --push
fi

echo "Done. Repo: https://github.com/$(gh api user -q .login)/Resurz"
