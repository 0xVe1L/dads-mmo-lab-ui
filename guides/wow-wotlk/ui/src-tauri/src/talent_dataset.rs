//! Parse mod-playerbots' `PremadeSpecLink` config entries into a JSON
//! dataset committed to the repo. Replaces the live-bot harvest tool —
//! the mod's own conf has level-aware talent builds for every (class,
//! spec) combo at multiple level milestones (60/65/70/80), hand-
//! curated by the mod authors. Much better source than sampling our
//! own bot population.
//!
//! How the mod stores builds:
//!   AiPlayerbot.PremadeSpecName.<class>.<spec_index>     = "holy pve"
//!   AiPlayerbot.PremadeSpecLink.<class>.<spec_index>.<level> = "<wowhead-link>"
//!
//! Wowhead link format (one tree at a time, separated by `-`):
//!   Each char in a tree-string is a rank value 0-5. Characters map to
//!   talents in row-major order — the i-th char is the rank of the
//!   i-th talent in that class's tab when sorted by (Row, Col). We
//!   mirror this exactly using metadata from our extracted talent
//!   cache. See mod source: PlayerbotAIConfig.cpp:901-952
//!   `ParseTempTalentsOrder`.
//!
//! Output: `<repo>/src/lib/talent-builds.json` — bundled into the app
//! via Vite's JSON import path; consumed by the My Party wizard.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

use crate::client_assets;

/// Schema version. v1 was the live-bot harvest shape (one build per
/// class+tab). v2 is the conf-derived shape with multiple level
/// milestones per spec, named specs, and an explicit Wowhead link
/// preserved for debugging.
const DATASET_VERSION: u32 = 2;

