#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="${ROOT_DIR}/cli"
WEB_DIR="${ROOT_DIR}/web"
HAPI_HOME_DIR="${HAPI_HOME:-${HOME}/.hapi}"
RUNNER_STATE_FILE="${HAPI_HOME_DIR}/runner.state.json"
SERVER_LOG_FILE="${HAPI_HOME_DIR}/logs/hapi-local-server.log"
SCREEN_SESSION="${HAPI_LOCAL_SCREEN_SESSION:-hapi-local-server}"
SERVER_PORT="${HAPI_LISTEN_PORT:-3006}"

BUN_BIN_CANDIDATE="${BUN_BIN:-${HOME}/.bun/bin/bun}"

if [ -x "${BUN_BIN_CANDIDATE}" ]; then
    BUN_BIN="${BUN_BIN_CANDIDATE}"
elif command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
else
    echo "❌ bun 未安装，请先安装 bun (推荐 1.3.5)"
    echo "   curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.5"
    exit 1
fi

mkdir -p "${HAPI_HOME_DIR}/logs"

print_usage() {
    cat <<EOF
用法:
  $(basename "$0") <命令>

命令:
  setup      安装依赖并构建 web
  start      启动本地分支 runner + server（复用 ~/.hapi 配置）
  stop       停止本地分支 runner + server
  restart    重启本地分支 runner + server
  status     查看当前运行状态
  logs [N]   查看 server 日志（默认最后 100 行）
  attach     进入 screen 会话查看 server 实时输出
EOF
}

server_port_pid() {
    ss -ltnp 2>/dev/null \
        | grep -F ":${SERVER_PORT} " \
        | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
        | head -n 1
}

pid_cmd() {
    local pid="$1"
    ps -p "${pid}" -o cmd= 2>/dev/null || true
}

is_local_server_cmd() {
    local cmd="$1"
    [[ "${cmd}" == *"${CLI_DIR}"* && "${cmd}" == *"src/index.ts server"* ]]
}

is_hapi_server_cmd() {
    local cmd="$1"
    [[ "${cmd}" == *"hapi"* && "${cmd}" == *"server"* ]]
}

ensure_setup() {
    if [ ! -d "${ROOT_DIR}/node_modules" ]; then
        echo "📦 安装依赖..."
        (cd "${ROOT_DIR}" && "${BUN_BIN}" install)
    fi

    if [ ! -f "${WEB_DIR}/dist/index.html" ]; then
        echo "🏗️  构建 web..."
        (cd "${ROOT_DIR}" && PATH="${HOME}/.bun/bin:${PATH}" bun run build:web)
    fi
}

cmd_setup() {
    echo "📦 安装依赖..."
    (cd "${ROOT_DIR}" && "${BUN_BIN}" install)
    echo "🏗️  构建 web..."
    (cd "${ROOT_DIR}" && PATH="${HOME}/.bun/bin:${PATH}" bun run build:web)
    echo "✅ setup 完成"
}

cmd_start() {
    ensure_setup

    local port_pid
    port_pid="$(server_port_pid || true)"
    if [ -n "${port_pid}" ]; then
        local cmd
        cmd="$(pid_cmd "${port_pid}")"
        if is_local_server_cmd "${cmd}"; then
            echo "ℹ️  本地分支 server 已在运行 (PID: ${port_pid})"
        else
            echo "❌ 端口 ${SERVER_PORT} 已被占用:"
            echo "   PID: ${port_pid}"
            echo "   CMD: ${cmd}"
            echo "   先执行: $(basename "$0") stop"
            exit 1
        fi
    fi

    echo "🚀 启动 runner..."
    (cd "${CLI_DIR}" && "${BUN_BIN}" src/index.ts runner start >/dev/null)

    if command -v screen >/dev/null 2>&1; then
        if screen -ls | grep -q "\.${SCREEN_SESSION}[[:space:]]"; then
            echo "ℹ️  screen 会话 ${SCREEN_SESSION} 已存在，先关闭旧会话"
            screen -S "${SCREEN_SESSION}" -X quit || true
            sleep 1
        fi

        echo "🚀 启动 server (screen: ${SCREEN_SESSION})..."
        screen -L -Logfile "${SERVER_LOG_FILE}" -dmS "${SCREEN_SESSION}" \
            bash -lc "cd '${CLI_DIR}' && exec '${BUN_BIN}' src/index.ts server"
    else
        echo "⚠️  未检测到 screen，改用 nohup 后台启动 server"
        nohup bash -lc "cd '${CLI_DIR}' && exec '${BUN_BIN}' src/index.ts server" \
            >>"${SERVER_LOG_FILE}" 2>&1 &
    fi

    for _ in {1..20}; do
        if curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1; then
            break
        fi
        sleep 0.3
    done

    echo "✅ 启动完成"
    cmd_status
}

