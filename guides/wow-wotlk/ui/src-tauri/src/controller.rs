//! Controller support for the WoW client.
//!
//! Currently surfaces ConsolePortLK — the WotLK port of the iconic
//! controller addon. The 1.4.0 release zip is bundled directly into
//! the binary via `include_bytes!` (rather than fetched at runtime)
//! because:
//!   1. The upstream repo hasn't been updated since Feb 2025; if the
//!      author takes it down our install button suddenly breaks.
//!   2. Offline-first: a Steam Deck user setting up on couch wifi
//!      shouldn't need to hit GitHub mid-install.
//!   3. 8MB zip baked into the binary is negligible next to wow-mpq
//!      + wow_dbc + DXVK assets we already ship.
//!
//! Install = extract every top-level `ConsolePort*` folder from the
//! zip into `<wow_client>/Interface/AddOns/`. WoW addons are just
//! folders; no registration needed. ConsolePortLK ships 8 sibling
//! addons (Loader, Bar, Help, etc.) which all extract at once.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::app_settings;

const CONSOLEPORTLK_VERSION: &str = "1.4.0";
const CONSOLEPORTLK_ZIP: &[u8] =
    include_bytes!("../resources/consoleportlk-1.4.0.zip");

/// Curated ConsolePortLK SavedVariables — our "The Lab" preset. Bundled
/// straight from the maintainer's setup so a fresh install lands on the
/// same controller layout the tutorial video demonstrates.
const CONSOLEPORT_LUA: &[u8] =
    include_bytes!("../resources/consoleport-svs/ConsolePort.lua");
const CONSOLEPORT_BAR_LUA: &[u8] =
    include_bytes!("../resources/consoleport-svs/ConsolePortBar.lua");

/// Steam Workshop ID for "The Lab: ConsolePortLK" controller layout.
/// The Steam URL scheme `steam://controllerconfig/<appid>/<workshop_id>`
/// subscribes (if needed) and applies it to the user's WoW non-Steam
/// shortcut in one shot.
const WORKSHOP_PRESET_ID: &str = "3730983531";

