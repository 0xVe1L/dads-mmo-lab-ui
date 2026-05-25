//! Dev-only tool: harvest canonical talent builds from the live
//! Playerbots bot population and emit a JSON dataset committed to the
//! repo.
//!
//! Why this exists:
//!   - The mod has hardcoded class+spec talent templates in C++ source,
//!     but no SOAP-callable way to pick a specific spec when spawning a
//!     bot. We need our own dataset so the My Party flow can apply a
//!     user-chosen build via direct INSERT into `character_talent`.
//!   - The mod-supplied talent rolls on live world bots ARE already
//!     valid endgame builds — they spec themselves up correctly per the
//!     mod's `InitTalentsByTemplate` logic. Rather than authoring 30
//!     builds from scratch, we sample one canonical example per
//!     (class, primary_tree) from the live population.
//!
//! Output: `<repo>/guides/wow-wotlk/ui/src/lib/talent-builds.json` —
//! same directory as the other hand-curated WoW data files. Bundled
//! into the app via Vite's JSON import path.
//!
//! Invocation: `harvest_talent_builds` Tauri command, surfaced as a
//! button on the Player Bots → Settings tab. Not a user-facing
//! feature — it's a dev workflow for refreshing the dataset when the
//! mod updates its templates or we want to switch source clients.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

use crate::client_assets;

/// Minimum level we'll accept as a harvest source. Endgame Lv 80 bots
/// have full ~71-point builds; lower-level bots have partial trees
/// that aren't useful as templates.
const MIN_HARVEST_LEVEL: u32 = 80;

