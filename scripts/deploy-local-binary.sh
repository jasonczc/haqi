#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_CTL="${ROOT_DIR}/scripts/hapi-local.sh"

BUN_BIN_CANDIDATE="${BUN_BIN:-${HOME}/.bun/bin/bun}"
if [ -x "${BUN_BIN_CANDIDATE}" ]; then
    BUN_BIN="${BUN_BIN_CANDIDATE}"
elif command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
else
    echo "❌ bun 未安装"
    exit 1
fi

usage() {
    cat <<'EOF'
用法:
  deploy-local-binary.sh [选项]

默认行为:
  1) 构建最新单文件二进制（含 web 资源）
  2) 备份当前 /opt/homebrew/bin/{haqi,hapi}（若存在）
  3) 替换二进制
  4) 重启本地 runner + hub

选项:
  --skip-build       跳过构建（使用现有 cli/dist-exe 产物）
  --skip-restart     跳过 stop/start（仅替换文件）
  --source <path>    指定源二进制路径（默认按当前系统推断）
  --haqi <path>      指定 haqi 安装路径（默认 command -v haqi 或 /opt/homebrew/bin/haqi）
  --hapi <path>      指定 hapi 安装路径（默认 command -v hapi 或 /opt/homebrew/bin/hapi）
  --no-backup        不备份旧二进制
  -h, --help         显示帮助
EOF
}

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

sha256_file() {
    local file="$1"
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${file}" | awk '{print $1}'
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${file}" | awk '{print $1}'
    else
        echo "unknown"
    fi
}

host_target_dir() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "${os}" in
    darwin) os="darwin" ;;
    linux) os="linux" ;;
    *)
        echo "❌ 不支持自动推断系统: $(uname -s)" >&2
        return 1
        ;;
    esac

    case "${arch}" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64) arch="x64" ;;
    *)
        echo "❌ 不支持自动推断架构: $(uname -m)" >&2
        return 1
        ;;
    esac

    echo "${ROOT_DIR}/cli/dist-exe/bun-${os}-${arch}/hapi"
}

ensure_writable_parent() {
    local path="$1"
    local parent
    parent="$(dirname "${path}")"
    if [ ! -d "${parent}" ]; then
        echo "❌ 目录不存在: ${parent}"
        exit 1
    fi
    if [ ! -w "${parent}" ]; then
        echo "❌ 目录不可写: ${parent}"
        echo "   可改用 --haqi/--hapi 指到可写路径，或手动提权执行"
        exit 1
    fi
}

install_one() {
    local src="$1"
    local dst="$2"
    local backup_dir="$3"
    local do_backup="$4"

    ensure_writable_parent "${dst}"

    if [ -e "${dst}" ] && [ "${do_backup}" = "1" ]; then
        mkdir -p "${backup_dir}"
        local stamp backup_path
        stamp="$(date '+%Y%m%d-%H%M%S')"
        backup_path="${backup_dir}/$(basename "${dst}").${stamp}"
        cp -p "${dst}" "${backup_path}"
        log "已备份: ${dst} -> ${backup_path}"
    fi

    local tmp
    tmp="$(dirname "${dst}")/.tmp.$(basename "${dst}").$$"
    cp "${src}" "${tmp}"
    chmod 755 "${tmp}"
    mv -f "${tmp}" "${dst}"
    log "已安装: ${dst}"
}

SKIP_BUILD=0
SKIP_RESTART=0
NO_BACKUP=0
SOURCE_BIN=""
HAQI_PATH=""
HAPI_PATH=""

while [ $# -gt 0 ]; do
    case "$1" in
    --skip-build)
        SKIP_BUILD=1
        shift
        ;;
    --skip-restart)
        SKIP_RESTART=1
        shift
        ;;
    --no-backup)
        NO_BACKUP=1
        shift
        ;;
    --source)
        SOURCE_BIN="${2:-}"
        shift 2
        ;;
    --haqi)
        HAQI_PATH="${2:-}"
        shift 2
        ;;
    --hapi)
        HAPI_PATH="${2:-}"
        shift 2
        ;;
    -h|--help)
        usage
        exit 0
        ;;
    *)
        echo "❌ 未知参数: $1"
        usage
        exit 1
        ;;
    esac
