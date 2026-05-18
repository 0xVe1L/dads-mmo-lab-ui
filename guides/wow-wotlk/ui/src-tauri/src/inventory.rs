//! Inventory commands for the Inventory page.
//!
//! Two operations the page needs:
//!  - `search_items` — fuzzy-match the worldserver's `item_template`
//!    table by name. Used to populate the browse / search panel.
//!  - `send_item_to_character` — deliver an item to a character's
//!    in-game mail via SOAP `.send items` (verified working without an
//!    in-world session, since the GM-target context isn't needed).
//!
//! Why mail rather than `.additem`: `.additem` requires a SELECTED
//! in-world target, which SOAP doesn't have. `.send items` only needs
//! the recipient's name and works whether the character is online or
//! offline.

use serde::{Deserialize, Serialize};

use crate::soap;

/// Pared-down `item_template` projection. We expose the fields the UI
/// actually displays — leaving the 100+ other columns in the table
/// alone. The icon name isn't in the SQL schema (it lives in the
/// `ItemDisplayInfo` DBC) so the frontend falls back to a Wowhead link
/// for the visual.
#[derive(Debug, Serialize, Clone)]
pub struct ItemSummary {
    pub entry: u32,
    pub name: String,
    /// 0..7 — Poor / Common / Uncommon / Rare / Epic / Legendary /
    /// Artifact / Heirloom.
    pub quality: u32,
    /// AC item `class` (Weapon / Armor / Container / Consumable / ...).
    pub class: u32,
    /// AC item `subclass` — context dependent on `class`.
    pub subclass: u32,
    pub inventory_type: u32,
    pub item_level: u32,
    pub required_level: u32,
    pub display_id: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchItemsArgs {
    pub query: String,
    /// 0 means "all" — match the AC item.class enum otherwise.
    pub class: Option<u32>,
    pub quality_min: Option<u32>,
    pub limit: Option<u32>,
}

/// Search by name (case-insensitive LIKE), optionally filtered by class
/// and minimum quality. Capped at 100 results by default to keep the
/// table snappy; raise via `limit` from the UI if needed.
#[tauri::command]
pub fn search_items(args: SearchItemsArgs) -> Result<Vec<ItemSummary>, String> {
    let container = find_database_container()
        .ok_or_else(|| "ac-database container not found — is the server running?".to_string())?;

    let limit = args.limit.unwrap_or(100).min(500);
    let query_sanitized = args.query.replace('\'', "''");
    let mut where_clauses: Vec<String> = Vec::new();
    if !query_sanitized.is_empty() {
        where_clauses.push(format!("name LIKE '%{}%'", query_sanitized));
    }
    if let Some(c) = args.class {
        if c > 0 {
            where_clauses.push(format!("class = {}", c));
        }
    }
    if let Some(qmin) = args.quality_min {
        where_clauses.push(format!("Quality >= {}", qmin));
    }
    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let sql = format!(
        "SELECT entry, name, Quality, class, subclass, InventoryType, ItemLevel, RequiredLevel, displayid \
         FROM acore_world.item_template \
         {where_sql} \
         ORDER BY Quality DESC, ItemLevel DESC, name ASC \
         LIMIT {limit};"
    );

    let out = std::process::Command::new("docker")
        .args(["exec", &container, "mysql", "-uroot", "-ppassword", "-N", "-B", "-e", &sql])
        .output()
        .map_err(|e| format!("docker exec mysql: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "mysql query failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut rows = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 9 {
            continue;
        }
        let parse_u32 = |s: &str| s.trim().parse::<u32>().ok();
        let (Some(entry), Some(quality), Some(class), Some(subclass), Some(inv), Some(ilvl), Some(rlvl), Some(disp)) = (
            parse_u32(parts[0]),
            parse_u32(parts[2]),
            parse_u32(parts[3]),
            parse_u32(parts[4]),
            parse_u32(parts[5]),
            parse_u32(parts[6]),
            parse_u32(parts[7]),
            parse_u32(parts[8]),
        ) else {
            continue;
        };
        rows.push(ItemSummary {
            entry,
            name: parts[1].trim().to_string(),
            quality,
            class,
            subclass,
            inventory_type: inv,
            item_level: ilvl,
            required_level: rlvl,
            display_id: disp,
        });
    }
    Ok(rows)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendItemArgs {
    pub character_name: String,
    pub item_id: u32,
    pub count: u32,
    pub subject: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SendItemResult {
    pub output: String,
}

/// Send an item to a character via in-game mail. The character can be
/// online or offline. AC's `.send items` syntax:
///   .send items "Name" "Subject" "Body" itemid:count
/// We provide friendly defaults for subject/body so the user only has
/// to pick a recipient + item.
#[tauri::command]
pub async fn send_item_to_character(args: SendItemArgs) -> Result<SendItemResult, String> {
    if args.count == 0 {
        return Err("count must be >= 1".into());
    }
    let subject = args.subject.unwrap_or_else(|| "A gift".to_string());
    let body = args
        .body
        .unwrap_or_else(|| "Sent from Dad's MMO Lab.".to_string());
    let cmd = format!(
        ".send items {recipient} \"{subject}\" \"{body}\" {item}:{count}",
        recipient = quote_if_needed(&args.character_name),
        subject = sanitize_quoted(&subject),
        body = sanitize_quoted(&body),
        item = args.item_id,
        count = args.count,
    );
    let r = soap::execute_command(&cmd).await?;
    Ok(SendItemResult { output: r.output })
}

// ── helpers ─────────────────────────────────────────────────────────

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

fn quote_if_needed(s: &str) -> String {
    if s.chars().any(|c| c.is_whitespace()) {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}

/// Strip embedded `"` so a user-supplied subject can't break the quoted
/// command argument. AC's command parser doesn't honor `\"`, so the
/// safest move is to replace them with a single quote.
fn sanitize_quoted(s: &str) -> String {
    s.replace('"', "'")
}
