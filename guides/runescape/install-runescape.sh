#!/bin/bash
# ============================================================
#  Dad's MMO Lab — RuneScape 2009 Server Installer
#  Powered by 2009scape Singleplayer Edition
#
#  https://github.com/DadsMmoLab/dads-mmo-lab
#
#  Version: 1.1.0
#
#  Usage:
#    chmod +x install-runescape.sh
#    ./install-runescape.sh
#
#  What this does:
#    1. Installs Java (JRE) — needed to run the server + client
#    2. Clones the 2009scape Singleplayer Edition for Linux
#       (includes bundled MySQL, server.jar, ms.jar, client.jar)
#    3. Initializes the bundled database (one-time setup)
#    4. Sets up the Gaming Mode launcher
#
#  Powered by:
#    2009scape Singleplayer Edition
#    github.com/2009scape/Singleplayer-Edition-Linux
#
#  ⚠️  This uses the SINGLEPLAYER edition — everything is
#  bundled together (MySQL, server, client). No Docker needed!
#  Java runs it all natively on Linux. No Proton required!
# ============================================================

INSTALLER_VERSION="1.1.0"

set -o pipefail

RST='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; WHITE='\033[1;37m'; CYAN='\033[0;36m'

RS='\033[0;33m'
RSB='\033[1;33m'

print_header() {
    clear
    echo ""
    echo -e "${RS}╔══════════════════════════════════════════════════╗${RST}"
    echo -e "${RS}║${WHITE}${BOLD}         🗡️  DAD'S MMO LAB                        ${RST}${RS}║${RST}"
    echo -e "${RS}║${WHITE}         RuneScape 2009 Installer v${INSTALLER_VERSION}          ${RST}${RS}║${RST}"
    echo -e "${RS}║${BLUE}         2009scape Singleplayer Edition           ${RST}${RS}║${RST}"
    echo -e "${RS}╚══════════════════════════════════════════════════╝${RST}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${RS}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
    echo -e "${WHITE}${BOLD} $1${RST}"
    echo -e "${RS}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
}

print_success() { echo -e "${GREEN}✅ $1${RST}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${RST}"; }
print_error()   { echo -e "${RED}❌ $1${RST}"; }
print_info()    { echo -e "${BLUE}ℹ️  $1${RST}"; }

ask_yes_no() {
    while true; do
        printf "${WHITE}$1 (y/n): ${RST}"
        read -r answer
        case $answer in
            [Yy]*) return 0 ;;
            [Nn]*) return 1 ;;
            *) echo "Please answer y or n." ;;
        esac
    done
}

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
SERVER_DIR="$HOME/runescape-server"

