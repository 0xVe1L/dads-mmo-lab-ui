# Modules UI — Implementation Plan

Working spec for the next phase: wiring module install/management into the Tauri UI for the WoW 3.3.5a AzerothCore + mod-playerbots server.

**Scope.** 8 modules from `manage-wow-modules.sh:89-98`:

- mod-ah-bot, mod-solocraft, mod-aoe-loot, mod-learn-spells, mod-individual-progression, mod-autobalance, mod-transmog, mod-1v1-arena

**Audience.** Casual users (non-technical "dad on a Steam Deck"). Voice and one-shot install philosophy from `CLAUDE.md`.

**Build assumption.** Only the **playerbots** install supports modules. The script blocks Base/NPCBots from rebuilding (`manage-wow-modules.sh:928-951`). Since onboarding now hard-defaults to playerbots, this is fine in practice — but the UI must still refuse module flows if it ever detects another variant.

---

## Phase 1 — Module config inventory

The matrix below is the source of truth for what we expose during onboarding. **Every config knob listed has been verified against its `.conf.dist`** — no inventions.

### Summary matrix

| Key                          | Default-enabled? | Onboarding asks | Has knobs worth touching? | Special setup |
|------------------------------|------------------|-----------------|---------------------------|---------------|
| mod-ah-bot                   | Yes              | **5 questions** | Yes (15+ knobs)           | **AH Bot character** — post-install wizard |
| mod-solocraft                | Yes              | 0 questions     | Yes (4 sliders)           | — |
| mod-aoe-loot                 | Opt-in           | 0 questions     | No (just enable)          | — |
| mod-learn-spells             | Opt-in           | 0 questions     | 1 toggle                  | — |
| mod-individual-progression   | Off              | **3 questions** | Yes (gameplay-altering)   | Requires worldserver.conf flags — handled by `SimpleConfigOverride=1` (default) |
| mod-autobalance              | Yes              | 0 questions     | Yes (1 slider)            | — |
| mod-transmog                 | Yes              | 0 questions     | Yes (cost/quality)        | — |
| mod-1v1-arena                | Opt-in           | 0 questions     | 1 toggle (talent gating)  | — |

**TL;DR.** Six of eight modules are zero-question installs. Only AH Bot and Individual Progression have onboarding worth doing. AH Bot is the only one with deferred, can't-automate setup.

---

### mod-ah-bot — Auction House Bot

**What it does.** Spawns a bot character that lists items on the auction house so the world's economy isn't an empty grid. Without it, the AH is dead in single-player.

**Why a user wants it.** Solves the #1 immersion-breaker for offline WoW: empty auction houses. The bot constantly lists items priced near vendor value, simulating a busy server.

**Onboarding knobs (5 questions, sensible defaults).** Cite `mod_ahbot.conf.dist` lines.

| UI label                                | Conf key                                      | Type     | Default | Lines |
|-----------------------------------------|-----------------------------------------------|----------|---------|-------|
| Auctions per cycle (more = busier AH)   | `AuctionHouseBot.ItemsPerCycle`               | int      | 200     | 115   |
| Auction duration (short/medium/long)    | `AuctionHouseBot.ElapsingTimeClass`           | enum 0-2 | 1 (medium) | 119 |
| Bot also buys from players              | `AuctionHouseBot.EnableBuyer`                 | bool     | 0       | 108   |
| Include vendor-purchasable items        | `AuctionHouseBot.VendorItems`                 | bool     | 0       | 206   |
| Include profession materials            | `AuctionHouseBot.ProfessionItems`             | bool     | 0       | 212   |

**Deferred to post-install wizard (cannot automate):**
- `AuctionHouseBot.Account` (line 113) and `AuctionHouseBot.GUID` (line 114) — these need a real WoW character. Workflow already exists in `manage-wow-modules.sh:968-1067`. Cannot be set during onboarding because the user must log into WoW with the client and create the AHBOT character first.
- `AuctionHouseBot.EnableSeller` (line 107) is forced to `1` by the post-install wizard once the character GUID is known. During onboarding we write the conf with `EnableSeller=0`, then flip to `1` after character configuration.

