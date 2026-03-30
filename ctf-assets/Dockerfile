FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# ════════════════════════════════════════════════════════════════════════
# 0. 基础系统配置 — locale, timezone, user
# ════════════════════════════════════════════════════════════════════════
RUN apt-get update && apt-get install -y --no-install-recommends \
        locales ca-certificates sudo && \
    sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && \
    locale-gen en_US.UTF-8 && \
    echo "Etc/UTC" > /etc/timezone && \
    useradd -m -s /bin/bash -u 1000 ubuntu && \
    echo "ubuntu ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/ubuntu && \
    chmod 0440 /etc/sudoers.d/ubuntu && \
    touch /home/ubuntu/.hushlogin && \
    touch /home/ubuntu/.sudo_as_admin_successful

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    LANGUAGE=en_US.UTF-8

# ════════════════════════════════════════════════════════════════════════
# 1. 系统包 — 对齐 vnc-desktop.Aptfile + 开发工具
# ════════════════════════════════════════════════════════════════════════
RUN apt-get update && apt-get install -y --no-install-recommends \
    tigervnc-standalone-server tigervnc-common tigervnc-tools \
    xfce4 xfce4-terminal xfce4-settings thunar \
    x11-utils x11-xserver-utils xdg-utils xdotool xclip procps \
    dbus-x11 at-spi2-core \
    mousepad seahorse \
    adwaita-icon-theme gnome-themes-extra gnome-keyring \
    plank sassc libglib2.0-dev-bin libxml2-utils dconf-cli \
    xfonts-base xfonts-terminus fonts-noto fonts-wqy-microhei \
    fonts-droid-fallback fonts-noto-color-emoji fonts-liberation \
    fonts-croscore fonts-cantarell fonts-jetbrains-mono \
    libx11-dev libxkbfile-dev libsecret-1-dev libgbm-dev \
    libnotify4 libnss3 libxss1 \
    libgl1-mesa-dri libglx-mesa0 libgl1 \
    python3-minimal python3-numpy python3-pip python3-websockify \
    bash coreutils curl findutils gzip tar wget unzip \
    git git-lfs jq ripgrep strace net-tools iproute2 lsof \
    openssh-client gnupg2 software-properties-common \
    build-essential pkg-config libssl-dev \
    default-jdk golang-go \
    ansible \
    ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ════════════════════════════════════════════════════════════════════════
