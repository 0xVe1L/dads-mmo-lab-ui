--[[ ============================================================
  dml_whisper.lua — Dad's MMO Lab whisper-as-player bridge
  --------------------------------------------------------------

  Registers a single GM/console-callable command:

      dml_whisper <playerName> <botName> <message...>

  When fired, it sends `<message>` as a /whisper FROM <playerName>
  TO <botName>, exactly as if the player had typed it in-game.

  Why we need it:
    mod-playerbots accepts most of its commands (`talents spec`,
    `autogear`, `maintenance`, `talents apply`, etc.) only as
    whispers FROM a player session TO a bot. AzerothCore's SOAP
    interface has no built-in way to spoof player chat — no
    `.character whisper` GM command exists. Eluna's Player:Whisper
    binding fills exactly that gap: it routes through Player::Whisper
    in core, which fires OnPlayerCanUseChat(CHAT_MSG_WHISPER),
    which is mod-playerbots' chat-command hook.

  How it's invoked:
    From SOAP (or the worldserver console), call:
        dml_whisper Joshua MyBot talents spec frost
    The mod-playerbots handler accepts the message as if Joshua had
    typed it. No native AC commands are needed.

  Security:
    Gated to player == nil (console / SOAP origin only). In-game
    accounts can't trigger this through chat — the hook only fires
    for chat parses, and chat parses always have a non-nil player.
    Even so, anyone with access to the GM console / SOAP credentials
    can issue any AC command anyway, so this isn't widening any
    attack surface.

  Returns false from the hook handler to CONSUME the command — we
  don't want AC's command parser to also try to interpret
  `dml_whisper ...` as a built-in command (it would error).
============================================================ --]]

-- PLAYER_EVENT_ON_COMMAND = 42. See:
-- https://www.azerothcore.org/eluna/Hooks.html#Player

local function OnCommand(event, player, command)
    -- Only console / SOAP origin. In-game players hitting any chat
    -- command will not trigger this branch.
    if player ~= nil then return end

    -- Match: dml_whisper <pname> <bname> <message...>
    -- %S+ — non-space runs. %s+ — whitespace.
    -- The third capture is the rest of the line so the message
    -- can contain spaces (e.g. "talents spec frost dps").
    local pname, bname, msg = command:match("^dml_whisper%s+(%S+)%s+(%S+)%s+(.+)$")
    if not pname then
        -- Not our command; let other handlers / core have it.
        return
    end

    local p = GetPlayerByName(pname)
    if not p then
        print(string.format("[dml_whisper] player not found: %s", pname))
        return false
    end
    local b = GetPlayerByName(bname)
    if not b then
        print(string.format("[dml_whisper] bot not found: %s", bname))
        return false
    end

    -- Language 0 == LANG_UNIVERSAL. Whispers are forced universal
    -- by core regardless, so this value is functionally cosmetic.
    p:Whisper(msg, 0, b)
    print(string.format(
        "[dml_whisper] %s -> %s: %s", pname, bname, msg
    ))
    return false
end

RegisterPlayerEvent(42, OnCommand)
print("[dml_whisper] loaded — bridge ready")