**Minimum onboarding scope.** 0 questions would work — defaults are fine. We ask 5 because they meaningfully change feel. Hide them behind an "Advanced" toggle if needed.

**Setup that CAN'T be automated.** Bot character creation. Surfaced as a yellow banner on the post-install Modules page: "AH Bot installed but inactive — configure character".

---

### mod-solocraft — Solo dungeon/raid scaling

**What it does.** Buffs solo (or under-pop) parties in dungeons/raids so a lone player can clear content meant for 5/10/25/40. Stacking per missing party member.

**Why a user wants it.** Single-player + Playerbots already gives you a "party", but Solocraft adds the per-instance balancing math so a 5-man bot group can do Naxx 25.

**Onboarding knobs (0 questions).** All defaults are fine.

The conf has 200+ per-instance level/difficulty knobs (`Solocraft.conf.dist:115-441`), but the catch-all defaults — `Solocraft.Dungeon=5.0`, `Solocraft.Heroic=10.0`, `Solocraft.Raid25=25.0`, `Solocraft.Raid40=40.0` (lines 105-108) — are tuned and match the existing wiki advice. **Do not expose the per-instance grid in the UI.**

If we ever want to expose anything, candidates are the four global multipliers above. Skip for v1.

**Minimum onboarding scope.** 0 questions. Just clone, write the default conf, done.

---

### mod-aoe-loot — AoE Loot

**What it does.** Loot every nearby corpse with one click. Pure quality-of-life.

**Why a user wants it.** Loot grind without the tedium.

**Onboarding knobs.** None worth asking about. `mod_aoe_loot.conf.dist` has 4 knobs (Enable, Message, Range, Group). All defaults are correct.

**Minimum onboarding scope.** 0 questions.

---

### mod-learn-spells — Learn spells on level up

**What it does.** Auto-grants class spells on level-up so you don't have to fly to a trainer.

**Why a user wants it.** Removes the most-skipped chore in classic WoW.

**Onboarding knobs (0 questions).** One *optional* knob worth exposing later, not now:

| UI label                                  | Conf key                  | Type | Default |
|-------------------------------------------|---------------------------|------|---------|
| Grant ALL spells on first login (cheaty)  | `LearnSpells.OnFirstLogin`| bool | 0       |

That's `mod_learnspells.conf.dist:19`. Skip during onboarding; expose on the Modules page later as "Power mode" toggle.

**Minimum onboarding scope.** 0 questions.

---

### mod-individual-progression — Vanilla -> TBC -> WotLK gating

**What it does.** Locks each character into a per-character progression state. New characters start in "Vanilla", must clear MC/BWL/AQ/Naxx to unlock TBC, then TBC raids to unlock WotLK. Restores Vanilla quest/creature stats while in Vanilla phase. Big mod — fundamentally changes pace.

**Why a user wants it.** Re-experience the journey through expansions on each character, instead of dinging straight to 80.

**Onboarding knobs (3 questions).** Cite `individualProgression.conf.dist` lines.

| UI label                                  | Conf key                                       | Type     | Default | Lines |
|-------------------------------------------|------------------------------------------------|----------|---------|-------|
| Difficulty: Vanilla feels Vanilla (50% pwr)| `IndividualProgression.VanillaPowerAdjustment`+`VanillaHealingAdjustment` | float    | 1 (off) | 41,52 |
| Lock raid finder until WotLK              | `IndividualProgression.DisableRDF`             | bool     | 0       | 201   |
| Death Knights need TBC cleared first      | `IndividualProgression.DeathKnightUnlockProgression` | int (0 or 13) | 13 | 294 |

The first slot bundles 4 conf keys (Vanilla + TBC power + healing). UI presents one "Authentic difficulty" toggle that sets all four to 0.6.

There are dozens more knobs (PvP requirements, ZG progression, etc.) — leave them at default. Expose on the Modules page as "Advanced" later.

**Setup that CAN'T be automated.** None — `SimpleConfigOverride=1` (line 182, on by default) auto-fixes `EnablePlayerSettings` and `DBC.EnforceItemAttributes` in `worldserver.conf` for us. This is the only module that touches worldserver.conf and it does so safely.

