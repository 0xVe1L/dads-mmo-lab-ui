--[[ ============================================================
  dml_gm.lua — Dad's MMO Lab real-time GM relay
  --------------------------------------------------------------

  Registers four console/SOAP-callable commands for editing a
  LOGGED-IN character's stats without forcing a relog:

      dml_gm_health <name> <pct>           -- HP to pct of max (1-100)
      dml_gm_power <name> <power_idx> <pct> -- power[idx 1..7] to pct
      dml_gm_money <name> <copper>          -- absolute coinage in copper
      dml_gm_revive <name>                  -- resurrect to full HP

  Why we need it:
    Direct UPDATEs against `acore_characters.characters` only take
    effect on the next login — the worldserver caches in-memory
    Player state and overwrites the DB on logout. For online
    characters the Lab's dashboard GM actions previously surfaced an
    "effects on next login" warning; this script replaces that with
    instant Eluna calls that mutate the live Player object.

    Tauri commands (gm_set_health_pct, gm_set_power_pct, gm_set_money,
    gm_revive) check `characters.online` and dispatch:
      - online  → dml_gm_* via SOAP (this script)
      - offline → existing UPDATE path (still correct for offline rows)

  Power index convention:
    `characters.powerN` (N = 1..7) maps 1:1 to AC's Powers enum at
    N - 1 (POWER_MANA=0, POWER_RAGE=1, ..., POWER_RUNIC_POWER=6).
    The Lab passes powerN style (1-based) and this script subtracts 1.

  Security:
    Gated to console / SOAP origin only (`player == nil`). SOAP creds
    already grant unconstrained command execution.
============================================================ --]]

local function find_online(name)
    local p = GetPlayerByName(name)
    if not p then
        print(string.format("[dml_gm] player not online: %s", name))
    end
    return p
end

local function OnGmCommand(event, player, command)
    if player ~= nil then return end

    -- dml_gm_health <name> <pct>
    local hname, hpct = command:match("^dml_gm_health%s+(%S+)%s+(%S+)$")
    if hname then
        local p = find_online(hname)
        if not p then return false end
        local pct = tonumber(hpct)
        if not pct then return false end
        local max_hp = p:GetMaxHealth()
        local new_hp = math.floor(max_hp * pct / 100)
        if new_hp < 1 then new_hp = 1 end
        p:SetHealth(new_hp)
        p:SaveToDB()
        print(string.format("[dml_gm] %s HP -> %d / %d (%d%%)", hname, new_hp, max_hp, pct))
        return false
    end

    -- dml_gm_power <name> <power_idx 1-7> <pct>
    local pname, pidx_s, ppct_s = command:match("^dml_gm_power%s+(%S+)%s+(%S+)%s+(%S+)$")
    if pname then
        local p = find_online(pname)
        if not p then return false end
        local pidx = tonumber(pidx_s)
        local ppct = tonumber(ppct_s)
        if not pidx or not ppct then return false end
        if pidx < 1 or pidx > 7 then
            print(string.format("[dml_gm] invalid power_idx %d (must be 1..7)", pidx))
            return false
        end
        local power_type = pidx - 1
        local max_p = p:GetMaxPower(power_type)
        local new_p = math.floor(max_p * ppct / 100)
        p:SetPower(power_type, new_p)
        p:SaveToDB()
        print(string.format(
            "[dml_gm] %s power[%d] -> %d / %d (%d%%)", pname, power_type, new_p, max_p, ppct
        ))
        return false
    end

    -- dml_gm_money <name> <copper>
    local mname, mcopper_s = command:match("^dml_gm_money%s+(%S+)%s+(%S+)$")
    if mname then
        local p = find_online(mname)
        if not p then return false end
        local copper = tonumber(mcopper_s)
        if not copper then return false end
        p:SetCoinage(copper)
        p:SaveToDB()
        print(string.format("[dml_gm] %s coinage -> %d", mname, copper))
        return false
    end

    -- dml_gm_revive <name>
    local rname = command:match("^dml_gm_revive%s+(%S+)$")
    if rname then
        local p = find_online(rname)
        if not p then return false end
        -- 1.0 = 100% HP on resurrect; second arg false = no resurrection
        -- sickness so the player isn't penalized for a Lab-initiated revive.
        p:ResurrectPlayer(1.0, false)
        p:SetHealth(p:GetMaxHealth())
        p:SaveToDB()
        print(string.format("[dml_gm] revived %s", rname))
        return false
    end
end

RegisterPlayerEvent(42, OnGmCommand)
print("[dml_gm] loaded — online GM ops ready")
