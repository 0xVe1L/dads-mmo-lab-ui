# 🔀 How to Migrate Characters & Accounts

> Move characters and accounts between server versions safely.
> The migration tool backs up everything before touching anything.

---

## 🚀 Quick Start

Open Konsole in Desktop Mode and run:

```bash
chmod +x migrate.sh && ./migrate.sh
```

Make sure the server you want to migrate FROM is running first.

---

## 📋 What You Can Do

The migration tool has five options:

```
1) List all accounts and characters
2) Migrate full account between servers
3) Copy single character between servers
4) Move character between accounts (same server)
5) Restore from backup
```

---

## 1 — List Accounts and Characters

Shows every account and every character across your chosen server with race, class and level all displayed in plain English. Great for getting your bearings before migrating.

---

## 2 — Migrate Full Account Between Servers

Moves an entire account AND all its characters from one server to another.

**Example use case:** You played on Base WoW and want to bring your character to the NPCBots server.

**What it does:**
1. Shows all accounts on the source server
2. You pick which account to migrate
3. Shows all characters on that account
4. Asks you to confirm
5. Backs up both servers automatically
6. Migrates the account and all characters
7. Done — login on the destination server with the same username and password

> The original account on the source server is left untouched.

---

## 3 — Copy Single Character Between Servers

Copies just one character to another server without removing it from the original. Perfect for trying a different server while keeping your main safe.

**Example use case:** Copy your Level 60 Warrior to the Playerbots server to experience the living world, while keeping the original on Base WoW.

**What it does:**
1. Shows all characters across your source server
2. You pick which character to copy
3. Shows accounts on the destination server
4. You pick which account receives the character
5. Backs up the destination server
6. Copies all character data including inventory, quests, talents and achievements

---

## 4 — Move Character Between Accounts (Same Server)

Reassigns a character from one account to another on the same server. Useful for reorganizing accounts or giving a character to a family member's account.

**Example use case:** Move your wife's character from your admin account to her own account.

---

## 5 — Restore From Backup

Every migration operation creates an automatic timestamped backup before making any changes. If something goes wrong you can restore any backup from this menu.

Backups are saved to:
```
~/wow-migration-backups/
```

---

## Safety Features

- Automatic backup before EVERY operation
- You must type `RESTORE` to confirm any restore operation
- Copy operations never delete the source — originals are always safe
- All backups are timestamped so you can always go back

---

## Tips

**Both servers need to have been run at least once** before migrating between them. The database tables need to exist.

**Only run one server at a time** during migration. The tool handles starting and stopping servers as needed.

**Character names must be unique** across accounts. If a character with the same name already exists on the destination the tool will notify you.

---

## What is Next?

- Need to install a server? See HOWTO-INSTALL.md
- Need to uninstall? See HOWTO-UNINSTALL.md
- Need to manage your server? See HOWTO-DESKTOP-CONTROLS-1.md

---

*Part of the Dad's MMO Lab project — offline MMO servers on Steam Deck, free forever.*

**youtube.com/@DadsMmoLab**
**github.com/DadsMmoLab/dads-mmo-lab**
