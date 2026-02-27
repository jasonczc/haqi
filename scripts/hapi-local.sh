#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="${ROOT_DIR}/cli"
WEB_DIR="${ROOT_DIR}/web"
HAPI_HOME_DIR="${HAPI_HOME:-${HOME}/.hapi}"
RUNNER_STATE_FILE="${HAPI_HOME_DIR}/runner.state.json"
SERVER_LOG_FILE="${HAPI_HOME_DIR}/logs/hapi-local-server.log"
DEV_LOG_FILE="${HAPI_HOME_DIR}/logs/hapi-local-dev.log"
SCREEN_SESSION="${HAPI_LOCAL_SCREEN_SESSION:-hapi-local-server}"
DEV_SCREEN_SESSION="${HAPI_LOCAL_DEV_SCREEN_SESSION:-hapi-local-dev}"
SERVER_PORT="${HAPI_LISTEN_PORT:-3006}"
WEB_DEV_PORT="${HAPI_WEB_DEV_PORT:-5173}"

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
  dev        启动开发热更新（runner + hub watch + web vite）
  dev-restart 强制重启开发热更新环境
  stop       停止本地分支 runner + server
  restart    重启本地分支 runner + server
  status     查看当前运行状态
  logs [N]   查看 server 日志（默认最后 100 行）
  dev-logs [N] 查看 dev 日志（默认最后 150 行）
  attach     进入 screen 会话查看 server 实时输出
  dev-attach 进入 dev screen 会话查看热更新输出
EOF
}

server_port_pid() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltnp 2>/dev/null \
            | grep -F ":${SERVER_PORT} " \
            | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
            | head -n 1
        return
    fi

    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"${SERVER_PORT}" -sTCP:LISTEN -t 2>/dev/null | head -n 1
        return
    fi

    return 0
}

pid_cmd() {
    local pid="$1"
    ps -p "${pid}" -o command= 2>/dev/null || ps -p "${pid}" -o cmd= 2>/dev/null || true
}

list_screen_session_ids() {
    local session="$1"
    local list
    list="$(screen -ls 2>/dev/null || true)"
    printf '%s\n' "${list}" \
        | sed -n "s/^[[:space:]]*\\([0-9][0-9]*\\.${session}\\)[[:space:]].*/\\1/p"
}

has_screen_session() {
    local session="$1"
    [ -n "$(list_screen_session_ids "${session}")" ]
}

stop_screen_sessions() {
    local session="$1"
    local ids
    ids="$(list_screen_session_ids "${session}")"
    if [ -z "${ids}" ]; then
        return 0
    fi

    while IFS= read -r id; do
        [ -n "${id}" ] || continue
        screen -S "${id}" -X quit || true
    done <<< "${ids}"

    return 0
}

first_screen_session_id() {
    local session="$1"
    list_screen_session_ids "${session}" | head -n 1
}

runner_state_field() {
    local field="$1"
    if [ ! -f "${RUNNER_STATE_FILE}" ]; then
        return 1
    fi
    python - "${RUNNER_STATE_FILE}" "${field}" <<'PY'
import json,sys
path=sys.argv[1]
field=sys.argv[2]
try:
    data=json.load(open(path))
except Exception:
    raise SystemExit(1)
value=data.get(field)
if value is None:
    raise SystemExit(1)
print(value)
PY
}

runner_state_pid() {
    runner_state_field "pid"
}

runner_state_http_port() {
    runner_state_field "httpPort"
}

runner_is_running() {
    local pid
    pid="$(runner_state_pid 2>/dev/null || true)"
    if [ -z "${pid}" ]; then
        return 1
    fi

    if ! kill -0 "${pid}" >/dev/null 2>&1; then
        return 1
    fi

    local cmd
    cmd="$(pid_cmd "${pid}")"
    [[ "${cmd}" == *"runner start-sync"* ]]
}

