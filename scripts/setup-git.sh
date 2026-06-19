#!/bin/bash
# Run from repo root: ./scripts/setup-git.sh
# Initializes git and adds the Trivela remote. Then you can push with your PAT or SSH.

set -e
cd "$(dirname "$0")/.."

if [ -d .git ]; then
  echo "Git already initialized."
else
  git init
  echo "Git initialized."
fi

if git remote get-url origin 2>/dev/null; then
  echo "Remote 'origin' already set."
else
  git remote add origin https://github.com/FinesseStudioLab/Trivela.git
  echo "Remote 'origin' added: https://github.com/FinesseStudioLab/Trivela.git"
fi

echo ""
echo "Next steps:"
echo "  1. Create the labels (see .github/issue_label_notes.md) and create issues from docs/ISSUES.md"
echo "  2. git add . && git commit -m 'chore: initial Trivela scaffold (Soroban + backend + frontend)'"
echo "  3. git branch -M main && git push -u origin main"
echo "     If prompted for password, use a Personal Access Token (PAT) with repo scope."
echo "     Or use SSH: git remote set-url origin git@github.com:FinesseStudioLab/Trivela.git"