**Minimum onboarding scope.** 0 questions would work (defaults give a fairly vanilla feel without difficulty changes). 3 questions if we want to honor the module's actual design intent.

---

### mod-autobalance — Auto Balance

**What it does.** Dynamically scales mob health/damage in instances to match the party size. Complementary to Solocraft but generally better-tuned for non-raids.

**Why a user wants it.** Heroic 5-mans tuned for a real 5-man party are unfun with 2 bots + you. Autobalance fixes that.

**Onboarding knobs (0 questions).** One worth exposing later:

| UI label                  | Conf key                              | Type    | Default | Line |
|---------------------------|---------------------------------------|---------|---------|------|
| Difficulty curve         | `AutoBalance.InflectionPoint`         | float (0.1-0.9) | 0.5 | 175 |

Lower = scales up faster as players join. The spreadsheet referenced in the conf is overkill for casual users. Skip.

**Minimum onboarding scope.** 0 questions. All AutoBalance.Enable.* defaults are correct.

Conf has 980+ lines — almost all are blank per-instance/per-size override slots that fall back to the global default. Don't surface any of it.

---

### mod-transmog — Transmogrification

**What it does.** Change the visual appearance of gear without changing stats. Adds a transmog NPC + commands.

**Why a user wants it.** Classic fashion-wow. Wear that one cool piece forever.

**Onboarding knobs (0 questions).** All defaults are good. Two knobs worth exposing on the Modules page later:

| UI label                  | Conf key                                  | Type           | Default | Line |
|---------------------------|-------------------------------------------|----------------|---------|------|
| Free transmog (no gold)   | `Transmogrification.ScaledCostModifier`   | float (0=free) | 1.0     | 120  |
| Allow mixed armor types   | `Transmogrification.AllowMixedArmorTypes` | bool           | 0       | 248  |

The module ships with a "portable transmog NPC" enabled by default (`EnablePortable=1`, line 103) — players summon the NPC anywhere. No GM action needed to use it.

**Minimum onboarding scope.** 0 questions.

---

### mod-1v1-arena — 1v1 Arena

**What it does.** Adds 1v1 arena queues. Useful when you have a bot opponent setup.

**Why a user wants it.** PvP practice against bots.

**Onboarding knobs (0 questions).** One worth exposing as a Modules-page toggle:

| UI label                            | Conf key                          | Type | Default | Line |
|-------------------------------------|-----------------------------------|------|---------|------|
| Block healing-spec talents in queue | `Arena1v1.PreventHealingTalents`  | bool | false   | 70   |

That's the only knob with a real gameplay split. Cost (`Arena1v1.Costs=400000` line 33) and `MinLevel=80` (line 26) are blizzlike defaults — leave alone.

**Minimum onboarding scope.** 0 questions. Default-off in the wizard because most casual users won't use it.

---

## Phase 2 — Non-interactive install script design

Approach: **extend `install-wow-ui.sh`** to read module env vars and clone modules into `$SERVER_DIR/modules/` between mod-playerbots clone (line 397) and `docker compose up -d --build` (line 429). Modules compiled into the initial worldserver, no extra rebuild.

A separate `install-modules-ui.sh` is also needed for the post-install Modules page (add/remove/reconfigure after first install). Same env var convention.

### Env var convention

All UI -> shell env vars are prefixed `DML_` to namespace them. Module-specific prefix is `DML_MOD_<KEY>_<SETTING>`.

**Top-level selector:**

```
DML_MODULES_ADD=mod-ah-bot,mod-solocraft,mod-transmog    # comma-separated keys to install
DML_MODULES_REMOVE=mod-1v1-arena                         # only used by install-modules-ui.sh
```

Empty / unset = no module operation. Both keys may be set in the same invocation (used by Modules page when user toggles things).

### Per-module env vars

Only keys that the wizard actually asks about. Knobs left at conf-default require no env var.

**Set at install time (onboarding):**

