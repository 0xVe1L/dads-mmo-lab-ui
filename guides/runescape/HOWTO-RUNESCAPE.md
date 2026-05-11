# ⚔️ RuneScape 2009 — Setup Guide
**Dad's MMO Lab** · youtube.com/@DadsMmoLab · github.com/DadsMmoLab/dads-mmo-lab

---

## What This Guide Covers

- Installing the server
- Getting the client (it's included!)
- Connecting the client to your local server
- Creating your account
- Starting and stopping the server
- What to do after a SteamOS update

---

## ⚠️ Client Version — Critical

**The 2009scape client is included with the server. You do not need to find a separate client.**

2009scape ships its own Java-based client that is pre-configured and maintained by the project. This is one of the easiest setups in Dad's MMO Lab.

- ✅ 2009scape official client (bundled) — **correct, Linux native via Java**
- ❌ Modern RuneScape client (Jagex) — **completely different game**
- ❌ Old School RuneScape client — **different era, won't connect**
- ❌ Any other RS client — **won't work with 2009scape server**

> **Why Java?** RuneScape 2009 era was a Java applet game. The 2009scape client is Java-based and runs on any platform with a JRE — including your Steam Deck, natively, with no Proton.

---

## Step 1 — Run the Installer

Open a terminal in Desktop Mode (Konsole) and run:

```bash
chmod +x install-runescape.sh
./install-runescape.sh
```

The installer:
- Installs Docker and Java (JRE)
- Pulls the 2009scape Docker image
- Sets up PostgreSQL database
- Downloads the 2009scape Java client
- Configures everything to connect to `127.0.0.1`

Installation takes about 10-15 minutes.

---

## Step 2 — The Client is Already Configured

Unlike most games in Dad's MMO Lab, **you don't need to manually edit any config files.**

The 2009scape client the installer downloads is pre-configured to connect to `127.0.0.1`. Just launch it.

### Where the client lives:

```bash
ls ~/runescape-server/client/
```

You should see a `.jar` file or a launch script.

### Launching the client manually:

```bash
cd ~/runescape-server/client
java -jar 2009scape-client.jar
```

Or use the launcher script created by the installer.

---

## Step 3 — Create Your Account

2009scape uses in-game account creation.

1. Make sure the server is running (Step 5)
2. Launch the 2009scape client
3. At the login screen, click **Create Account** or simply type a new username and password
4. The server creates the account automatically on first login

> **No email required.** Just pick a username and password.

---

## Step 4 — Add to Steam (Gaming Mode)

The Java client runs natively — **no Proton needed.**

### Add the client launcher:
1. Open Steam → **Games** → **Add a Non-Steam Game**
2. Browse to `/usr/bin/` → select `java`
3. Rename it: `RuneScape 2009`
4. Launch Options:
```
-jar /home/deck/runescape-server/client/2009scape-client.jar
```
5. **Do NOT enable Proton**

### Add the server launcher:
1. Add `konsole` to Steam separately
2. Rename: `RS2009 Server`
3. Launch Options:
```
--hold -e bash ~/runescape-launcher.sh
```

---

## Step 5 — Starting the Server

### From Desktop Mode:
```bash
cd ~/runescape-server
docker compose up -d
```

### From Gaming Mode:
Launch **RS2009 Server** from your Steam library. Wait for:
```
✅ GIELINOR IS READY!
```

---

## Step 6 — Stopping the Server

```bash
cd ~/runescape-server
docker compose down
```

---

## After a SteamOS Update

Java (installed via pacman) will be wiped. Re-run the installer:

```bash
./install-runescape.sh
```

Character data lives in Docker volumes (PostgreSQL) and is safe.

---

## Useful Commands

| What | Command |
|------|---------|
| Start server | `cd ~/runescape-server && docker compose up -d` |
| Stop server | `cd ~/runescape-server && docker compose down` |
| Server logs | `docker logs -f 2009scape` |
| DB logs | `docker logs -f rs-postgres` |
| Launch client | `cd ~/runescape-server/client && java -jar 2009scape-client.jar` |

---

## Ports Used

| Port | Purpose |
|------|---------|
| 43594 | Game server |
| 5432 | PostgreSQL (internal) |

---

## Troubleshooting

**Client says "Error connecting to server"**
- Make sure the server is running: `docker ps`
- Check logs: `docker logs 2009scape | tail -20`
- The server may take 1-2 minutes to fully start

**"Java not found" when launching client**
- Re-run the installer to reinstall Java
- Or manually: `sudo pacman -Sy jre-openjdk`

**Blank login screen / client won't load**
- Make sure you're using the 2009scape client, not any other RS client
- Try: `java -version` to confirm Java is working

**Server starts but world is empty**
- 2009scape populates NPCs on zone load — walk around a bit
- Check server logs for any initialization errors

---

*Dad's MMO Lab · youtube.com/@DadsMmoLab · ko-fi.com/dadsmmolab*
