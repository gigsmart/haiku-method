#!/usr/bin/env bash
# ensure-deps.sh — SessionStart hook that ensures jq and yq are installed.
# Outputs instructions for the agent to install missing dependencies.
set -euo pipefail

missing=()

command -v jq  >/dev/null 2>&1 || missing+=(jq)
command -v yq  >/dev/null 2>&1 || missing+=(yq)

if [ ${#missing[@]} -eq 0 ]; then
  exit 0
fi

# Detect package manager
if command -v brew >/dev/null 2>&1; then
  installer="brew install ${missing[*]}"
elif command -v apt-get >/dev/null 2>&1; then
  # apt-get has jq but not yq; install yq from GitHub releases
  apt_pkgs=()
  yq_needed=false
  for dep in "${missing[@]}"; do
    if [ "$dep" = "yq" ]; then
      yq_needed=true
    else
      apt_pkgs+=("$dep")
    fi
  done
  installer=""
  if [ ${#apt_pkgs[@]} -gt 0 ]; then
    installer="sudo apt-get update && sudo apt-get install -y ${apt_pkgs[*]}"
  fi
  if [ "$yq_needed" = true ]; then
    yq_arch="amd64"
    case "$(uname -m)" in
      aarch64|arm64) yq_arch="arm64" ;;
      armv7l)        yq_arch="arm"   ;;
    esac
    yq_url="https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${yq_arch}"
    yq_cmd="sudo curl -fsSL '$yq_url' -o /usr/local/bin/yq && sudo chmod +x /usr/local/bin/yq"
    if [ -n "$installer" ]; then
      installer="$installer && $yq_cmd"
    else
      installer="$yq_cmd"
    fi
  fi
elif command -v apk >/dev/null 2>&1; then
  installer="apk add ${missing[*]}"
else
  installer="(no supported package manager found — install manually: ${missing[*]})"
fi

cat <<EOF
<must-act reason="missing required CLI tools">
The following required tools are missing: ${missing[*]}

Install them now by running:
  ${installer}

Do NOT proceed with any AI-DLC workflow until these are installed.
</must-act>
EOF
