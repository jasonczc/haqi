# CTF Assets — Cursor Cloud Agent 运行时副本

从 Cursor Cloud Agent 实际运行环境中完整提取的文件、二进制、配置和运行时快照，用于离线分析与本地复刻。

## 目录结构

```
ctf-assets/
├── Dockerfile                  # 复刻环境构建文件
├── docker-compose.yml          # 一键启动（完整/轻量两种模式）
├── entrypoint.sh               # 容器入口脚本
│
├── exec-daemon/                # 核心：Agent 执行引擎
│   ├── index.js                # 主逻辑 (16 MB Webpack bundle, @anysphere/exec-daemon-runtime)
│   ├── 252/407/511/953/980.index.js  # 代码分片
│   ├── package.json            # 包元数据
│   ├── exec-daemon             # shell 启动脚本
│   ├── exec_daemon_version     # 版本 URL (S3)
│   ├── cursorsandbox           # 沙箱二进制 (4.6 MB, static-pie, Bwrap+seccomp+Landlock)
│   ├── polished-renderer.node  # 屏幕录制 (Rust + FFmpeg)
│   ├── pty.node                # PTY 原生模块
│   ├── ssh-keygen              # SSH 密钥生成
│   ├── tmux / tmux.portal.conf # 自带 tmux
│   └── 97f64a4d8eca9a2e35bb.mp4 # 内嵌 MP4 资源
│
├── pod-daemon/                 # 核心：容器 PID 1 进程管理
│   └── pod-daemon              # Rust 二进制 (7.9 MB, static-pie, gRPC)
│                                 # 服务: anyrun.v1.PodDaemonService
│                                 # RPC: CreateProcess / AttachProcess
│
├── opt-cursor/                 # /opt/cursor 快照
│   ├── ansible/                # Ansible playbook (VNC 桌面安装)
│   │   ├── vnc-desktop.yml     # 完整 playbook (23 KB)
│   │   ├── README.md
│   │   └── files/              # 配置模板、安装脚本
│   ├── cloud-agent-tools/      # 资产分发系统
│   │   ├── current/            # 当前版本 bundle
│   │   │   ├── cloud-agent-setup      # 安装器 (21 KB bash)
│   │   │   ├── cloud-agent-tools.tsv  # 工具清单
│   │   │   ├── cloud-agent-assets.tsv # 资产清单 (字体、主题、noVNC 等)
│   │   │   └── files/                 # anyos + vnc 脚本
│   │   └── current.bundle-hash
│   └── cursor-git-ssh-keygen   # SSH keygen 封装
│
├── system-scripts/             # 系统级脚本与用户配置
│   ├── usr-local-bin/          # /usr/local/bin 全部脚本 (37 个)
│   ├── usr-local-share/        # anyos.conf, desktop-init.sh, Aptfile
│   ├── vnc/                    # xstartup, capture-vnc-user-env
│   ├── user-config/            # XFCE4, GTK3, Plank, .bashrc, .Xresources
│   ├── codex-config/           # Codex 配置 (config.toml, version.json)
│   ├── cursor-git-ssh-keygen
│   └── nvm.sh                  # NVM 初始化脚本
│
├── strings-dump/               # 二进制 strings 提取（离线分析用）
│   ├── cursorsandbox.strings.txt    # 全量 (42K 行)
│   ├── cursorsandbox.keywords.txt   # 关键词过滤 (469 行)
│   ├── pod-daemon.strings.txt       # 全量 (66K 行)
│   ├── pod-daemon.keywords.txt      # 关键词过滤 (2.9K 行)
│   ├── polished-renderer.strings.txt # 全量 (58K 行)
│   └── index-js.keywords.txt        # 关键词过滤 (17K 行)
│
├── runtime-snapshots/          # 运行时快照
│   ├── ps-auxf.txt             # 进程树
│   ├── netstat-tlnp.txt        # 端口监听
│   ├── env.txt                 # 环境变量
│   ├── container-inspect.json  # Docker 容器详情
│   ├── docker-*.json           # Docker API 返回 (version/info/images/containers)
│   ├── capsh.txt               # Linux capabilities
│   ├── proc-self-status.txt    # /proc/self/status
│   ├── proc-mounts.txt         # 挂载表
│   ├── dpkg-packages.txt       # 780 已安装 deb 包列表
│   └── ...                     # 其他系统信息快照
│
└── SHA256SUMS.txt              # 全部文件校验和
```