| Env var                                       | Conf key applied                              | Module |
|-----------------------------------------------|-----------------------------------------------|--------|
| `DML_MOD_AHBOT_ITEMS_PER_CYCLE`               | `AuctionHouseBot.ItemsPerCycle`               | mod-ah-bot |
| `DML_MOD_AHBOT_ELAPSING_TIME_CLASS`           | `AuctionHouseBot.ElapsingTimeClass` (0/1/2)   | mod-ah-bot |
| `DML_MOD_AHBOT_ENABLE_BUYER`                  | `AuctionHouseBot.EnableBuyer`                 | mod-ah-bot |
| `DML_MOD_AHBOT_VENDOR_ITEMS`                  | `AuctionHouseBot.VendorItems`                 | mod-ah-bot |
| `DML_MOD_AHBOT_PROFESSION_ITEMS`              | `AuctionHouseBot.ProfessionItems`             | mod-ah-bot |
| `DML_MOD_IP_AUTHENTIC_DIFFICULTY`             | sets `VanillaPowerAdjustment`+`VanillaHealingAdjustment`+`TBCPowerAdjustment`+`TBCHealingAdjustment` to 0.6, or all to 1 if unset | mod-individual-progression |
| `DML_MOD_IP_DISABLE_RDF`                      | `IndividualProgression.DisableRDF`            | mod-individual-progression |
| `DML_MOD_IP_DK_REQUIRES_TBC`                  | `IndividualProgression.DeathKnightUnlockProgression` (13 if set, 0 if unset) | mod-individual-progression |

**Set later (post-install only — Modules page):**

| Env var                                       | Conf key                                      | Why later |
|-----------------------------------------------|-----------------------------------------------|-----------|
| `DML_MOD_AHBOT_ACCOUNT`                       | `AuctionHouseBot.Account`                     | Character must exist in DB |
| `DML_MOD_AHBOT_GUID`                          | `AuctionHouseBot.GUID`                        | Character must exist in DB |
| `DML_MOD_AHBOT_ENABLE_SELLER`                 | `AuctionHouseBot.EnableSeller`                | Flipped to 1 after GUID set |
| `DML_MOD_LEARNSPELLS_ON_FIRST_LOGIN`          | `LearnSpells.OnFirstLogin`                    | Power-user toggle |
| `DML_MOD_AB_INFLECTION_POINT`                 | `AutoBalance.InflectionPoint`                 | Power-user tuning |
| `DML_MOD_TRANSMOG_FREE`                       | `Transmogrification.ScaledCostModifier` (0 if true, 1.0 if false) | Power-user toggle |
| `DML_MOD_TRANSMOG_MIXED_ARMOR`                | `Transmogrification.AllowMixedArmorTypes`     | Power-user toggle |
| `DML_MOD_1V1_PREVENT_HEALERS`                 | `Arena1v1.PreventHealingTalents`              | Niche toggle |

**Conventions for env-var to conf translation:**
- Bool inputs are "0" or "1" from the UI. The script translates to the conf format (`= 0` / `= 1` for most; `= true` / `= false` for `Arena1v1.PreventHealingTalents`).
- Unset env vars mean "use conf default" — the script does NOT write that line, just copies the `.conf.dist` as-is.
- Floats are passed as strings (e.g. "0.6", "1.0").

### Script flow (install-wow-ui.sh changes)

After line 397 (mod-playerbots clone, before docker compose --build):

```
install_user_modules() {
    [ -z "$DML_MODULES_ADD" ] && return 0
    print_step "Installing user modules"
    local IFS=','
    for key in $DML_MODULES_ADD; do
        clone_module "$key" "$SERVER_DIR/modules/$key"
        write_module_conf "$key" "$SERVER_DIR/modules/$key" "$SERVER_DIR/env/dist/etc/modules"
    done
}
```

- `clone_module` looks up the URL in a script-local registry mirroring `manage-wow-modules.sh:89-98`.
- `write_module_conf` copies `<modulepath>/conf/*.conf.dist` -> `$SERVER_DIR/env/dist/etc/modules/<basename>.conf` (drop the `.dist`), then applies the `DML_MOD_*_*` env vars via `sed -i` substitutions. Pattern matches `configure_ahbot` in `manage-wow-modules.sh:1044-1051`.
- Important: the `env/dist/etc/modules/` directory may not exist before first build. `mkdir -p` it.