/// One talent row of a harvested build — exactly what we'll INSERT
/// into `character_talent` when applying the build to a target bot.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TalentRow {
    /// Spell id of the chosen rank — drops straight into
    /// `character_talent.spell`.
    spell: i32,
    /// Bitmask for `character_talent.specMask`. Always 1 in v1
    /// (primary spec slot only). Dual-spec support can extend this
    /// later by harvesting and storing per-slot.
    spec_mask: u8,
    /// Denormalized coords for human-readability + future use (we may
    /// want to swap to coord-based application across patch versions).
    tab_index: u8,
    tier: u8,
    column: u8,
    rank: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TalentBuild {
    class_id: u8,
    /// Primary tree (0/1/2). Display name resolved client-side via
    /// SPEC_NAMES.
    tab_index: u8,
    /// Tree distribution at harvest time — what the UI shows as
    /// "X/Y/Z" in the build picker.
    tree_distribution: [u32; 3],
    /// Total points spent (sum of `rank+1` across primary-spec talents).
    total_points: u32,
    /// Source bot name + guid — debug/traceability for "where did
    /// this build come from?". Not used at apply time.
    source_bot: String,
    source_bot_guid: u64,
    /// The actual talent rows to INSERT.
    talents: Vec<TalentRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TalentBuildDataset {
    version: u32,
    harvested_at: String,
    /// Source client directory the talent cache was extracted from —
    /// stamps the dataset with a provenance trail.
    harvested_from_client: String,
    builds: Vec<TalentBuild>,
}

/// Result of a harvest run, surfaced to the UI so the user can see
/// what got picked + flagged gaps where no good source was found.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvestResult {
    pub builds_emitted: usize,
    pub output_path: String,
    /// Human-readable "Class:Spec" entries that had no Lv 80 candidate
    /// with talents in the primary tree. Common for under-populated
    /// classes on small servers.
    pub skipped_combos: Vec<String>,
    /// Per-build summary for the UI: { class_id, spec_name, source_bot,
    /// total_points, tree_distribution }. Frontend formats it.
    pub summary: Vec<HarvestSummaryEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvestSummaryEntry {
    pub class_id: u8,
    pub tab_index: u8,
    pub source_bot: String,
    pub total_points: u32,
    pub tree_distribution: [u32; 3],
}

const DATASET_VERSION: u32 = 1;

#[tauri::command]
pub fn harvest_talent_builds() -> Result<HarvestResult, String> {
    // ── 1. Talent cache: spell_id → (tab_index, tier, column, rank,
    //       class_id). Required to classify each character_talent row.
    let cache = client_assets::load_talent_data().map_err(|e| {
        format!(
            "Talent cache not loaded: {e}. Run Settings → Talents → \
             Extract talents first."
        )
    })?;
    // Parse keys (stored as strings in JSON) back to integers for the
    // hashmap lookup we'll do thousands of times.
    let spell_to_info: HashMap<i32, &client_assets::TalentInfo> = cache
        .spell_to_talent
        .iter()
        .filter_map(|(k, v)| k.parse::<i32>().ok().map(|sid| (sid, v)))
        .collect();

    let container = find_database_container().ok_or_else(|| {
        "ac-database container not found — is the server running?".to_string()
    })?;

    // ── 2. Bot roster: every type=1 or type=2 bot at our min level,
    //       carrying class + name. Filter at Lv 80 so we only consider
    //       full endgame builds.
    let bots = query_bot_roster(&container)?;

    // ── 3. Talent rows for those bots, keyed by guid. Only specMask
    //       bit 0 (primary spec) rows so dual-spec bots don't blend
    //       trees.
    let bot_talents = query_bot_talents(&container)?;

    // ── 4. Profile each bot: classify talents, compute tree distribution.
    let profiles: Vec<BotProfile> = bots
        .into_iter()
        .filter(|b| b.level >= MIN_HARVEST_LEVEL)
        .filter_map(|b| {
            let rows = bot_talents.get(&b.guid)?;
            let mut tree_points = [0u32; 3];
            let mut classified: Vec<ClassifiedTalent> =
                Vec::with_capacity(rows.len());
            for &(spell, spec_mask) in rows {
                let info = spell_to_info.get(&spell)?;
                // Sanity-check the talent matches the bot's class —
                // shouldn't happen given AC's invariants but cheap to
                // guard against.
                if info.class_id != b.class_id {
                    continue;
                }
                if (info.tab_index as usize) < tree_points.len() {
                    // character_talent stores one row per *talent* (not
                    // per point), and the spell id encodes the current
                    // rank. So a tier-1 talent maxed at r5 contributes
                    // 5 points, not 1 — weight by rank+1.
                    tree_points[info.tab_index as usize] += (info.rank as u32) + 1;
                }
                classified.push(ClassifiedTalent {
                    spell,
                    spec_mask,
                    tab_index: info.tab_index,
                    tier: info.tier,
                    column: info.column,
                    rank: info.rank,
                });
            }
            let total_points: u32 = tree_points.iter().sum();
            if total_points == 0 {
                return None;
            }
            // Primary tab = max points. Ties broken by lowest tab index.
            let primary_tab = tree_points
                .iter()
                .enumerate()
                .max_by_key(|(_, &points)| points)
                .map(|(idx, _)| idx as u8)
                .unwrap_or(0);
            Some(BotProfile {
                guid: b.guid,
                name: b.name,
                class_id: b.class_id,
                level: b.level,
                tree_points,
                primary_tab,
                total_points,
                classified,
            })
        })
        .collect();

    // ── 5. Group by (class, primary_tab), pick the highest-quality
    //       profile per combo.
    let mut best: HashMap<(u8, u8), BotProfile> = HashMap::new();
    for profile in profiles {
        let key = (profile.class_id, profile.primary_tab);
        let challenger_score = quality_score(&profile);
        match best.get(&key) {
            Some(existing) if quality_score(existing) >= challenger_score => {}
            _ => {
                best.insert(key, profile);
            }
        }
    }

    // ── 6. Build the dataset. Walk the canonical 30 (class, tab) combos
    //       so we know exactly what's missing — easier than diffing two
    //       maps after the fact.
    let canonical_combos: &[(u8, u8)] = &[
        (1, 0), (1, 1), (1, 2),       // Warrior
        (2, 0), (2, 1), (2, 2),       // Paladin
        (3, 0), (3, 1), (3, 2),       // Hunter
        (4, 0), (4, 1), (4, 2),       // Rogue
        (5, 0), (5, 1), (5, 2),       // Priest
        (6, 0), (6, 1), (6, 2),       // Death Knight
        (7, 0), (7, 1), (7, 2),       // Shaman
        (8, 0), (8, 1), (8, 2),       // Mage
        (9, 0), (9, 1), (9, 2),       // Warlock
        (11, 0), (11, 1), (11, 2),    // Druid
    ];

    let mut builds: Vec<TalentBuild> = Vec::with_capacity(30);
    let mut skipped: Vec<String> = Vec::new();
    let mut summary: Vec<HarvestSummaryEntry> = Vec::new();

    for &(class_id, tab_index) in canonical_combos {
        let Some(profile) = best.get(&(class_id, tab_index)) else {
            skipped.push(format!("{}:{}", class_label(class_id), tab_index));
            continue;
        };
        // Only keep talents in the primary tree — the user's build for
        // "Holy Paladin" shouldn't drag in any Prot points the source
        // bot picked up as off-tree filler.
        let talents: Vec<TalentRow> = profile
            .classified
            .iter()
            .filter(|t| t.tab_index == tab_index)
            .map(|t| TalentRow {
                spell: t.spell,
                spec_mask: t.spec_mask,
                tab_index: t.tab_index,
                tier: t.tier,
                column: t.column,
                rank: t.rank,
            })
            .collect();
        summary.push(HarvestSummaryEntry {
            class_id,
            tab_index,
            source_bot: profile.name.clone(),
            total_points: profile.total_points,
            tree_distribution: profile.tree_points,
        });
        builds.push(TalentBuild {
            class_id,
            tab_index,
            tree_distribution: profile.tree_points,
            total_points: profile.total_points,
            source_bot: profile.name.clone(),
            source_bot_guid: profile.guid,
            talents,
        });
    }

    // ── 7. Emit JSON to the repo location.
    let harvested_from_client = cache.source_dir;
    let dataset = TalentBuildDataset {
        version: DATASET_VERSION,
        harvested_at: now_iso(),
        harvested_from_client,
        builds,
    };
    let json = serde_json::to_string_pretty(&dataset)
        .map_err(|e| format!("serialize dataset: {e}"))?;
    let path = output_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
    }
    std::fs::write(&path, json)
        .map_err(|e| format!("write {}: {}", path.display(), e))?;

    Ok(HarvestResult {
        builds_emitted: dataset.builds.len(),
        output_path: path.display().to_string(),
        skipped_combos: skipped,
        summary,
    })
}

