/**
 * Static lookup tables for WoW 3.3.5a item_template enums.
 * Used by ItemTooltip to render slot/type/stat labels matching what
 * appears in the in-game tooltip and on Wowhead.
 *
 * Numbers come from the AzerothCore source (TC-derived); see
 * `src/server/game/Entities/Item/ItemTemplate.h` for canonical
 * definitions. Missing labels fall back to the raw enum value so
 * the UI shows *something* if a server-side mod adds new values.
 */

/** ItemTemplate.InventoryType → user-facing slot name. */
export const INVENTORY_TYPE_LABELS: Record<number, string> = {
  0: "",
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
  10: "Hands",
  11: "Finger",
  12: "Trinket",
  13: "One-Hand",
  14: "Off Hand",
  15: "Ranged",
  16: "Back",
  17: "Two-Hand",
  18: "Bag",
  19: "Tabard",
  20: "Chest",
  21: "Main Hand",
  22: "Off Hand",
  23: "Held In Off-hand",
  24: "Ammo",
  25: "Thrown",
  26: "Ranged",
  27: "Quiver",
  28: "Relic",
}

/** ItemTemplate.dmg_type → damage element label. 0 = blank ("Damage"). */
export const DAMAGE_TYPE_LABELS: Record<number, string> = {
  0: "",
  1: "Holy",
  2: "Fire",
  3: "Nature",
  4: "Frost",
  5: "Shadow",
  6: "Arcane",
}

/** ItemTemplate.bonding → tooltip line. 0 = no bind line shown. */
export const BONDING_LABELS: Record<number, string> = {
  0: "",
  1: "Binds when picked up",
  2: "Binds when equipped",
  3: "Binds when used",
  4: "Quest Item",
}

/**
 * Weapon subclass labels (item class 2). Falls back to "Weapon" if
 * unrecognised. Numbers match SubclassWeapon in the AC source.
 */
export const WEAPON_SUBCLASS_LABELS: Record<number, string> = {
  0: "Axe",
  1: "Axe",
  2: "Bow",
  3: "Gun",
  4: "Mace",
  5: "Mace",
  6: "Polearm",
  7: "Sword",
  8: "Sword",
  9: "Obsolete",
  10: "Staff",
  11: "Exotic",
  12: "Exotic",
  13: "Fist Weapon",
  14: "Misc",
  15: "Dagger",
  16: "Thrown",
  17: "Spear",
  18: "Crossbow",
  19: "Wand",
  20: "Fishing Pole",
}

/** Armor subclass labels (item class 4). */
export const ARMOR_SUBCLASS_LABELS: Record<number, string> = {
  0: "Miscellaneous",
  1: "Cloth",
  2: "Leather",
  3: "Mail",
  4: "Plate",
  5: "Buckler",
  6: "Shield",
  7: "Libram",
  8: "Idol",
  9: "Totem",
  10: "Sigil",
}

/**
 * ItemModType → stat label. Wowhead uses "+N Stat" prefixed; the
 * tooltip caller adds the sign + value, this map gives just the noun.
 */
export const STAT_TYPE_LABELS: Record<number, string> = {
  0: "Mana",
  1: "Health",
  3: "Agility",
  4: "Strength",
  5: "Intellect",
  6: "Spirit",
  7: "Stamina",
  12: "Defense Rating",
  13: "Dodge Rating",
  14: "Parry Rating",
  15: "Block Rating",
  16: "Melee Hit Rating",
  17: "Ranged Hit Rating",
  18: "Spell Hit Rating",
  19: "Melee Crit Rating",
  20: "Ranged Crit Rating",
  21: "Spell Crit Rating",
  28: "Melee Haste Rating",
  29: "Ranged Haste Rating",
  30: "Spell Haste Rating",
  31: "Hit Rating",
  32: "Crit Rating",
  35: "Resilience Rating",
  36: "Haste Rating",
  37: "Expertise Rating",
  38: "Attack Power",
  39: "Ranged Attack Power",
  41: "Spell Healing",
  42: "Spell Damage",
  43: "Mana per 5 sec",
  44: "Armor Penetration Rating",
  45: "Spell Power",
  46: "Health Regen",
  47: "Spell Penetration",
  48: "Block Value",
}

/** ItemTemplate.spelltrigger → tooltip prefix verb. */
export const SPELL_TRIGGER_LABELS: Record<number, string> = {
  0: "Use",
  1: "Equip",
  2: "Chance on hit",
  4: "Soulstone",
  5: "Use",
  6: "Learn",
}

/**
 * Get a friendly type label for an item ("Sword", "Cloth", "Bag",
 * etc.). For classes we don't have specific subclass labels for, we
 * fall back to a generic class label.
 */
export function itemTypeLabel(itemClass: number, subclass: number): string {
  switch (itemClass) {
    case 0: return "Consumable"
    case 1: return "Container"
    case 2: return WEAPON_SUBCLASS_LABELS[subclass] ?? "Weapon"
    case 4: return ARMOR_SUBCLASS_LABELS[subclass] ?? "Armor"
    case 6: return "Projectile"
    case 7: return "Trade Goods"
    case 9: return "Recipe"
    case 11: return "Quiver"
    case 12: return "Quest"
    case 13: return "Key"
    case 15: return "Miscellaneous"
    case 16: return "Glyph"
    default: return ""
  }
}

/**
 * Format a copper amount as `Xg Ys Zc`, omitting denominations that
 * are zero (so 31 copper renders just "31c" rather than "0g 0s 31c").
 */
export function formatMoney(copper: number): {
  gold: number
  silver: number
  copper: number
} {
  const gold = Math.floor(copper / 10000)
  const silver = Math.floor((copper % 10000) / 100)
  const cop = copper % 100
  return { gold, silver, copper: cop }
}
