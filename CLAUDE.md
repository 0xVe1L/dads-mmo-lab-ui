# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two tightly coupled projects living side-by-side:

1. **Bash installer scripts + Markdown how-to guides** — the original deliverable. Used by people who run an MMO private server directly from a terminal on Steam Deck or WSL2.
2. **The Lab** — a Tauri 2 (Rust + React) desktop app that wraps the scripts behind a clickable UI. Lives under [`guides/wow-wotlk/ui/`](./guides/wow-wotlk/ui/). The app is the active development target; the standalone scripts continue to work as a fallback / power-user path. See [`guides/wow-wotlk/ui/CLAUDE.md`](./guides/wow-wotlk/ui/CLAUDE.md) for the UI subproject's guidance.

The audience for both halves is non-technical: "dads who love games, not developers." Every user-facing string, prompt, and guide is written for someone who has never opened a terminal before. Preserve that voice in any edits.

## Repository layout

- `README.md` — landing page, supported games table, project ethos.
- `CONTRIBUTING.md` — contribution rules. Note the hard "open-source emulators only / no game assets / no public-server guides" constraints.
- `HOWTO-WINDOWS-WSL2.md` — top-level guide for running the WoW setup on Windows via WSL2.
- `VISION.md`, `ARCHITECTURE.md`, `MODULES_PLAN.md`, `WorkGoals_5-27-2026.md`, `STEAMOS_AND_MULTI_SERVER_AUDIT.md` — planning + roadmap docs. Treat the dated ones as a working sprint plan, not historical record.
- `guides/wow-wotlk/` — WoW 3.3.5a / AzerothCore. The most active area.
  - **Standalone scripts** (used directly by power users):
    - `install-wow.sh` — interactive wizard: picks Base / NPCBots / Playerbots, installs Docker, clones AzerothCore, starts containers.
    - `uninstall.sh` — interactive removal with character backup.
    - `manage-wow-modules.sh` — post-install tool for adding/removing AzerothCore modules and start/stop/log/console actions. Auto-detects existing installs under `~/wow-server*`.
    - `fix-after-update.sh` — rebuilds pacman keyring + reinstalls Docker after a SteamOS update breaks them.
    - `check-admin-account.sh`, `check-docker.sh` — diagnostic helpers.
    - `wow-gaming-mode.sh`, `wow-npcbots-launcher.sh`, `wow-playerbots-launcher.sh` — Steam Gaming Mode launchers (start server → wait for "world initialized" → auto-shutdown when WoW exits).
  - **UI-driven companions** (invoked by The Lab via env vars, never `read`):
    - `install-wow-ui.sh` — non-interactive variant of `install-wow.sh`. Emits `::DML::SECTION::*` sentinel lines that the Tauri console parses into collapsible groups.
    - `uninstall-wow-ui.sh` — non-interactive variant of `uninstall.sh`. Targets one install at a time; uses `pkexec` for the dir removal so root-owned bind-mount remnants can be cleaned without prompting.
    - `dml-bootstrap.sh` — one-time privileged setup (Docker install + sudoers rule), run via `pkexec` from the app.
  - **Eluna bridge scripts** at [`eluna-scripts/`](./guides/wow-wotlk/eluna-scripts/):
    - `dml_whisper.lua`, `dml_addclass.lua`, `dml_uninvite.lua`, `dml_login.lua`, `dml_gm.lua`.
    - Loaded by `mod-ale` (AzerothCore Lua Engine) so SOAP-callable commands like `dml_addclass <player> <classname>` can run *as the player* — required for mod-playerbots commands that only work from a player's session (talents apply, autogear, maintenance, party bot spawn).
  - **Tauri app** at [`ui/`](./guides/wow-wotlk/ui/) — see its [`CLAUDE.md`](./guides/wow-wotlk/ui/CLAUDE.md) for stack + state + file map.
  - `docker-compose.yml` — reference compose file used by the manual-install guide. Real installs clone `acore-docker` from upstream and apply our own `docker-compose.override.yml` (see `install-wow-ui.sh` for the playerbots override that adds SOAP, lua_scripts mount, AC_ALE_SCRIPT_PATH, etc.).
  - `how-to/HOWTO-*.md` — beginner guides paired with each script.
  - `legacy/` — superseded `install.sh` / `install-npcbots.sh`. Do not edit unless explicitly asked.