### install-modules-ui.sh (new script)

Same conventions, used by the Modules page for add/remove/reconfigure after first install. Difference: it also reads `DML_MODULES_REMOVE`, runs the add/remove operations, then drives `docker compose up -d --build` to recompile the worldserver. Streams output through the existing `::DML::SECTION::` markers so the UI can collapse the build noise.

### Modules clone-before-build optimization (free)

`docker compose up -d --build` (line 429 of install-wow-ui.sh) builds the worldserver image from source, and the Dockerfile's `worldserver` target globs `modules/*`. Anything cloned into `modules/` before line 429 is included in the same compile pass.

That means: a fresh install with 5 user modules is the SAME compile time as a fresh install with 0 modules. The bare-install case ALREADY recompiles AzerothCore from scratch; we're just adding more `.cpp` files to the same pass.

This is why onboarding-time module selection costs nothing extra (per user). Post-install adds DO cost 30-90min for rebuild.

---

## Phase 3 — Onboarding wizard step design

Existing wizard (`install-onboarding.tsx`) has 4 steps. Module config inflates this to **a max of 7 steps**, but most users see 4-5 because per-module config steps are conditional.

### Step list

1. **Server type** — unchanged. Locked to Playerbots.
2. **Modules** — checkboxes, **now actually wired through** to `DML_MODULES_ADD`. Existing component `ModulesStep` is fine; just stop dropping `state.modules` on the floor at line 137 of install-onboarding.tsx.
3. **AH Bot config** — *conditional, only if `mod-ah-bot` is checked*.
4. **Individual Progression config** — *conditional, only if `mod-individual-progression` is checked*.
5. **Admin account** — unchanged.
6. **Summary** — unchanged structure, augmented to list module choices with chosen knobs in the Modules row.

Other 5 modules (solocraft, aoe-loot, learn-spells, autobalance, transmog, 1v1-arena) get NO config step.

### Step 3 — AH Bot config form

Layout: vertical form. Defaults pre-filled.

- **Information banner** (top, yellow): "After install you'll need to log into WoW once and create a bot character. The Modules page will walk you through it."
- **Auctions per cycle** — number input, default 200, range 50-2000. Help text: "How many items the bot lists per cycle. Higher = busier AH, but more CPU."
- **Auction duration** — radio group: Short (10-60min) / Medium (1-24h) / Long (1-3d). Default Medium. Maps to enum 0/1/2 inverted (2=short, 0=long).
- **Bot also buys from players** — switch, default off.
- **Include vendor items** — switch, default off. Help text: "Adds vendor-purchasable goods to the AH (more variety, less authentic)."
- **Include profession materials** — switch, default off.

### Step 4 — Individual Progression config form

Layout: vertical form. All defaults preserve a "vanilla feel without difficulty tweaks" experience.

- **Information banner** (top, blue): "This module changes WoW fundamentally — each character starts in Vanilla and must clear raids to unlock TBC, then WotLK. The journey, not the destination."
- **Authentic difficulty (50% power/healing in Vanilla and TBC)** — switch, default off. Help text: "Recommended for solo play with Playerbots."
- **Lock Random Dungeon Finder until WotLK** — switch, default off. Help text: "Forces forming groups manually until late-game."
- **Death Knights require completing TBC first** — switch, default ON. Help text: "Module default. Disable to make DKs available from the start."

### Step 6 — Summary changes

Existing `SummaryStep` already shows modules as Badge tags. Augment with sub-text under each module name when it has configured knobs, e.g.:

```
[Auction House Bot]   200 items/cycle, medium duration, vendor items: off
[Individual Progression]   Authentic difficulty: on
```

Keep the existing yellow "compiles from source" warning. Nothing about modules adds to compile time when done at install.

### Form state shape changes

Extend `FormState` in install-onboarding.tsx:

