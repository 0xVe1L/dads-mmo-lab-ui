//! One-time privileged setup, triggered from the UI.
//!
//! Installing Docker (+ BuildKit), disabling the SteamOS read-only rootfs,
//! and writing the docker sudoers rule all need root. Rather than make the
//! user drop to a terminal and run install-wow.sh first, the app asks for
//! elevation through PolicyKit (`pkexec`), which pops a single graphical
//! password prompt and runs `dml-bootstrap.sh` as root. After that, Docker
//! works as the normal user and the install proceeds entirely unprivileged.
//!
//! We never run the installer itself through pkexec — only the small,
//! root-only bootstrap. Running the whole thing as root would leave
//! `~/wow-server-*` owned by root and break the app.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;
use tokio::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResult {
    /// True if privileged setup was actually required (vs. already done /
    /// not needed). The UI uses this to decide whether to mention it.
    pub needed: bool,
    /// True if we actually ran the pkexec bootstrap this time.
    pub ran: bool,
    /// Human-readable summary for the install console.
    pub message: String,
}

/// Walk up from the running binary to find `dml-bootstrap.sh` (same strategy
/// as `resolve_install_script`). `$DML_BOOTSTRAP_SCRIPT` overrides for tests.
fn resolve_bootstrap_script() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("DML_BOOTSTRAP_SCRIPT") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Ok(p);
        }
        return Err(format!("DML_BOOTSTRAP_SCRIPT set but missing: {}", p.display()));
    }
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    let mut cursor: Option<&Path> = exe.parent();
    while let Some(dir) = cursor {
        let candidate = dir.join("dml-bootstrap.sh");
        if candidate.exists() {
            return Ok(candidate);
        }
        cursor = dir.parent();
    }
    Err(format!(
        "dml-bootstrap.sh not found walking up from {}",
        exe.display()
    ))
}

/// Run a quick check command and report whether it exited 0. Output is
/// discarded. Used for the cheap "is this already set up?" probes.
fn cmd_ok(program: &str, args: &[&str]) -> bool {
    std::process::Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn docker_ready() -> bool {
    cmd_ok("docker", &["ps"])
}
fn buildx_present() -> bool {
    cmd_ok("docker", &["buildx", "version"])
}
fn passwordless_sudo() -> bool {
    cmd_ok("sudo", &["-n", "true"])
}

/// Ensure Docker + BuildKit are usable, requesting a one-time graphical
/// elevation only when there's no other way.
///
/// Decision order:
/// 1. Docker works as the user AND buildx is present → nothing to do.
/// 2. Passwordless sudo available (e.g. a distrobox dev container) → the
///    installer can configure Docker itself via `sudo -n`; no GUI prompt.
/// 3. Otherwise → run `dml-bootstrap.sh` as root via `pkexec`.
#[tauri::command]
pub async fn bootstrap_privileges() -> Result<BootstrapResult, String> {
    if docker_ready() && buildx_present() {
        return Ok(BootstrapResult {
            needed: false,
            ran: false,
            message: "Docker and BuildKit are already set up.".into(),
        });
    }

    if passwordless_sudo() {
        return Ok(BootstrapResult {
            needed: false,
            ran: false,
            message: "Passwordless sudo available — the installer will configure Docker.".into(),
        });
    }

    if !cmd_ok("pkexec", &["--version"]) {
        return Err("Can't request permissions: pkexec (PolicyKit) isn't available. \
                    Install polkit, or run install-wow.sh once in a terminal."
            .into());
    }

    let script = resolve_bootstrap_script()?;
    let output = Command::new("pkexec")
        .arg("bash")
        .arg(&script)
        .output()
        .await
        .map_err(|e| format!("failed to launch pkexec: {e}"))?;

    if output.status.success() {
        return Ok(BootstrapResult {
            needed: true,
            ran: true,
            message: "Permissions granted — Docker is set up.".into(),
        });
    }

    // pkexec: 126 = request dismissed/declined, 127 = no auth agent available
    // (the usual case in Steam Deck Gaming Mode, which has no PolicyKit agent).
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    match output.status.code() {
        Some(126) | Some(127) => Err(
            "Couldn't get permission. Approve the system password prompt to continue. \
             (Steam Deck Gaming Mode has no password dialog — switch to Desktop Mode for \
             first-time setup.)"
                .into(),
        ),
        other => Err(format!(
            "Privileged setup failed{}.{}",
            other.map(|c| format!(" (exit {c})")).unwrap_or_default(),
            if stderr.is_empty() {
                String::new()
            } else {
                format!("\n{stderr}")
            }
        )),
    }
}
