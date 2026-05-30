--[[ ============================================================
  dml_summon_npc.lua — Dad's MMO Lab "summon an NPC to me" bridge
  --------------------------------------------------------------

  Registers one console/SOAP-callable command:

      dml_summon_npc <playerName> <creatureEntry>

  Spawns a TEMPORARY copy of <creatureEntry> right next to
  <playerName>, despawning after 5 minutes. Used by The Lab to bring
  service NPCs (e.g. the mod-transmog "Transmogrifier") to the player
  on demand — AzerothCore's `.npc add` needs an in-world GM session
  with a position, which SOAP doesn't have, so we route through the
  player's own position via Eluna instead (same pattern as the other
  dml_*.lua bridges).

  Spawn type 8 = TEMPSUMMON_TIMED_DESPAWN — the creature vanishes after
  the timer no matter what, so repeated summons don't litter the world.

  Security: gated to console / SOAP origin only (player == nil).
============================================================ --]]

local function OnCommand(event, player, command)
    if player ~= nil then return end

    local pname, entry = command:match("^dml_summon_npc%s+(%S+)%s+(%d+)$")
    if not pname then
        return
    end

    local p = GetPlayerByName(pname)
    if not p then
        print(string.format("[dml_summon_npc] player not online: %s", pname))
        return false
    end

    local e = tonumber(entry)
    local x, y, z, o = p:GetX(), p:GetY(), p:GetZ(), p:GetO()
    -- Drop it just in front of the player so it isn't standing inside them.
    local fx = x + math.cos(o) * 2.0
    local fy = y + math.sin(o) * 2.0

    -- WorldObject:SpawnCreature(entry, x, y, z, o, spawnType, despawnTimer)
    p:SpawnCreature(e, fx, fy, z, o, 8, 300000)
    print(string.format("[dml_summon_npc] %s -> npc %d", pname, e))
    return false
end

RegisterPlayerEvent(42, OnCommand)
print("[dml_summon_npc] loaded — bridge ready")
