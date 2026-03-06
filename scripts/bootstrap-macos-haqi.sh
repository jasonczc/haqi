#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_VERSION="2026-02-28"

PROJECTS_DIR="${HOME}/Projects"
HAQI_DIR="${PROJECTS_DIR}/haqi"
HAPI_HOME="${HOME}/.hapi-stable"
HAPI_PORT="3006"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
SSH_DIR="${HOME}/.ssh"
GITHUB_KEY_PATH="${SSH_DIR}/id_ed25519_github"
AUTHORIZED_KEYS="${SSH_DIR}/authorized_keys"
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-haqi-keyonly.conf"

CF_DIR="${HOME}/.cloudflared"
CF_CONFIG_FILE="${CF_DIR}/config.yml"
CF_TUNNEL_LABEL="com.haqi.cloudflared"
CF_TUNNEL_PLIST="${LAUNCH_AGENTS_DIR}/${CF_TUNNEL_LABEL}.plist"

HUB_LABEL="com.haqi.hub"
RUNNER_LABEL="com.haqi.runner"
HUB_PLIST="${LAUNCH_AGENTS_DIR}/${HUB_LABEL}.plist"
RUNNER_PLIST="${LAUNCH_AGENTS_DIR}/${RUNNER_LABEL}.plist"

PUBLIC_URL=""

log() {
    printf "\n\033[1;34m[INFO]\033[0m %s\n" "$*"
}

warn() {
    printf "\n\033[1;33m[WARN]\033[0m %s\n" "$*" >&2
}

err() {
    printf "\n\033[1;31m[ERROR]\033[0m %s\n" "$*" >&2
}

have_cmd() {
    command -v "$1" >/dev/null 2>&1
}

require_macos() {
    if [[ "$(uname -s)" != "Darwin" ]]; then
        err "This script is for macOS only."
        exit 1
    fi
}

prompt_yes_no() {
    local prompt="$1"
    local default="${2:-Y}"
    local answer

    while true; do
        if [[ "$default" == "Y" ]]; then
            read -r -p "$prompt [Y/n]: " answer || true
            answer="${answer:-Y}"
        else
            read -r -p "$prompt [y/N]: " answer || true
            answer="${answer:-N}"
        fi

        case "${answer,,}" in
            y|yes) return 0 ;;
            n|no) return 1 ;;
            *) warn "Please answer y or n." ;;
        esac
    done
}

ensure_dir() {
    mkdir -p "$1"
}

ensure_file_mode() {
    local file="$1"
    local mode="$2"
    [[ -e "$file" ]] || return 0
    chmod "$mode" "$file"
}

append_line_if_missing() {
    local line="$1"
    local file="$2"
    touch "$file"
    if ! grep -Fqx "$line" "$file"; then
        printf "%s\n" "$line" >>"$file"
    fi
}

ensure_block_in_file() {
    local file="$1"
    local begin_marker="$2"
    local end_marker="$3"
    local block_content="$4"
    touch "$file"

    if grep -Fq "$begin_marker" "$file"; then
        awk -v b="$begin_marker" -v e="$end_marker" '
            $0==b {in_block=1; next}
            $0==e {in_block=0; next}
            !in_block {print}
        ' "$file" >"${file}.tmp"
        mv "${file}.tmp" "$file"
    fi

    {
        printf "%s\n" "$begin_marker"
        printf "%s\n" "$block_content"
        printf "%s\n" "$end_marker"
    } >>"$file"
}

