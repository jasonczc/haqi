# 云 Agent 运行环境调研

本文记录 **当前 Cursor Cloud Agent 实际运行环境** 的观测结果，并对照 **HAQI 云会话 / 云端工作区** 目标形态，归纳系统特征、已有技术栈与潜在缺口。观测时间点以仓库内 Agent 会话为准；不同云厂商或批次镜像可能略有差异。

## 1. 目标对齐说明

「目标想要达到的环境」在此理解为：

- **隔离、可复用的 Linux 执行面**：Agent 在受控环境中读写代码、跑命令、访问网络。
- **与 HAQI 云路径一致的能力边界**：本仓库中云 spawn 依赖 **Docker 会话镜像**、**Git 同步仓库**、**密钥物化**、**可选侧车服务** 等；目标环境应能支撑这些能力或明确哪些能力在控制面侧提供。

下文第二节为实测，第三节为与 HAQI 的映射，第四节为建议技术栈与风险，第七节为 Cursor 侧实现剖析。

---

## 2. 当前环境实测

### 2.1 操作系统与内核

| 项 | 观测值 |
|----|--------|
| 内核 | Linux 6.1.147，`x86_64`，`PREEMPT_DYNAMIC` |
| 发行版 | Ubuntu 24.04.4 LTS（Noble Numbat） |
| 用户 | `ubuntu`（uid/gid 1000） |
| 工作目录 | 仓库挂载于 `/workspace`（overlay 文件系统） |
| Hypervisor | **KVM** 虚拟化（来自 `lscpu`） |

### 2.2 硬件资源

| 项 | 观测值 |
|----|--------|
| CPU | Intel Xeon（Sapphire Rapids），4 核，2400 MHz，支持 AVX-512 / AMX |
| 内存 | **16 GiB**，无 swap（容器限制 `Memory: 17179869184` = 16 GiB） |
| CPU 限制 | `NanoCpus: 4000000000`（= 4 核） |
| 磁盘 | overlay 文件系统，**126 GiB** 总量 |
| 虚拟化 | KVM 全虚拟化 |

### 2.3 容器拓扑（关键发现）

```
┌─────────────────────────────────────────────────────────────┐
│ KVM 虚拟机（宿主机）                                          │
│                                                              │
│  Docker Engine 29.1.4 + containerd v2.2.1 + runc 1.3.4      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 容器: pod-4gsef3w6w5asrl6ng76xer7ota-e18a9cc7          │  │
│  │ 镜像: anyrun-empty（5 bytes，几乎空白）                  │  │
│  │ 模式: --privileged --network=host                       │  │
│  │ PID 1: /pod-daemon (Rust, static-pie, 7.9 MB)         │  │
│  │                                                        │  │
│  │  exec-daemon (Node.js)  ← index.js 16 MB              │  │
│  │  desktop-init.sh → XFCE + TigerVNC + noVNC             │  │
│  │  cursorsandbox (static-pie, 4.6 MB)                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  另有辅助镜像: anyrun-utils (ECR, 245 MB)                     │
└─────────────────────────────────────────────────────────────┘
```

**关键观测点**：

| 项 | 观测值 |
|----|--------|
| 容器标识 | `/.dockerenv` 存在；`overlay` 根文件系统 |
| Docker 引擎 | **宿主机 Docker API 可达**：`http://localhost:2375`（因 `--network=host`） |
| Docker 版本 | Engine 29.1.4，API 1.52，containerd v2.2.1，runc 1.3.4 |
| 容器内无 `docker` CLI | `command -v docker` 为空，但 REST API 直接可用 |
| 特权模式 | `Privileged: true`，`SecurityOpt: ["label=disable"]` |
| 网络 | `NetworkMode: host`（共享宿主机网络命名空间） |
| 容器名称格式 | `pod-<podId>-<hash>`（如 `pod-4gsef3w6w5asrl6ng76xer7ota-e18a9cc7`） |
| 基础镜像 | `anyrun-empty:latest`（5 bytes），全部环境通过 Ansible + cloud-agent-tools 构建 |
| ExtraHosts | `cursor:127.0.0.1`、`host.docker.internal:host-gateway` |

