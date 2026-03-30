# 云 Agent 运行环境调研

本文记录 **当前 Cursor Cloud Agent 实际运行环境** 的观测结果，并对照 **HAQI 云会话 / 云端工作区** 目标形态，归纳系统特征、已有技术栈与潜在缺口。观测时间点以仓库内 Agent 会话为准；不同云厂商或批次镜像可能略有差异。

## 1. 目标对齐说明

「目标想要达到的环境」在此理解为：

- **隔离、可复用的 Linux 执行面**：Agent 在受控环境中读写代码、跑命令、访问网络。
- **与 HAQI 云路径一致的能力边界**：本仓库中云 spawn 依赖 **Docker 会话镜像**、**Git 同步仓库**、**密钥物化**、**可选侧车服务** 等；目标环境应能支撑这些能力或明确哪些能力在控制面侧提供。

下文 **第二节为实测**，**第三节为与 HAQI 的映射**，**第四节为建议技术栈与风险**，**第七节为 Cursor 侧实现剖析**（基于容器内文件与二进制 `strings`，非反编译）。

## 2. 当前环境实测

### 2.1 操作系统与内核

| 项 | 观测值 |
|----|--------|
| 内核 | Linux 6.1.147，`x86_64`，`PREEMPT_DYNAMIC` |
| 发行版 | Ubuntu 24.04.4 LTS（Noble） |
| 用户 | `ubuntu`（uid/gid 1000） |
| 工作目录 | 仓库挂载于 `/workspace`（与常见 Cursor 云工作区一致） |

### 2.2 容器与文件系统

| 项 | 观测值 |
|----|--------|
| 容器标识 | 存在 `/.dockerenv`，表明进程运行在 **Docker（或兼容）容器** 内 |
| 根文件系统 | `/` 与 `/workspace` 均为 **overlay**，典型容器层叠挂载 |
| 磁盘 | 单卷约 **126G** 量级（示例环境），使用率视任务变化 |
| 内存 | 示例约 **15Gi** 总量，无 swap |
| CPU | 示例 **4 核** |

含义：当前 Agent **本身已在容器内**；若在同一 VM 内再嵌套运行 `docker` CLI，需要 **Docker-in-Docker** 或 **宿主机 socket 挂载**，本环境 **未检测到 `docker` / `podman` 命令**（见下）。

### 2.3 已安装工具链

| 类别 | 版本 / 路径（示例） |
|------|---------------------|
| Bun | 1.3.5，`~/.bun/bin` |
| Node.js | v22.22.1（nvm） |
| Rust | rustc 1.83.0 |
| Python | 3.12.3 |
| Git | 2.43.0 |
| curl | 8.5.0 |
| jq | 1.7 |

### 2.4 环境变量与 Agent 特征

- `CURSOR_AGENT=1`：表明当前为 Cursor Agent 会话。
- `TERM=dumb`：非交互终端，适合脚本与工具，不适合依赖全屏 TUI 的流程。
- `PATH` 含 Bun、Cargo、Node，与 **TypeScript / Rust  monorepo** 开发一致。

### 2.5 与 HAQI 仓库的契合度

- 根 `package.json` 使用 **Bun workspaces**（`cli` / `hub` / `web` / `shared` 等），与当前 **Bun + Node** 环境一致。
- **本机未提供 Docker CLI**：若在此环境直接执行 HAQI Runner 的 **`runtimeKind: docker-session`** 路径（`DockerCliRuntime`、`ensureWorkspaceContainer`），会因找不到 `docker` 而失败，除非另行注入客户端或改为非容器执行后端。

## 3. 与 HAQI 云能力的映射

下表将「目标云环境」与仓库中已有概念对齐（实现细节见 `hub/src/cloud/`、`cli/src/cloud/`、`cli/src/runner/run.ts`）。

