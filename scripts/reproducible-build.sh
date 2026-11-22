#!/usr/bin/env bash
# Reproducible WASM build + hash verification (issue #775).
#
# Builds the given contract package(s) twice, from a clean target directory
# each time, using the toolchain pinned in rust-toolchain.toml and
# deterministic build flags, then asserts the two builds produce byte-
# identical WASM (and therefore identical sha256 hashes). This is what lets
# "anyone rebuild from a tag and get the published hash."
#
# Usage:
#   scripts/reproducible-build.sh <package-name> [<package-name> ...]
#   scripts/reproducible-build.sh trivela-rewards-contract trivela-campaign-contract
#
# Prints one "<package> <sha256>" line per package on success and exits 0.
# Exits 1 if either build's hash disagrees with the other.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <package-name> [<package-name> ...]" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Deterministic build flags:
# - SOURCE_DATE_EPOCH: several build tools (and some proc-macros that embed
#   timestamps) honour this instead of the real wall clock.
# - --locked: forbids Cargo.lock drift changing what actually gets compiled
#   between the two runs (or between CI and a later local rebuild).
# - CARGO_INCREMENTAL=0: incremental compilation metadata isn't part of the
#   output artifact, but disabling it removes one more source of
#   non-determinism in intermediate state between runs.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1704067200}" # 2024-01-01T00:00:00Z, fixed
export CARGO_INCREMENTAL=0

build_once() {
  local out_dir="$1"
  shift
  rm -rf "$out_dir"
  CARGO_TARGET_DIR="$out_dir" cargo build \
    --locked \
    --release \
    --target wasm32v1-none \
    "$@"
}

status=0
for package in "$@"; do
  echo "==> Building $package (pass 1/2)"
  build_once "$REPO_ROOT/.reproducible-build/pass1" -p "$package"
  echo "==> Building $package (pass 2/2)"
  build_once "$REPO_ROOT/.reproducible-build/pass2" -p "$package"

  wasm_name="$(echo "$package" | tr '-' '_').wasm"
  hash1="$(shasum -a 256 "$REPO_ROOT/.reproducible-build/pass1/wasm32v1-none/release/$wasm_name" | cut -d' ' -f1)"
  hash2="$(shasum -a 256 "$REPO_ROOT/.reproducible-build/pass2/wasm32v1-none/release/$wasm_name" | cut -d' ' -f1)"

  if [ "$hash1" != "$hash2" ]; then
    echo "MISMATCH: $package pass1=$hash1 pass2=$hash2" >&2
    status=1
  else
    echo "$package $hash1"
  fi
done

rm -rf "$REPO_ROOT/.reproducible-build"
exit "$status"