# ─────────────────────────────────────────
# SYSTEM CHECK
# ─────────────────────────────────────────
check_system() {
    print_step "Checking System"
    [[ "$OSTYPE" != "linux-gnu"* ]] && { print_error "Linux required."; exit 1; }
    print_success "Linux detected"

    AVAILABLE_GB=$(df -BG "$HOME" 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//' | tr -d ' ')
    if [ -n "$AVAILABLE_GB" ] && [ "$AVAILABLE_GB" -lt 5 ] 2>/dev/null; then
        print_error "Need at least 5GB free. Have ${AVAILABLE_GB}GB."
        exit 1
    fi
    print_success "Disk space OK (${AVAILABLE_GB:-unknown}GB available)"

    if ! ping -c 1 github.com &>/dev/null; then
        print_error "No internet connection."
        exit 1
    fi
    print_success "Internet OK"
}

# ─────────────────────────────────────────
# JAVA
# ─────────────────────────────────────────
install_java() {
    if command -v java &>/dev/null; then
        local ver
        ver=$(java -version 2>&1 | head -1)
        print_success "Java already installed: $ver"
        return 0
    fi

    print_info "Installing Java (needed to run the server and client)..."

    if command -v steamos-readonly &>/dev/null; then
        sudo steamos-readonly disable 2>/dev/null || true
    fi

    # Try progressively older JREs — SteamOS may not have the latest
    if sudo pacman -Sy --noconfirm jre-openjdk 2>/dev/null; then
        print_success "Java installed!"; return 0
    fi
    if sudo pacman -Sy --noconfirm jre17-openjdk 2>/dev/null; then
        print_success "Java 17 installed!"; return 0
    fi
    if sudo pacman -Sy --noconfirm jre11-openjdk 2>/dev/null; then
        print_success "Java 11 installed!"; return 0
    fi

    print_error "Java installation failed."
    print_info "Try manually: sudo pacman -Sy jre-openjdk"
    print_info "Then re-run this installer."
    exit 1
}

install_git() {
    if command -v git &>/dev/null; then
        print_success "Git already installed"; return 0
    fi
    print_info "Installing git..."
    if command -v steamos-readonly &>/dev/null; then
        sudo steamos-readonly disable 2>/dev/null || true
    fi
    sudo pacman -Sy --noconfirm git 2>/dev/null && \
        print_success "Git installed!" || \
        print_warning "Git install failed — continuing anyway"
}

install_wmctrl() {
    # wmctrl + xdotool let the launcher resize/position the Java client window
    # so it fills the Steam Deck's 1280x800 screen instead of being letterboxed.
    # Not fatal if either fails — launcher falls back to native window size.
    if command -v wmctrl &>/dev/null && command -v xdotool &>/dev/null; then
        print_success "Window-management tools already installed"; return 0
    fi
    print_info "Installing window-management tools (wmctrl, xdotool)..."
    if command -v steamos-readonly &>/dev/null; then
        sudo steamos-readonly disable 2>/dev/null || true
    fi
    sudo pacman -Sy --noconfirm wmctrl xdotool 2>/dev/null && \
        print_success "Window tools installed!" || \
        print_warning "Window tools install failed — client will use default 765x503 window"
}

# ─────────────────────────────────────────
# WELCOME
# ─────────────────────────────────────────
show_welcome() {
    print_header
    echo -e "${WHITE}Welcome to the RuneScape 2009 installer!${RST}"
    echo ""
    echo -e "${RSB}RuneScape 2009 era${RST}"
    echo -e "${WHITE}Peak RuneScape. Before the Evolution of Combat.${RST}"
    echo -e "${WHITE}The game everyone in school played.${RST}"
    echo -e "${WHITE}Mining. Fishing. Quests. The Grand Exchange.${RST}"
    echo ""
    echo -e "${RSB}What makes this special:${RST}"
    echo -e "${WHITE}  🗡️  2009scape Singleplayer — everything bundled in one repo${RST}"
    echo -e "${WHITE}  ☕ Java client runs natively — NO Proton needed!${RST}"
    echo -e "${WHITE}  📦 Bundled MySQL, management server, game server, client${RST}"
    echo -e "${WHITE}  🌍 Most globally recognized MMO name after WoW${RST}"
    echo ""
    echo -e "${YELLOW}⚠️  This is the singleplayer edition.${RST}"
    echo -e "${YELLOW}   You play solo locally on your Steam Deck.${RST}"
    echo -e "${YELLOW}   Just log in with any username to create your account!${RST}"
    echo ""
    echo -e "${BLUE}ℹ️  Install time: ~5 minutes${RST}"
    echo -e "${BLUE}ℹ️  Storage needed: ~500MB${RST}"
    echo -e "${BLUE}ℹ️  No Docker. No Proton. Pure Java on Linux.${RST}"
    echo ""
    ask_yes_no "Ready to grind? 🗡️" || { echo "Run when ready!"; exit 0; }
}

# ─────────────────────────────────────────
# STEP 1 — CLONE SINGLEPLAYER EDITION
# ─────────────────────────────────────────
clone_server() {
    print_header
    print_step "STEP 1/3 — Downloading 2009scape Singleplayer Edition"

    install_java
    install_git
    install_wmctrl

    if [ -d "$SERVER_DIR" ]; then
        print_warning "Existing RuneScape installation found at $SERVER_DIR"
        if ask_yes_no "Remove it and start fresh?"; then
            rm -rf "$SERVER_DIR"
            print_success "Old installation removed"
        else
            # Keep it — check if DB is already good
            if [ -d "$SERVER_DIR/database/data" ] && \
               [ "$(ls -A "$SERVER_DIR/database/data" 2>/dev/null)" ]; then
                print_success "Existing installation looks good — skipping clone"
                return 0
            fi
        fi
    fi

    print_info "Cloning 2009scape Singleplayer Edition..."
    print_info "The repo includes JARs via Git LFS — this may take a few minutes"
    echo ""

    # Install git-lfs if not present — the JARs are stored in LFS
    if ! git lfs version &>/dev/null 2>&1; then
        print_info "Installing git-lfs (needed for binary files in this repo)..."
        if command -v steamos-readonly &>/dev/null; then
            sudo steamos-readonly disable 2>/dev/null || true
        fi
        sudo pacman -Sy --noconfirm git-lfs 2>/dev/null || true
        git lfs install 2>/dev/null || true
    fi
    print_success "git-lfs ready"

    if ! git clone \
        https://github.com/2009scape/Singleplayer-Edition-Linux.git \
        "$SERVER_DIR"; then
        print_error "Clone failed. Check your internet connection."
        exit 1
    fi

    cd "$SERVER_DIR"

    print_info "Pulling binary files via Git LFS..."
    if ! git lfs pull 2>/dev/null; then
        print_warning "git lfs pull had issues — checking JAR sizes..."
    fi

    print_success "2009scape Singleplayer Edition cloned!"

    # Sanity-check the JARs — LFS stubs are tiny (< 1KB)
    local all_ok=true
    for jar in server.jar ms.jar client.jar; do
        if [ ! -f "$SERVER_DIR/$jar" ]; then
            print_warning "Missing: $jar"
            all_ok=false
        else
            local size
            size=$(wc -c < "$SERVER_DIR/$jar" 2>/dev/null || echo 0)
            if [ "$size" -lt 10000 ]; then
                print_warning "$jar is only ${size} bytes — likely an LFS pointer stub"
                all_ok=false
            else
                print_success "$jar OK (${size} bytes)"
            fi
        fi
    done

    if [ "$all_ok" = false ]; then
        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
        echo -e "${WHITE}${BOLD} Git LFS Download Issue — Manual Fix${RST}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
        echo ""
        echo -e "  ${WHITE}The JAR files didn't download properly via LFS.${RST}"
        echo -e "  ${WHITE}This can happen on SteamOS. Here's the fix:${RST}"
        echo ""
        echo -e "  ${CYAN}1. Go to this URL in a browser on any device:${RST}"
        echo -e "  ${GREEN}   https://github.com/2009scape/Singleplayer-Edition-Linux${RST}"
        echo -e "  ${CYAN}2. Click green Code button → Download ZIP${RST}"
        echo -e "  ${CYAN}3. Transfer the ZIP to your Steam Deck${RST}"
        echo -e "  ${CYAN}4. Extract it to: ${GREEN}~/runescape-server${RST}"
        echo -e "  ${CYAN}5. Re-run this installer${RST}"
        echo ""
        if ! ask_yes_no "Continue anyway and try to initialize the database?"; then
            print_info "Come back after downloading the ZIP manually!"
            exit 0
        fi
    fi
}

# ─────────────────────────────────────────
# STEP 2 — INITIALIZE DATABASE
# ─────────────────────────────────────────
init_database() {
    print_header
    print_step "STEP 2/3 — Initializing Game Database"

    cd "$SERVER_DIR"

    # Skip if already done
    if [ -d "$SERVER_DIR/database/data" ] && \
       [ "$(ls -A "$SERVER_DIR/database/data" 2>/dev/null)" ]; then
        print_success "Database already initialized — skipping!"
        return 0
    fi

    print_info "Setting up the bundled MySQL database..."
    print_info "This is a one-time setup — takes about 30-60 seconds."
    echo ""

    # The bundled mysqld needs its own library path
    export LD_LIBRARY_PATH="$SERVER_DIR/database/lib"

    mkdir -p "$SERVER_DIR/database/data"

    print_info "Starting bundled MySQL..."
    cd "$SERVER_DIR/database"
    bin/mysqld --console --skip-grant-tables \
        --lc-messages-dir="./share/" \
        --datadir="./data" \
        2>/tmp/rs-mysql-init.log &
    local MYSQL_PID=$!
    sleep 10

    if ! kill -0 "$MYSQL_PID" 2>/dev/null; then
        print_error "Bundled MySQL failed to start."
        print_info "Check /tmp/rs-mysql-init.log"
        print_info "This usually means the JAR/binary files are incomplete (LFS issue)."
        exit 1
    fi
    print_success "MySQL running (PID $MYSQL_PID)"

    print_info "Creating game database..."
    cd "$SERVER_DIR"
    echo | database/bin/mysql -u root \
        -e "CREATE DATABASE IF NOT EXISTS global;" 2>/dev/null && \
        print_success "Database 'global' created!" || \
        print_warning "Database create had output — may already exist"

    print_info "Importing game data (world, NPCs, quests)..."
    echo | database/bin/mysql -u root \
        global < data/global.sql 2>/dev/null && \
        print_success "Game data imported!" || \
        print_warning "Import had output — check /tmp/rs-mysql-init.log if issues arise"

    sleep 3

    print_info "Copying client cache files..."
    mkdir -p "$HOME/.runite_rs/runescape"
    if cp -f "$SERVER_DIR/data/cache/"* "$HOME/.runite_rs/runescape/" 2>/dev/null; then
        print_success "Cache files copied!"
    else
        print_warning "Cache copy had issues — client may prompt to re-cache on first run"
    fi

    # Clean shutdown of init MySQL
    kill "$MYSQL_PID" 2>/dev/null || true
    sleep 3
    pkill -f "mysqld" 2>/dev/null || true

    print_success "Database initialized! 🗡️"
    echo ""
    echo -e "${GREEN}  You never have to do this again — the DB is ready.${RST}"
}

# ─────────────────────────────────────────
# STEP 3 — GAMING MODE LAUNCHER
# ─────────────────────────────────────────
setup_launcher() {
    print_header
    print_step "STEP 3/3 — Setting Up Gaming Mode Launcher"

    cat > "$HOME/runescape-launcher.sh" << LAUNCHER
#!/bin/bash
# Dad's MMO Lab — RuneScape 2009 Launcher v${INSTALLER_VERSION}
export PATH="/usr/bin:/usr/local/bin:/bin:\$PATH"
unset LD_PRELOAD LD_LIBRARY_PATH
LOGFILE="/tmp/rs-launch.log"
> "\$LOGFILE"

SERVER_DIR="${SERVER_DIR}"

# ── Trap: always clean up on exit, even if interrupted ───────
# This is the critical hardening from session v1.0.0: previous
# launcher could leave orphaned mysqld/java processes that held
# socket lock files, causing next launch to fail silently.
cleanup() {
    echo ""
    echo "  Shutting down..."
    # SIGTERM first (graceful), then SIGKILL anything still alive.
    pkill -TERM -f "\$SERVER_DIR/client.jar"   2>/dev/null || true
    pkill -TERM -f "\$SERVER_DIR/server.jar"   2>/dev/null || true
    pkill -TERM -f "\$SERVER_DIR/ms.jar"       2>/dev/null || true
    pkill -TERM -f "\$SERVER_DIR/database/bin/mysqld" 2>/dev/null || true
    sleep 3
    pkill -KILL -f "\$SERVER_DIR/client.jar"   2>/dev/null || true
    pkill -KILL -f "\$SERVER_DIR/server.jar"   2>/dev/null || true
    pkill -KILL -f "\$SERVER_DIR/ms.jar"       2>/dev/null || true
    pkill -KILL -f "\$SERVER_DIR/database/bin/mysqld" 2>/dev/null || true
    # Remove stale socket/pid/lock files so next launch is clean.
    rm -f "\$SERVER_DIR/database/data/"*.pid 2>/dev/null || true
    rm -f "\$SERVER_DIR/database/data/"*.sock* 2>/dev/null || true
    rm -f /tmp/mysql.sock /tmp/mysql.sock.lock 2>/dev/null || true
    echo "  ✅ Done! youtube.com/@DadsMmoLab"
}
trap cleanup EXIT INT TERM

clear
echo ""
echo "  🗡️  DAD'S MMO LAB — RuneScape 2009"
echo "  ══════════════════════════════════════════"
echo "  2009scape Singleplayer Edition"
echo "  ══════════════════════════════════════════"
echo ""

cd "\$SERVER_DIR" || {
    echo "  ❌ Server dir not found: \$SERVER_DIR"
    echo "  Run install-runescape.sh first!"
    sleep 10; exit 1
}

# Bundled MySQL needs this
export LD_LIBRARY_PATH="\$SERVER_DIR/database/lib"

# ── Pre-flight cleanup ───────────────────────────────────────
# Match the full bundled-mysqld path so we don't accidentally kill
# the system mysqld if one is running. Match each JAR by full path
# too, so we don't kill unrelated Java apps.
echo "  Cleaning up any leftover processes..."
pkill -TERM -f "\$SERVER_DIR/database/bin/mysqld" 2>/dev/null || true
pkill -TERM -f "\$SERVER_DIR/ms.jar"       2>/dev/null || true
pkill -TERM -f "\$SERVER_DIR/server.jar"   2>/dev/null || true
pkill -TERM -f "\$SERVER_DIR/client.jar"   2>/dev/null || true
sleep 2
pkill -KILL -f "\$SERVER_DIR/database/bin/mysqld" 2>/dev/null || true
pkill -KILL -f "\$SERVER_DIR/ms.jar"       2>/dev/null || true
pkill -KILL -f "\$SERVER_DIR/server.jar"   2>/dev/null || true
pkill -KILL -f "\$SERVER_DIR/client.jar"   2>/dev/null || true
sleep 1
# Stale socket/lock files from a crashed previous run will prevent
# mysqld from starting. Remove them.
rm -f "\$SERVER_DIR/database/data/"*.pid 2>/dev/null || true
rm -f "\$SERVER_DIR/database/data/"*.sock* 2>/dev/null || true
rm -f /tmp/mysql.sock /tmp/mysql.sock.lock 2>/dev/null || true

# ── Start bundled MySQL ──────────────────────────────────────
echo "  Starting database..."
cd "\$SERVER_DIR/database"
bin/mysqld --console --skip-grant-tables \\
    --lc-messages-dir="./share/" \\
    --datadir="./data" \\
    >> "\$LOGFILE" 2>&1 &
MYSQL_PID=\$!

# ── Real health check — don't just trust kill -0 on a zombie ──
# Try to actually open a connection. mysqld reports "ready" via the
# socket being acceptable, not via the process being alive.
echo "  Waiting for database to accept connections..."
DB_READY=false
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if "\$SERVER_DIR/database/bin/mysql" -u root \\
        -e "SELECT 1" >/dev/null 2>&1; then
        DB_READY=true
        break
    fi
    # Also fail fast if the process actually died
    if ! kill -0 \$MYSQL_PID 2>/dev/null; then
        echo "  ❌ Database process died during startup!"
        echo "  Last 30 lines of \$LOGFILE:"
        tail -30 "\$LOGFILE"
        echo ""
        echo "  Common cause: stale lock file. Try:"
        echo "    rm -f \$SERVER_DIR/database/data/*.pid"
        echo "    rm -f \$SERVER_DIR/database/data/*.sock*"
        sleep 15
        exit 1
    fi
    sleep 2
done

if [ "\$DB_READY" != "true" ]; then
    echo "  ❌ Database did not accept connections within 30 seconds!"
    echo "  Last 30 lines of \$LOGFILE:"
    tail -30 "\$LOGFILE"
    sleep 15
    exit 1
fi
echo "  Database ready!"

# ── Start management server ──────────────────────────────────
echo "  Starting management server..."
cd "\$SERVER_DIR"
java -jar ms.jar >> "\$LOGFILE" 2>&1 &
MS_PID=\$!
sleep 5

if ! kill -0 \$MS_PID 2>/dev/null; then
    echo "  ❌ Management server failed to start!"
    echo "  Last 20 lines of \$LOGFILE:"
    tail -20 "\$LOGFILE"
    sleep 15
    exit 1
fi

# ── Start game server ────────────────────────────────────────
echo "  Starting game server..."
java -jar server.jar >> "\$LOGFILE" 2>&1 &
SERVER_PID=\$!

echo "  Waiting for Gielinor to open..."
# Poll the log for "ready"-ish signals rather than blindly waiting 20s.
SERVER_READY=false
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do
    if grep -qiE "listening|ready|started|game world is open|world is now online" \\
        "\$LOGFILE" 2>/dev/null; then
        SERVER_READY=true
        break
    fi
    if ! kill -0 \$SERVER_PID 2>/dev/null; then
        echo "  ❌ Game server died during startup!"
        tail -30 "\$LOGFILE"
        sleep 15
        exit 1
    fi
    sleep 1
done
# Even without an explicit signal, give it a few more seconds for sockets to bind
sleep 3

echo ""
echo "  ══════════════════════════════════════════"
echo "  ✅ GIELINOR IS OPEN! 🗡️"
echo "  ══════════════════════════════════════════"
echo ""
echo "  ⚠️  IMPORTANT:"
echo "     • Click the LEFT button (Standard Detail / SD)"
echo "     • DO NOT click HD — it doesn't work on this client"
echo "       and will cause 'error connecting to server'"
echo ""
echo "     If you're already stuck on HD: in-game, go to"
echo "     Settings → Graphics → switch back to Standard."
echo ""
echo "  Launching client now..."
echo "  Log in with any username + password to play!"
echo "  (First login creates your account automatically)"
echo ""

# ── Launch client ────────────────────────────────────────────
java -jar "\$SERVER_DIR/client.jar" >> "\$LOGFILE" 2>&1 &
CLIENT_PID=\$!

# ── Resize client window to fit Steam Deck screen ────────────
# The Java client opens at 765x503 by default — letterboxed on the
# Deck's 1280x800 screen. wmctrl can stretch it to native, but
# we have to wait for the window to actually exist first.
if command -v wmctrl &>/dev/null && command -v xdotool &>/dev/null; then
    echo "  Waiting for client window..."
    for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
        # Look for any window with "RuneScape", "2009scape", or "Client" in title
        WIN_ID=\$(wmctrl -l 2>/dev/null | grep -iE "runescape|2009scape|jagex" | \\
                 head -1 | awk '{print \$1}')
        if [ -n "\$WIN_ID" ]; then
            # Stretch to 1280x800 at position 0,0 — Steam Deck native.
            # First arg: 0=normal, 2=maximize/etc; gravity 0=default.
            wmctrl -i -r "\$WIN_ID" -e "0,0,0,1280,800" 2>/dev/null || true
            echo "  Client window resized to Steam Deck native (1280x800)"
            break
        fi
        sleep 2
    done
fi

# Block on the client process (foreground behavior of original launcher)
wait \$CLIENT_PID 2>/dev/null

# Trap will handle cleanup on exit.
LAUNCHER

    chmod +x "$HOME/runescape-launcher.sh"

    cat > "$SERVER_DIR/MY_SERVER.txt" << INFO
====================================
  Dad's MMO Lab — RuneScape 2009
  2009scape Singleplayer Edition
====================================

NO Docker. NO Proton. Pure Java.
Everything runs locally on your Deck:
  - Bundled MySQL database
  - Management server (ms.jar)
  - Game server (server.jar)
  - Java client (client.jar)

====================================
  Playing
====================================
Launch: bash ~/runescape-launcher.sh

At the login screen:
  Type any username + any password
  Your account is created automatically!

⚠️  IMPORTANT — DO NOT CLICK HD:
  The legacy 2009scape client doesn't support HD scaling
  properly on non-experimental builds. Clicking HD causes
  "error connecting to server" because the HD assets aren't
  bundled and the client tries to fetch them.

  Always click the LEFT button (Standard Detail / SD).

  If you accidentally chose HD and the client remembers it:
  in-game go to Settings → Graphics → Display mode
  and switch back to "Fixed" or "Resizable" (standard detail).

To get admin rights in-game:
  cd ${SERVER_DIR}
  ./run-linux.sh  (pick option 4)
  Enter your username

====================================
  Gaming Mode Setup
====================================
Add konsole to Steam:
  Target:  /usr/bin/konsole
  Options: --hold -e bash ~/runescape-launcher.sh
  Proton:  OFF (Java is Linux-native!)

====================================
  Window Resolution
====================================
The launcher auto-resizes the client window to 1280x800
(Steam Deck native) using wmctrl. If you don't have wmctrl
installed it'll use the default 765x503 window with black bars.

For a larger play area within the window, in-game go to:
  Settings → Graphics → Display mode → Resizable

====================================
  Troubleshooting
====================================
"Launcher closes immediately, Java never opens":
  This usually means a previous run left mysqld holding
  the socket lock file. The launcher's auto-cleanup should
  catch this, but if not, run these once manually:
    pkill -9 -f mysqld
    rm -f ${SERVER_DIR}/database/data/*.pid
    rm -f ${SERVER_DIR}/database/data/*.sock*

"Error connecting to server" at login:
  You clicked HD. Restart the launcher and click SD this time.
  If preferences saved your HD choice, delete:
    ~/.runite_rs/preferences.json   (if it exists)
  and try again.

====================================
  Manual Start (if launcher fails)
====================================
  cd ${SERVER_DIR}
  ./run-linux.sh  (option 1 = run game)

Logs: /tmp/rs-launch.log
====================================
INFO

    print_success "Launcher ready: ~/runescape-launcher.sh"
    print_success "Info saved: $SERVER_DIR/MY_SERVER.txt"
}

show_completion() {
    echo ""
    echo -e "${RSB}╔══════════════════════════════════════════════════╗${RST}"
    echo -e "${RSB}║   🗡️  GIELINOR IS OPEN!                          ║${RST}"
    echo -e "${RSB}╚══════════════════════════════════════════════════╝${RST}"
    echo ""
    echo -e "  ${WHITE}Server:${RST}  ${RS}2009scape Singleplayer Edition${RST}"
    echo -e "  ${WHITE}Client:${RST}  ${RS}Java — Linux native, NO Proton!${RST}"
    echo -e "  ${WHITE}Login:${RST}   ${RS}Any username + password = auto account creation${RST}"
    echo ""
    echo -e "${RS}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
    echo -e "${WHITE}${BOLD} Gaming Mode Setup${RST}"
    echo -e "${RS}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
    echo ""
    echo -e "  1. Open Steam in Desktop Mode"
    echo -e "  2. Click ${CYAN}Games${RST} → ${CYAN}Add a Non-Steam Game${RST}"
    echo -e "  3. Browse to ${CYAN}/usr/bin/${RST} → select ${CYAN}konsole${RST}"
    echo -e "  4. Right-click → Properties → rename: ${GREEN}RuneScape 2009${RST}"
    echo -e "  5. Set Launch Options to:"
    echo ""
    echo -e "  ${GREEN}--hold -e bash ~/runescape-launcher.sh${RST}"
    echo ""
    echo -e "  6. ${RED}Do NOT enable Proton${RST} — Java runs natively!"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
    echo -e "${WHITE}  📺 youtube.com/@DadsMmoLab${RST}"
    echo -e "${WHITE}  📦 github.com/DadsMmoLab/dads-mmo-lab${RST}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
    echo ""
    echo -e "${RSB}Welcome back to Gielinor. 🗡️${RST}"
    echo ""

    echo -e "${WHITE}Launch RuneScape now to test it? (y/n): ${RST}"
    read -r launch_now
    if [[ "$launch_now" =~ ^[Yy]$ ]]; then
        print_info "Launching 2009scape..."
        bash "$HOME/runescape-launcher.sh"
    fi
}

check_system
show_welcome
clone_server
init_database
setup_launcher
show_completion