ensure_runner_started() {
    echo "🚀 启动 runner..."
    (cd "${CLI_DIR}" && "${BUN_BIN}" src/index.ts runner start >/dev/null 2>&1 || true)

    local ready=0
    for _ in {1..40}; do
        if runner_is_running; then
            ready=1
            break
        fi
        sleep 0.2
    done

    if [ "${ready}" -eq 1 ]; then
        return 0
    fi

    if [ -f "${RUNNER_STATE_FILE}" ]; then
        echo "⚠️  runner.state 可能过期，尝试清理后重试启动"
        rm -f "${RUNNER_STATE_FILE}" || true
        (cd "${CLI_DIR}" && "${BUN_BIN}" src/index.ts runner start >/dev/null 2>&1 || true)
        for _ in {1..40}; do
            if runner_is_running; then
                ready=1
                break
            fi
            sleep 0.2
        done
    fi

    if [ "${ready}" -ne 1 ]; then
        echo "❌ runner 启动失败（或状态异常）"
        echo "   请执行: cd cli && bun src/index.ts runner status"
        return 1
    fi

    return 0
}

is_local_server_cmd() {
    local cmd="$1"
    [[ "${cmd}" == *"${CLI_DIR}"* && ( "${cmd}" == *"src/index.ts server"* || "${cmd}" == *"src/index.ts hub"* ) ]]
}

is_local_hub_cmd() {
    local cmd="$1"
    [[ "${cmd}" == *"${CLI_DIR}"* && "${cmd}" == *"src/index.ts hub"* ]]
}

is_hapi_server_cmd() {
    local cmd="$1"
    [[ "${cmd}" == *"hapi"* && ( "${cmd}" == *"server"* || "${cmd}" == *"hub"* ) ]]
}

is_web_dev_ready() {
    curl -fsS "http://127.0.0.1:${WEB_DEV_PORT}/" >/dev/null 2>&1
}

ensure_deps() {
    if [ ! -d "${ROOT_DIR}/node_modules" ]; then
        echo "📦 安装依赖..."
        (cd "${ROOT_DIR}" && "${BUN_BIN}" install)
    fi
}