/// The "marker" folder we look for to decide if ConsolePortLK is
/// already installed. The Loader folder is the central piece — every
/// install has it.
const LOADER_FOLDER: &str = "ConsolePortLoader";

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ConsolePortStatus {
    /// User hasn't connected a WoW client yet; install can't run.
    NoClient,
    /// Client connected, addon not installed.
    NotInstalled { client_dir: String },
    /// Addon folders detected under Interface/AddOns/. Version is the
    /// one we bundled (we don't currently parse the installed .toc to
    /// detect older copies — if the user installs a different version
    /// out-of-band we'll just say "installed").
    Installed {
        client_dir: String,
        version: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct InstallResult {
    /// Number of files written from the zip.
    pub file_count: u32,
    /// Top-level folder names extracted (e.g. `["ConsolePort",
    /// "ConsolePortBar", ...]`). Surfaced so the UI can confirm
    /// which sibling addons landed.
    pub folders: Vec<String>,
    pub version: String,
    /// WoW WTF/Account/* dirs we wrote our SavedVariables into.
    /// Zero means the user hasn't launched WoW yet (no Account dir
    /// exists yet) — the SVs only take effect after the first login
    /// creates the account folder. Not an error; the UI nudges.
    pub accounts_seeded: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct WowSteamShortcut {
    pub appid: u32,
    pub name: String,
}

fn addons_dir(wow_dir: &str) -> PathBuf {
    Path::new(wow_dir).join("Interface").join("AddOns")
}

#[tauri::command]
pub fn get_consoleportlk_status() -> ConsolePortStatus {
    let settings = app_settings::load();
    let client_dir = match settings.wow_client_dir {
        Some(d) => d,
        None => return ConsolePortStatus::NoClient,
    };
    let loader = addons_dir(&client_dir).join(LOADER_FOLDER);
    if loader.is_dir() {
        ConsolePortStatus::Installed {
            client_dir,
            version: CONSOLEPORTLK_VERSION.to_string(),
        }
    } else {
        ConsolePortStatus::NotInstalled { client_dir }
    }
}

#[tauri::command]
pub async fn install_consoleportlk() -> Result<InstallResult, String> {
    let settings = app_settings::load();
    let client_dir = settings
        .wow_client_dir
        .ok_or_else(|| "No WoW client connected — set one in Settings first.".to_string())?;

    // CPU-bound zip extract — hop onto the blocking pool so the
    // Tauri runtime thread stays free. Same pattern as the icon /
    // tooltip extractors in client_assets.rs.
    tokio::task::spawn_blocking(move || install_blocking(client_dir))
        .await
        .map_err(|e| format!("blocking task join: {e}"))?
}

fn install_blocking(client_dir: String) -> Result<InstallResult, String> {
    let addons = addons_dir(&client_dir);
    std::fs::create_dir_all(&addons)
        .map_err(|e| format!("create {}: {}", addons.display(), e))?;

    let reader = Cursor::new(CONSOLEPORTLK_ZIP);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("open bundled zip: {e}"))?;

    let mut file_count = 0u32;
    let mut folders: std::collections::BTreeSet<String> =
        std::collections::BTreeSet::new();

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
        // `enclosed_name` resolves the safe in-archive path (no
        // ".." traversal, no absolute paths) — the right defense
        // even though we trust the bundled archive.
        let rel_path = match file.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };

        // Track top-level folder names for the result payload.
        if let Some(first) = rel_path.components().next() {
            folders.insert(first.as_os_str().to_string_lossy().into_owned());
        }

        let out_path = addons.join(&rel_path);
        if file.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("mkdir {}: {}", out_path.display(), e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
            }
            let mut out = std::fs::File::create(&out_path)
                .map_err(|e| format!("create {}: {}", out_path.display(), e))?;
            std::io::copy(&mut file, &mut out)
                .map_err(|e| format!("write {}: {}", out_path.display(), e))?;
            file_count += 1;
        }
    }

    // Apply the curated SavedVariables into every WoW account dir so
    // the keybinds + bar layout match the tutorial out of the box.
    let accounts_seeded = apply_consoleport_svs(Path::new(&client_dir))?;

    Ok(InstallResult {
        file_count,
        folders: folders.into_iter().collect(),
        version: CONSOLEPORTLK_VERSION.to_string(),
        accounts_seeded,
    })
}

