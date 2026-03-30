#!/bin/bash
set -e

VNC_USER="${VNC_USER:-ubuntu}"
VNC_PORT="${VNC_PORT:-5901}"
NOVNC_PORT="${NOVNC_PORT:-26058}"

echo "┌─────────────────────────────────────────────────┐"
echo "│  Cursor Cloud Agent Replica Environment         │"
echo "└─────────────────────────────────────────────────┘"

# ── SSH auth socket placeholder ──
if [ ! -S /run/host-services/ssh-auth.sock ]; then
    touch /run/host-services/ssh-auth.sock 2>/dev/null || true
fi

# ── D-Bus ──
if command -v dbus-daemon >/dev/null 2>&1; then
    mkdir -p /run/dbus
    dbus-daemon --system --nofork &>/dev/null &
    sleep 0.3
fi

# ── TigerVNC ──
echo "[init] Starting TigerVNC on :1 (port ${VNC_PORT})..."
su - "${VNC_USER}" -c "
    export DISPLAY=:1
    export DBUS_SESSION_BUS_ADDRESS=autolaunch:
    /usr/bin/tigervncserver :1 \
        -geometry 1920x1200 -depth 24 \
        -rfbport ${VNC_PORT} -dpi 96 \
        -localhost -desktop AnyOS \
        -SecurityTypes None \
        -xstartup /tmp/anyos-xstartup 2>/dev/null
" || echo "[init] TigerVNC start failed (non-fatal)"
sleep 1

# ── noVNC / websockify ──
echo "[init] Starting noVNC on port ${NOVNC_PORT}..."
if [ -d /usr/local/novnc/noVNC-1.2.0 ]; then
    su - "${VNC_USER}" -c "
        bash /usr/local/novnc/noVNC-1.2.0/utils/launch.sh \
            --listen ${NOVNC_PORT} --vnc localhost:${VNC_PORT} &
    " 2>/dev/null
fi
sleep 0.5

# ── Plank dock ──
su - "${VNC_USER}" -c "export DISPLAY=:1; plank &" 2>/dev/null || true

# ── pod-daemon (optional) ──
if [ "${START_POD_DAEMON:-false}" = "true" ] && [ -x /pod-daemon ]; then
    echo "[init] Starting pod-daemon..."
    /pod-daemon \
        --ssh-auth-sock-path /run/host-services/ssh-auth.sock \
        --ssh-auth-vsock-port 52 &
fi

# ── exec-daemon (optional, needs /exec-daemon/node) ──
if [ "${START_EXEC_DAEMON:-false}" = "true" ] && [ -x /exec-daemon/node ]; then
    AUTH_TOKEN="${EXEC_DAEMON_AUTH_TOKEN:-$(head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1)}"
    echo "[init] Starting exec-daemon (token: ${AUTH_TOKEN:0:16}...)..."
    su - "${VNC_USER}" -c "
        /exec-daemon/node /exec-daemon/index.js serve \
            --port 26053 --pty-websocket-port 26054 \
            --auth-token ${AUTH_TOKEN} \
            --rg-path /exec-daemon/rg \
            --cloud-rules-enabled --computer-use-enabled \
            --browser-enabled --record-screen-enabled &
    "
fi

echo "┌─────────────────────────────────────────────────┐"
echo "│  Ready.                                         │"
echo "│  noVNC:  http://localhost:${NOVNC_PORT}/vnc.html       │"
echo "│  VNC:    localhost:${VNC_PORT}                        │"
echo "│  Chrome: localhost:9222                          │"
echo "└─────────────────────────────────────────────────┘"

exec tail -f /dev/null