// ── helpers ──────────────────────────────────────────────────────────

struct BotRosterEntry {
    guid: u64,
    name: String,
    class_id: u8,
    level: u32,
}

/// One classified talent row owned by a BotProfile. Flat fields
/// (rather than holding a reference to the cache's TalentInfo) so
/// the profile doesn't need a lifetime parameter.
#[derive(Clone)]
struct ClassifiedTalent {
    spell: i32,
    spec_mask: u8,
    tab_index: u8,
    tier: u8,
    column: u8,
    rank: u8,
}

struct BotProfile {
    guid: u64,
    name: String,
    class_id: u8,
    #[allow(dead_code)]
    level: u32,
    tree_points: [u32; 3],
    primary_tab: u8,
    total_points: u32,
    classified: Vec<ClassifiedTalent>,
}

/// Quality score for picking the canonical example. Heavily weighted
/// toward concentration in the primary tree and total points spent.
fn quality_score(p: &BotProfile) -> u32 {
    let primary = p.tree_points[p.primary_tab as usize];
    // Concentration: primary / total, scaled to 0-100.
    let concentration_pct = if p.total_points > 0 {
        (primary * 100) / p.total_points
    } else {
        0
    };
    // Composite: weighted average favoring concentration.
    // primary = up to ~55 on a real build, concentration up to 100.
    primary * 2 + concentration_pct
}

