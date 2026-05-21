#!/bin/bash
# ============================================================
#  Dad's MMO Lab — Build-host setup for the Tauri UI (THE LAB)
#  https://github.com/DadsMmoLab/dads-mmo-lab
#
#  Installs everything needed to BUILD the desktop app natively
#  on a Steam Deck, so the binary links against SteamOS's own
#  webkit/GTK/GL — which is what makes it actually render on the
#  Deck's GPU (an Ubuntu/Arch-container build bundles a mismatched
#  webkit and crashes with "EGL_BAD_PARAMETER").
#
#  SteamOS ships an immutable, stripped rootfs: the runtime .so
#  libraries are present but their dev files (.pc, headers) and the
#  compiler are removed, and a SteamOS update resets the rootfs. So
#  RE-RUN THIS after every SteamOS update. It is idempotent.
#
#  What goes where (we never bloat the 5GB rootfs unnecessarily):
#    - pacman DOWNLOAD cache  -> /home  (not the tiny 180MB /var)
#    - rust / cargo / bun     -> /home  (already there)
#    - cargo build artifacts  -> /home  (the project's target/)
#    - compiler + dev headers -> /usr   (unavoidable; ~500-700MB,
#                                fits the ~1.5GB free rootfs)
#
#  Usage:
#    chmod +x setup-build-host.sh && ./setup-build-host.sh
#  Then build:
#    cd guides/wow-wotlk/ui && bun run tauri build
# ============================================================
set -o pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; WHITE='\033[1;37m'
NC='\033[0m'; BOLD='\033[1m'