- `guides/runescape/` — `install-runescape.sh` plus its how-to. Uses the 2009scape Singleplayer Edition (bundled Java + MySQL, no Docker).

The three WoW server variants install into distinct directories so they can coexist:
- Base: `~/wow-server`
- NPCBots: `~/wow-server-npcbots`
- Playerbots: `~/wow-server-playerbots` ← **what The Lab installs.** The UI only supports the Playerbots variant today; Base / NPCBots paths exist in the bash scripts for power users.

`manage-wow-modules.sh` discovers installs by globbing `~/wow-server*` for any directory containing `docker-compose.yml`. The Tauri app's `detect_installs()` does the same scan and additionally checks for `.dads-mmo-lab/install.json` (the "bootstrap finished" marker) to distinguish complete installs from partial ones.

## Target platform — important

These scripts run on **SteamOS (Arch-based, immutable rootfs)** and on **Ubuntu under WSL2**. Practical consequences:

1. **Package manager assumptions**: code paths handle both `pacman` (SteamOS) and `apt-get` (WSL2 / Ubuntu). See `install_git()` in `install-wow.sh` for the pattern — try `pacman`, fall back to `apt-get`, warn (don't fail) if neither works.
2. **SteamOS quirks**: `steamos-readonly disable` is called before package installs; pacman keyring is checked with `check_pacman_keyring()` and only reset after user confirmation (never silently — a previous version did, and broke user systems).
3. **Docker permissions**: after installing Docker the scripts add the user to `docker` group *and* write a `NOPASSWD` sudoers rule for `docker`/`docker-compose`, *and* chmod the socket, *and* fall back to `function docker() { sudo docker "$@"; }` — because group membership doesn't take effect mid-session.
4. **Never mutate the SteamOS rootfs to free space.** Deleting `/usr` files has irrecoverably broken Gaming Mode in past sessions. Use Docker volumes, user `$HOME`, or external storage only.

When writing new install logic, follow the same "try the clean way, fall back, never silently fail" pattern.

## Script conventions

All scripts in this repo follow a shared style — match it when editing or adding scripts:

- Header banner with project name, version, GitHub URL, usage, and changelog comment block.
- `set -o pipefail` at the top (not `set -e` — the scripts handle errors explicitly and report human-readable messages).
- ANSI color constants (`RED`, `GREEN`, `YELLOW`, `BLUE`, `CYAN`, `WHITE`, `NC`/`RST`, `BOLD`) and helpers: `print_header`, `print_step`, `print_success`, `print_warning`, `print_error`, `print_info`, `ask_yes_no`, `press_enter`.
- Steps numbered for the user ("STEP 1/6 — Choose Your Experience").
- Errors are *explained*, not just `exit 1`. Tell the user what to do next ("Try rebooting and running the installer again", "Run install-wow.sh first").
- Destructive operations (keyring reset, removing an existing install, uninstall) always require a typed `yes` / `DELETE` confirmation, not just `y`.
- **`*-ui.sh` companions** never call `read` and never `clear`. They emit `::DML::SECTION::START::title::` and `::DML::SECTION::END::` sentinel lines around noisy ranges (e.g., `docker compose up --build`) — Tauri's `forward_lines` translates those into collapsible console sections.

### Container / volume / image names (today, post upstream sync)

The Lab installs the upstream **acore-docker** compose stack, which uses hyphenated names:

- Containers: `ac-database`, `ac-db-import`, `ac-worldserver`, `ac-authserver`, `ac-client-data-init`, `ac-tools`
- Volumes: `<project>_ac-database`, `<project>_ac-client-data` (project = install dir basename)
- Network: `<project>_ac-network`

For belt-and-suspenders cleanup during uninstall we **filter by compose project label** (`com.docker.compose.project=<dir-name>`) rather than matching names — that way a separate acore-docker install outside The Lab is never touched. See `uninstall-wow-ui.sh`'s STEP 1 for the pattern.

Legacy underscore-cased names (`ac_database`, `dads_mmo_network`, `dads_mmo_wow_db`) survive in older docs and the reference `docker-compose.yml`; the live UI flow does not use them.

## Building & running

### Bash scripts only

There is nothing to "run" on Windows for this project itself — the scripts only execute on Linux (SteamOS / WSL2 / Ubuntu). The repo on Windows is for editing.

- **Lint a bash script before committing**: `shellcheck guides/wow-wotlk/install-wow.sh`
- **Smoke-test syntax without running**: `bash -n guides/wow-wotlk/install-wow.sh`
- **Real testing** requires a Steam Deck or a WSL2 Ubuntu instance. The "fast install" path for NPCBots (~10 min, prebuilt images) is the cheapest end-to-end test; Playerbots compiles from source and takes ~1.5h on a Deck — avoid in normal dev loops.

### The Lab (Tauri app)

Built **natively on the Steam Deck host** — distrobox builds are deprecated. From `guides/wow-wotlk/ui/`:

- **Dev**: `bun run tauri dev` — hot-reload React, live Rust rebuild.
- **Production AppImage**: `bash build-appimage.sh` — runs `bun run tauri build`, then aliases the versioned artifact (`TheLab_X.Y.Z_amd64.AppImage`) to a stable `TheLab.AppImage` filename so Steam shortcuts + the OTA updater keep working across releases.
- **Output**: `src-tauri/target/release/bundle/appimage/TheLab.AppImage` (~110 MB — most of that is bundled WebKitGTK, our Rust binary is ~33 MB).
- **Typecheck / cargo check**: `bun run tsc --noEmit` and `cd src-tauri && cargo check` are the fast feedback loops; run them after edits before kicking a full AppImage build.

> ⚠️ **Never kick off a production AppImage build (`bash build-appimage.sh`) unless the user explicitly asks for one.** Builds take 2–3 minutes, overwrite the AppImage the user may have actively open, and consume a non-trivial amount of compute. After editing app code, run typecheck + cargo check to verify the change compiles, then **stop** and tell the user the changes are ready — they'll request a rebuild when they want one. Dev mode (`bun run tauri dev`) follows the same rule: only spin it up on request.

See [`guides/wow-wotlk/ui/CLAUDE.md`](./guides/wow-wotlk/ui/CLAUDE.md) for the UI's full stack and conventions.

## Modules currently shipped

The Lab's install wizard installs these AzerothCore modules (all clone+compile into the worldserver image):

| Key | Source | What it does |
|---|---|---|
| **mod-playerbots** (built-in to fork) | `mod-playerbots/azerothcore-wotlk` | The reason we exist. Solo-server bots. |
| **mod-ale** (Eluna) | `azerothcore/mod-ale` | Lua engine. Loads our `dml_*.lua` bridge scripts. Required for SOAP→player-context commands. |
| **mod-ah-bot-plus** | `NathanHandley/mod-ah-bot-plus` | Replaces upstream `mod-ah-bot`. ~440-knob auction-house bot with full config-only setup, no SQL changes. The Lab's Auction House page is its UI. |
| mod-solocraft, mod-autobalance, mod-transmog, mod-individual-progression, mod-1v1-arena, mod-aoe-loot, mod-learn-spells | various | User-selectable in the install wizard. See `USER_MODULE_REGISTRY` in `install-wow-ui.sh` for the live registry. |

Adding a new module = update the registry in `install-wow-ui.sh` (and `manage-wow-modules.sh` for the standalone path) + add an entry to `MODULES` in `ui/src/components/install-onboarding.tsx`.

## Editing rules specific to this project

- **Never link to, document, or assume the existence of copyrighted game clients or server binaries.** Users supply their own clients; we only orchestrate open-source emulators. This is non-negotiable per `CONTRIBUTING.md`.
- **Voice**: plain English, no jargon without explanation, instructions paste-able as-is. When unsure, read any `how-to/HOWTO-*.md` for the tone.
- **Don't introduce new languages or runtimes** at the script layer. Rust under `ui/src-tauri/` is the lone exception. No Python, Node, Go, etc. in install/management bash.
- **The Lab UI is the source of truth for user-facing flows.** New features land in the app first; the standalone scripts catch up when they make sense for power users.
- The two videos linked in `README.md` (`youtu.be/0XwLmaz3tao`, `youtu.be/GVUVnngY93I`) are real — don't replace them with placeholders.

# CODING & BEHAVIORAL GUIDELINES
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