fn class_label(class_id: u8) -> &'static str {
    match class_id {
        1 => "Warrior",
        2 => "Paladin",
        3 => "Hunter",
        4 => "Rogue",
        5 => "Priest",
        6 => "Death Knight",
        7 => "Shaman",
        8 => "Mage",
        9 => "Warlock",
        11 => "Druid",
        _ => "Unknown",
    }
}

fn output_path() -> PathBuf {
    // CARGO_MANIFEST_DIR is the src-tauri/ directory at compile time.
    // The dataset lives one level up in src/lib/ alongside the other
    // hand-curated data files (wow-map-names, wow-zone-names, etc.).
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("src/lib/talent-builds.json"))
        .expect("CARGO_MANIFEST_DIR should have a parent")
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Bare RFC-3339-ish UTC stamp. Same format the other caches use.
    let days_since_epoch = secs / 86_400;
    let secs_today = secs % 86_400;
    let hour = secs_today / 3_600;
    let minute = (secs_today % 3_600) / 60;
    let second = secs_today % 60;
    let (year, month, day) = days_to_ymd(days_since_epoch as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

fn days_to_ymd(mut days: i64) -> (i32, u32, u32) {
    // Civil-from-days algorithm (Howard Hinnant). Days since
    // 1970-01-01 → (year, month, day).
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

fn query_bot_roster(container: &str) -> Result<Vec<BotRosterEntry>, String> {
    let out = std::process::Command::new("docker")
        .args([
            "exec",
            container,
            "mysql",
            "-uroot",
            "-ppassword",
            "-N",
            "-B",
            "-e",
            "SELECT c.guid, c.name, c.class, c.level \
             FROM acore_characters.characters c \
             JOIN acore_playerbots.playerbots_account_type t \
                 ON t.account_id = c.account \
             WHERE t.account_type IN (1, 2);",
        ])
        .output()
        .map_err(|e| format!("docker exec mysql: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "bot roster query failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut rows = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 4 {
            continue;
        }
        let (Some(guid), Some(class_id), Some(level)) = (
            parts[0].trim().parse::<u64>().ok(),
            parts[2].trim().parse::<u8>().ok(),
            parts[3].trim().parse::<u32>().ok(),
        )
        else {
            continue;
        };
        rows.push(BotRosterEntry {
            guid,
            name: parts[1].trim().to_string(),
            class_id,
            level,
        });
    }
    Ok(rows)
}

fn query_bot_talents(container: &str) -> Result<HashMap<u64, Vec<(i32, u8)>>, String> {
    let out = std::process::Command::new("docker")
        .args([
            "exec",
            container,
            "mysql",
            "-uroot",
            "-ppassword",
            "-N",
            "-B",
            "-e",
            // Only primary-spec rows (specMask & 1) so dual-spec bots
            // don't blend trees. AC's specMask values are 1, 2, or 3.
            "SELECT ct.guid, ct.spell, ct.specMask \
             FROM acore_characters.character_talent ct \
             INNER JOIN acore_characters.characters c ON c.guid = ct.guid \
             INNER JOIN acore_playerbots.playerbots_account_type t \
                 ON t.account_id = c.account \
             WHERE t.account_type IN (1, 2) AND (ct.specMask & 1) = 1;",
        ])
        .output()
        .map_err(|e| format!("docker exec mysql: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "bot talent query failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut by_guid: HashMap<u64, Vec<(i32, u8)>> = HashMap::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }
        let (Some(guid), Some(spell), Some(mask)) = (
            parts[0].trim().parse::<u64>().ok(),
            parts[1].trim().parse::<i32>().ok(),
            parts[2].trim().parse::<u8>().ok(),
        )
        else {
            continue;
        };
        by_guid.entry(guid).or_default().push((spell, mask));
    }
    Ok(by_guid)
}

fn find_database_container() -> Option<String> {
    let out = std::process::Command::new("docker")
        .args(["ps", "--format", "{{.Names}}"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find(|n| n.to_lowercase().contains("database"))
        .map(|s| s.to_string())
}