## 快速使用

### 构建镜像

```bash
cd ctf-assets
docker build -t cursor-ctf .
```

### 启动（完整桌面复刻）

```bash
docker compose up cursor-agent-replica
# noVNC: http://localhost:26058/vnc.html
# VNC:   localhost:5901
```

### 启动（仅 shell 分析）

```bash
docker compose --profile shell run --rm cursor-agent-shell
```

### 启动 exec-daemon（需要 exec-daemon 内的 node 二进制）

> 注意：exec-daemon/node 是 124 MB 的 Node.js 二进制，因过大未入 git。
> 需要时可从实际环境复制或下载同版本 Node.js v22。

```bash
docker run --privileged --network=host \
    -e START_EXEC_DAEMON=true \
    -e START_POD_DAEMON=true \
    cursor-ctf
```

## 原始环境参数

| 参数 | 值 |
|------|-----|
| 内核 | Linux 6.1.147, x86_64, KVM |
| 发行版 | Ubuntu 24.04.4 LTS |
| CPU | Intel Xeon (Sapphire Rapids), 4 核 |
| 内存 | 16 GiB, 无 swap |
| 容器 | Docker 29.1.4, privileged, host 网络 |
| 基础镜像 | anyrun-empty (5 bytes) |
| exec-daemon | @anysphere/exec-daemon-runtime, 2026-03-28 |
| pod-daemon | Rust static-pie, anyrun.v1.PodDaemonService |

## 端口映射

| 端口 | 组件 | 用途 |
|------|------|------|
| 2375 | Docker Engine (宿主机) | Docker REST API |
| 5901 | TigerVNC | VNC 原始协议 (localhost) |
| 26053 | exec-daemon | HTTP API |
| 26054 | exec-daemon | PTY WebSocket |
| 26058 | websockify | noVNC Web 客户端 |
| 26500 | 未知 (宿主机) | 疑似 pod 编排 |
| 50052 | 未知 (宿主机) | 疑似 gRPC 控制面 |

## 安全上下文

- `Privileged: true`, `SecurityOpt: ["label=disable"]`
- Capabilities: 全集 (41 项)
- Seccomp: 关闭
- AppArmor: 无限制
- Network Namespace: 共享宿主机
- cursorsandbox 在命令级提供 7 步隔离

## CTF 分析要点

1. **exec-daemon index.js** — 16 MB Webpack bundle，含 API 路由、沙箱策略、规则加载逻辑
2. **cursorsandbox** — 7 步沙箱隔离，网络策略引擎 (deny/allow list)，可用 `strings-dump/cursorsandbox.keywords.txt` 快速定位
3. **pod-daemon** — gRPC 进程管理，`strings-dump/pod-daemon.keywords.txt` 含完整 RPC 方法
4. **Docker API 无鉴权** — `localhost:2375` 可直接操作容器
5. **JWT token** — exec-daemon 启动参数含 `--trace-auth-token`（JWT），可解码分析
6. **SSH auth socket** — `/run/host-services/ssh-auth.sock` 代理宿主机 SSH agent
7. **polished-renderer** — Rust + FFmpeg 屏幕录制引擎

## 未包含（过大）

| 文件 | 大小 | 说明 |
|------|------|------|
| `/exec-daemon/node` | 124 MB | Node.js v22 二进制（可用 `apt install nodejs` 替代） |
| `/exec-daemon/gh` | 55 MB | GitHub CLI（可用 `apt install gh` 替代） |
| `/exec-daemon/rg` | 5.2 MB | ripgrep（可用 `apt install ripgrep` 替代） |

## 采集时间

2026-03-30，Cursor Cloud Agent 运行环境。