### 2.4 安全上下文

| 项 | 观测值 |
|----|--------|
| Capabilities（Bounding） | 全集（41 项），含 `CAP_SYS_ADMIN`、`CAP_NET_ADMIN` 等 |
| Seccomp | **关闭**（`Seccomp: 0`，`Seccomp_filters: 0`） |
| AppArmor | `kernel`（未限制） |
| User Namespace | 直通宿主机（`0 0 4294967295`） |
| PID Namespace | 隔离（容器内 PID 1 = `pod-daemon`） |
| Mount Namespace | 隔离（overlay 文件系统） |
| Network Namespace | **共享宿主机**（`net:[4026531840]`） |

### 2.5 已安装工具链

| 类别 | 版本 / 路径 |
|------|-------------|
| Bun | 1.3.5，`~/.bun/bin` |
| Node.js | v22.22.1（nvm） |
| Rust | rustc 1.83.0 |
| Python | 3.12.3 |
| Git | 2.43.0 |
| curl | 8.5.0 |
| jq | 1.7 |
| Chrome | 已安装（VNC 桌面环境内） |

### 2.6 环境变量

| 变量 | 值 | 含义 |
|------|-----|------|
| `CURSOR_AGENT` | `1` | 标识当前为 Cursor Agent 会话 |
| `TERM` | `dumb` | 非交互终端 |
| `DISPLAY` | `:1` | X11 显示服务（TigerVNC） |
| `VNC_RESOLUTION` | `1920x1200x24` | 虚拟桌面分辨率 |
| `VNC_DPI` | `96` | 标准 DPI |
| `FORCE_COLOR` / `NO_COLOR` | `0` / `1` | 禁用终端颜色输出 |
| `GIT_LFS_SKIP_SMUDGE` | `1` | 跳过 LFS 文件下载 |
| `GIT_DISCOVERY_ACROSS_FILESYSTEM` | `0` | 禁止跨文件系统 Git 发现 |
| `HOSTNAME` | `cursor` | 固定主机名 |

### 2.7 端口监听

| 端口 | 进程 | 协议 / 用途 |
|------|------|-------------|
| **2375** | dockerd（宿主机） | Docker Engine REST API（未加密，因 host 网络可达） |
| **5901** | Xtigervnc | VNC 原始协议（localhost 绑定） |
| **26053** | exec-daemon (node) | HTTP API（Agent 命令执行） |
| **26054** | exec-daemon (node) | PTY WebSocket（终端交互） |
| **26058** | websockify (python3) | noVNC Web 客户端（HTTP/WebSocket → VNC） |
| **26500** | 未知（宿主机） | 待确认（可能为 pod 编排或遥测） |
| **50052** | 未知（宿主机） | 待确认（可能为 gRPC 控制面） |

### 2.8 与 HAQI 仓库的契合度

- 根 `package.json` 使用 **Bun workspaces**（`cli` / `hub` / `web` / `shared` 等），与当前 **Bun + Node** 环境一致。
- **Docker API 可达**（重要修正）：虽然容器内无 `docker` CLI，但因 `--network=host`，Docker REST API 在 `localhost:2375` 上完全可用。可通过 `curl` 或编程方式操作 Docker。这意味着 HAQI 的 `docker-session` 路径 **理论上可行**，只需将 `DockerCliRuntime` 改为 REST API 调用。

---

## 3. 与 HAQI 云能力的映射