| HAQI 概念 | 当前 Agent 环境 | 说明 |
|-----------|-----------------|------|
| Cloud worker / Runner | 类比为 **本容器 + Cursor 编排** | 非 HAQI Socket.IO 注册的 machine，但承担「远程执行」角色 |
| `executionBackend` / `docker-session` | **缺 Docker CLI** | 代码路径假设本机可 `docker pull/run/exec` |
| `workspaceSource.repository` + Git | **具备** | `git` 与网络可用即可克隆/同步 |
| 密钥物化、环境模板 | **具备（文件与进程层面）** | 与具体密钥注入方式有关 |
| 检查点 / 镜像（checkpoint + `runtime.image`） | **依赖 Docker 或等价 OCI 运行时** | 当前环境需额外能力 |
| 持久工作区 / 租约 | **部分类比** | 容器生命周期由平台管理，非 HAQI `cloud_workspaces` 表 |

结论：**当前环境 ≈「无嵌套 Docker 的 Linux 开发容器 + 丰富语言工具链」**；与 HAQI 云文档中「Runner 机器上跑 Docker 会话」的模型 **差在容器运行时是否对 Agent 暴露**。

## 4. 潜在技术栈与架构选项

### 4.1 执行面（Agent / Worker）

- **OCI 容器（Docker / containerd / nerdctl）**：与现有 `DockerSessionExecutor`、`WorkspaceContainerManager` 一致；需在 worker 镜像内安装 daemon 或挂载 `/var/run/docker.sock`（安全边界需单独设计）。
- **Kubernetes Job / Pod**：将「一次会话」映射为 Pod，镜像即 checkpoint；Git 同步用 init 容器或 sidecar；与当前代码的「本机 docker CLI」差异较大，需适配层。
- **Firecracker / Kata（强隔离 VM）**：安全与多租户更优，集成成本高。
- **仅进程隔离（当前 Cursor 容器）**：与 `HostProcessExecutor` 思路接近；不跑嵌套容器则 **docker-session 需关闭或改写**。

### 4.2 控制面（Hub 已具备的方向）

- **异步 spawn + 阶段机**：`CloudSpawnPhase`（queued → pulling-checkpoint → creating-container → …）。
- **SQLite 持久化**：cloud requests / workspaces / secrets。
- **RPC 到 CLI Runner**：与具体 worker 拓扑绑定。

### 4.3 存储与快照

- **镜像 tag/digest 作为 checkpoint**：与当前 `CloudCheckpoint`、`runtime.image` 一致。
- **容器 commit / volume snapshot**：协议中有 `runtime.snapshot` 等字段，实现未贯通；若产品要「从运行中会话冻结再派生」，需存储后端（Registry、Ceph、S3 + 自定义元数据）与 Runner 协作。
- **Git + 分支 `haqi/<workspaceId>`**：已有 workspace 分支与 repo 同步脚本方向，适合「代码态」派生，不等价于整盘快照。

### 4.4 网络与安全

- 出站 HTTPS（工具安装、API）为常见需求；入站预览端口需 **隧道或反向代理**（仓库已有 tunwg 等相关脚本，属产品化路径）。
- 密钥：**Hub SecretBroker + Runner 物化**；云 Agent 场景需注意 **日志与转储** 不落盘明文。

## 5. 缺口与建议（简表）

| 缺口 | 建议方向 |
|------|----------|
| Agent 内无 `docker` | Worker 镜像预装 CLI + socket；或 Runner 仅使用 `local` / 进程模式；或远端执行改为 K8s API |
| `snapshot-derived` / `session-clone` 协议未全流程实现 | 产品定义「派生」是 Git 分支、镜像还是 volume，再补 `prepareWorkspace` 与 spawn 约束 |
| 与 Cursor 云环境对齐 | 若目标即「类似当前 VM」：以 **Host 类执行 + 可选侧车容器服务** 为第一阶段，Docker 会话为第二阶段 |

## 6. 复现观测命令（可选）

在同类环境中可自行核对：

```bash
uname -a
cat /etc/os-release
test -f /.dockerenv && echo inside-container
command -v docker podman bun node git python3
free -h && df -h / /workspace
```

## 7. Cursor 运行时实现剖析