```ts
type ModuleConfig = {
  ahbot?: { itemsPerCycle: number; elapsingTimeClass: 0|1|2; enableBuyer: boolean; vendorItems: boolean; professionItems: boolean }
  ip?: { authenticDifficulty: boolean; disableRdf: boolean; dkRequiresTbc: boolean }
}

type FormState = {
  serverType: ServerType
  modules: Record<ModuleKey, boolean>
  moduleConfig: ModuleConfig
  adminUser: string
  adminPass: string
}
```

At submit, serialize to the env-var contract in `startInstall`. The Rust side translates the JSON into env vars before spawning `install-wow-ui.sh`.

---

## Phase 4 — Post-install Modules page design

A new page accessible from the sidebar (nav-main.tsx). Only enabled if a playerbots install is detected.

### Layout — markdown wireframe

```
+-------------------------------------------------------------------+
| Modules                                                            |
| Add, remove, or reconfigure server modules.                        |
+-------------------------------------------------------------------+
| [!] AH Bot installed but inactive — Configure bot character ->     |  <- conditional banner
+-------------------------------------------------------------------+
|                                                                    |
| Installed (4)                                          [+ Add]    |
|                                                                    |
|   AUCTION HOUSE BOT                              [Configure][Remove]
|     200 items/cycle - medium - bot account: AHBOT (GUID 12)        |
|                                                                    |
|   SOLOCRAFT                                      [Configure][Remove]
|     Default tuning                                                 |
|                                                                    |
|   AUTO BALANCE                                   [Configure][Remove]
|     Inflection point: 0.5                                          |
|                                                                    |
|   TRANSMOGRIFICATION                             [Configure][Remove]
|     Default cost - portable NPC enabled                            |
|                                                                    |
| Available (4)                                                      |
|                                                                    |
|   AoE Loot                                                  [+ Add]
|   Learn Spells on Levelup                                   [+ Add]
|   Individual Progression                                    [+ Add]
|   1v1 Arena                                                 [+ Add]
+-------------------------------------------------------------------+
```

### Flows

**Add module flow.** Opens a per-module config form in a modal (same layout as the onboarding per-module step). Submitting:

1. Warning dialog: "Adding a module rebuilds the worldserver. Expect 30-90 minutes on Steam Deck. Server will be unavailable during the rebuild."
2. On confirm, calls install-modules-ui.sh via Tauri command, streaming output to the existing install-console UI.
3. After completion: server is restarted, module appears in Installed list.

