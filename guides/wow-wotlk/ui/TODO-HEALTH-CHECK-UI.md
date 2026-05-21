# TODO — Health Check UI

## Problem

SteamOS ships an immutable rootfs and **resets it on every OS update**. That
wipes everything we installed there: docker + docker-compose, the pacman
keyring, our build deps. So after an update the app hits errors like:

```
Failed to start: spawn docker compose: No such file or directory (os error 2)
```

Today the fix lives in a terminal script (`../fix-after-update.sh`). We want it
**in the app**: detect the post-update state, explain it, and repair it with one
click — same convenience bar as the install flow and the pkexec bootstrap.

## Pieces

### 1. Detect "SteamOS updated since last run"
- On launch, read a stable OS build identifier and compare to the last one we
  saw. Candidates (pick what's reliable on SteamOS): `BUILD_ID` / `VERSION_ID`
  in `/etc/os-release`, or `steamos-atomupd`/`steamos-readonly` version output.
- Persist `last_seen_os_build` in `app_settings.rs` (settings.json), like
  `selected_character_guid`. If it changed since last run → flag "needs health
  check" and surface the Health page automatically (banner or auto-route).
- Tauri command: `get_os_build_id() -> String` + store/compare. Frontend reads
  on mount in `server-state-context`.

### 2. Health Check page (under the **More** menu)
- New `ActivePage` value `health` + a `HealthScreen` component.
- Reachable from the **More** dropdown (alongside Get Help / Support Us) — add a
  "System Health" entry there.
- Layout mirrors the install console: a streamed log panel + a status chip +
  a "Run repair" button. Reuse `InstallConsole` + the `forward_lines` event
  plumbing from `install.rs` (factor the streaming into something shareable).

### 3. Run the repair script with elevation (pkexec) + streamed output
- The repair touches the rootfs (`steamos-readonly disable`, `pacman -S`,
  `systemctl`), so it needs root. Reuse the **bootstrap pattern**
  (`bootstrap.rs`): resolve the script (resource dir → walk-up), stage it to a
  0600 temp file (AppImage FUSE-mount isn't root-readable), then
  `pkexec bash <tmp>`.
- BUT we also want **streamed** output (not just a final exit code like the
  bootstrap). Spawn `pkexec bash <tmp>` with piped stdout/stderr and forward
  lines as `health:output` events, mirroring `start_install`. One graphical
  password prompt up front (Desktop Mode; Gaming Mode has no polkit agent —
  surface that limitation like the bootstrap does).
- New command: `run_health_repair(app) -> Result<(), String>` + `health:*`
  events.

### 4. Detect specific critical errors → deep-link to Health
- Classify known-fatal errors from server start / docker calls. First one:
  `docker compose` / `docker` "No such file or directory" → docker missing.
- When `start_server` (or `get_server_status`) hits a classified error, the UI
  shows an inline banner/button: **"Looks like a SteamOS update broke Docker —
  Run health check"** that routes to the Health page.
- Keep the classifier small + explicit (string match on the known errors), same
  spirit as the `WorldserverStatus::Crashed` detection.

### 5. The repair script itself (`fix-after-update.sh`) — needs updating
The existing script works but predates several lessons; before wiring it to the
UI, fix:
- **Off-root pacman cache** — it uses default cache (the 180 MB `/var`); pass
  `--cachedir $HOME/.cache/dml-pacman` (downloads to /home).
- **Gentler keyring** — it does a destructive full reset (deletes
  `/etc/pacman.d/gnupg`). Prefer the non-destructive `pacman-key --init`
  + `--populate` we use in `setup-build-host.sh`; only reset if genuinely
  corrupt.
- **Add `docker-buildx`** — needed for compile installs (acore-docker's
  `RUN --mount` needs BuildKit).
- **Dynamic install dir** — the success message hardcodes `~/wow-server`;
  detect the real `~/wow-server*` (base/npcbots/playerbots).
- **Health checks, not just docker** — verify: docker present + daemon up,
  `docker compose` works, buildx present, keyring healthy, install dir intact,
  the `~/wow-server-*/docker-compose.yml` present. Report each pass/fail (the
  page surfaces them).

## Notes
- The build-host setup (`setup-build-host.sh`) is the *developer* equivalent and
  is a good reference, but it installs *build* deps; the health/repair path is
  about the *runtime* (docker) for end users.
- Data caveat to surface somewhere: the character DB is a **named docker
  volume**; if a SteamOS update wiped docker's data-root, characters are gone.
  Worth a "back up characters" feature later (mysqldump the `acore_characters`
  DB to `/home`).
