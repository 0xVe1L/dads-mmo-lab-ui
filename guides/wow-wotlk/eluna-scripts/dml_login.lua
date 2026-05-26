--[[ ============================================================
  dml_login.lua — Dad's MMO Lab "bring bot online" relay
  --------------------------------------------------------------

  Registers a single console/SOAP-callable command:

      dml_login <playerName> <botName>

  Runs `.playerbots bot login <botName>` AS IF `<playerName>` typed
  it in-game, logging the bot in under the player's account.

  Why we need it:
    When the user disconnects (auto-kicked for inactivity, manual
    logout, etc.) their alt-bots disconnect too — their group_member
    rows persist but each bot's session is gone. The Lab's "Bring
    online" action runs this command per bot to log them back in.
    Post-login mod-playerbots auto-rejoins them to the master's
    group via its standard GroupInviteOperation queue.

    Like `.playerbots bot addclass`, the `bot login` subcommand
    requires a live player session (master->GetSession()) — it
    can't run from SOAP directly. Eluna's Player:RunCommand bridges
    that gap.

  How it's invoked (from SOAP):
      dml_login Joshua Vallonian
============================================================ --]]

local function OnLoginCommand(event, player, command)
    if player ~= nil then return end

    local pname, bname = command:match("^dml_login%s+(%S+)%s+(%S+)$")
    if not pname then return end

    local p = GetPlayerByName(pname)
    if not p then
        print(string.format("[dml_login] player not found: %s", pname))
        return false
    end

    p:RunCommand(string.format("playerbots bot login %s", bname))
    print(string.format(
        "[dml_login] %s ran: .playerbots bot login %s", pname, bname
    ))
    return false
end

RegisterPlayerEvent(42, OnLoginCommand)
print("[dml_login] loaded — bring-online relay ready")
