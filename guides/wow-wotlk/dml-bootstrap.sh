#!/bin/bash
# ============================================================
#  Dad's MMO Lab — Privileged bootstrap (run as root via pkexec)
#
#  One-time, root-only setup so the rest of the install can run
#  entirely as the normal user. The Tauri app invokes this with
#  `pkexec bash dml-bootstrap.sh`, which pops a single graphical
#  PolicyKit password prompt. Idempotent — safe to re-run.
#
#  Does ONLY privileged steps:
#    - SteamOS: disable the read-only rootfs
#    - install docker + docker-compose + docker-buildx (BuildKit)
#    - create the `docker` group + add the user to it
#    - NOPASSWD sudoers rule for docker / docker-compose
#    - enable + start the docker daemon (systemd hosts)
#    - open the docker socket so it works without a re-login
#
#  Everything heavy (clone / compile / configure) stays
#  unprivileged in install-wow-ui.sh and runs as the normal user.
#  We deliberately do NOT run the installer itself as root — that
#  would leave ~/wow-server-* owned by root and break the app.
# ============================================================
set -o pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "[ERR] dml-bootstrap.sh must run as root (via pkexec)." >&2
    exit 1
fi

# Resolve the real (non-root) user that invoked pkexec. pkexec exports
# PKEXEC_UID; fall back to SUDO_USER if launched another way.
TARGET_USER=""
if [ -n "${PKEXEC_UID:-}" ]; then
    TARGET_USER="$(id -un "$PKEXEC_UID" 2>/dev/null)"
fi
[ -z "$TARGET_USER" ] && TARGET_USER="${SUDO_USER:-}"
if [ -z "$TARGET_USER" ] || [ "$TARGET_USER" = "root" ]; then
    echo "[ERR] Could not determine the target user (PKEXEC_UID unset)." >&2
    exit 1
fi
echo "[..] Configuring Docker for user: $TARGET_USER"

# 1. SteamOS read-only rootfs ------------------------------------------------
if command -v steamos-readonly &>/dev/null; then
    echo "[..] Disabling SteamOS read-only mode..."
    steamos-readonly disable || echo "[!!] steamos-readonly disable failed — continuing"
fi

# 2. Docker + Compose + BuildKit ---------------------------------------------
#    docker-buildx is REQUIRED: acore-docker's Dockerfile uses
#    `RUN --mount` (BuildKit-only). Without it, compile builds fail with
#    "the --mount option requires BuildKit" and produce no worldserver image.
if command -v pacman &>/dev/null; then
    echo "[..] Refreshing package keyring..."
    pacman -Sy --noconfirm archlinux-keyring &>/dev/null || echo "[!!] keyring refresh failed — continuing"
    echo "[..] Installing docker, docker-compose, docker-buildx..."
    if ! pacman -S --noconfirm --needed docker docker-compose docker-buildx; then
        echo "[ERR] Failed to install Docker packages via pacman." >&2
        exit 1
    fi
elif command -v apt-get &>/dev/null; then
    apt-get update -y || true
    if ! apt-get install -y docker.io docker-compose; then
        echo "[ERR] Failed to install Docker via apt-get." >&2
        exit 1
    fi
    apt-get install -y docker-buildx >/dev/null 2>&1 || true
else
    echo "[ERR] No supported package manager (need pacman or apt-get)." >&2
    exit 1
fi

# 3. docker group + membership -----------------------------------------------
getent group docker >/dev/null 2>&1 || groupadd docker
usermod -aG docker "$TARGET_USER" || echo "[!!] usermod failed — continuing"

# 4. NOPASSWD sudoers rule (docker only — same scope as install-wow.sh) ------
echo "$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose" \
    > /etc/sudoers.d/dml-docker
chmod 0440 /etc/sudoers.d/dml-docker

# 5. Start the daemon (systemd hosts; skipped in containers w/o systemd) ------
if command -v systemctl &>/dev/null && [ -d /run/systemd/system ]; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable --now docker 2>/dev/null || echo "[!!] could not start docker via systemd"
fi

# 6. Open the socket so docker works immediately (group change needs re-login)
[ -S /var/run/docker.sock ] && chmod 666 /var/run/docker.sock 2>/dev/null || true

echo "[OK] Bootstrap complete — Docker is set up for $TARGET_USER."
exit 0
