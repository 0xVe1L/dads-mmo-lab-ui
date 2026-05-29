# CLAUDE.md — UI subproject

Scoped guidance for The Lab: the Tauri management/install UI at `guides/wow-wotlk/ui/`. The repo-root [`CLAUDE.md`](../../../CLAUDE.md) describes the wider scripts-and-guides repo and the bash-script half. The planning docs at the repo root cover *what* and *why*:

- [`VISION.md`](../../../VISION.md) — product vision.
- [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) — original stack + phasing (Phases 1-4 are now shipped; treat as historical).
- [`WorkGoals_5-27-2026.md`](../../../WorkGoals_5-27-2026.md) — current sprint plan (OTA updates, AHBot Plus migration, module config UI, new modules).

This file tells you *where things are now* and *how to work on them*.

## Stack

- **Tauri 2** (Rust shell + system WebView). Bundled distribution = AppImage.
- **React 19 + Vite 7 + TypeScript** (strict).
- **shadcn/ui + Tailwind CSS v4** — primitives live in `src/components/ui/`.
- **Phosphor icons** (`@phosphor-icons/react`) — **always use the `*Icon` suffix** (`PlayIcon`, not `Play`; bare names are deprecated and TypeScript flags them).
- **Bun** as package manager and JS runtime.
- **sonner** for toasts. **radix-ui** primitives back most shadcn components.

## Dev setup on the Steam Deck

The build environment is the Deck itself — **build natively on the host**. Distrobox builds (the old archdev / ubuntu-build flow) are deprecated; they produced AppImages with library mismatches against SteamOS's WebKit and the EGL renderer crashed under gamescope.

```sh
# Bun
curl -fsSL https://bun.sh/install | bash

# Rust (for Tauri's Rust backend) — install rustup, default toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri 2 Linux system deps (cross-check current Tauri docs if anything's missing)
sudo pacman -S --needed \
  webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg

# Project
cd guides/wow-wotlk/ui
bun install
bun run tauri dev          # dev mode with HMR
```

If `bun install` fails with an `msw` postinstall error, run `pnpm install` once instead — there's a known msw + bun postinstall incompatibility. Daily dev still uses `bun`.

### Building for distribution

```sh
cd guides/wow-wotlk/ui
bash build-appimage.sh
# → src-tauri/target/release/bundle/appimage/TheLab.AppImage  (~110MB)
```

The script aliases the versioned artifact (`TheLab_X.Y.Z_amd64.AppImage`) to a stable `TheLab.AppImage` filename so Steam non-Steam shortcuts and the OTA updater don't break across releases.

**Important env vars baked into `build-appimage.sh`:**
- `APPIMAGE_EXTRACT_AND_RUN=1` — linuxdeploy needs this on SteamOS.
- `NO_STRIP=1` — stripping the bundled WebKit libs causes EGL crashes under gamescope. Don't change this without testing in Gaming Mode.

The updater signing key lives at `src-tauri/.secrets/updater.key` (gitignored). Builds without it abort because `createUpdaterArtifacts: true` in `tauri.conf.json` produces signed `.sig` files alongside the `.AppImage`.

## Current state (as of 2026-05-29)

**Shipped pages** (all reachable from the sidebar; greyed out when no install is detected):
- **Dashboard** — character paperdoll, Player View / My Party tabs, install-resume banner, WoW client card (realmlist check).
- **Teleport** — preset locations + custom coords, fires `.teleport name` / `.tele x y z` via SOAP.
- **Inventory** → routes to **Item Database** — full item search with quality/class filters, icon enrichment, send-to-character flow. Each item card has a **gavel** dropdown for adding/removing the item from `AuctionHouseBot.DisabledCustomItemIDs`.
- **Auction House** — basic + advanced tabs for `mod-ah-bot-plus` config. Save button writes diffed fields + fires `.ahbot reload` via SOAP.
- **Player Bots** → routes to **Bot Detail** screens — talent specs, autogear, maintenance whispers via the Eluna `dml_*` bridge scripts.
- **Settings** — audio prefs, cursor faction theming, WoW client connection, data enrichment (icons / tooltips / talents extracted from MPQs), character backup/restore (.dmlbak format), Steam integration (auto-adds The Lab + WoW client as non-Steam games with artwork), Controller support (ConsolePortLK), modules table, **uninstall server** (with surgical settings.json wipe + pkexec-based dir removal).
- **Help** — always reachable (even pre-install).