/// Number of talent trees per class. Matches mod's MAX_TALENT_TABS.
const TABS_PER_CLASS: usize = 3;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TalentRow {
    /// character_talent.spell — the spell id at the chosen rank.
    spell: i32,
    /// character_talent.specMask. v1 always writes primary slot (1);
    /// dual-spec support can extend later.
    spec_mask: u8,
    tab_index: u8,
    tier: u8,
    column: u8,
    /// 0-indexed rank (rank 0 = first point, rank 4 = fifth point).
    rank: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TalentBuild {
    /// Level milestone the conf provided this build for (60/65/70/80).
    level: u32,
    /// Original Wowhead link for transparency / debugging / future
    /// re-parse if the spell id lookup ever changes.
    wowhead_link: String,
    /// Sum of all rank+1 values across primary-spec talents.
    total_points: u32,
    /// Points per tree (0/1/2). Drives the "X/Y/Z" display in the
    /// wizard's build picker.
    tree_distribution: [u32; 3],
    /// Tree with the most points — the spec the build commits to.
    primary_tab: u8,
    talents: Vec<TalentRow>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpecEntry {
    class_id: u8,
    /// The mod's spec_index. Often 0/1/2 (one per tab) but DK has 7
    /// variants (PvE/DPS-PvE/PvP variations per tab), warlocks have 5,
    /// etc. Surfaced raw so the wizard can choose how to expose
    /// variants (e.g. group by primary_tab and let user pick variant).
    spec_index: u32,
    /// Human-readable name from PremadeSpecName (e.g. "holy pve",
    /// "frost dps pvp"). Lowercased per the mod's own convention.
    spec_name: String,
    builds: Vec<TalentBuild>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TalentDataset {
    version: u32,
    /// Absolute path the conf was parsed from — provenance trail.
    source_file: String,
    extracted_at: String,
    spec_count: usize,
    build_count: usize,
    specs: Vec<SpecEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDatasetResult {
    pub spec_count: usize,
    pub build_count: usize,
    pub source_file: String,
    pub output_path: String,
    /// Builds that failed any spell-id lookup. Format: "class:spec:level".
    /// Should normally be empty — populated means the talent cache is
    /// out of sync with the conf (e.g. different patch versions).
    pub partial_decodes: Vec<String>,
}

#[tauri::command]
pub fn build_talent_dataset() -> Result<BuildDatasetResult, String> {
    // ── 1. Talent cache → spell-id reverse lookup + per-class tab
    //       talent-position lists (sorted by row, col).
    let cache = client_assets::load_talent_data().map_err(|e| {
        format!(
            "Talent cache not loaded: {e}. Run Settings → Talents → \
             Extract talents first."
        )
    })?;

    // (class, tab, tier, col, rank) → spell_id
    let mut rank_lookup: HashMap<(u8, u8, u8, u8, u8), i32> = HashMap::new();
    // (class, tab) → sorted list of (tier, col) — one entry per
    // unique talent, regardless of rank. Walked in row-major order
    // when decoding the Wowhead link.
    let mut tab_talents: HashMap<u8, [Vec<(u8, u8)>; TABS_PER_CLASS]> = HashMap::new();
    let mut seen_positions: HashMap<(u8, u8, u8, u8), bool> = HashMap::new();

    for (spell_str, info) in &cache.spell_to_talent {
        let Ok(spell_id) = spell_str.parse::<i32>() else {
            continue;
        };
        rank_lookup.insert(
            (info.class_id, info.tab_index, info.tier, info.column, info.rank),
            spell_id,
        );
        if (info.tab_index as usize) >= TABS_PER_CLASS {
            continue;
        }
        let pos_key = (info.class_id, info.tab_index, info.tier, info.column);
        if seen_positions.insert(pos_key, true).is_none() {
            let entry = tab_talents
                .entry(info.class_id)
                .or_insert_with(|| Default::default());
            entry[info.tab_index as usize].push((info.tier, info.column));
        }
    }
    // Sort each tab's talent positions by (row, col) — exactly what
    // the mod does in ParseTempTalentsOrder.
    for arr in tab_talents.values_mut() {
        for tab in arr.iter_mut() {
            tab.sort();
        }
    }

    // ── 2. Locate the conf file.
    let conf_path = find_playerbots_conf()?;
    let text = std::fs::read_to_string(&conf_path)
        .map_err(|e| format!("read {}: {}", conf_path.display(), e))?;

    // ── 3. Extract PremadeSpecName + PremadeSpecLink entries.
    //       Hand-rolled prefix matching beats pulling in regex for ~3
    //       patterns.
    let mut names: HashMap<(u8, u32), String> = HashMap::new();
    let mut links: HashMap<(u8, u32, u32), String> = HashMap::new();

    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("AiPlayerbot.PremadeSpecName.") {
            if let Some((key, value)) = split_key_value(rest) {
                let parts: Vec<&str> = key.split('.').collect();
                if parts.len() != 2 {
                    continue;
                }
                let (Ok(cls), Ok(spec)) = (parts[0].parse::<u8>(), parts[1].parse::<u32>()) else {
                    continue;
                };
                names.insert((cls, spec), value);
            }
        } else if let Some(rest) = line.strip_prefix("AiPlayerbot.PremadeSpecLink.") {
            if let Some((key, value)) = split_key_value(rest) {
                let parts: Vec<&str> = key.split('.').collect();
                if parts.len() != 3 {
                    continue;
                }
                let (Ok(cls), Ok(spec), Ok(lvl)) = (
                    parts[0].parse::<u8>(),
                    parts[1].parse::<u32>(),
                    parts[2].parse::<u32>(),
                ) else {
                    continue;
                };
                if value.is_empty() {
                    continue;
                }
                links.insert((cls, spec, lvl), value);
            }
        }
    }

    // ── 4. Decode each link → talent rows. Group by (class, spec).
    let mut specs_map: HashMap<(u8, u32), SpecEntry> = HashMap::new();
    let mut partial_decodes: Vec<String> = Vec::new();

    let mut link_keys: Vec<(u8, u32, u32)> = links.keys().copied().collect();
    link_keys.sort();
    for key in link_keys {
        let (cls, spec, lvl) = key;
        let link = &links[&key];
        let Some(talent_arr) = tab_talents.get(&cls) else {
            // Class id from conf isn't in our cache — odd, but skip.
            partial_decodes.push(format!("{}:{}:{} (no class in cache)", cls, spec, lvl));
            continue;
        };
        let (talents, tree_distribution, total_points, primary_tab, partial) =
            decode_link(cls, link, talent_arr, &rank_lookup);
        if partial {
            partial_decodes.push(format!("{}:{}:{}", cls, spec, lvl));
        }
        if talents.is_empty() {
            // Defensive: link decoded to zero rows (no recognizable
            // talents). Skip rather than emit an empty build.
            continue;
        }
        let entry = specs_map.entry((cls, spec)).or_insert_with(|| SpecEntry {
            class_id: cls,
            spec_index: spec,
            spec_name: names
                .get(&(cls, spec))
                .cloned()
                .unwrap_or_else(|| format!("class {} spec {}", cls, spec)),
            builds: Vec::new(),
        });
        entry.builds.push(TalentBuild {
            level: lvl,
            wowhead_link: link.clone(),
            total_points,
            tree_distribution,
            primary_tab,
            talents,
        });
    }

    // Order specs (class then spec_index) and sort each spec's builds
    // by level so consumers can search "biggest build ≤ target level"
    // with a simple linear walk.
    let mut specs: Vec<SpecEntry> = specs_map.into_values().collect();
    specs.sort_by_key(|s| (s.class_id, s.spec_index));
    for s in &mut specs {
        s.builds.sort_by_key(|b| b.level);
    }

    let build_count: usize = specs.iter().map(|s| s.builds.len()).sum();
    let spec_count = specs.len();
    let extracted_at = now_iso();
    let dataset = TalentDataset {
        version: DATASET_VERSION,
        source_file: conf_path.display().to_string(),
        extracted_at,
        spec_count,
        build_count,
        specs,
    };

    // ── 5. Emit JSON.
    let json = serde_json::to_string_pretty(&dataset)
        .map_err(|e| format!("serialize dataset: {e}"))?;
    let output_path = output_path();
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
    }
    std::fs::write(&output_path, json)
        .map_err(|e| format!("write {}: {}", output_path.display(), e))?;

    Ok(BuildDatasetResult {
        spec_count,
        build_count,
        source_file: conf_path.display().to_string(),
        output_path: output_path.display().to_string(),
        partial_decodes,
    })
}

// ── helpers ──────────────────────────────────────────────────────────

/// Mirrors `ParseTempTalentsOrder` in
/// `mod-playerbots/src/PlayerbotAIConfig.cpp:901`. Walks the link
/// character by character against the per-tab sorted talent list.
/// Returns (rows, tree distribution, total points, primary tab,
/// partial flag). `partial = true` means at least one (tier, col,
/// rank) lookup missed — meaningful builds can still go through.
fn decode_link(
    class_id: u8,
    link: &str,
    tab_talents: &[Vec<(u8, u8)>; TABS_PER_CLASS],
    rank_lookup: &HashMap<(u8, u8, u8, u8, u8), i32>,
) -> (Vec<TalentRow>, [u32; 3], u32, u8, bool) {
    let mut rows: Vec<TalentRow> = Vec::new();
    let mut tree_distribution = [0u32; 3];
    let mut partial = false;

    for (raw_idx, tab_str) in link.split('-').enumerate() {
        if raw_idx >= TABS_PER_CLASS {
            break;
        }
        let tab_index = raw_idx as u8;
        let positions = &tab_talents[raw_idx];
        for (i, ch) in tab_str.chars().enumerate() {
            if i >= positions.len() {
                // Link is longer than this tab's actual talents. Stop
                // here — the mod's decoder breaks too.
                break;
            }
            let rank_value = match ch.to_digit(10) {
                Some(n) if n <= 5 => n as u8,
                _ => {
                    partial = true;
                    continue;
                }
            };
            if rank_value == 0 {
                continue;
            }
            let (tier, column) = positions[i];
            let rank = rank_value - 1; // wowhead chars are 1-based, cache rank is 0-based
            let key = (class_id, tab_index, tier, column, rank);
            let Some(&spell) = rank_lookup.get(&key) else {
                partial = true;
                continue;
            };
            tree_distribution[tab_index as usize] += rank_value as u32;
            rows.push(TalentRow {
                spell,
                spec_mask: 1,
                tab_index,
                tier,
                column,
                rank,
            });
        }
    }

    let total_points: u32 = tree_distribution.iter().sum();
    let primary_tab = tree_distribution
        .iter()
        .enumerate()
        .max_by_key(|(_, &v)| v)
        .map(|(idx, _)| idx as u8)
        .unwrap_or(0);
    (rows, tree_distribution, total_points, primary_tab, partial)
}

fn find_playerbots_conf() -> Result<PathBuf, String> {
    let install_modules = dirs::home_dir()
        .ok_or_else(|| "could not resolve home directory".to_string())?
        .join("wow-server-playerbots/env/dist/etc/modules");
    // Prefer the user's customized .conf if it exists, else the
    // upstream-shipped .conf.dist. Matches how the mod itself loads:
    // .conf overrides .conf.dist.
    let conf = install_modules.join("playerbots.conf");
    if conf.is_file() {
        return Ok(conf);
    }
    let dist = install_modules.join("playerbots.conf.dist");
    if dist.is_file() {
        return Ok(dist);
    }
    Err(format!(
        "playerbots.conf not found in {}. Is the Playerbots variant installed?",
        install_modules.display()
    ))
}

fn split_key_value(rest: &str) -> Option<(String, String)> {
    let eq = rest.find('=')?;
    let key = rest[..eq].trim().to_string();
    let value = rest[eq + 1..].trim().to_string();
    Some((key, value))
}

fn output_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("src/lib/talent-builds.json"))
        .expect("CARGO_MANIFEST_DIR should have a parent")
}

fn now_iso() -> String {
    // Same minimal ISO-8601 stamp other modules use. Days-from-epoch
    // → Y/M/D using Howard Hinnant's civil-from-days algorithm.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    let secs_today = secs % 86_400;
    let (y, m, d) = days_to_ymd(days as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m,
        d,
        secs_today / 3600,
        (secs_today % 3600) / 60,
        secs_today % 60
    )
}

fn days_to_ymd(mut days: i64) -> (i32, u32, u32) {
    days += 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let doe = (days - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year as i32, m as u32, d as u32)
}

