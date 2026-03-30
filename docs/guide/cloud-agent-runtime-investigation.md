# 云 Agent 运行环境调研

本文记录 **当前 Cursor Cloud Agent 实际运行环境** 的观测结果，并对照 **HAQI 云会话 / 云端工作区** 目标形态，归纳系统特征、已有技术栈与潜在缺口。观测时间点以仓库内 Agent 会话为准；不同云厂商或批次镜像可能略有差异。

## 1. 目标对齐说明

「目标想要达到的环境」在此理解为：

- **隔离、可复用的 Linux 执行面**：Agent 在受控环境中读写代码、跑命令、访问网络。
- **与 HAQI 云路径一致的能力边界**：本仓库中云 spawn 依赖 **Docker 会话镜像**、**Git 同步仓库**、**密钥物化**、**可选侧车服务** 等；目标环境应能支撑这些能力或明确哪些能力在控制面侧提供。

下文 **第二节为实测**，**第三节为与 HAQI 的映射**，**第四节为建议技术栈与风险**。

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

---

*本文档由 Agent 在实际运行环境中执行命令采集数据并撰写，仅反映采样时刻；部署时应以正式镜像说明与基础设施文档为准。*