load_brew_env_for_current_shell() {
    if [[ -x "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x "/usr/local/bin/brew" ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
}

install_xcode_clt_if_needed() {
    log "Step 1/11 - Check Xcode Command Line Tools"

    if xcode-select -p >/dev/null 2>&1; then
        log "Xcode CLT already installed: $(xcode-select -p)"
        return 0
    fi

    log "Xcode CLT not found. Triggering installer..."
    xcode-select --install >/dev/null 2>&1 || true

    cat <<'EOF'
Please finish the Xcode Command Line Tools GUI installation.
When installation completes, return here and press Enter.
EOF
    read -r

    if ! xcode-select -p >/dev/null 2>&1; then
        err "Xcode CLT still not detected. Re-run script after installation."
        exit 1
    fi

    log "Xcode CLT installed: $(xcode-select -p)"
}

install_homebrew_if_needed() {
    log "Step 2/11 - Check Homebrew"

    if have_cmd brew; then
        log "Homebrew already installed: $(brew --version | head -n1)"
        load_brew_env_for_current_shell
        return 0
    fi

    log "Installing Homebrew..."
    NONINTERACTIVE=1 /bin/bash -c \
        "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    load_brew_env_for_current_shell
    if ! have_cmd brew; then
        err "Homebrew install failed."
        exit 1
    fi

    local zprofile="${HOME}/.zprofile"
    if [[ -x "/opt/homebrew/bin/brew" ]]; then
        append_line_if_missing 'eval "$(/opt/homebrew/bin/brew shellenv)"' "$zprofile"
    else
        append_line_if_missing 'eval "$(/usr/local/bin/brew shellenv)"' "$zprofile"
    fi
    log "Homebrew installed: $(brew --version | head -n1)"
}

brew_install_formula_if_needed() {
    local formula="$1"
    if brew list --formula "$formula" >/dev/null 2>&1; then
        log "brew formula already installed: $formula"
    else
        log "Installing brew formula: $formula"
        brew install "$formula"
    fi
}

brew_install_cask_if_needed() {
    local cask="$1"
    if brew list --cask "$cask" >/dev/null 2>&1; then
        log "brew cask already installed: $cask"
    else
        log "Installing brew cask: $cask"
        brew install --cask "$cask"
    fi
}

install_core_tools() {
    log "Step 3/11 - Install tools via Homebrew"
    load_brew_env_for_current_shell
    brew update

    brew_install_formula_if_needed git
    brew_install_formula_if_needed gh
    brew_install_formula_if_needed cloudflared
    brew_install_cask_if_needed codex

    if have_cmd codex; then
        log "codex installed: $(codex --version 2>/dev/null | head -n1)"
    else
        warn "codex command not found after installation; check brew cask path."
    fi
}

codex_login_if_needed() {
    log "Step 4/11 - Codex login"

    if [[ -s "${HOME}/.codex/auth.json" ]]; then
        log "~/.codex/auth.json already exists. Skipping login."
        return 0
    fi

    if ! have_cmd codex; then
        warn "codex command not available. Skipping login."
        return 0
    fi

    log "Starting Codex login flow."
    if codex --help 2>&1 | grep -Eq '(^|[[:space:]])login([[:space:]]|$)'; then
        if codex login --help 2>&1 | grep -qi "device"; then
            codex login --device-code || codex login
        else
            codex login
        fi
    else
        cat <<'EOF'
This Codex version does not expose `codex login`.
Run `codex`, then choose "Sign in with ChatGPT" in the interactive prompt.
EOF
        codex || true
    fi

    if [[ -s "${HOME}/.codex/auth.json" ]]; then
        log "Codex login appears complete (~/.codex/auth.json exists)."
    else
        warn "Cannot confirm Codex login. You may need to run `codex` manually later."
    fi
}

ensure_ssh_agent_has_key() {
    local key_path="$1"

    if ! pgrep -u "$USER" ssh-agent >/dev/null 2>&1; then
        eval "$(ssh-agent -s)" >/dev/null
    fi

    if ssh-add -l 2>/dev/null | grep -Fq "$key_path"; then
        return 0
    fi

    if ssh-add --help 2>&1 | grep -q -- "--apple-use-keychain"; then
        ssh-add --apple-use-keychain "$key_path" >/dev/null 2>&1 || true
    else
        ssh-add -K "$key_path" >/dev/null 2>&1 || true
    fi
}

setup_github_ssh() {
    log "Step 5/11 - GitHub SSH key"
    ensure_dir "$SSH_DIR"
    ensure_file_mode "$SSH_DIR" 700 || true
    chmod 700 "$SSH_DIR"

    if [[ ! -f "$GITHUB_KEY_PATH" ]]; then
        local default_comment
        default_comment="$(whoami)@$(scutil --get LocalHostName 2>/dev/null || hostname)-github"
        read -r -p "GitHub SSH key comment/email [${default_comment}]: " key_comment || true
        key_comment="${key_comment:-$default_comment}"

        ssh-keygen -t ed25519 -C "$key_comment" -f "$GITHUB_KEY_PATH" -N ""
        log "Generated key: ${GITHUB_KEY_PATH}"
    else
        log "GitHub key already exists: ${GITHUB_KEY_PATH}"
    fi

    ensure_ssh_agent_has_key "$GITHUB_KEY_PATH"

    local ssh_config="${SSH_DIR}/config"
    local github_block
    github_block=$'Host github.com\n    HostName github.com\n    User git\n    IdentityFile ~/.ssh/id_ed25519_github\n    IdentitiesOnly yes\n    AddKeysToAgent yes\n    UseKeychain yes'
    ensure_block_in_file "$ssh_config" "# >>> HAQI github ssh >>>" "# <<< HAQI github ssh <<<" "$github_block"
    chmod 600 "$ssh_config"

    local known_hosts="${SSH_DIR}/known_hosts"
    touch "$known_hosts"
    chmod 600 "$known_hosts"
    if ! ssh-keygen -F github.com -f "$known_hosts" >/dev/null 2>&1; then
        ssh-keyscan -t ed25519 github.com >>"$known_hosts" 2>/dev/null || true
    fi

    cat <<EOF

==== GitHub public key (copy this) ====
$(cat "${GITHUB_KEY_PATH}.pub")
=======================================

Please add this key in:
https://github.com/settings/keys
EOF

    if prompt_yes_no "Open GitHub SSH keys page now?" "Y"; then
        open "https://github.com/settings/keys"
    fi

    read -r -p "Press Enter after the key has been added to GitHub..."

    set +e
    local ssh_test_output
    ssh_test_output="$(ssh -T -o BatchMode=yes -o StrictHostKeyChecking=accept-new git@github.com 2>&1)"
    local ssh_test_status=$?
    set -e
    if [[ "$ssh_test_output" == *"successfully authenticated"* ]] || [[ "$ssh_test_output" == *"Hi "* ]]; then
        log "GitHub SSH test passed."
    else
        warn "GitHub SSH test not clearly successful (status=${ssh_test_status}). Output:"
        printf "%s\n" "$ssh_test_output"
    fi
}

enable_ssh_server_key_only() {
    log "Step 7/11 - SSH server: enable + key-only auth"

    if [[ ! -s "$AUTHORIZED_KEYS" ]]; then
        warn "No ${AUTHORIZED_KEYS} entries detected."
        warn "If you continue now, password SSH login will be disabled and remote login may fail."
        if ! prompt_yes_no "Continue enabling key-only SSH without authorized_keys?" "N"; then
            warn "Skipping SSH server hardening for now."
            return 0
        fi
    fi

    local remote_login_status
    remote_login_status="$(sudo systemsetup -getremotelogin 2>/dev/null || true)"
    if [[ "$remote_login_status" != *"On"* ]]; then
        log "Enabling Remote Login (SSH server)..."
        sudo systemsetup -setremotelogin on >/dev/null
    else
        log "Remote Login already enabled."
    fi

    if ! grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config.d/\*\.conf' /etc/ssh/sshd_config; then
        log "Adding Include directive to /etc/ssh/sshd_config"
        sudo cp /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%Y%m%d-%H%M%S)"
        sudo sed -i '' '1i\
Include /etc/ssh/sshd_config.d/*.conf\
' /etc/ssh/sshd_config
    fi

    local tmp_dropin
    tmp_dropin="$(mktemp)"
    cat >"$tmp_dropin" <<'EOF'
# Managed by HAQI bootstrap script.
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
PermitRootLogin no
EOF
    sudo mkdir -p /etc/ssh/sshd_config.d
    sudo install -m 644 "$tmp_dropin" "$SSHD_DROPIN"
    rm -f "$tmp_dropin"

    sudo /usr/sbin/sshd -t -f /etc/ssh/sshd_config
    sudo launchctl kickstart -k system/com.openssh.sshd >/dev/null 2>&1 || true
    log "SSH server configured for key-only authentication."
}

allow_user_provided_ssh_pubkey() {
    log "Step 6/11 - Add user-provided SSH public key to authorized_keys"
    ensure_dir "$SSH_DIR"
    chmod 700 "$SSH_DIR"
    touch "$AUTHORIZED_KEYS"
    chmod 600 "$AUTHORIZED_KEYS"

    if prompt_yes_no "Do you want to add another public key to this Mac now?" "Y"; then
        cat <<'EOF'
Paste the full public key in one line (starts with ssh-ed25519 / ssh-rsa), then press Enter.
EOF
        local user_pubkey=""
        read -r user_pubkey || true
        if [[ -n "${user_pubkey// }" ]]; then
            if grep -Fqx "$user_pubkey" "$AUTHORIZED_KEYS"; then
                log "Key already present in authorized_keys."
            else
                printf "%s\n" "$user_pubkey" >>"$AUTHORIZED_KEYS"
                log "Key added to authorized_keys."
            fi
        else
            warn "No key entered. Skipping."
        fi
    else
        log "Skipped adding extra SSH key."
    fi
}

clone_or_update_haqi_repo() {
    log "Step 8/11 - Clone or update jasonczc/haqi in ${HAQI_DIR}"
    ensure_dir "$PROJECTS_DIR"

    if [[ -d "${HAQI_DIR}/.git" ]]; then
        log "Repo already exists. Pulling latest changes..."
        git -C "$HAQI_DIR" fetch --all --prune
        git -C "$HAQI_DIR" pull --ff-only || warn "git pull failed; resolve manually."
        return 0
    fi

    if [[ -e "$HAQI_DIR" && ! -d "${HAQI_DIR}/.git" ]]; then
        warn "${HAQI_DIR} exists but is not a git repo. Skipping clone."
        return 0
    fi

    if git clone git@github.com:jasonczc/haqi.git "$HAQI_DIR"; then
        log "Cloned via SSH."
    else
        warn "SSH clone failed; falling back to HTTPS."
        git clone https://github.com/jasonczc/haqi.git "$HAQI_DIR"
    fi
}

find_haqi_bin() {
    if have_cmd haqi; then
        command -v haqi
        return 0
    fi
    if have_cmd hapi; then
        command -v hapi
        return 0
    fi
    return 1
}

install_haqi_systemwide() {
    log "Step 9/11 - Install HAQI to system"

    local existing_bin
    if existing_bin="$(find_haqi_bin 2>/dev/null)"; then
        log "HAQI already installed: ${existing_bin}"
        return 0
    fi

    load_brew_env_for_current_shell
    if ! brew tap | grep -q '^tiann/tap$'; then
        brew tap tiann/tap
    fi

    if brew list --formula hapi >/dev/null 2>&1; then
        log "hapi formula already installed."
    else
        brew install tiann/tap/hapi
    fi

    local haqi_bin
    if haqi_bin="$(find_haqi_bin 2>/dev/null)"; then
        log "HAQI installed: ${haqi_bin}"
    else
        warn "Cannot find haqi/hapi command after brew install."
    fi
}

write_hub_plist() {
    local haqi_bin="$1"
    local public_url="$2"
    ensure_dir "$LAUNCH_AGENTS_DIR"
    ensure_dir "${HAPI_HOME}/logs"

    cat >"$HUB_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${HUB_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${haqi_bin}</string>
        <string>hub</string>
        <string>--relay</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HAPI_HOME</key>
        <string>${HAPI_HOME}</string>
        <key>HAPI_LISTEN_PORT</key>
        <string>${HAPI_PORT}</string>
$( [[ -n "$public_url" ]] && printf '        <key>HAPI_PUBLIC_URL</key>\n        <string>%s</string>\n' "$public_url" )
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HAPI_HOME}/logs/hub.log</string>
    <key>StandardErrorPath</key>
    <string>${HAPI_HOME}/logs/hub.log</string>
</dict>
</plist>
EOF
}