print_step()    { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
print_success() { echo -e "${GREEN}[OK]${NC}  $1"; }
print_info()    { echo -e "${BLUE}[..]${NC}  $1"; }
print_error()   { echo -e "${RED}[ERR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!!]${NC} $1"; }

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${WHITE}${BOLD}  Dad's MMO Lab — Build-host setup (Steam Deck)${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"

# Keep the package download cache on /home, not the tiny /var or the rootfs.
CACHE_DIR="${DML_PACMAN_CACHE:-$HOME/.cache/dml-pacman}"
mkdir -p "$CACHE_DIR"

# ─────────────────────────────────────────
# Packages — installed AND/OR force-reinstalled to restore the
# dev files (.pc + headers) SteamOS strips. Grouped for clarity;
# pacman installs them all in one transaction.
# ─────────────────────────────────────────
# Compiler toolchain + C headers (glibc/kernel headers get stripped too).
# xdg-utils provides /usr/bin/xdg-open, which Tauri's AppImage bundler embeds
# (bundling fails with "xdg-open binary not found" without it).
TOOLCHAIN=(base-devel glibc linux-api-headers xdg-utils)

# Tauri's GTK / WebKit dev stack (top-level).
GTK_WEBKIT=(
  webkit2gtk-4.1 gtk3 glib2 libsoup3 cairo pango gdk-pixbuf2
  at-spi2-core harfbuzz librsvg libappindicator-gtk3 gobject-introspection
)

# Transitive dev deps whose .pc/headers are ALSO stripped — discovered by
# walking the pkg-config --libs --cflags chain. Reinstalling restores them.
TRANSITIVE=(
  pcre2 libffi libsysprof-capture zlib bzip2 brotli graphite expat libxml2
  libx11 libxext libxrender libxcb pixman libjpeg-turbo libtiff
  util-linux-libs shared-mime-info fribidi libthai libdatrie xorgproto
  libxft libxau libxdmcp zstd xz sqlite libpsl libnghttp2 libxkbcommon
  wayland libepoxy libpng dav1d freetype2 fontconfig icu
  libxi libxrandr libxcursor libxfixes libxcomposite libxdamage libxinerama
  libglvnd libcloudproviders dbus systemd-libs libxtst
)
PKGS=("${TOOLCHAIN[@]}" "${GTK_WEBKIT[@]}" "${TRANSITIVE[@]}")

# ─────────────────────────────────────────
print_step "1/5  Unlock the rootfs"
# ─────────────────────────────────────────
if command -v steamos-readonly &>/dev/null; then
    sudo steamos-readonly disable || {
        print_error "Could not disable SteamOS read-only mode."
        exit 1
    }
    print_success "Rootfs writable"
else
    print_info "No steamos-readonly here (not SteamOS?) — continuing"
fi

# ─────────────────────────────────────────
print_step "2/5  Ensure the pacman keyring"
# ─────────────────────────────────────────
# A fresh SteamOS install has no initialized keyring ("Public keyring not
# found; have you run 'pacman-key --init'?"). Initialize + populate from the
# on-disk key files. This is NON-destructive — it does not delete an existing
# keyring — and safe to re-run. For a genuinely CORRUPT keyring (vs. just
# missing), use fix-after-update.sh, which does a full reset.
if sudo pacman-key --list-keys &>/dev/null; then
    print_success "Keyring already initialized"
else
    print_info "No keyring yet (fresh install) — initializing + populating..."
    if sudo pacman-key --init && sudo pacman-key --populate; then
        print_success "Keyring initialized + populated"
    else
        print_error "Keyring init/populate failed. If it's corrupt (not just"
        print_error "missing), run fix-after-update.sh, then re-run this."
        exit 1
    fi
fi

# ─────────────────────────────────────────
print_step "3/5  Refresh package databases"
# ─────────────────────────────────────────
if ! sudo pacman -Sy --noconfirm --cachedir "$CACHE_DIR" archlinux-keyring; then
    print_warning "Database/keyring refresh failed."
    print_info  "If installs below fail with signature errors, your pacman"
    print_info  "keyring is broken — run fix-after-update.sh (handles the reset)."
fi
print_success "Databases refreshed (cache: $CACHE_DIR)"

# ─────────────────────────────────────────
print_step "4/5  Install + restore build dependencies"
# ─────────────────────────────────────────
print_info "${#PKGS[@]} packages — installs missing ones and re-lays stripped"
print_info "dev files (.pc + headers). Downloads cached on /home."
# No --needed: installed-but-stripped packages MUST be reinstalled to get
# their dev files back. --overwrite handles the half-present-file warnings.
if ! sudo pacman -S --noconfirm --overwrite='*' --cachedir "$CACHE_DIR" "${PKGS[@]}"; then
    print_error "pacman install failed. See the output above."
    print_info  "Common cause: broken keyring after a SteamOS update — run fix-after-update.sh, then re-run this."
    exit 1
fi
print_success "Packages installed"

# ─────────────────────────────────────────
print_step "5/5  Verify the toolchain + dev chain"
# ─────────────────────────────────────────
FAIL=0
for t in cc gcc make pkg-config; do
    if command -v "$t" &>/dev/null; then
        print_success "$t present"
    else
        print_error "$t MISSING"; FAIL=1
    fi
done
[ -f /usr/include/stdint.h ] && print_success "glibc headers present" \
    || { print_error "stdint.h MISSING"; FAIL=1; }

# Strict pkg-config check: --libs --cflags resolves the FULL Requires chain,
# so a MISS here means a transitive dev file is still stripped.
for p in glib-2.0 gobject-2.0 gio-2.0 gtk+-3.0 gdk-3.0 cairo cairo-gobject \
         pango pangocairo atk libsoup-3.0 librsvg-2.0 webkit2gtk-4.1 \
         javascriptcoregtk-4.1 gdk-pixbuf-2.0 harfbuzz freetype2; do
    if pkg-config --libs --cflags "$p" >/dev/null 2>&1; then
        print_success "$p"
    else
        print_error "MISS $p — find the missing dep with:  pkg-config --print-errors --libs --cflags $p"
        FAIL=1
    fi
done

echo ""
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  Build host ready.${NC}"
    echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════${NC}"
    print_info "Next:  cd guides/wow-wotlk/ui && bun run tauri build"
else
    print_warning "Some checks failed above — the build may not link until they're resolved."
    print_info  "Tell the maintainer which package each MISS points to so it can be added here."
    exit 1
fi