**Remove module flow.** Confirmation dialog with explicit "type the module name to confirm" gate (we don't want fat-finger removals after hours of compile).

1. Stops worldserver.
2. Removes `modules/<key>` directory (mirror `module_remove` in manage-wow-modules.sh:871-887).
3. Rebuilds worldserver (30-90 min warning same as add).
4. Database tables stay (per manage-wow-modules.sh:884-885 — removing them risks data loss and they're harmless to leave).

**Reconfigure flow.** Opens the same config form pre-filled with current values. Submitting:

1. Writes the updated conf file.
2. Short dialog: "Restarting worldserver to apply (~30 seconds)."
3. Calls `restart_server` Tauri command (already exists).

Reconfigure is FAST — no rebuild. Just a conf edit + worldserver restart.

**AH Bot character config flow (deferred wizard).** Only entered via the yellow banner.

1. Step 1: "Have you logged into WoW and created a bot character?" — Yes/No.
2. If No: instructions panel with steps (mirrors `configure_ahbot` in manage-wow-modules.sh:980-988).
3. Step 2: dropdown populated from a `list_characters` Tauri command (query `acore_characters.characters`). User picks the bot character.
4. Step 3: confirm + apply. Sets `AuctionHouseBot.Account`, `AuctionHouseBot.GUID`, `AuctionHouseBot.EnableSeller=1`. Restarts worldserver.

### Surface-level warnings the page must show

- **Rebuild warning** (30-90 min on Steam Deck) — shown before Add and before Remove.
- **Restart warning** (~30 sec) — shown before Reconfigure save.
- **AH Bot inactive banner** — shown when mod-ah-bot is installed but `AuctionHouseBot.GUID = 0` (the default).
- **Build-only-on-playerbots warning** — disable the entire page on Base/NPCBots installs with a "Modules require Playerbots; reinstall to enable" note.

---

## Phase 5 — Rust commands needed

New Tauri commands in `guides/wow-wotlk/ui/src-tauri/src/`. Suggest grouping in a new file `modules.rs`.

| Command                          | Args                                          | Returns                                          | Streams? | Notes |
|----------------------------------|-----------------------------------------------|--------------------------------------------------|----------|-------|
| `list_installed_modules`         | none                                          | `Vec<InstalledModule { key, name, current_config: HashMap<String, String> }>` | sync     | Reads `$SERVER_DIR/modules/*` dirs (skip `mod-playerbots`); for each, parse `$SERVER_DIR/env/dist/etc/modules/<name>.conf` if present, else the `.dist` file. |
| `list_available_modules`         | none                                          | `Vec<ModuleEntry { key, name, url, description }>` | sync     | Static — mirrors `MODULE_REGISTRY` from manage-wow-modules.sh:89-98. Hardcode in Rust. |
| `install_module`                 | `{ key, config: HashMap<String, String> }`    | streams via `install:output` events              | yes      | Spawns `install-modules-ui.sh` with `DML_MODULES_ADD=<key>` and translated env vars. Reuses existing event channel from install.rs. |
| `remove_module`                  | `{ key }`                                     | streams                                          | yes      | Spawns `install-modules-ui.sh` with `DML_MODULES_REMOVE=<key>`. |
| `reconfigure_module`             | `{ key, config: HashMap<String, String> }`    | `Result<(), String>`                             | sync     | No script — directly writes the conf file from Rust, then triggers `restart_server`. No rebuild. |
| `list_characters`                | none                                          | `Vec<Character { guid, name, account, level, class, race }>` | sync     | `docker exec ac_database mysql ...` — mirror `list_characters` in manage-wow-modules.sh:958-966. |
| `configure_ahbot_character`      | `{ guid, account }`                           | `Result<(), String>`                             | sync     | Writes the three keys in mod_ahbot.conf, then triggers `restart_server`. Mirrors `configure_ahbot:1044-1051`. |
| `validate_module_config`         | `{ key, config }`                             | `Result<(), Vec<ValidationError>>`               | sync     | Bounds-checks numeric fields (e.g. ItemsPerCycle in 50-2000). Lets the UI show field-level errors before invoking install. |

**Events reused from install.rs:** `install:output`, `install:section`, `install:done`. The Modules page console reuses the existing install-console component.

**Lib.rs changes:** add the new commands to `invoke_handler!` and `manage` a new `ModulesState` if needed (it might not be — these are all stateless).

**install.rs changes:** the existing `start_install` command needs to gain a `modulesAdd: Vec<String>` and `moduleConfig: HashMap<ModuleKey, HashMap<String, String>>` field in `InstallRequest`, which it translates into `DML_MODULES_ADD` and `DML_MOD_*_*` env vars before spawning the script.

---

## Phase 6 — Risks, gotchas, open questions

### Implementation risks

- **`docker compose` working directory bug.** The recent `-f` fix needs to be applied to any new compose invocations. Always `cd "$SERVER_DIR"` then `docker compose ...` — never `docker compose -f <path>` from a different cwd. Affects install-modules-ui.sh and the rebuild trigger.
- **`env/dist/etc/modules/` permissions.** Mirror the existing `chown 1000:1000` pattern from manage-wow-modules.sh:312-324. Modules dropped into this dir by a non-1000 user will be invisible to the container.
- **Conf .dist -> .conf copy timing.** AzerothCore reads `<name>.conf` if present, else falls back to `<name>.conf.dist`. We MUST write to `<name>.conf` (drop the `.dist`), otherwise our changes are silently ignored.
- **AH Bot SQL pre-loaded.** `mod_auctionhousebot.sql` (the per-item-quality quotas table) gets auto-imported by AC's update system on first build. Don't touch it manually — the previous mistake (manage-wow-modules.sh:837-844) caused "table already exists" errors. Just let ac-db-import run.
- **mod-individual-progression's worldserver.conf override.** With `SimpleConfigOverride=1` (the default), this module EDITS `worldserver.conf` at startup. If the user has IP installed and then removes it, the conf changes persist (the script can't tell our edit apart from theirs). Document this in the remove dialog.
- **mod-1v1-arena replaces an existing arena slot.** Default `Arena1v1.ArenaSlotID=3` is safe, but if any future addon uses slot 3, conflict. Out of scope to detect.
- **Conf parsing for "current config" display.** The conf format is `key = value` with `#` comments. Need a small line-based parser, NOT a TOML library. Strip leading/trailing whitespace, ignore comment lines, split on first `=`. mod-autobalance has 980 lines of which most are blank — parser must handle empty values.
- **Rebuild lock.** The Modules page MUST disable Add/Remove buttons (and surface "Rebuild in progress" status) while any of `install_module` / `remove_module` are running. Otherwise a user could queue 5 module adds and the second one would clobber the first's running build container. Track via the existing `InstallState.running_pid`.
- **Restart-only Reconfigure must verify the conf was actually re-read.** AC reloads SOME keys on `.reload config` but most module configs require a full worldserver restart. Always restart, never just reload config.

### Known limitations

- **Base/NPCBots installs can't take modules.** The Modules page refuses to operate on them (per manage-wow-modules.sh:928-951). UI shows the "reinstall as Playerbots" suggestion already in the script.
- **mod-playerbots is special and untouchable.** It's bundled with the source clone. The page hides it from the "Installed" list (mirror manage-wow-modules.sh:1250-1251).
- **No granular per-module enable/disable.** Each module has its own `*.Enable` knob in its conf, but the recommended "remove" flow is to delete the `modules/<key>` dir and rebuild. We don't support `Enable=0` toggles — too easy to confuse user about state.
- **SQL leftover on remove.** Per manage-wow-modules.sh:884-885 we deliberately don't drop tables; they're harmless. Mention this in the remove dialog so users don't think uninstall is incomplete.
- **mod-individual-progression and mod-autobalance overlap.** Both alter difficulty; running both works but the math compounds. Not blocked by the UI; mention in the IP/AB descriptions.

### Open questions worth deciding before implementation

1. **Should the Modules page show an "Advanced settings" expander?** The current plan is to only expose the 1-2 high-value knobs per module on the Reconfigure form. Knobs like all 200 per-instance Solocraft difficulties are intentionally hidden. **Suggested default: hide everything except the listed knobs; advanced users can edit `~/wow-server-playerbots/env/dist/etc/modules/*.conf` directly.** Document this in the Modules page footer.
2. **Where does the "currently running build" live in app state?** The existing `InstallState.running_pid` is shared between the install flow and module-add flow. They can't run at the same time (both compile the worldserver) — should we surface a unified "Compile in progress" banner across the whole app? **Suggested: yes, in the existing sidebar/topbar status indicator.**
3. **Default-enabled modules in onboarding.** Currently `install-onboarding.tsx:49-58` defaults AH Bot, Solocraft, Auto Balance, Transmog to ON. **Keep this — those are the 4 with universally-good defaults and zero questions. The two "questions-worth-asking" modules (AH Bot, IP) are intentionally split: AH Bot is on by default because the questions are 5 minor knobs; IP is off by default because it fundamentally changes the game.**
4. **Should we add a "presets" feature?** "Casual party-of-friends" preset that picks the 4 default modules. "Hardcore solo" preset that adds IP + 1v1 Arena. Out of scope for this phase; revisit after first user feedback.
5. **AH Bot wizard timing.** Currently planned as a yellow banner on the Modules page. Should it also show up as a step in the post-install "first time setup" flow? **Suggested: yes — chain it after the existing "create admin account" post-install step if AH Bot was installed.**

---

*Generated from inspection of `manage-wow-modules.sh` (lines cited), the cloned `.conf.dist` files in `/tmp/dml-module-research/`, and `install-wow-ui.sh` + `install-onboarding.tsx` for the existing UI/script contract.*