| HAQI 概念 | 当前 Agent 环境 | 说明 |
|-----------|-----------------|------|
| Cloud worker / Runner | 本容器 + Cursor 编排 | 非 HAQI Socket.IO 注册的 machine，但承担「远程执行」角色 |
| `executionBackend` / `docker-session` | **Docker API 可达**（修正） | `localhost:2375` 提供完整 Docker API，可 pull/run/exec |
| `workspaceSource.repository` + Git | **具备** | `git` + 网络 + SSH auth socket 可用 |
| 密钥物化、环境模板 | **具备** | Cursor 通过环境变量注入 secrets |
| 检查点 / 镜像（checkpoint） | **具备 Docker API** | 可通过 Docker API 实现 commit / tag |
| 持久工作区 / 租约 | **部分类比** | 容器生命周期由 Cursor 平台管理，非 HAQI `cloud_workspaces` 表 |
| 桌面 / 浏览器自动化 | **完整具备** | XFCE + TigerVNC + noVNC + Chrome |
| 屏幕录制 | **具备** | polished-renderer（Rust native，FFmpeg backend） |

**修正结论**：当前环境 ≈ **「带完整 Docker API 的特权 Linux 容器 + 丰富语言工具链 + VNC 桌面」**。与前次调研认为「缺 Docker」不同，Docker Engine 实际运行在宿主机并通过 host 网络暴露。

---

## 4. 潜在技术栈与架构选项

### 4.1 执行面（Agent / Worker）

- **Docker REST API**：当前环境已有 `localhost:2375`；HAQI 可改写 `DockerSessionExecutor` 为 HTTP 调用而非 CLI 子进程。
- **OCI 容器（Docker CLI）**：可安装 `docker-ce-cli` 到容器内，即可使用标准 CLI 命令。
- **Kubernetes Job / Pod**：将「一次会话」映射为 Pod；与当前代码差异较大。
- **仅进程隔离**：与 `HostProcessExecutor` 一致；不跑嵌套容器。

### 4.2 控制面（Hub 已具备的方向）

- **异步 spawn + 阶段机**：`CloudSpawnPhase`（queued → pulling-checkpoint → creating-container → …）。
- **SQLite 持久化**：cloud requests / workspaces / secrets。
- **RPC 到 CLI Runner**：与具体 worker 拓扑绑定。

### 4.3 存储与快照

- **Docker commit / tag**：通过 Docker API 可直接实现；与当前 `CloudCheckpoint` 一致。
- **Git + 分支**：已有 workspace 分支与 repo 同步脚本方向。
- **Volume snapshot**：Docker volume 支持，但需额外存储后端。

### 4.4 网络与安全

- 出站 HTTPS 可用；入站需隧道或反向代理。
- Docker API 无鉴权（`localhost:2375` 无 TLS）：仅因 host 网络隔离在 VM 内；多租户场景需加固。
- 密钥：Hub SecretBroker + Runner 物化；云 Agent 场景需注意日志不落盘明文。

---

## 5. 缺口与建议（简表）

| 缺口 | 建议方向 |
|------|----------|
| 容器内无 `docker` CLI | 安装 `docker-ce-cli`；或改用 Docker REST API（已可达） |
| `snapshot-derived` / `session-clone` 未贯通 | 利用 Docker API commit + tag 实现 checkpoint |
| Host 网络下 Docker API 无鉴权 | 单租户可接受；多租户需 TLS 或 unix socket 限制 |
| polished-renderer 依赖 FFmpeg | 确认容器内 libavcodec 可用性 |

---

## 6. 复现观测命令

在同类环境中可自行核对：

```bash
uname -a
cat /etc/os-release
test -f /.dockerenv && echo inside-container
lscpu | head -20
free -h && df -h / /workspace
command -v docker podman bun node git python3

# Docker API（重要！）
curl -s http://localhost:2375/version | python3 -m json.tool
curl -s http://localhost:2375/containers/json | python3 -m json.tool
curl -s http://localhost:2375/images/json | python3 -m json.tool

# 进程树
ps auxf

# 端口监听
ss -tlnp

# 安全上下文
capsh --print
cat /proc/self/status | grep -i -E 'seccomp|cap'
ls -la /proc/self/ns/

# 环境变量
env | sort
```

---

## 7. Cursor 运行时实现剖析

本节说明 **Cursor Cloud Agent 容器内「控制与执行」的实现架构**。依据包括：进程树与命令行参数、文件系统布局、Docker API 返回的容器元数据、二进制 `strings` 提取的 gRPC 方法名与 Rust 模块路径。