本节说明 **Cursor Cloud Agent 容器内「控制与执行」大致如何实现**。依据包括：`/opt/cursor` 与 Ansible  playbook、`/pod-daemon` 与 `/exec-daemon` 可执行文件中的 **嵌入字符串与符号路径**、进程命令行中可见参数。**未**对闭源 `index.js` 做反编译；**gRPC 方法名、Rust 模块路径** 等来自二进制内嵌文本，属较强证据；**调用顺序与 Protobuf 字段** 仍以官方实现为准。

### 7.1 分层架构（概念）

```
┌─────────────────────────────────────────────────────────────┐
│ Cursor 控制面（云端）                                         │
│ api2.cursor.sh、authentication…、Connect-RPC over WebSocket 等 │
└──────────────────────────▲──────────────────────────────────┘
                           │ TLS / WebSocket / 应用协议
┌──────────────────────────┴──────────────────────────────────┐
│ 访客容器（Agent VM）                                          │
│  ┌──────────────┐   ┌─────────────────────────────────────┐ │
│  │  pod-daemon  │   │  exec-daemon（/exec-daemon/node +     │ │
│  │  (Rust)      │   │  index.js，@anysphere/exec-daemon-    │ │
│  │              │   │  runtime）                           │ │
│  └──────┬───────┘   └──────────────┬──────────────────────┘ │
│         │ vsock / SSH auth 代理     │ HTTP、PTY WebSocket、    │
│         ▼                           ▼   子进程 + cursorsandbox │
│  CreateProcess / AttachProcess      bash、rg、浏览器自动化等    │
└─────────────────────────────────────────────────────────────┘
```

- **控制面**：闭源；`index.js` 字面量中出现 `https://api2.cursor.sh`、`ConnectRPC`、`WebSocket adapter` 等与进程参数 `--trace-endpoint` 一致。
- **容器内**：**`pod-daemon`** 与 **`exec-daemon`** 分工；**不是** 依赖名为 `cursor` 的单一 CLI 完成全部能力。

### 7.2 `pod-daemon`：Pod 内进程管理与宿主机通道

对 `/pod-daemon` 提取字符串可见（节选含义）：

| 线索 | 推断 |
|------|------|
| `pod_daemon::process_manager`、`pod_daemon::ssh_auth_proxy` | Rust 实现，模块边界清晰。 |
| `/anyrun.v1.PodDaemonService/CreateProcess`、`AttachProcess` | **gRPC 服务** `anyrun.v1.PodDaemonService` 上的 RPC；Tonic/h2/rustls 等栈与 **HTTP/2 + gRPC** 一致。 |
| `CreateProcessRequest` 相关：`working_directory`、`command`、`env`、`last_event_id` | 在 guest 内 **创建子进程**，并带 **事件游标**（便于 attach 时续传）。 |
| `send_output_event`、`is_stdout`、`read_output_stream`、`handle_process_lifecycle` | **stdout/stderr 事件流** 与生命周期管理。 |
| `Failed to connect to host vsock`、`SSH auth socket` | 与启动参数 `--ssh-auth-sock-path`、`--ssh-auth-vsock-port` 一致：**宿主机经 vsock 向容器暴露 SSH agent 类能力**，供 `git` 等使用。 |

**概括**：宿主机或 sidecar 通过 **vsock（或等价）** 调 `pod-daemon`，用 **gRPC** 在容器内 **起进程、附着进程、拉取输出**；SSH 凭据走 **代理 socket**，而非要求用户在容器内单独配密钥文件。

### 7.3 `exec-daemon`：会话执行、PTY、连官方 API

- **形态**：`/exec-daemon/node` 执行 `index.js`；`package.json` 中包名为 `@anysphere/exec-daemon-runtime`。
- **监听**：典型参数含 `serve --port <http> --pty-websocket-port <ws> --auth-token …`，即 **HTTP API + 独立 PTY WebSocket**，带共享密钥。
- **对上**：`--trace-endpoint https://api2.cursor.sh` 等与遥测/控制面通信；字面量中可见 **Connect-RPC** 与 **WebSocket** 适配相关文本。
- **对下**：`strings` 中出现 `@anysphere/shell-exec`、`configureRipgrepPath`、`configureSandboxPrereqs`，与同目录 **`rg`、`cursorsandbox`** 一致。