done

if [ -z "${SOURCE_BIN}" ]; then
    SOURCE_BIN="$(host_target_dir)"
fi

if [ -z "${HAQI_PATH}" ]; then
    HAQI_PATH="$(command -v haqi 2>/dev/null || true)"
    if [ -z "${HAQI_PATH}" ] && [ -e /opt/homebrew/bin/haqi ]; then
        HAQI_PATH="/opt/homebrew/bin/haqi"
    fi
fi
if [ -z "${HAPI_PATH}" ]; then
    HAPI_PATH="$(command -v hapi 2>/dev/null || true)"
    if [ -z "${HAPI_PATH}" ] && [ -e /opt/homebrew/bin/hapi ]; then
        HAPI_PATH="/opt/homebrew/bin/hapi"
    fi
fi

if [ -z "${HAQI_PATH}" ] && [ -z "${HAPI_PATH}" ]; then
    echo "❌ 未找到 haqi/hapi 安装路径，请使用 --haqi 或 --hapi 指定"
    exit 1
fi

BACKUP_DIR="${HAPI_HOME:-${HOME}/.hapi}/backups/bin"

log "仓库: ${ROOT_DIR}"
log "目标 commit: $(cd "${ROOT_DIR}" && git rev-parse --short HEAD)"

if [ "${SKIP_BUILD}" = "0" ]; then
    log "开始构建单文件二进制（含 web 资源）..."
    (
        cd "${ROOT_DIR}"
        "${BUN_BIN}" run build:single-exe
    )
else
    log "跳过构建（--skip-build）"
fi

if [ ! -f "${SOURCE_BIN}" ]; then
    echo "❌ 源二进制不存在: ${SOURCE_BIN}"
    exit 1
fi

SRC_SHA="$(sha256_file "${SOURCE_BIN}")"
log "源二进制: ${SOURCE_BIN}"
log "源 SHA256 : ${SRC_SHA}"

if [ "${SKIP_RESTART}" = "0" ] && [ -x "${LOCAL_CTL}" ]; then
    log "停止本地 runner/hub..."
    bash "${LOCAL_CTL}" stop || true
fi

DO_BACKUP=1
if [ "${NO_BACKUP}" = "1" ]; then
    DO_BACKUP=0
fi

if [ -n "${HAQI_PATH}" ]; then
    install_one "${SOURCE_BIN}" "${HAQI_PATH}" "${BACKUP_DIR}" "${DO_BACKUP}"
fi
if [ -n "${HAPI_PATH}" ]; then
    install_one "${SOURCE_BIN}" "${HAPI_PATH}" "${BACKUP_DIR}" "${DO_BACKUP}"
fi

if [ -n "${HAQI_PATH}" ] && [ -x "${HAQI_PATH}" ]; then
    log "haqi 版本: $("${HAQI_PATH}" --version | tr '\n' ' ')"
    log "haqi SHA256: $(sha256_file "${HAQI_PATH}")"
fi
if [ -n "${HAPI_PATH}" ] && [ -x "${HAPI_PATH}" ]; then
    log "hapi SHA256: $(sha256_file "${HAPI_PATH}")"
fi

if [ "${SKIP_RESTART}" = "0" ] && [ -x "${LOCAL_CTL}" ]; then
    log "启动本地 runner/hub..."
    bash "${LOCAL_CTL}" start

    local_health_url="http://127.0.0.1:${HAPI_LISTEN_PORT:-3006}/health"
    if curl -fsS "${local_health_url}" >/dev/null 2>&1; then
        log "健康检查 OK: ${local_health_url}"
        curl -fsS "${local_health_url}"
        echo
    else
        echo "❌ 健康检查失败: ${local_health_url}"
        exit 1
    fi
fi

log "完成"