write_runner_plist() {
    local haqi_bin="$1"
    ensure_dir "$LAUNCH_AGENTS_DIR"
    ensure_dir "${HAPI_HOME}/logs"

    cat >"$RUNNER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${RUNNER_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${haqi_bin}</string>
        <string>runner</string>
        <string>start-sync</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HAPI_HOME</key>
        <string>${HAPI_HOME}</string>
        <key>HAPI_LISTEN_PORT</key>
        <string>${HAPI_PORT}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HAPI_HOME}/logs/runner.log</string>
    <key>StandardErrorPath</key>
    <string>${HAPI_HOME}/logs/runner.log</string>
</dict>
</plist>
EOF
}

launchctl_reload_user_agent() {
    local label="$1"
    local plist="$2"

    launchctl bootout "gui/${UID}/${label}" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/${UID}" "$plist"
    launchctl enable "gui/${UID}/${label}" >/dev/null 2>&1 || true
    launchctl kickstart -k "gui/${UID}/${label}" >/dev/null 2>&1 || true
}

configure_haqi_launchd_services() {
    log "Step 10/11 - Configure HAQI launchd services (auto start on login)"

    local haqi_bin
    haqi_bin="$(find_haqi_bin)" || {
        err "Cannot configure service: haqi/hapi command not found."
        exit 1
    }

    write_hub_plist "$haqi_bin" "$PUBLIC_URL"
    write_runner_plist "$haqi_bin"

    launchctl_reload_user_agent "$HUB_LABEL" "$HUB_PLIST"
    launchctl_reload_user_agent "$RUNNER_LABEL" "$RUNNER_PLIST"

    local health_url="http://127.0.0.1:${HAPI_PORT}/health"
    local i
    for i in {1..15}; do
        if curl -fsS "$health_url" >/dev/null 2>&1; then
            log "HAQI hub health check OK: ${health_url}"
            return 0
        fi
        sleep 2
    done
    warn "Hub health check failed at ${health_url}. Check logs: ${HAPI_HOME}/logs/hub.log"
}