**Install lifecycle**:
- Install wizard (4 steps: server type → modules → admin account → summary) spawns `install-wow-ui.sh` with env vars, streams stdout/stderr into a collapsible console (section markers wrap docker build into a labelled "Worldserver + Playerbots" / "Authserver" 2-stage view).
- `bootstrap_privileges` runs first — uses pkexec to install Docker / write the NOPASSWD sudoers rule, if needed.
- On success, Rust persists the admin user + password to `~/.config/dads-mmo-lab/settings.json` (chmod 0600). Subsequent SOAP calls authenticate as that user.

**Uninstall lifecycle**:
- Spawns `uninstall-wow-ui.sh`. Uses `docker compose down -v` + project-label-filtered container cleanup, then `pkexec rm -rf` for the install dir (handles root-owned docker bind-mount remnants without prompting in the script).
- Rust pre-wipes server-bound fields in settings.json (selected character, switcher GUIDs, dismissed notices, admin creds) before the script runs. App-level prefs (audio, cursor, WoW client folder) survive.
- Success dialog is rendered at the **App root** (not inside `SettingsScreen`) so it survives the route-change when `installs` empties.

**SOAP + Eluna bridge**:
- `soap::execute_command` authenticates as the install's admin (read from `settings.json`).
- mod-ale loads the 5 `dml_*.lua` bridge scripts from `<install>/lua_scripts/`, mounted into the worldserver container at `/azerothcore/env/dist/bin/lua_scripts` (path is `AC_ALE_SCRIPT_PATH` in the compose override).
- `dml_addclass`, `dml_whisper`, `dml_uninvite`, `dml_login`, `dml_gm` let SOAP route commands through a player's session — required for mod-playerbots features that don't accept admin-context commands.

## File map

