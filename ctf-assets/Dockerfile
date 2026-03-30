FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG VNC_USER=ubuntu

# ── 1. 基础系统包（对齐 vnc-desktop.Aptfile） ─────────────────────────
COPY system-scripts/usr-local-share/vnc-desktop.Aptfile /tmp/vnc-desktop.Aptfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        sudo wget ca-certificates software-properties-common \
        ansible net-tools iproute2 procps lsof strace \
        python3-minimal python3-numpy python3-pip python3-websockify && \
    grep -v '^#' /tmp/vnc-desktop.Aptfile | grep -v '^$' | \
        xargs apt-get install -y --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ── 2. 用户 ──────────────────────────────────────────────────────────
RUN useradd -m -s /bin/bash -u 1000 ${VNC_USER} && \
    echo "${VNC_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# ── 3. noVNC + websockify ────────────────────────────────────────────
RUN mkdir -p /usr/local/novnc && \
    wget -qO /tmp/novnc.zip https://github.com/novnc/noVNC/archive/refs/tags/v1.2.0.zip && \
    unzip -q /tmp/novnc.zip -d /usr/local/novnc && rm /tmp/novnc.zip && \
    wget -qO /tmp/ws.zip https://github.com/novnc/websockify/archive/refs/tags/v0.10.0.zip && \
    unzip -q /tmp/ws.zip -d /usr/local/novnc && rm /tmp/ws.zip

# ── 4. AnyOS 配置 ───────────────────────────────────────────────────
COPY system-scripts/usr-local-share/anyos.conf /usr/local/share/anyos.conf
COPY system-scripts/usr-local-share/desktop-init.sh /usr/local/share/desktop-init.sh
RUN chmod +x /usr/local/share/desktop-init.sh

# ── 5. VNC xstartup ─────────────────────────────────────────────────
COPY system-scripts/vnc/anyos-xstartup /tmp/anyos-xstartup
RUN chmod +x /tmp/anyos-xstartup

# ── 6. XFCE / GTK / Plank 用户配置 ──────────────────────────────────
COPY system-scripts/user-config/ /home/${VNC_USER}/
RUN chown -R ${VNC_USER}:${VNC_USER} /home/${VNC_USER}

# ── 7. /usr/local/bin 脚本 ───────────────────────────────────────────
COPY system-scripts/usr-local-bin/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*

# ── 8. pod-daemon ────────────────────────────────────────────────────
COPY pod-daemon/pod-daemon /pod-daemon
RUN chmod +x /pod-daemon

# ── 9. exec-daemon ───────────────────────────────────────────────────
COPY exec-daemon/ /exec-daemon/
RUN chmod +x /exec-daemon/exec-daemon /exec-daemon/cursorsandbox \
             /exec-daemon/ssh-keygen /exec-daemon/tmux 2>/dev/null; true

# ── 10. /opt/cursor 结构 ─────────────────────────────────────────────
COPY opt-cursor/ /opt/cursor-snapshot/
RUN mkdir -p /opt/cursor/artifacts /opt/cursor/.exec-daemon && \
    chmod 1777 /opt/cursor/artifacts /opt/cursor/.exec-daemon

# ── 11. SSH auth socket 目录 ─────────────────────────────────────────
RUN mkdir -p /run/host-services

# ── 12. 环境变量（对齐实测） ──────────────────────────────────────────
ENV CURSOR_AGENT=1 \
    TERM=dumb \
    DISPLAY=:1 \
    VNC_RESOLUTION=1920x1200x24 \
    VNC_DPI=96 \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    FORCE_COLOR=0 \
    NO_COLOR=1 \
    GIT_LFS_SKIP_SMUDGE=1 \
    GIT_DISCOVERY_ACROSS_FILESYSTEM=0 \
    HOSTNAME=cursor \
    LIBGL_ALWAYS_SOFTWARE=1

# ── 13. 端口 ─────────────────────────────────────────────────────────
# 5901  - TigerVNC raw
# 26053 - exec-daemon HTTP API
# 26054 - exec-daemon PTY WebSocket
# 26058 - noVNC web client
EXPOSE 5901 26053 26054 26058

# ── 14. 启动入口 ─────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