cmd_stop() {
    echo "🛑 停止 runner..."
    (cd "${CLI_DIR}" && "${BUN_BIN}" src/index.ts runner stop >/dev/null 2>&1 || true)

    if command -v screen >/dev/null 2>&1; then
        if screen -ls | grep -q "\.${SCREEN_SESSION}[[:space:]]"; then
            echo "🛑 停止 server screen 会话: ${SCREEN_SESSION}"
            screen -S "${SCREEN_SESSION}" -X quit || true
        fi
    fi

    pkill -f "src/index.ts server" 2>/dev/null || true
    pkill -f "/bin/haqi server" 2>/dev/null || true

    local port_pid
    port_pid="$(server_port_pid || true)"
    if [ -n "${port_pid}" ]; then
        local cmd
        cmd="$(pid_cmd "${port_pid}")"
        if is_hapi_server_cmd "${cmd}"; then
            kill "${port_pid}" 2>/dev/null || true
        fi
    fi

    echo "✅ 已执行 stop"
}

cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

cmd_status() {
    local version
    version="$(cd "${CLI_DIR}" && "${BUN_BIN}" src/index.ts --version | sed -n 's/^haqi version: //p')"
    echo "📌 本地源码 CLI 版本: ${version:-unknown}"

    if [ -f "${RUNNER_STATE_FILE}" ]; then
        echo "📌 runner.state: ${RUNNER_STATE_FILE}"
        python - "${RUNNER_STATE_FILE}" <<'PY'
import json,sys
p=sys.argv[1]
try:
    d=json.load(open(p))
except Exception as e:
    print(f"  读取失败: {e}")
    raise SystemExit
pid=d.get("pid")
version=d.get("startedWithCliVersion")
http_port=d.get("httpPort")
print(f"  pid={pid} startedWithCliVersion={version} httpPort={http_port}")
PY
    else
        echo "📌 未找到 runner.state: ${RUNNER_STATE_FILE}"
    fi

    local port_pid
    port_pid="$(server_port_pid || true)"
    if [ -n "${port_pid}" ]; then
        local cmd
        cmd="$(pid_cmd "${port_pid}")"
        echo "📌 server 端口 ${SERVER_PORT}: UP (PID ${port_pid})"
        echo "   ${cmd}"
    else
        echo "📌 server 端口 ${SERVER_PORT}: DOWN"
    fi

    if curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1; then
        echo "📌 /health: OK"
    else
        echo "📌 /health: FAIL"
    fi

    if command -v screen >/dev/null 2>&1; then
        if screen -ls | grep -q "\.${SCREEN_SESSION}[[:space:]]"; then
            echo "📌 screen 会话: ${SCREEN_SESSION} (running)"
        else
            echo "📌 screen 会话: ${SCREEN_SESSION} (not running)"
        fi
    fi
}

cmd_logs() {
    local lines="${1:-100}"
    if [ ! -f "${SERVER_LOG_FILE}" ]; then
        echo "⚠️  未找到日志文件: ${SERVER_LOG_FILE}"
        return 0
    fi
    echo "📄 ${SERVER_LOG_FILE} (最后 ${lines} 行)"
    tail -n "${lines}" "${SERVER_LOG_FILE}"
}

cmd_attach() {
    if ! command -v screen >/dev/null 2>&1; then
        echo "❌ 当前环境没有 screen，无法 attach"
        exit 1
    fi
    if ! screen -ls | grep -q "\.${SCREEN_SESSION}[[:space:]]"; then
        echo "❌ screen 会话不存在: ${SCREEN_SESSION}"
        exit 1
    fi
    echo "进入 screen：退出请按 Ctrl+A 然后 D"
    exec screen -r "${SCREEN_SESSION}"
}

ACTION="${1:-}"
case "${ACTION}" in
setup)
    cmd_setup
    ;;
start)
    cmd_start
    ;;
stop)
    cmd_stop
    ;;
restart)
    cmd_restart
    ;;
status)
    cmd_status
    ;;
logs)
    cmd_logs "${2:-100}"
    ;;
attach)
    cmd_attach
    ;;
""|-h|--help|help)
    print_usage
    ;;
*)
    echo "❌ 未知命令: ${ACTION}"
    print_usage
    exit 1
    ;;
esac