### 7.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│ Cursor 控制面（云端）                                                  │
│  api2.cursor.sh · authentication.cursor.sh                          │
│  Connect-RPC over WebSocket · Telemetry · Agent Orchestration       │
└──────────────────────────▲──────────────────────────────────────────┘
                           │ TLS / WebSocket / Connect-RPC
┌──────────────────────────┴──────────────────────────────────────────┐
│ KVM 虚拟机                                                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Docker Engine 29.1.4 (localhost:2375)                          │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │ Container: pod-<podId>-<hash>                            │  │ │
│  │  │ Image: anyrun-empty (privileged, host network)           │  │ │
│  │  │                                                          │  │ │
│  │  │  ┌──────────────┐  ┌──────────────────────────────────┐ │  │ │
│  │  │  │ pod-daemon   │  │ exec-daemon                      │ │  │ │
│  │  │  │ (Rust, PID 1)│  │ (Node.js, @anysphere/exec-      │ │  │ │
│  │  │  │              │  │  daemon-runtime)                  │ │  │ │
│  │  │  │ gRPC:        │  │                                  │ │  │ │
│  │  │  │ CreateProcess│  │ :26053 HTTP API                  │ │  │ │
│  │  │  │ AttachProcess│  │ :26054 PTY WebSocket             │ │  │ │
│  │  │  └──────┬───────┘  └────────────┬─────────────────────┘ │  │ │
│  │  │         │ vsock/SSH              │ cursorsandbox          │  │ │
│  │  │         │ auth proxy             │ (Bwrap+seccomp+       │  │ │
│  │  │         ▼                        │  Landlock)             │  │ │
│  │  │  /run/host-services/             ▼                       │  │ │
│  │  │   ssh-auth.sock          Agent shell / tool execution    │  │ │
│  │  │                                                          │  │ │
│  │  │  ┌──────────────────────────────────────────────────┐    │  │ │
│  │  │  │ AnyOS Desktop Environment                        │    │  │ │
│  │  │  │  TigerVNC :1 (:5901) → XFCE4 + Plank + Chrome   │    │  │ │
│  │  │  │  noVNC/websockify (:26058) → Web 访问             │    │  │ │
│  │  │  │  polished-renderer → 屏幕录制（FFmpeg backend）    │    │  │ │
│  │  │  └──────────────────────────────────────────────────┘    │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Port 26500: 疑似 pod 编排/遥测                                       │
│  Port 50052: 疑似 gRPC 控制面端点                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 `pod-daemon`：容器内 PID 1 与进程管理

| 属性 | 值 |
|------|-----|
| 二进制 | `/pod-daemon`，Rust static-pie，7.9 MB，not stripped |
| 运行身份 | root（uid 0），PID 1 |
| 命令行 | `--ssh-auth-sock-path /run/host-services/ssh-auth.sock --ssh-auth-vsock-port 52` |
| 内存 | VmRSS ~4 MB |
| 源码路径 | `app/pod-daemon/src/main.rs`、`app/pod-daemon/src/process_manager.rs` |
| Protobuf 源 | `app/target/x86_64-unknown-linux-musl/release/build/tonic-proto-.../out/anyrun.v1.rs` |

**gRPC 服务**（从二进制字符串提取）：

```
/anyrun.v1.PodDaemonService/CreateProcess
/anyrun.v1.PodDaemonService/AttachProcess
```

**核心模块**：

| 模块 | 功能 |
|------|------|
| `pod_daemon::process_manager` | 进程创建/附着/生命周期管理/stdout-stderr 事件流 |
| `pod_daemon::ssh_auth_proxy` | SSH auth socket 代理（vsock → 宿主机 SSH agent） |

**CreateProcess RPC 字段**（从 Protobuf 定义提取）：
- `working_directory` — 工作目录
- `command` — 命令
- `env` — 环境变量
- `last_event_id` — 事件游标（用于 attach 时续传输出）

