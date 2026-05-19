//! Teleport commands for the Teleport page.
//!
//! Two main capabilities:
//!  - List the worldserver's `game_tele` table (1989 named locations
//!    that ship with AC — Stormwind, Orgrimmar, every instance entry,
//!    etc.). Used to populate the location browser.
//!  - Teleport a named character to a named location via SOAP
//!    (`.tele name <character> <location>`). For coords-only teleports
//!    we add a one-shot entry to `game_tele`, tele the character, and
//!    delete it again.
//!
//! Players must be ONLINE for the SOAP command to take effect. The UI
//! is responsible for surfacing the "log your character in first"
//! prerequisite — the Rust side just reports whatever the worldserver
//! responded with.

use serde::{Deserialize, Serialize};

use crate::soap;

/// One row of `game_tele`. We expose the continent / map id raw so the
/// frontend can do its own grouping (Eastern Kingdoms / Kalimdor /
/// Outland / Northrend / Dungeons & Raids).
#[derive(Debug, Serialize, Clone)]
pub struct TeleportLocation {
    pub id: u32,
    pub name: String,
    pub map: u32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Result of a teleport attempt. `output` is the worldserver's raw
/// reply so the UI can show "Player not found" or "Teleporting Foo to
/// Stormwind" verbatim.
#[derive(Debug, Serialize)]
pub struct TeleportResult {
    pub output: String,
}

#[tauri::command]
pub fn list_teleport_locations() -> Result<Vec<TeleportLocation>, String> {
    let container = find_database_container()
        .ok_or_else(|| "ac-database container not found — is the server running?".to_string())?;
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
            "SELECT id, name, map, position_x, position_y, position_z \
             FROM acore_world.game_tele \
             ORDER BY map, name;",
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
    let mut rows = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 6 {
            continue;
        }
        let Some(id) = parts[0].trim().parse::<u32>().ok() else {
            continue;
        };
        let Some(map) = parts[2].trim().parse::<u32>().ok() else {
            continue;
        };
        let Some(x) = parts[3].trim().parse::<f64>().ok() else {
            continue;
        };
        let Some(y) = parts[4].trim().parse::<f64>().ok() else {
            continue;
        };
        let Some(z) = parts[5].trim().parse::<f64>().ok() else {
            continue;
        };
        rows.push(TeleportLocation {
            id,
            name: parts[1].trim().to_string(),
            map,
            x,
            y,
            z,
        });
    }
    Ok(rows)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeleportToLocationArgs {
    pub character_name: String,
    pub location_name: String,
}

#[tauri::command]
pub async fn teleport_character_to_location(
    args: TeleportToLocationArgs,
) -> Result<TeleportResult, String> {
    let cmd = format!(
        ".tele name {} {}",
        quote_if_needed(&args.character_name),
        quote_if_needed(&args.location_name)
    );
    let result = soap::execute_command(&cmd).await?;
    Ok(TeleportResult { output: result.output })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeleportToCoordsArgs {
    pub character_name: String,
    pub map: u32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Custom-coords teleport. AC has no single command for "tele a named
/// player to coordinates" — `.tele name` only takes a location name.
/// Workaround: add a temporary entry to `game_tele` via SOAP, tele the
/// player to that name, then delete it. Marker prefix `dml_tmp_` makes
/// orphan rows easy to spot if a crash interrupts cleanup.
#[tauri::command]
pub async fn teleport_character_to_coords(
    args: TeleportToCoordsArgs,
) -> Result<TeleportResult, String> {
    // Per-call random suffix avoids collisions if two teleports race.
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    let temp_name = format!("dml_tmp_{}", suffix);

    let add_cmd = format!(
        ".tele add {} {} {} {} 0 {}",
        temp_name, args.x, args.y, args.z, args.map
    );
    // `.tele add` would add the GM's CURRENT pos — but SOAP has no
    // selected GM, so this won't behave the way the in-game command
    // does. Instead we go straight to SQL via docker exec.
    let _ = add_cmd; // kept for documentation; we use SQL below.

    let container = find_database_container()
        .ok_or_else(|| "ac-database container not found".to_string())?;
    // Pick an id at the top of the existing range — game_tele's id is
    // not auto-increment.
    let max_id = mysql_scalar_u32(
        &container,
        "SELECT COALESCE(MAX(id), 0) FROM acore_world.game_tele;",
    )?;
    let new_id = max_id + 1;
    let insert_sql = format!(
        "INSERT INTO acore_world.game_tele (id, position_x, position_y, position_z, orientation, map, name) \
         VALUES ({id}, {x}, {y}, {z}, 0, {map}, '{name}');",
        id = new_id,
        x = args.x,
        y = args.y,
        z = args.z,
        map = args.map,
        name = temp_name
    );
    mysql_exec(&container, &insert_sql)?;

    // Tell the worldserver to reload its cached teleport list so the
    // newly-inserted row is recognized by `.tele name`.
    let _ = soap::execute_command(".reload game_tele").await;

    let tele_cmd = format!(
        ".tele name {} {}",
        quote_if_needed(&args.character_name),
        temp_name
    );
    let tele_result = soap::execute_command(&tele_cmd).await;

    // Cleanup regardless of whether the tele succeeded — leaving the
    // temp row behind would clutter the location list.
    let delete_sql = format!(
        "DELETE FROM acore_world.game_tele WHERE name = '{}';",
        temp_name
    );
    let _ = mysql_exec(&container, &delete_sql);
    let _ = soap::execute_command(".reload game_tele").await;

    match tele_result {
        Ok(r) => Ok(TeleportResult { output: r.output }),
        Err(e) => Err(e),
    }
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

fn mysql_exec(container: &str, sql: &str) -> Result<(), String> {
    let out = std::process::Command::new("docker")
        .args(["exec", container, "mysql", "-uroot", "-ppassword", "-e", sql])
        .output()
        .map_err(|e| format!("docker exec mysql: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "mysql exec failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

fn mysql_scalar_u32(container: &str, sql: &str) -> Result<u32, String> {
    let out = std::process::Command::new("docker")
        .args([
            "exec", container, "mysql", "-uroot", "-ppassword", "-N", "-B", "-e", sql,
        ])
        .output()
        .map_err(|e| format!("docker exec mysql: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "mysql scalar failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.trim()
        .parse::<u32>()
        .map_err(|e| format!("parse scalar '{}': {}", text.trim(), e))
}

/// Quote a value for the AC command parser if it contains whitespace.
/// AC's parser splits on whitespace; multi-word names need quoting.
fn quote_if_needed(s: &str) -> String {
    if s.chars().any(|c| c.is_whitespace()) {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}
