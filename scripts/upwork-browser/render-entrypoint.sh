#!/usr/bin/env bash
set -euo pipefail
umask 077
# Render attaches this disk to a single service instance. Hold an exclusive lease before
# clearing Chromium's container-specific IPC locks. These are not account cookies/storage.
mkdir -p "$UPWORK_BROWSER_SESSION_DIR"
chmod 700 "$UPWORK_BROWSER_SESSION_DIR"
exec 9>"$UPWORK_BROWSER_SESSION_DIR/.worker.lock"
flock -n 9 || { echo 'The browser session is already in use.' >&2; exit 1; }
rm -f "$UPWORK_BROWSER_SESSION_DIR/SingletonLock" \
      "$UPWORK_BROWSER_SESSION_DIR/SingletonCookie" \
      "$UPWORK_BROWSER_SESSION_DIR/SingletonSocket"
export DISPLAY=:99
export UPWORK_BROWSER_HEADED=true
Xvfb "$DISPLAY" -screen 0 1440x1000x24 -nolisten tcp &
display_pid=$!
cleanup() {
  # Close Chromium and flush its persistent profile before stopping its display.
  if [[ -n "${worker_pid:-}" ]]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  kill "${vnc_pid:-}" "${web_pid:-}" "$display_pid" 2>/dev/null || true
  wait || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
for attempt in {1..50}; do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
xdpyinfo -display "$DISPLAY" >/dev/null
if [[ "${UPWORK_BROWSER_LOGIN_MODE:-false}" == true ]]; then
  # VNC and websockify listen only on loopback. Node authenticates HTTP and WebSocket access.
  x11vnc -display "$DISPLAY" -localhost -rfbport 5900 -nopw -forever -shared -quiet &
  vnc_pid=$!
  websockify --web /usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 &
  web_pid=$!
fi
node scripts/upwork-browser/server.mjs &
worker_pid=$!
wait "$worker_pid"