**进程输出机制**：
- `send_output_event` + `is_stdout` — 按 stdout/stderr 分类发送事件
- `read_output_stream` — 读取进程输出流
- `handle_process_lifecycle` — 进程生命周期管理

**SSH Auth 代理**：
- 监听 Unix socket `/run/host-services/ssh-auth.sock`
- 通过 vsock port 52 连接宿主机 SSH agent
- 供 `git clone/push` 等使用宿主机 SSH 凭据

**技术栈**（从二进制依赖提取）：
- Tonic（gRPC 框架）+ h2（HTTP/2）+ rustls（TLS）
- hyper（HTTP）+ tokio（异步运行时）

### 7.3 `exec-daemon`：Agent 执行引擎

| 属性 | 值 |
|------|-----|
| 形态 | `/exec-daemon/node`（124 MB）执行 `index.js`（16 MB） |
| 包名 | `@anysphere/exec-daemon-runtime` |
| 构建时间 | 2026-03-28T01:04:22.063Z |
| 运行身份 | ubuntu（uid 1000） |

**命令行参数**（完整）：

```
serve
  --port 26053                    # HTTP API 端口
  --pty-websocket-port 26054      # PTY WebSocket 端口
  --auth-token <sha256>           # 共享密钥鉴权
  --rg-path /exec-daemon/rg       # ripgrep 路径
  --cloud-rules-enabled           # 启用云规则
  --computer-use-enabled          # 启用桌面操作（Computer Use）
  --trace-endpoint https://api2.cursor.sh  # 遥测上报
  --trace-auth-token <jwt>        # 遥测鉴权（JWT，含 user ID、scope、过期时间）
  --ghost-mode true               # Ghost 模式
  --browser-enabled               # 启用浏览器自动化
  --record-screen-enabled         # 启用屏幕录制
```

**JWT trace-auth-token 结构**（base64 解码）：

| 字段 | 值 |
|------|-----|
| `sub` | `google-oauth2\|user_<userId>` |
| `type` | `exec_daemon` |
| `scope` | `openid profile email offline_access` |
| `iss` | `https://authentication.cursor.sh` |
| `aud` | `https://cursor.com` |
| `exp` | Unix 时间戳（约 7 天有效期） |

**功能模块**（从 `index.js` 字面量提取）：

| 功能 | 关键字 / API |
|------|--------------|
| Shell 执行 | `@anysphere/shell-exec`、`cursorsandbox` 集成 |
| 沙箱策略 | `parseSandboxPolicyJson`、`configureSandboxPrereqs` |
| 规则系统 | `.cursor/rules`、cloud rules、sandbox.json |
| 技能系统 | `~/.cursor/skills-cursor/`、`SKILL.md` 加载 |
| 远程构件 | `cursor.blob.core.windows.net/remote-releases/`、`downloadCursorServer` |
| SSE | GET endpoint 返回 `text/event-stream` |
| Connect-RPC | `ConnectRPC` + WebSocket adapter |

**随附工具**（`/exec-daemon/` 目录）：

| 工具 | 说明 |
|------|------|
| `rg`（5.4 MB） | ripgrep，static-pie linked |
| `cursorsandbox`（4.6 MB） | 命令沙箱，static-pie linked |
| `gh`（55 MB） | GitHub CLI |
| `ssh-keygen`（453 KB） | SSH 密钥生成 |
| `polished-renderer.node`（5.8 MB） | Rust 原生 Node 模块，屏幕录制（FFmpeg backend） |
| `pty.node`（73 KB） | PTY 原生模块 |
| `tmux` + `tmux-root/` | 自带 tmux + libevent（终端复用） |
| `97f64a4d8eca9a2e35bb.mp4` | 内嵌 MP4 资源（63 KB，用途待确认） |

### 7.4 `cursorsandbox`：多层命令隔离

从二进制字符串可提取其完整的沙箱实现架构：

**七步隔离流程**：