cloudflared_tunnel_id_by_name() {
    local name="$1"
    cloudflared tunnel list 2>/dev/null | awk -v n="$name" 'NR>1 && $2==n {print $1; exit}'
}

configure_cloudflare_tunnel() {
    log "Step 11/11 - Configure Cloudflare Tunnel (SSH + HAQI)"

    if ! have_cmd cloudflared; then
        warn "cloudflared not found. Skipping tunnel setup."
        return 0
    fi

    if ! prompt_yes_no "Configure Cloudflare Named Tunnel now?" "Y"; then
        log "Skipping Cloudflare tunnel setup."
        return 0
    fi

    ensure_dir "$CF_DIR"

    if [[ ! -f "${CF_DIR}/cert.pem" ]]; then
        log "Cloudflare login required (browser flow)."
        cloudflared tunnel login
    else
        log "Cloudflare cert already exists: ${CF_DIR}/cert.pem"
    fi

    local domain=""
    read -r -p "Your Cloudflare root domain (e.g. example.com): " domain || true
    if [[ -z "${domain// }" ]]; then
        warn "No domain provided. Skipping tunnel setup."
        return 0
    fi

    local host_tag
    host_tag="$(scutil --get LocalHostName 2>/dev/null || hostname)"
    host_tag="${host_tag,,}"

    local default_tunnel_name="haqi-${host_tag}"
    local tunnel_name
    read -r -p "Tunnel name [${default_tunnel_name}]: " tunnel_name || true
    tunnel_name="${tunnel_name:-$default_tunnel_name}"

    local default_haqi_host="haqi-${host_tag}.${domain}"
    local default_ssh_host="ssh-${host_tag}.${domain}"
    local haqi_host ssh_host
    read -r -p "HAQI hostname [${default_haqi_host}]: " haqi_host || true
    read -r -p "SSH hostname [${default_ssh_host}]: " ssh_host || true
    haqi_host="${haqi_host:-$default_haqi_host}"
    ssh_host="${ssh_host:-$default_ssh_host}"

    local tunnel_id
    tunnel_id="$(cloudflared_tunnel_id_by_name "$tunnel_name" || true)"
    if [[ -z "$tunnel_id" ]]; then
        log "Creating tunnel: ${tunnel_name}"
        cloudflared tunnel create "$tunnel_name"
        tunnel_id="$(cloudflared_tunnel_id_by_name "$tunnel_name" || true)"
    else
        log "Tunnel already exists: ${tunnel_name} (${tunnel_id})"
    fi

    if [[ -z "$tunnel_id" ]]; then
        err "Cannot find/create Cloudflare tunnel ID."
        return 1
    fi

    cloudflared tunnel route dns "$tunnel_name" "$haqi_host" || true
    cloudflared tunnel route dns "$tunnel_name" "$ssh_host" || true

    cat >"$CF_CONFIG_FILE" <<EOF
tunnel: ${tunnel_id}
credentials-file: ${CF_DIR}/${tunnel_id}.json
ingress:
    - hostname: ${haqi_host}
      service: http://localhost:${HAPI_PORT}
    - hostname: ${ssh_host}
      service: ssh://localhost:22
    - service: http_status:404
EOF

    cat >"$CF_TUNNEL_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${CF_TUNNEL_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(command -v cloudflared)</string>
        <string>tunnel</string>
        <string>--config</string>
        <string>${CF_CONFIG_FILE}</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HAPI_HOME}/logs/cloudflared.log</string>
    <key>StandardErrorPath</key>
    <string>${HAPI_HOME}/logs/cloudflared.log</string>
