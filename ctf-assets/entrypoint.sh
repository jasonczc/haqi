#!/bin/bash
set -e

VNC_USER="${VNC_USER:-ubuntu}"
VNC_PORT="${VNC_PORT:-5901}"
NOVNC_PORT="${NOVNC_PORT:-26058}"
EXEC_DAEMON_HTTP_PORT="${EXEC_DAEMON_HTTP_PORT:-26053}"
EXEC_DAEMON_PTY_PORT="${EXEC_DAEMON_PTY_PORT:-26054}"

echo "[ctf-env] Starting Cursor Cloud Agent replica environment..."
echo "[ctf-env] VNC: :${VNC_PORT}  noVNC: :${NOVNC_PORT}"
echo "[ctf-env] exec-daemon HTTP: :${EXEC_DAEMON_HTTP_PORT}  PTY: :${EXEC_DAEMON_PTY_PORT}"

# ── SSH auth socket placeholder ──────────────────────────────────────
if [ ! -S /run/host-services/ssh-auth.sock ]; then
    echo "[ctf-env] No SSH auth socket mounted, creating placeholder"
    touch /run/host-services/ssh-auth.sock 2>/dev/null || true
fi

# ── Start D-Bus ──────────────────────────────────────────────────────
if command -v dbus-daemon >/dev/null 2>&1; then
    mkdir -p /run/dbus
    dbus-daemon --system --nofork &
    sleep 0.5
fi

# ── Start TigerVNC ───────────────────────────────────────────────────
echo "[ctf-env] Starting TigerVNC on :1 (port ${VNC_PORT})..."
su - "${VNC_USER}" -c "
    export DISPLAY=:1
    export DBUS_SESSION_BUS_ADDRESS=autolaunch:
    /usr/bin/tigervncserver :1 \
        -geometry 1920x1200 -depth 24 \
        -rfbport ${VNC_PORT} -dpi 96 \
        -localhost -desktop AnyOS \
        -SecurityTypes None \
        -xstartup /tmp/anyos-xstartup
" 2>/dev/null || echo "[ctf-env] TigerVNC start failed (non-fatal)"

sleep 1

# ── Start noVNC/websockify ───────────────────────────────────────────
echo "[ctf-env] Starting noVNC on port ${NOVNC_PORT}..."
if [ -d /usr/local/novnc/noVNC-1.2.0 ]; then
    su - "${VNC_USER}" -c "
        bash /usr/local/novnc/noVNC-1.2.0/utils/launch.sh \
            --listen ${NOVNC_PORT} --vnc localhost:${VNC_PORT} &
    " 2>/dev/null
fi

# ── Start Plank dock ────────────────────────────────────────────────
su - "${VNC_USER}" -c "
    export DISPLAY=:1
    plank &
" 2>/dev/null || true

# ── Start pod-daemon (optional, as PID != 1) ────────────────────────
if [ -x /pod-daemon ] && [ "${START_POD_DAEMON:-false}" = "true" ]; then
    echo "[ctf-env] Starting pod-daemon..."
    /pod-daemon \
        --ssh-auth-sock-path /run/host-services/ssh-auth.sock \
        --ssh-auth-vsock-port 52 &
fi

# ── Start exec-daemon (optional) ────────────────────────────────────
if [ -x /exec-daemon/node ] && [ "${START_EXEC_DAEMON:-false}" = "true" ]; then
    echo "[ctf-env] Starting exec-daemon..."
    AUTH_TOKEN="${EXEC_DAEMON_AUTH_TOKEN:-$(head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1)}"
    su - "${VNC_USER}" -c "
        /exec-daemon/node /exec-daemon/index.js serve \
            --port ${EXEC_DAEMON_HTTP_PORT} \
            --pty-websocket-port ${EXEC_DAEMON_PTY_PORT} \
            --auth-token ${AUTH_TOKEN} \
            --rg-path /exec-daemon/rg \
            --cloud-rules-enabled \
            --computer-use-enabled \
            --browser-enabled \
            --record-screen-enabled &
    "
    echo "[ctf-env] exec-daemon auth token: ${AUTH_TOKEN}"
fi

echo "[ctf-env] ═══════════════════════════════════════════════════"
echo "[ctf-env] Environment ready."
echo "[ctf-env]   noVNC:  http://localhost:${NOVNC_PORT}/vnc.html"
echo "[ctf-env]   VNC:    localhost:${VNC_PORT}"
echo "[ctf-env] ═══════════════════════════════════════════════════"

# Keep alive
exec tail -f /dev/null
