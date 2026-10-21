#!/usr/bin/env bash
# Checks the SMT models in contracts/rewards/formal/ with Z3 (issue #1317).
#
# Each file starts with "; expect: unsat" (the property is proved: no counterexample exists) or
# "; expect: sat" (a negative control / informational check that must keep finding a model).
# The script fails if any result differs from what the file declares, so a model that silently
# stops being meaningful is caught as well as one that stops being true.
#
#   scripts/verify-reward-invariants.sh            # all models
#   scripts/verify-reward-invariants.sh 04_*.smt2  # selected models
set -euo pipefail

if ! command -v z3 >/dev/null 2>&1; then
  echo "z3 is required (brew install z3 / apt-get install z3)" >&2
  exit 2
fi

dir="$(cd "$(dirname "$0")/../contracts/rewards/formal" && pwd)"
cd "$dir"
files=("$@")
[ ${#files[@]} -eq 0 ] && files=(*.smt2)

failed=0
for f in "${files[@]}"; do
  expected="$(sed -n 's/^; expect: *//p' "$f" | head -n1)"
  actual="$(z3 -T:60 "$f" | sed -n 1p)"
  if [ "$actual" = "$expected" ]; then
    printf 'PASS  %-62s %s\n' "$f" "$actual"
  else
    printf 'FAIL  %-62s expected %s, got %s\n' "$f" "$expected" "$actual"
    failed=1
  fi
done

exit "$failed"