</dict>
</plist>
EOF

    ensure_dir "${HAPI_HOME}/logs"
    launchctl_reload_user_agent "$CF_TUNNEL_LABEL" "$CF_TUNNEL_PLIST"

    PUBLIC_URL="https://${haqi_host}"
    log "Cloudflare tunnel configured."
    log "HAQI public URL: ${PUBLIC_URL}"
    log "SSH endpoint hostname: ${ssh_host}"

    if prompt_yes_no "Update HAQI service with HAPI_PUBLIC_URL=${PUBLIC_URL} and reload?" "Y"; then
        configure_haqi_launchd_services
    fi
}

print_summary() {
    local haqi_bin="not found"
    haqi_bin="$(find_haqi_bin 2>/dev/null || echo "not found")"

    cat <<EOF

=========================================================
HAQI macOS bootstrap completed
script version: ${SCRIPT_VERSION}

HAQI binary:      ${haqi_bin}
HAQI home:        ${HAPI_HOME}
HAQI local URL:   http://127.0.0.1:${HAPI_PORT}
HAQI public URL:  ${PUBLIC_URL:-"(not configured)"}

LaunchAgents:
  - ${HUB_PLIST}
  - ${RUNNER_PLIST}
  - ${CF_TUNNEL_PLIST} (if configured)

Logs:
  - ${HAPI_HOME}/logs/hub.log
  - ${HAPI_HOME}/logs/runner.log
  - ${HAPI_HOME}/logs/cloudflared.log
=========================================================
EOF
}

main() {
    require_macos

    install_xcode_clt_if_needed
    install_homebrew_if_needed
    install_core_tools
    codex_login_if_needed
    setup_github_ssh
    allow_user_provided_ssh_pubkey
    enable_ssh_server_key_only
    clone_or_update_haqi_repo
    install_haqi_systemwide
    configure_haqi_launchd_services
    configure_cloudflare_tunnel
    print_summary
}

main "$@"