ensure_setup() {
    ensure_deps
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

    ensure_runner_started

    if curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1; then
        echo "ℹ️  runner 启动后检测到 server 已可用，跳过重复启动"
    else
        if command -v screen >/dev/null 2>&1; then
            if has_screen_session "${SCREEN_SESSION}"; then
                echo "ℹ️  screen 会话 ${SCREEN_SESSION} 已存在，先关闭旧会话"
                stop_screen_sessions "${SCREEN_SESSION}"
                sleep 1
            fi

            echo "🚀 启动 server (screen: ${SCREEN_SESSION})..."
            # Older GNU screen builds (e.g. macOS 4.00.03) do not support -Logfile.
            # Redirect server stdout/stderr inside the shell for cross-version compatibility.
            screen -dmS "${SCREEN_SESSION}" \
                bash -lc "cd '${CLI_DIR}' && exec '${BUN_BIN}' src/index.ts server >>'${SERVER_LOG_FILE}' 2>&1"
        else
            echo "⚠️  未检测到 screen，改用 nohup 后台启动 server"
            nohup bash -lc "cd '${CLI_DIR}' && exec '${BUN_BIN}' src/index.ts server" \
                >>"${SERVER_LOG_FILE}" 2>&1 &
        fi
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

cmd_dev() {
    ensure_deps

    if [ "${SERVER_PORT}" != "3006" ]; then
        echo "❌ dev 模式要求 HAPI_LISTEN_PORT=3006（web/vite 代理固定指向 3006）"
        echo "   当前端口: ${SERVER_PORT}"
        echo "   可用方式: HAPI_LISTEN_PORT=3006 $(basename "$0") dev"
        exit 1
    fi

    if curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1 && is_web_dev_ready; then
        echo "ℹ️  dev 热更新环境已可用，跳过重复启动"
        ensure_runner_started
        cmd_status
        return
    fi

    local port_pid
    port_pid="$(server_port_pid || true)"
    if [ -n "${port_pid}" ]; then
        local cmd
        cmd="$(pid_cmd "${port_pid}")"
        if is_local_server_cmd "${cmd}" || is_local_hub_cmd "${cmd}"; then
            echo "ℹ️  检测到本地 hub 占用端口 ${SERVER_PORT}，先停止旧进程 (PID: ${port_pid})"
            kill "${port_pid}" 2>/dev/null || true
            sleep 1
        else
            echo "❌ 端口 ${SERVER_PORT} 已被占用:"
            echo "   PID: ${port_pid}"
            echo "   CMD: ${cmd}"
            echo "   先释放端口后再执行: $(basename "$0") dev"
            exit 1
        fi
    fi

    if command -v screen >/dev/null 2>&1; then
        if has_screen_session "${DEV_SCREEN_SESSION}"; then
            echo "ℹ️  dev screen 会话 ${DEV_SCREEN_SESSION} 已存在，先关闭旧会话"
            stop_screen_sessions "${DEV_SCREEN_SESSION}"
            sleep 1
        fi

        echo "🚀 启动 dev 热更新 (screen: ${DEV_SCREEN_SESSION})..."
        screen -dmS "${DEV_SCREEN_SESSION}" \
            bash -lc "cd '${ROOT_DIR}' && exec '${BUN_BIN}' run dev >>'${DEV_LOG_FILE}' 2>&1"
    else
        echo "⚠️  未检测到 screen，改用 nohup 后台启动 dev 热更新"
        nohup bash -lc "cd '${ROOT_DIR}' && exec '${BUN_BIN}' run dev" \
            >>"${DEV_LOG_FILE}" 2>&1 &
    fi

    local hub_ready=0
    local web_ready=0
    for _ in {1..40}; do
        if curl -fsS "http://127.0.0.1:${SERVER_PORT}/health" >/dev/null 2>&1; then
            hub_ready=1
        fi
        if is_web_dev_ready; then
            web_ready=1
        fi
        if [ "${hub_ready}" -eq 1 ] && [ "${web_ready}" -eq 1 ]; then
            break
        fi
        sleep 0.3
    done

    if [ "${hub_ready}" -eq 1 ] && [ "${web_ready}" -eq 1 ]; then
        echo "✅ dev 热更新环境启动完成"
        echo "🌐 Web(HMR): http://127.0.0.1:${WEB_DEV_PORT}"
        echo "🌐 Hub API:  http://127.0.0.1:${SERVER_PORT}"
    else
        echo "⚠️  dev 热更新启动超时，请查看日志: ${DEV_LOG_FILE}"
    fi

    ensure_runner_started

    cmd_status
}

cmd_dev_restart() {
    echo "🔁 强制重启 dev 热更新环境..."
    cmd_stop
    sleep 1
    cmd_dev
}

cmd_stop() {
    echo "🛑 停止 runner..."
    (cd "${CLI_DIR}" && "${BUN_BIN}" src/index.ts runner stop >/dev/null 2>&1 || true)

    if command -v screen >/dev/null 2>&1; then
        if has_screen_session "${SCREEN_SESSION}"; then
            echo "🛑 停止 server screen 会话: ${SCREEN_SESSION}"
            stop_screen_sessions "${SCREEN_SESSION}"
        fi
        if has_screen_session "${DEV_SCREEN_SESSION}"; then
            echo "🛑 停止 dev screen 会话: ${DEV_SCREEN_SESSION}"
            stop_screen_sessions "${DEV_SCREEN_SESSION}"
        fi
    fi

    pkill -f "src/index.ts server" 2>/dev/null || true
    pkill -f "src/index.ts hub" 2>/dev/null || true
    pkill -f "/bin/haqi server" 2>/dev/null || true
    pkill -f "/bin/haqi hub" 2>/dev/null || true
    pkill -f "${ROOT_DIR}.*bun run dev" 2>/dev/null || true
    pkill -f "${ROOT_DIR}.*concurrently .*dev:hub.*dev:web" 2>/dev/null || true

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
        python3 - "${RUNNER_STATE_FILE}" <<'PY'
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

        if runner_is_running; then
            local runner_pid
            runner_pid="$(runner_state_pid 2>/dev/null || true)"
            local runner_http
            runner_http="$(runner_state_http_port 2>/dev/null || true)"
            echo "📌 runner health: RUNNING (PID ${runner_pid:-unknown}, http ${runner_http:-unknown})"
        else
            local runner_pid
            runner_pid="$(runner_state_pid 2>/dev/null || true)"
            local runner_cmd
            runner_cmd="$(pid_cmd "${runner_pid}")"
            echo "📌 runner health: STALE/NOT-RUNNING"
            if [ -n "${runner_pid}" ]; then
                echo "   stale pid=${runner_pid} cmd=${runner_cmd:-<missing>}"
            fi
        fi
    else
        echo "📌 未找到 runner.state: ${RUNNER_STATE_FILE}"
        echo "📌 runner health: NOT-RUNNING"
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

    if is_web_dev_ready; then
        echo "📌 web dev 端口 ${WEB_DEV_PORT}: OK"
    else
        echo "📌 web dev 端口 ${WEB_DEV_PORT}: FAIL"
    fi

    if command -v screen >/dev/null 2>&1; then
        if has_screen_session "${SCREEN_SESSION}"; then
            echo "📌 screen 会话(server): ${SCREEN_SESSION} (running)"
        else
            echo "📌 screen 会话(server): ${SCREEN_SESSION} (not running)"
        fi
        if has_screen_session "${DEV_SCREEN_SESSION}"; then
            echo "📌 screen 会话(dev): ${DEV_SCREEN_SESSION} (running)"
        else
            echo "📌 screen 会话(dev): ${DEV_SCREEN_SESSION} (not running)"
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

cmd_dev_logs() {
    local lines="${1:-150}"
    if [ ! -f "${DEV_LOG_FILE}" ]; then
        echo "⚠️  未找到日志文件: ${DEV_LOG_FILE}"
        return 0
    fi
    echo "📄 ${DEV_LOG_FILE} (最后 ${lines} 行)"
    tail -n "${lines}" "${DEV_LOG_FILE}"
}

cmd_attach() {
    if ! command -v screen >/dev/null 2>&1; then
        echo "❌ 当前环境没有 screen，无法 attach"
        exit 1
    fi
    if ! has_screen_session "${SCREEN_SESSION}"; then
        echo "❌ screen 会话不存在: ${SCREEN_SESSION}"
        exit 1
    fi
    local session_id
    session_id="$(first_screen_session_id "${SCREEN_SESSION}")"
    if [ -z "${session_id}" ]; then
        echo "❌ 未找到可 attach 的 screen 会话: ${SCREEN_SESSION}"
        exit 1
    fi
    echo "进入 screen：退出请按 Ctrl+A 然后 D"
    exec screen -r "${session_id}"
}

cmd_dev_attach() {
    if ! command -v screen >/dev/null 2>&1; then
        echo "❌ 当前环境没有 screen，无法 dev-attach"
        exit 1
    fi
    if ! has_screen_session "${DEV_SCREEN_SESSION}"; then
        echo "❌ dev screen 会话不存在: ${DEV_SCREEN_SESSION}"
        exit 1
    fi
    local session_id
    session_id="$(first_screen_session_id "${DEV_SCREEN_SESSION}")"
    if [ -z "${session_id}" ]; then
        echo "❌ 未找到可 attach 的 dev screen 会话: ${DEV_SCREEN_SESSION}"
        exit 1
    fi
    echo "进入 dev screen：退出请按 Ctrl+A 然后 D"
    exec screen -r "${session_id}"
}

ACTION="${1:-}"
SUBACTION="${2:-}"
case "${ACTION}" in
setup)
    cmd_setup
    ;;
start)
    cmd_start
    ;;
dev)
    if [ "${SUBACTION}" = "--restart" ] || [ "${SUBACTION}" = "-r" ]; then
        cmd_dev_restart
    else
        cmd_dev
    fi
    ;;
dev-restart)
    cmd_dev_restart
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
dev-logs)
    cmd_dev_logs "${2:-150}"
    ;;
attach)
    cmd_attach
    ;;
dev-attach)
    cmd_dev_attach
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
