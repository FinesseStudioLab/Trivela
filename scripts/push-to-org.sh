#!/bin/bash
# Push Trivela to FinesseStudioLab/Trivela using PAT from .env.local
# Run from repo root: ./scripts/push-to-org.sh

set -e
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "Missing .env.local (expected PAT=...)"
  exit 1
fi

set -a
. ./.env.local
set +a

if [ -z "$PAT" ]; then
  echo "PAT not set in .env.local"
  exit 1
fi

git init
git remote remove origin 2>/dev/null || true
git remote add origin "https://${PAT}@github.com/FinesseStudioLab/Trivela.git"
git add .
git status

if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "chore: initial Trivela scaffold (Soroban + backend + frontend)"
fi

git branch -M main
git push -u origin main

echo "Done. Pushed to https://github.com/FinesseStudioLab/Trivela"