**终端（推断，与端口命名及常见模式一致）**：客户端经 **WebSocket** 连 `pty-websocket-port`，与 **`pty.node`** 原生模块配合，在本地分配 **PTY** 并绑定 shell/子进程。与 HAQI「Socket.IO + Hub 转发」是 **同类能力、不同协议与拓扑**。

### 7.4 `cursorsandbox`：命令级隔离

对 `/exec-daemon/cursorsandbox` 提取字符串可见 **Bubblewrap、Linux user namespace、seccomp、Landlock、mount** 等错误与状态文案，以及 `.cursorignore`、`Blocked by sandbox network policy`、`CURSOR_SANDBOX_LINUX_BACKEND` 等。

**概括**：用户/Agent 触发的命令常经 **沙箱包装**，组合 **Bwrap + 命名空间挂载 + seccomp（含网络相关限制）+ Landlock + 与 `.cursorignore` 等规则**，实现 **可读路径与网络策略**；具体策略由上层加载（`index.js` 闭源）。

### 7.5 桌面、浏览器、录屏：`/opt/cursor` 与 Ansible

- **`/opt/cursor/ansible/vnc-desktop.yml`**：声明安装 **TigerVNC、XFCE、noVNC（如 1.2.0）、websockify（如 0.10.0）、Google Chrome、主题字体、polished-renderer** 等；README 说明与 **公开/内部镜像** 共享同一 playbook。
- **穿透方式**：**VNC（RFB）→ websockify → 浏览器 WebSocket**，即经典 **noVNC** 栈；非 exec-daemon PTY 的同一条链路，但同属「远程可视/可操作」能力。
- **`cloud-agent-tools`**：`cloud-agent-setup` 根据 **TSV 清单（权限、sha256、目标路径）** 从给定 **download base URL** 同步资产，注释指向内部 **`podConfig.ts`** 对齐，保证 **可复现安装**。

### 7.6 规则、技能与远程构件（`index.js` 字面量）

`strings` 可见对 **`.cursor/rules`、`~/.cursor/skills-cursor`、`sandbox.json`、`.cursorignore`** 等路径与 API 符号的引用，以及 **`cursor.blob.core.windows.net/remote-releases/`**、`downloadCursorServer` 等，表明云侧仍会 **拉取或同步 Cursor 相关构件与策略**，与桌面产品概念对齐（细节在闭源 bundle）。

### 7.7 与 HAQI 对照（实现视角）

| 能力 | HAQI | Cursor 云（本节模型） |
|------|------|------------------------|
| 谁在机器上起 shell | **CLI** 连 Hub，RPC/事件驱动 | **pod-daemon gRPC** + **exec-daemon** |
| 终端到浏览器 | Hub **Socket.IO** 转发 | **PTY WebSocket**（专用端口）+ 闭源协议 |
| 图形桌面到浏览器 | **Web「远程桌面」**：会话元数据中的 `previewUrls` 若含 **noVNC / websockify**（URL 或名称命中），则内嵌 iframe；仅暴露 **5900** 等原生 VNC 时提示用 **6080 类 HTTP** 的 noVNC 预览 | **VNC → websockify → noVNC**（Ansible 镜像栈） |
| 进程输出 | CLI 上报 | **PodDaemon AttachProcess** 事件流（推断） |
| 策略/忽略文件 | 自有模式 | **`.cursorignore` + sandbox.json + cursorsandbox** |

### 7.8 局限

- **Protobuf 定义、RPC 请求顺序、与前端 URL 拼接** 未在本文验证。
- 不同 Cursor 镜像批次可能升级 **exec-daemon tarball**、`pod-daemon` 行为或 **noVNC/websockify** 版本，以实际环境为准。

---

*本文档由 Agent 在实际运行环境中执行命令采集数据并撰写，仅反映采样时刻；部署时应以正式镜像说明与基础设施文档为准。*