/// Drop our `ConsolePort.lua` + `ConsolePortBar.lua` into every WTF
/// account's SavedVariables/ — that's per-account, so all alts share
/// the same controller setup. If WoW hasn't been launched yet there's
/// no Account dir; return 0 and let the UI tell the user to log in
/// once.
fn apply_consoleport_svs(client_dir: &Path) -> Result<u32, String> {
    let accounts_root = client_dir.join("WTF").join("Account");
    if !accounts_root.is_dir() {
        return Ok(0);
    }
    let mut applied = 0u32;
    for entry in std::fs::read_dir(&accounts_root)
        .map_err(|e| format!("read {}: {e}", accounts_root.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if !is_dir {
            continue;
        }
        let sv_dir = entry.path().join("SavedVariables");
        std::fs::create_dir_all(&sv_dir)
            .map_err(|e| format!("mkdir {}: {e}", sv_dir.display()))?;
        std::fs::write(sv_dir.join("ConsolePort.lua"), CONSOLEPORT_LUA)
            .map_err(|e| format!("write ConsolePort.lua: {e}"))?;
        std::fs::write(sv_dir.join("ConsolePortBar.lua"), CONSOLEPORT_BAR_LUA)
            .map_err(|e| format!("write ConsolePortBar.lua: {e}"))?;
        applied += 1;
    }
    Ok(applied)
}

/// Find the user's WoW client added to Steam as a non-Steam game so we
/// can target it with `steam://controllerconfig`. Steam stores
/// non-Steam shortcuts in `~/.steam/steam/userdata/<id>/config/shortcuts.vdf`
/// (a binary VDF). We match by `AppName` containing "World of Warcraft"
/// — the path field is unreliable (Lutris/Flatpak entries point at
/// `/usr/bin/flatpak`, native ones at `wine`, etc.).
#[tauri::command]
pub fn find_wow_steam_shortcut() -> Option<WowSteamShortcut> {
    let userdata = dirs::home_dir()?.join(".steam/steam/userdata");
    let users = std::fs::read_dir(&userdata).ok()?;
    for user in users.flatten() {
        let vdf = user.path().join("config/shortcuts.vdf");
        if !vdf.exists() {
            continue;
        }
        let Ok(data) = std::fs::read(&vdf) else {
            continue;
        };
        for sc in parse_shortcuts(&data) {
            if sc.name.to_lowercase().contains("world of warcraft") {
                return Some(WowSteamShortcut {
                    appid: sc.appid,
                    name: sc.name,
                });
            }
        }
    }
    None
}

/// Open the Steam URL that applies our curated Workshop controller
/// layout to the WoW non-Steam shortcut. Steam handles subscribe+apply
/// in one go; if Steam isn't running, the URL launches it.
#[tauri::command]
pub fn apply_controller_preset(
    app: tauri::AppHandle,
    appid: u32,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = format!(
        "steam://controllerconfig/{}/{}",
        appid, WORKSHOP_PRESET_ID
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("open steam URL: {e}"))
}

// ── shortcuts.vdf binary VDF parser (only the bits we need) ──────────
struct ParsedShortcut {
    appid: u32,
    name: String,
}

/// Walks the type-tagged binary VDF tree just deep enough to pull each
/// shortcut entry's `appid` (uint32, type 0x02) and `AppName` (string,
/// type 0x01). Tag bytes: 0x00 = object open (then cstring name), 0x08
/// = object close, 0x01 = string field, 0x02 = uint32 field. Unknown
/// types bail safely.
fn parse_shortcuts(data: &[u8]) -> Vec<ParsedShortcut> {
    let mut out = Vec::new();
    let mut i = 0usize;
    let mut depth: i32 = 0;
    let mut cur = ParsedShortcut {
        appid: 0,
        name: String::new(),
    };
    while i < data.len() {
        let t = data[i];
        i += 1;
        match t {
            0x00 => {
                // Object open — consume the key cstring.
                let _ = read_cstr(data, &mut i);
                depth += 1;
                if depth == 2 {
                    cur = ParsedShortcut {
                        appid: 0,
                        name: String::new(),
                    };
                }
            }
            0x08 => {
                if depth == 2 && (cur.appid != 0 || !cur.name.is_empty()) {
                    out.push(std::mem::replace(
                        &mut cur,
                        ParsedShortcut {
                            appid: 0,
                            name: String::new(),
                        },
                    ));
                }
                depth -= 1;
                if depth < 0 {
                    break;
                }
            }
            0x01 => {
                let key = read_cstr(data, &mut i);
                let val = read_cstr(data, &mut i);
                if depth == 2 && key.eq_ignore_ascii_case("AppName") {
                    cur.name = val;
                }
            }
            0x02 => {
                let key = read_cstr(data, &mut i);
                if i + 4 > data.len() {
                    break;
                }
                let v = u32::from_le_bytes([
                    data[i],
                    data[i + 1],
                    data[i + 2],
                    data[i + 3],
                ]);
                i += 4;
                if depth == 2 && key.eq_ignore_ascii_case("appid") {
                    cur.appid = v;
                }
            }
            _ => break,
        }
    }
    out
}

fn read_cstr(data: &[u8], i: &mut usize) -> String {
    let start = *i;
    while *i < data.len() && data[*i] != 0 {
        *i += 1;
    }
    let s = String::from_utf8_lossy(&data[start..*i]).into_owned();
    if *i < data.len() {
        *i += 1;
    }
    s
}