```
src/
├── App.tsx                              ← Provider tree + page-level routing
├── main.tsx                             ← Root mount + dev DebugPanel + theme
├── index.css                            ← Tailwind v4 tokens + global scrollbar + Edge ::-ms-reveal suppression
├── assets/                              ← Logos, lottie loops, item icons, cursor SVGs
├── components/
│   ├── server-state-context.tsx         ← Single source of truth for ALL server / install / character / module state
│   ├── App pieces:
│   │   ├── welcome-screen.tsx           ← Pre-install landing page
│   │   ├── splash-screen.tsx            ← First-paint splash
│   │   ├── site-header.tsx              ← Top bar (title + mute icon)
│   │   └── app-sidebar.tsx              ← Sidebar nav + nav-main / nav-secondary
│   ├── Install / uninstall flow:
│   │   ├── install-onboarding.tsx       ← 4-step modal wizard
│   │   ├── install-progress-screen.tsx  ← Streams script output during install
│   │   ├── install-console.tsx          ← Reusable terminal console with sections + progress bar
│   │   ├── install-resume-banner.tsx    ← Banner when install.json missing (partial install)
│   │   ├── uninstall-section.tsx        ← Settings → Uninstall card
│   │   └── uninstall-success-dialog.tsx ← App-root dialog that survives route-change after uninstall
│   ├── Dashboard:
│   │   ├── dashboard-shell.tsx          ← Player View / My Party tabs + banner row
│   │   ├── dashboard-player-view.tsx    ← Character paperdoll + quick GM actions
│   │   ├── dashboard-my-party.tsx       ← Active party + bot slots
│   │   └── wow-client-card.tsx          ← Client dir + realmlist health
│   ├── Pages:
│   │   ├── teleport-screen.tsx
│   │   ├── inventory-screen.tsx         ← Item Database + gavel dropdown for AH exclusions
│   │   ├── auction-house-screen.tsx     ← mod-ah-bot-plus config (Basic + Advanced tabs)
│   │   ├── playerbots-screen.tsx        ← Bot roster
│   │   ├── bot-detail-screen.tsx        ← Individual bot spec / autogear / maintenance
│   │   ├── modules-screen.tsx           ← ModulesEmbedded (used inside Settings) + standalone screen
│   │   ├── settings-screen.tsx          ← Tabs for prefs / WoW client / enrichment / backups / Steam / modules / uninstall
│   │   └── help-screen.tsx
│   ├── Wizards / overlays:
│   │   ├── ahbot-intro-overlay.tsx      ← First-run "AH bot needs setup" prompt
│   │   ├── ahbot-wizard.tsx             ← Character picker for AH bot GUID
│   │   ├── add-to-party-wizard.tsx      ← Class-pick → dml_addclass spawn
│   │   ├── character-backup-wizard.tsx  ← .dmlbak export
│   │   ├── character-restore-wizard.tsx ← .dmlbak import
│   │   ├── character-picker.tsx         ← Generic picker
│   │   ├── character-switcher.tsx       ← Sidebar character switcher
│   │   ├── auto-shutdown-alert-dialog.tsx ← Surfaces backend's auto-stop event
│   │   ├── pre-install-tooltip.tsx      ← Hover tooltip for greyed nav items
│   │   ├── controller-support-section.tsx ← ConsolePortLK install
│   │   └── steam-integration-section.tsx  ← Add to Steam (shortcuts.vdf editor)
│   ├── Utility components:
│   │   ├── item-icon-framed.tsx, item-tooltip.tsx
│   │   ├── talent-tree.tsx
│   │   ├── download-log-button.tsx
│   │   ├── external-link-guard.tsx
│   │   ├── update-checker.tsx           ← Tauri updater hook
│   │   ├── cursor-faction-context.tsx   ← Warcraft cursor theming
│   │   ├── theme-provider.tsx
│   │   ├── debug-panel.tsx              ← Ctrl+D dev panel
│   │   ├── lottie-loop.tsx
│   │   ├── wow-icon.tsx                 ← Custom <WowIcon size={N}/>
│   │   └── ui/                          ← shadcn primitives — add via `bunx shadcn@latest add <name>`
└── lib/
    ├── tauri.ts                         ← trackedInvoke + isTauri helpers
    ├── sfx.ts                           ← Audio prefs store
    ├── ahbot-exclude.ts                 ← Parse/serialize DisabledCustomItemIDs
    └── utils.ts                         ← cn()
```

```
src-tauri/src/
├── lib.rs                               ← Plugin registration + 87+ #[tauri::command] handlers
├── main.rs                              ← Entry point
├── app_settings.rs                      ← ~/.config/dads-mmo-lab/settings.json (chmod 0600 on every save)
├── bootstrap.rs                         ← One-time pkexec privileged setup (Docker + sudoers)
├── install.rs                           ← Spawns install-wow-ui.sh, streams output, persists admin creds on success
├── uninstall.rs                         ← Spawns uninstall-wow-ui.sh; pre-wipes server-bound settings.json fields
├── server.rs                            ← Start/stop/restart worldserver + status polling + client-exit watcher
├── modules.rs                           ← list_installed_modules, configure_ahbot_character, update_module_conf, reload_ahbot
├── soap.rs                              ← execute_command (HTTP Basic, creds from app_settings)
├── dashboard.rs                         ← Character paperdoll + GM actions (money / heal / revive / talents)
├── inventory.rs                         ← search_items, send_item_to_character
├── teleport.rs                          ← Preset list + execute
├── playerbots.rs                        ← Bot roster, spawn, party management (uses dml_addclass via SOAP)
├── client_assets.rs                     ← MPQ extractors (icons, tooltips, talents) + cache management
├── talent_dataset.rs, talent_harvest.rs, talent_trees.rs  ← Talent metadata pipeline
├── character_backup.rs                  ← .dmlbak export/import (transactional restore via staging schema)
├── wow_client.rs                        ← Client dir detection, realmlist.wtf rewrite
├── controller.rs                        ← ConsolePortLK addon install
├── steam_shortcuts.rs                   ← shortcuts.vdf editing + grid art install
├── sfx.rs                               ← SFX playback (audio file → tauri-managed sink)
└── bin/extract_trees.rs                 ← Standalone tool for the talent dataset build
```

