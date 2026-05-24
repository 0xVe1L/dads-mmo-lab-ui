//! Playerbots browser — queries `acore_playerbots.playerbots_account_type`
//! joined to `acore_characters.characters` to enumerate the two bot
//! populations the mod manages:
//!
//!   - `account_type = 1` (RNDBot): the random bots living in the world.
//!     ~200 on a stock install, roaming level-appropriate zones.
//!   - `account_type = 2` (AddClass): the pre-leveled invite pool. 500
//!     characters split into "ready to invite" slots, never roam, just
//!     wait to be summoned into a player's party.
//!
//! Both populations are real `characters` rows — no separate bot table —
//! so we read everything (guid, name, class/race/gender/level, current
//! map+zone) from the standard char schema and just use the join to
//! distinguish the two types.
//!
//! Phase 1 of the Bots UI is read-only: this command feeds the browser.
//! Actions (invite-to-party, summon-to-me, refresh, levelup, etc.) flow
//! through SOAP and land in their own commands once the browser is
//! exercised and we know the UX we want.

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlayerbotSummary {
    pub guid: u64,
    pub name: String,
    pub race: u32,
    pub class: u32,
    /// 0 = male, 1 = female. Mirrors the `characters.gender` column.
    pub gender: u32,
    pub level: u32,
    /// Map id (0 EK, 1 Kalimdor, 530 Outland, 571 Northrend, etc.) plus
    /// zone id (lookup table in DBC — surfaced raw for now; the UI can
    /// resolve to names later).
    pub map: u32,
    pub zone: u32,
    pub account: u64,
    /// 1 = random bot (world-roaming), 2 = addclass (invite pool).
    pub bot_type: u32,
}

#[tauri::command]
pub fn list_playerbots() -> Result<Vec<PlayerbotSummary>, String> {
    let container = find_database_container().ok_or_else(|| {
        "ac-database container not found — is the server running?".to_string()
    })?;

    // Single query for both populations. The UI tabs filter client-side
    // by bot_type — 700 rows is well within "fits in memory" territory
    // and one query beats two round-trips.
    let out = std::process::Command::new("docker")
        .args([
            "exec",
            &container,
            "mysql",
            "-uroot",
            "-ppassword",
            "-N",
            "-B",
            "-e",
            "SELECT c.guid, c.name, c.race, c.class, c.gender, c.level, \
                    c.map, c.zone, c.account, t.account_type \
             FROM acore_characters.characters c \
             JOIN acore_playerbots.playerbots_account_type t \
                 ON t.account_id = c.account \
             WHERE t.account_type IN (1, 2) \
             ORDER BY t.account_type, c.level DESC, c.name;",
        ])
        .output()
        .map_err(|e| format!("docker exec mysql: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "mysql query failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut rows = Vec::with_capacity(700);
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 10 {
            continue;
        }
        let parse_u64 = |s: &str| s.trim().parse::<u64>().ok();
        let parse_u32 = |s: &str| s.trim().parse::<u32>().ok();
        let (
            Some(guid),
            Some(race),
            Some(class),
            Some(gender),
            Some(level),
            Some(map),
            Some(zone),
            Some(account),
            Some(bot_type),
        ) = (
            parse_u64(parts[0]),
            parse_u32(parts[2]),
            parse_u32(parts[3]),
            parse_u32(parts[4]),
            parse_u32(parts[5]),
            parse_u32(parts[6]),
            parse_u32(parts[7]),
            parse_u64(parts[8]),
            parse_u32(parts[9]),
        )
        else {
            continue;
        };
        rows.push(PlayerbotSummary {
            guid,
            name: parts[1].trim().to_string(),
            race,
            class,
            gender,
            level,
            map,
            zone,
            account,
            bot_type,
        });
    }
    Ok(rows)
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