| 步骤 | 阶段 | 技术 |
|------|------|------|
| 1-2/7 | User namespace 创建 | `unshare`、`newuidmap`/`newgidmap` |
| 2.5/7 | Loopback 网络设置 | 网络命名空间内的 loopback 配置 |
| 3/7 | Mount namespace 隔离 | `MS_PRIVATE` 重挂载 |
| 5/7 | 网络 seccomp | seccomp BPF 过滤网络系统调用 |
| 5.5/7 | 危险系统调用 seccomp | 阻止 `ptrace` 等危险调用 |
| 6/7 | seccomp 网络阻断 | 进一步限制网络访问 |
| 6.5/7 | Drop capabilities | 丢弃不必要的 Linux 能力 |
| 7/7 | Working directory | 切换到目标工作目录 |

**沙箱后端**：

| 后端 | 环境变量 | 说明 |
|------|----------|------|
| Bubblewrap (`bwrap`) | `CURSOR_SANDBOX_LINUX_BACKEND` | Linux 默认后端 |
| Landlock | `CURSOR_SANDBOX_LANDLOCK_STATUS` | 文件系统级 LSM 隔离 |
| seccomp | — | 系统调用过滤 |
| macOS sandbox-exec | `/usr/bin/sandbox-exec` | macOS 路径（本环境不适用） |

**网络策略引擎**（从字符串提取）：

```
deny_list       — 域名/IP 黑名单
allow_list       — 域名/IP 白名单
default_deny     — 默认拒绝
default_allow    — 默认放行
policy_invalid   — 策略无效
unsupported_protocol — 不支持的协议
```

运行时通过 `--policy-json` 传入 JSON 策略，支持：
- **网络代理**：内置 HTTP/SOCKS 代理（`--forwarder-socket`、`--forwarder-http-port`、`--forwarder-socks-port`）
- **CONNECT 隧道**：`sandbox: CONNECT target connection failed (session=...)`
- **文件系统规则**：`file-suffix rules`、`glob denies`、`allow_rw` 路径白名单
- **决策日志**：`decision.log` 记录 URL、host hash、resolved IPs、matched rule 等
- **`.cursorignore`**：文件路径忽略/拒绝规则

### 7.5 AnyOS 桌面环境

Cursor Cloud Agent 内置完整的远程桌面系统，称为 **AnyOS**。

**组件栈**：

```
TigerVNC Server (:5901)
    └── XFCE4 Desktop (1920x1200, 96 DPI)
        ├── xfwm4 (窗口管理)
        ├── xfce4-panel (顶部面板，macOS 风格)
        ├── Plank (底部 Dock，macOS 风格)
        ├── Thunar (文件管理)
        ├── xfdesktop (桌面背景：macOS Tiger 壁纸)
        └── Google Chrome (浏览器自动化)
    └── noVNC 1.2.0 + websockify 0.10.0 (:26058)
        └── Web 浏览器可直接访问远程桌面
    └── polished-renderer.node
        └── 屏幕录制（Rust + FFmpeg/libavcodec）
```

**配置系统**（`anyos.conf`）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `ANYOS_DISPLAY_WIDTH` | 1920 | 显示宽度 |
| `ANYOS_DISPLAY_HEIGHT` | 1200 | 显示高度（16:10） |
| `ANYOS_DPI` | 96 | 标准 DPI |
| `ANYOS_FRAMERATE` | 120 | 录制帧率 |
| `ANYOS_FONT_NAME` | Inter | UI 字体 |
| `ANYOS_TERMINAL_FONT_NAME` | JetBrains Mono | 终端字体 |
| `ANYOS_PANEL_HEIGHT` | 28 | 顶部面板高度 |
| `ANYOS_DOCK_ICON_SIZE` | 48 | Dock 图标大小 |

**主题**：WhiteSur Light（macOS 风格 GTK / 图标 / 光标主题）