## Conventions

- **Shared server state** goes through `useServerState()` — don't reach for local `useState` if more than one component needs to react to it.
- **shadcn primitives only** — no other component libraries. Add with `bunx shadcn@latest add <name>` and the file lands in `src/components/ui/`.
- **Phosphor v2 naming** — always use the `*Icon` suffix. Bare exports trigger TS deprecation warnings.
- **Icon sizing inside `SidebarMenuButton`** — the cva variant sets `[&_svg]:size-4`. Override with `[&_svg]:size-5!` (or other size). The `!` matters; twMerge doesn't reliably collapse arbitrary variants.
- **Themed scrollbars are global** — `index.css` styles `::-webkit-scrollbar` against `var(--foreground)` via `color-mix`. No per-component wrapping needed.
- **Steam Deck resolution** — design target is **1280×800**. The onboarding modal at 900×560 was sized specifically to leave Deck-friendly margins; test new modals at this resolution.
- **Tauri commands** are the only path from the WebView to anything dangerous (shell, FS, DB, SOAP). The frontend never calls those APIs directly.
- **`trackedInvoke`** (in `lib/tauri.ts`) wraps `invoke()` with logging/error normalization — use it, not the raw `@tauri-apps/api` import.
- **SOAP credentials** live in `app_settings.json` after install. `soap::execute_command` reads them on every call (file is tiny). Falls back to `ADMIN/admin` only for adopted external installs.
- **`mod-ah-bot-plus` schema is boolean strings**, not 1/0. `AuctionHouseBot.EnableSeller = true` / `Buyer.Enabled = false`. The bash conf writer and the AH page both handle this.
- **Window mode** — gamescope (Gaming Mode) is detected via `GAMESCOPE_WAYLAND_DISPLAY`; if present, `setup()` forces fullscreen so Steam's bottom strip doesn't eat clicks on the last 40px. Desktop Mode stays windowed.
- **`forward_lines`** (in `install.rs` / `uninstall.rs`) translates the bash `::DML::SECTION::*` sentinels into `*:section` events. When wrapping a long docker step in a script, use the helper to keep the user's console scannable.

## Known issues / cleanup candidates

- The Advanced tab on the Auction House page renders all 440+ `AuctionHouseBot.*` fields with auto-detected types but no inline help text. Conf comments aren't parsed yet — the comment-extraction pipeline is on the future list.
- `install-wow.sh` (the standalone bash installer) hardcodes the `deck` username in its NOPASSWD sudoers rule. Will need generalization for Omarchy + non-Steam Deck Linux — use `$USER` instead of `deck`.
- A few legacy filenames in `src/assets/icons/` are identical to the canonical 480px SVG — safe to delete if you're cleaning up.
- `site-header.tsx` has `title` as a required prop with no default — adding a new page will be a compile error until you pass the title from `App.tsx`. Intentional, keeps page titles explicit.

## When in doubt

1. Check [`WorkGoals_5-27-2026.md`](../../../WorkGoals_5-27-2026.md) for the current sprint priorities.
2. Look at the surrounding component for conventions before introducing a new pattern.
3. Smoke test: `bun run tsc --noEmit` for TypeScript, `cd src-tauri && cargo check` for Rust. Both should be clean before a build.
4. End-to-end test: `bash build-appimage.sh`, then run the AppImage. Fresh install → uninstall → reinstall is the canonical happy path.