# 2. Google Chrome — 对齐 146.x via apt repo
# ════════════════════════════════════════════════════════════════════════
RUN wget -qO /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt-get update && apt-get install -y /tmp/chrome.deb && \
    rm /tmp/chrome.deb && apt-get clean && rm -rf /var/lib/apt/lists/*

# Chrome wrapper — 对齐实际环境的启动参数
RUN cat > /usr/local/bin/google-chrome <<'CHROME_WRAPPER'
#!/bin/bash
exec /usr/bin/google-chrome-stable --no-sandbox --test-type --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader-webgl --password-store=basic --no-first-run --no-default-browser-check --remote-debugging-port=9222 --user-data-dir=/home/ubuntu/.config/google-chrome --class=google-chrome --window-size=1820,1100 --window-position=50,50 "$@"
CHROME_WRAPPER
RUN chmod +x /usr/local/bin/google-chrome && \
    ln -sf /usr/local/bin/google-chrome /usr/local/bin/chrome

# ════════════════════════════════════════════════════════════════════════
# 3. NVM + Node.js 22 — 对齐 v22.22.1, nvm 0.40.3
# ════════════════════════════════════════════════════════════════════════
USER ubuntu
ENV NVM_DIR=/home/ubuntu/.nvm
RUN mkdir -p $NVM_DIR && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install 22 && nvm use 22 && nvm alias default 22
ENV PATH=/home/ubuntu/.nvm/versions/node/v22.22.1/bin:$PATH
USER root

# ════════════════════════════════════════════════════════════════════════
# 4. Bun 1.3.5
# ════════════════════════════════════════════════════════════════════════
USER ubuntu
ENV BUN_INSTALL=/home/ubuntu/.bun
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.5"
ENV PATH=/home/ubuntu/.bun/bin:$PATH
USER root

# ════════════════════════════════════════════════════════════════════════
# 5. Rust 1.83.0 — 对齐 RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo
# ════════════════════════════════════════════════════════════════════════
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain 1.83.0 && \
    chmod -R a+r $RUSTUP_HOME $CARGO_HOME
ENV PATH=/usr/local/cargo/bin:$PATH

# ════════════════════════════════════════════════════════════════════════
# 6. noVNC 1.2.0 + websockify 0.10.0
# ════════════════════════════════════════════════════════════════════════
RUN mkdir -p /usr/local/novnc && \
    wget -qO /tmp/novnc.zip https://github.com/novnc/noVNC/archive/refs/tags/v1.2.0.zip && \
    unzip -q /tmp/novnc.zip -d /usr/local/novnc && rm /tmp/novnc.zip && \
    wget -qO /tmp/ws.zip https://github.com/novnc/websockify/archive/refs/tags/v0.10.0.zip && \
    unzip -q /tmp/ws.zip -d /usr/local/novnc && rm /tmp/ws.zip

# ════════════════════════════════════════════════════════════════════════
# 7. 字体 — Inter, JetBrains Mono, Public Sans, Source Sans 3, Cascadia Code
# ════════════════════════════════════════════════════════════════════════
COPY system-assets/fonts/ /usr/share/fonts/truetype/macos/

# 字体替换规则 — macOS/Windows 字体映射到 Linux 等价
COPY system-configs/etc-fonts/local.conf /etc/fonts/local.conf
RUN fc-cache -fv 2>/dev/null || true

# ════════════════════════════════════════════════════════════════════════
# 8. WhiteSur 主题 + 图标 + 光标
# ════════════════════════════════════════════════════════════════════════
COPY system-assets/WhiteSur-Light-theme.tar.gz /tmp/
COPY system-assets/WhiteSur-icons.tar.gz /tmp/
COPY system-assets/WhiteSur-cursors.tar.gz /tmp/
RUN tar xzf /tmp/WhiteSur-Light-theme.tar.gz -C /usr/share/themes/ && \
    tar xzf /tmp/WhiteSur-icons.tar.gz -C /usr/share/icons/ && \
    tar xzf /tmp/WhiteSur-cursors.tar.gz -C /usr/share/icons/ && \
    rm /tmp/WhiteSur-*.tar.gz && \
    gtk-update-icon-cache /usr/share/icons/WhiteSur/ 2>/dev/null || true && \
    gtk-update-icon-cache /usr/share/icons/WhiteSur-dark/ 2>/dev/null || true && \
    gtk-update-icon-cache /usr/share/icons/WhiteSur-light/ 2>/dev/null || true

# Plank WhiteSur-Light dock 主题
COPY system-assets/plank-themes/WhiteSur-Light/ /usr/share/plank/themes/WhiteSur-Light/

# ════════════════════════════════════════════════════════════════════════
# 9. 壁纸 + Cursor 图标
# ════════════════════════════════════════════════════════════════════════
COPY system-assets/backgrounds/ /usr/share/backgrounds/
COPY system-assets/icons/cursor-logo.png /usr/share/icons/hicolor/24x24/apps/
COPY system-assets/icons/cursor-logo-dark.png /usr/share/icons/hicolor/24x24/apps/
COPY system-assets/icons/cursor-logo.svg /usr/share/pixmaps/
COPY system-assets/icons/cursor-logo-dark.svg /usr/share/pixmaps/

# 壁纸 hash/version 元数据
COPY system-assets/backgrounds/ /usr/share/backgrounds/

# cloud-agent-media 原始素材包
COPY system-assets/cloud-agent-media/ /usr/local/share/cloud-agent-media/

# Chrome .desktop 文件
COPY system-configs/google-chrome.desktop /usr/share/applications/google-chrome.desktop

# ════════════════════════════════════════════════════════════════════════
# 10. AnyOS 配置 — /usr/local/share
# ════════════════════════════════════════════════════════════════════════
COPY system-scripts/usr-local-share/anyos.conf /usr/local/share/anyos.conf
COPY system-scripts/usr-local-share/desktop-init.sh /usr/local/share/desktop-init.sh
COPY system-scripts/usr-local-share/vnc-desktop.Aptfile /usr/local/share/vnc-desktop.Aptfile
RUN chmod +x /usr/local/share/desktop-init.sh

# ════════════════════════════════════════════════════════════════════════
# 11. /usr/local/bin 脚本 — anyos-setup, configure-google-chrome 等
# ════════════════════════════════════════════════════════════════════════
COPY system-scripts/usr-local-bin/ /usr/local/bin/
RUN find /usr/local/bin -type f -name '*.sh' -exec chmod +x {} \; && \
    chmod +x /usr/local/bin/anyos-setup \
             /usr/local/bin/configure-google-chrome \
             /usr/local/bin/configure-os-display \
             /usr/local/bin/install-and-configure-themes \
             /usr/local/bin/install-cursor-artifact-directories \
             /usr/local/bin/install-fonts-and-fontconfig \
             /usr/local/bin/install-google-chrome \
             /usr/local/bin/install-locales \
             /usr/local/bin/install-remote-vnc-setup \
             /usr/local/bin/install-vnc-desktop-apt-packages 2>/dev/null; true

# ════════════════════════════════════════════════════════════════════════
# 12. VNC xstartup — 对齐 /tmp/anyos-xstartup
# ════════════════════════════════════════════════════════════════════════
COPY system-scripts/vnc/anyos-xstartup /tmp/anyos-xstartup
RUN chmod +x /tmp/anyos-xstartup

# ════════════════════════════════════════════════════════════════════════
# 13. XFCE4 / GTK3 / Plank 用户桌面配置
# ════════════════════════════════════════════════════════════════════════
# .config/xfce4 — 面板、窗口管理器、桌面
COPY system-scripts/user-config/xfce4/ /home/ubuntu/.config/xfce4/
# .config/gtk-3.0 — GTK 主题
COPY system-scripts/user-config/gtk-3.0/ /home/ubuntu/.config/gtk-3.0/
# .config/plank — Dock 配置
COPY system-scripts/user-config/plank/ /home/ubuntu/.config/plank/
# .config/dconf — dconf 数据库
COPY system-scripts/user-config/dconf/ /home/ubuntu/.config/dconf/

# .Xresources — DPI 和字体渲染
COPY system-scripts/user-config/.Xresources /home/ubuntu/.Xresources

# .bashrc — NVM + Bun + Rust + PS1
COPY system-scripts/user-config/.bashrc /home/ubuntu/.bashrc
COPY system-scripts/user-config/.profile /home/ubuntu/.profile

# ════════════════════════════════════════════════════════════════════════
# 14. .gitconfig — 对齐 Cursor Agent 身份
# ════════════════════════════════════════════════════════════════════════
RUN cat > /home/ubuntu/.gitconfig <<'GITCONFIG'
[user]
	email = cursoragent@cursor.com
	name = Cursor Agent
[alias]
	p = push
	cp = cherry-pick
	c = commit
	s = status
[push]
	autoSetupRemote = true
[core]
	fsmonitor = true
	untrackedCache = true
GITCONFIG

# ════════════════════════════════════════════════════════════════════════
# 14b. Cursor Agent Hooks — git secret scanning + co-author
# ════════════════════════════════════════════════════════════════════════
COPY system-configs/cursor-agent-hooks/ /home/ubuntu/.cursor/agent-hooks/default/
RUN chmod +x /home/ubuntu/.cursor/agent-hooks/default/.dispatcher \
             /home/ubuntu/.cursor/agent-hooks/default/commit-msg.cursor \
             /home/ubuntu/.cursor/agent-hooks/default/commit-msg.cursor.co-author \
             /home/ubuntu/.cursor/agent-hooks/default/pre-commit.cursor 2>/dev/null; true

# cursor-git-ssh-keygen
RUN mkdir -p /home/ubuntu/.cursor/bin
COPY system-scripts/cursor-git-ssh-keygen /home/ubuntu/.cursor/bin/cursor-git-ssh-keygen
RUN chmod +x /home/ubuntu/.cursor/bin/cursor-git-ssh-keygen

# ════════════════════════════════════════════════════════════════════════
# 15. pod-daemon + exec-daemon 二进制
# ════════════════════════════════════════════════════════════════════════
COPY pod-daemon/pod-daemon /pod-daemon
RUN chmod +x /pod-daemon

COPY exec-daemon/ /exec-daemon/
RUN chmod +x /exec-daemon/exec-daemon \
             /exec-daemon/cursorsandbox \
             /exec-daemon/ssh-keygen \
             /exec-daemon/tmux 2>/dev/null; true

# ════════════════════════════════════════════════════════════════════════
# 16. /opt/cursor 目录结构
# ════════════════════════════════════════════════════════════════════════
RUN mkdir -p /opt/cursor/artifacts /opt/cursor/.exec-daemon \
             /opt/cursor/ansible /opt/cursor/cloud-agent-tools && \
    chmod 1777 /opt/cursor/artifacts /opt/cursor/.exec-daemon
COPY opt-cursor/ansible/ /opt/cursor/ansible/
COPY opt-cursor/cloud-agent-tools/ /opt/cursor/cloud-agent-tools/

# ════════════════════════════════════════════════════════════════════════
# 17. SSH auth socket + /run 目录
# ════════════════════════════════════════════════════════════════════════
RUN mkdir -p /run/host-services

# ════════════════════════════════════════════════════════════════════════
# 18. 文件权限 — 全部 home 归 ubuntu
# ════════════════════════════════════════════════════════════════════════
RUN chown -R ubuntu:ubuntu /home/ubuntu

# ════════════════════════════════════════════════════════════════════════
# 19. 环境变量 — 完全对齐实测 env
# ════════════════════════════════════════════════════════════════════════
ENV CURSOR_AGENT=1 \
    TERM=dumb \
    DISPLAY=:1 \
    VNC_RESOLUTION=1920x1200x24 \
    VNC_DPI=96 \
    FORCE_COLOR=0 \
    NO_COLOR=1 \
    GIT_LFS_SKIP_SMUDGE=1 \
    GIT_DISCOVERY_ACROSS_FILESYSTEM=0 \
    HOSTNAME=cursor \
    LIBGL_ALWAYS_SOFTWARE=1 \
    SHELL=/bin/bash \
    _ZO_DOCTOR=0

# ════════════════════════════════════════════════════════════════════════
# 20. 端口
# ════════════════════════════════════════════════════════════════════════
# 5901  — TigerVNC raw RFB
# 9222  — Chrome DevTools
# 26053 — exec-daemon HTTP API
# 26054 — exec-daemon PTY WebSocket
# 26058 — noVNC web client
EXPOSE 5901 9222 26053 26054 26058

# ════════════════════════════════════════════════════════════════════════
# 21. 入口
# ════════════════════════════════════════════════════════════════════════
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