**初始化流程**（`desktop-init.sh`）：
1. 加载 `anyos.conf` 配置
2. 读取 VNC 目标用户环境（`/tmp/vnc-desktop-user-env`）
3. 设置 `DISPLAY`、`DBUS_SESSION_BUS_ADDRESS`、`LIBGL_ALWAYS_SOFTWARE=1`
4. 启动 TigerVNC Server
5. 启动 XFCE4 Session
6. 启动 noVNC + websockify
7. 启动 Plank Dock

**支持 HiDPI**：有 `anyos.hidpi.conf` 配置文件用于 4K/2x 缩放场景。

### 7.6 `cloud-agent-tools`：资产分发系统

Cursor 使用一套自建的 **可复现资产分发系统**，确保每次 Agent 启动时环境一致。

**目录结构**：

```
/opt/cursor/cloud-agent-tools/
├── current -> ./<bundle-hash>/   # 当前版本符号链接
├── current.bundle-hash           # 当前 bundle SHA-256
└── <bundle-hash>/
    ├── cloud-agent-setup          # 安装脚本（21 KB bash）
    ├── cloud-agent-tools.tsv      # 工具清单（14 条）
    ├── cloud-agent-assets.tsv     # 资产清单（31 条）
    └── files/
        ├── anyos/                 # AnyOS 配置
        │   ├── anyos.conf
        │   └── anyos-setup.sh
        └── vnc/                   # VNC 桌面脚本
            ├── desktop-init.sh
            ├── configure-google-chrome.sh
            ├── configure_os_display.sh
            ├── install-fonts-and-fontconfig.sh
            ├── install-google-chrome.sh
            ├── install-remote-vnc-setup.sh
            ├── install-vnc-desktop-apt-packages.sh
            ├── vnc-desktop.Aptfile
            └── ...
```

**清单格式**（TSV）：

```
<permissions>\t<sha256>\t<source_b64>\t<destination_b64>
```

每条记录包含：权限模式、SHA-256 校验和、base64 编码的源路径、base64 编码的目标路径。

**`cloud-agent-setup` 脚本功能**：

| 子命令 | 用途 |
|--------|------|
| `sync-assets <url> <cmd> <ver>` | 从 S3 下载资产并校验 SHA-256 |
| `run-step <step-name>` | 执行单个安装步骤 |
| `wrap-vnc-step <idx> <total> <cmd> -- <step> [args]` | 包装 VNC 步骤，带失败哨兵机制 |

**资产来源**：`https://public-asphr-vm-daemon-bucket.s3.us-east-1.amazonaws.com/`

**exec-daemon 分发**：

```
exec_daemon_version 文件内容（完整 URL）：
https://public-asphr-vm-daemon-bucket.s3.us-east-1.amazonaws.com/
  exec-daemon/exec-daemon-x64-<sha256>.tar.gz
```

**VNC 失败哨兵**：

```
VNC_SETUP_FAILURE_SENTINEL_PATH=/usr/local/share/vnc-setup-commands-failure.v5.env
VNC_SETUP_FAILURE_MAX_CONSECUTIVE=3
```

连续失败超过 3 次时跳过该安装步骤，保证 Agent 可用性。

### 7.7 `polished-renderer`：屏幕录制引擎

| 属性 | 值 |
|------|-----|
| 形态 | Rust 原生 Node.js 模块（`.node` 扩展） |
| 大小 | 5.8 MB |
| 依赖 | FFmpeg libavcodec（运行时动态链接） |
| 功能 | `avcodec_alloc_context3`、`avcodec_find_decoder`、`av_read_frame` 等 |
| 渲染 | `resvg`（SVG）+ `tiny_skia`（2D 光栅化） |
| 输出 | 视频帧 → 编码 → MP4 |

**构件目录**：

```
/opt/cursor/artifacts/   # 录制输出目录（drwxrwxrwt，全局可写）
/opt/cursor/.exec-daemon # exec-daemon 工作目录
```

### 7.8 Cursor Agent 钩子与规则

**`~/.cursor/` 目录**：

| 路径 | 用途 |
|------|------|
| `agent-hooks/L3dvcmtzcGFjZQ/` | Agent 钩子（base64 编码的 workspace 路径） |
| `bin/cursor-git-ssh-keygen` | SSH 密钥生成封装脚本 |
| `projects/` | 项目数据 |

