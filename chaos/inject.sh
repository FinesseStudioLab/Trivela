#!/usr/bin/env bash
# chaos/inject.sh — Fault injection harness for Trivela (#784).
#
# Usage:
#   bash chaos/inject.sh <scenario>     inject a fault
#   bash chaos/inject.sh restore        remove all injected faults
#   bash chaos/inject.sh --list         list available scenarios
#
# Requires: docker, iproute2 (tc) inside the target container, NET_ADMIN cap.
set -euo pipefail

BACKEND_CONTAINER="${BACKEND_CONTAINER:-trivela-backend-1}"
INTERFACE="${INTERFACE:-eth0}"

die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

list_scenarios() {
  cat <<'EOF'
Available chaos scenarios:
  network-partition-backend   Drop all outbound traffic from the backend container
  db-latency                  Add 500 ms artificial latency to the DB volume path
  webhook-endpoint-down       Block outbound HTTPS (port 443) from the backend
  stellar-rpc-timeout         Delay Stellar RPC calls by 30 s (via tc)
  outbox-relay-kill           Send SIGKILL to the outbox relay worker process
  high-cpu                    Spawn a CPU hog in the backend container for 60 s
  restore                     Remove all injected faults
EOF
}

tc_exec() {
  docker exec "$BACKEND_CONTAINER" tc "$@"
}

restore_tc() {
  tc_exec qdisc del dev "$INTERFACE" root 2>/dev/null || true
  tc_exec qdisc del dev "$INTERFACE" ingress 2>/dev/null || true
  printf '[chaos] tc rules cleared on %s:%s\n' "$BACKEND_CONTAINER" "$INTERFACE"
}

case "${1:-}" in
  --list|-l)
    list_scenarios
    ;;

  network-partition-backend)
    printf '[chaos] injecting: network partition on %s\n' "$BACKEND_CONTAINER"
    tc_exec qdisc add dev "$INTERFACE" root netem loss 100%
    printf '[chaos] all outbound packets dropped. Restore with: bash chaos/inject.sh restore\n'
    ;;

  db-latency)
    printf '[chaos] injecting: 500 ms DB latency on %s\n' "$BACKEND_CONTAINER"
    tc_exec qdisc add dev lo root netem delay 500ms 50ms
    printf '[chaos] loopback latency applied (SQLite on localhost). Restore: bash chaos/inject.sh restore\n'
    ;;

  webhook-endpoint-down)
    printf '[chaos] injecting: webhook HTTPS block on %s\n' "$BACKEND_CONTAINER"
    docker exec "$BACKEND_CONTAINER" iptables -A OUTPUT -p tcp --dport 443 -j DROP
    printf '[chaos] outbound HTTPS blocked. Restore: bash chaos/inject.sh restore\n'
    ;;

  stellar-rpc-timeout)
    DELAY="${STELLAR_RPC_DELAY_MS:-30000}"
    printf '[chaos] injecting: %s ms delay on Stellar RPC traffic\n' "$DELAY"
    # Stellar RPC default port is 8000; adjust via STELLAR_RPC_PORT if needed.
    PORT="${STELLAR_RPC_PORT:-8000}"
    tc_exec qdisc add dev "$INTERFACE" root handle 1: prio
    tc_exec filter add dev "$INTERFACE" protocol ip parent 1:0 prio 1 \
      u32 match ip dport "$PORT" 0xffff flowid 1:1
    tc_exec qdisc add dev "$INTERFACE" parent 1:1 netem delay "${DELAY}ms"
    printf '[chaos] Stellar RPC on port %s delayed by %s ms\n' "$PORT" "$DELAY"
    ;;

  outbox-relay-kill)
    printf '[chaos] injecting: SIGKILL to outbox relay worker\n'
    docker exec "$BACKEND_CONTAINER" \
      sh -c 'kill -9 $(pgrep -f outboxService) 2>/dev/null && echo "killed" || echo "process not found"'
    ;;

  high-cpu)
    DURATION="${HIGH_CPU_SECONDS:-60}"
    printf '[chaos] injecting: CPU stress for %s s on %s\n' "$DURATION" "$BACKEND_CONTAINER"
    docker exec -d "$BACKEND_CONTAINER" \
      sh -c "dd if=/dev/urandom of=/dev/null bs=1M count=99999 & sleep $DURATION && kill %1" \
      || docker exec -d "$BACKEND_CONTAINER" \
         sh -c "yes > /dev/null & sleep $DURATION && kill %1"
    printf '[chaos] CPU stress running for %s s. Monitor with: docker stats %s\n' "$DURATION" "$BACKEND_CONTAINER"
    ;;

  restore)
    printf '[chaos] restoring: removing all injected faults\n'
    restore_tc
    docker exec "$BACKEND_CONTAINER" iptables -D OUTPUT -p tcp --dport 443 -j DROP 2>/dev/null || true
    printf '[chaos] faults cleared\n'
    ;;

  "")
    list_scenarios
    exit 1
    ;;

  *)
    die "Unknown scenario: ${1}. Run with --list to see available scenarios."
    ;;
esac
