//! SOAP client for the AzerothCore worldserver console.
//!
//! The worldserver exposes its console commands over SOAP on port 7878
//! (enabled by AC_SOAP_ENABLED=1 in the playerbots compose override).
//! Any `.dot` command available at the worldserver console can be sent
//! via `execute_command()` — `additem`, `teleport`, `account create`,
//! `npcbot spawn`, etc.
//!
//! All GM commands in the UI flow through here. The bootstrap is the
//! only exception (it predates the admin account existing, so it can't
//! authenticate to SOAP — it uses direct SQL + SRP6 instead). After
//! bootstrap, this is the universal channel.
//!
//! Auth: HTTP Basic with the ADMIN account install-wow-ui.sh creates.
//! For v1 we hardcode admin/admin since onboarding's custom-credentials
//! flow doesn't yet persist the password anywhere readable from Rust.
//! Plumbing custom creds is a follow-up (the install.json could grow
//! a hashed pointer or we add a keyring-backed store).

use std::time::Duration;

use serde::Deserialize;

/// Defaults match what `install-wow-ui.sh` creates. Override later when
/// we wire custom-credentials from the wizard through to settings.
const DEFAULT_USER: &str = "ADMIN";
const DEFAULT_PASS: &str = "admin";
const SOAP_URL: &str = "http://127.0.0.1:7878/";

#[derive(Debug, Deserialize)]
pub struct SoapCommandResult {
    /// Raw response text from the worldserver — stripped of XML
    /// envelope and entity-decoded. May contain ANSI color codes
    /// (frontends should strip them if displaying inline).
    pub output: String,
}

/// Send any worldserver console command and return its text output.
///
/// Network + auth errors come back as Err(message). A "the command ran
/// but returned an error string" still comes back as Ok with that
/// string — the worldserver doesn't always use non-200 HTTP statuses
/// for command-level failures, so the caller is responsible for
/// scanning the output for things like "syntax error" if it matters.
pub async fn execute_command(command: &str) -> Result<SoapCommandResult, String> {
    // Single-line envelope — raw strings don't process `\` line continuations
    // and AC's SOAP parser is finicky about whitespace inside opening tags.
    let envelope = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ns1="urn:AC"><SOAP-ENV:Body><ns1:executeCommand><command>{}</command></ns1:executeCommand></SOAP-ENV:Body></SOAP-ENV:Envelope>"#,
        xml_escape(command)
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("build http client: {e}"))?;

    let response = client
        .post(SOAP_URL)
        .basic_auth(DEFAULT_USER, Some(DEFAULT_PASS))
        .header("Content-Type", "application/xml")
        .header("SOAPAction", "")
        .body(envelope)
        .send()
        .await
        .map_err(|e| format!("SOAP request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("read SOAP response: {e}"))?;

    // AC returns 200 on auth-or-command failure too — we have to look
    // inside the envelope. SOAP-style fault: <faultstring>...</faultstring>.
    if let Some(fault) = extract_between(&body, "<faultstring>", "</faultstring>") {
        return Err(format!("worldserver SOAP fault: {}", decode_xml(&fault)));
    }
    if !status.is_success() {
        // Genuinely-broken HTTP response (auth failure usually).
        return Err(format!(
            "SOAP returned HTTP {} — body: {}",
            status,
            body.chars().take(200).collect::<String>()
        ));
    }
    let Some(result) = extract_between(&body, "<result>", "</result>") else {
        return Err(format!(
            "SOAP response missing <result> — body: {}",
            body.chars().take(200).collect::<String>()
        ));
    };
    Ok(SoapCommandResult { output: decode_xml(&result) })
}

/// Minimal XML escape for the command body — covers what worldserver
/// commands actually use (item names with apostrophes etc.).
fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

/// Decode the AC SOAP response entities we actually see: `&#xD;` for
/// `\r`, `&amp;` etc. Doesn't try to be a full XML parser.
fn decode_xml(s: &str) -> String {
    s.replace("&#xD;", "\r")
        .replace("&#xA;", "\n")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn extract_between(haystack: &str, start: &str, end: &str) -> Option<String> {
    let start_pos = haystack.find(start)? + start.len();
    let rest = &haystack[start_pos..];
    let end_pos = rest.find(end)?;
    Some(rest[..end_pos].to_string())
}