**规则加载顺序**（从 `index.js` 字面量推断）：
1. `~/.cursor/sandbox.json` — 用户级沙箱策略
2. `<workspace>/.cursor/sandbox.json` — 项目级沙箱策略
3. `.cursor/rules/*.mdc` — 项目级 Cursor 规则
4. `~/.cursor/skills-cursor/` — 内置技能
5. Cloud rules — 云端下发规则

### 7.9 Docker 容器详细配置

从 Docker API 获取的容器 inspect 数据：

```json
{
    "Name": "/pod-4gsef3w6w5asrl6ng76xer7ota-e18a9cc7",
    "Image": "anyrun-empty:latest",
    "HostConfig": {
        "Privileged": true,
        "NetworkMode": "host",
        "SecurityOpt": ["label=disable"],
        "Memory": 17179869184,
        "NanoCpus": 4000000000,
        "CgroupnsMode": "private",
        "ShmSize": 67108864,
        "Runtime": "runc",
        "LogConfig": { "Type": "journald" },
        "ExtraHosts": [
            "cursor:127.0.0.1",
            "host.docker.internal:host-gateway"
        ]
    }
}
```

**可用 Docker 镜像**：

| 镜像 | 大小 | 用途 |
|------|------|------|
| `anyrun-empty:latest` | 5 bytes | Agent 容器基础镜像（空壳，环境由运行时构建） |
| `946207870883.dkr.ecr.us-east-1.amazonaws.com/anyrun-utils:util-a237115` | 245 MB | 辅助工具镜像 |

### 7.10 与 HAQI 对照（实现视角）

| 能力 | HAQI | Cursor 云（本节模型） |
|------|------|------------------------|
| 谁在机器上起 shell | **CLI** 连 Hub，RPC/事件驱动 | **pod-daemon gRPC** `CreateProcess` + **exec-daemon** |
| 终端到浏览器 | Hub **Socket.IO** 转发 | **PTY WebSocket**（:26054）+ 闭源协议 |
| 进程输出 | CLI 上报 | **PodDaemon `AttachProcess`** 事件流 |
| 策略/忽略文件 | 自有模式 | **`.cursorignore` + sandbox.json + cursorsandbox** 七步隔离 |
| 容器编排 | `spawnCoordinator` + Docker CLI | **Docker API**（宿主机 :2375） |
| 桌面/浏览器 | 无内建 | **AnyOS**（XFCE + TigerVNC + noVNC + Chrome） |
| 屏幕录制 | 无内建 | **polished-renderer**（Rust + FFmpeg） |
| SSH 凭据 | 自管理 | **vsock SSH auth proxy** → 宿主机 SSH agent |
| 资产分发 | npm/bun install | **cloud-agent-setup** TSV 清单 + S3 + SHA-256 校验 |
| 密钥管理 | `SecretBroker` + 物化 | 环境变量注入 + **JWT token**（`trace-auth-token`） |
| 构件产出 | 无标准路径 | `/opt/cursor/artifacts/`（全局可写） |

### 7.11 局限与未验证项

- **Protobuf 完整定义**：仅从二进制 strings 提取方法名和字段名，不含完整 schema。
- **端口 26500 / 50052**：无法确认具体用途（进程不在容器内，从宿主机监听）。
- **exec-daemon 内部逻辑**：`index.js` 为 Webpack bundle（16 MB），未反编译；API 路由和沙箱策略细节在闭源代码中。
- **不同镜像批次**：exec-daemon tarball 版本、pod-daemon 行为可能因批次更新而变化。
- **anyrun-utils 镜像用途**：245 MB 辅助镜像的具体功能未探测。

---

*本文档由 Agent 在 Cursor Cloud Agent 实际运行环境中执行命令采集数据并撰写（观测时间：2026-03-30）。仅反映采样时刻；部署时应以正式镜像说明与基础设施文档为准。*
