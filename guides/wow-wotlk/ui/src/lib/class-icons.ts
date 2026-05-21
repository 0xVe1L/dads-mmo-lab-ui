/**
 * Bundled class crest images, keyed by the 3.3.5a class id. These are
 * imported statically so Vite fingerprints + inlines them into the
 * build — the avatar renders them straight from disk, with no live
 * network fetch. (Sourced once from the icon CDN; the proper per-client
 * MPQ extraction is a later pass — see CLASS_ICON_NAMES in
 * wow-character-enums for the icon basenames.)
 */
import classicon_warrior from "@/assets/class-icons/classicon_warrior.jpg"
import classicon_paladin from "@/assets/class-icons/classicon_paladin.jpg"
import classicon_hunter from "@/assets/class-icons/classicon_hunter.jpg"
import classicon_rogue from "@/assets/class-icons/classicon_rogue.jpg"
import classicon_priest from "@/assets/class-icons/classicon_priest.jpg"
import classicon_deathknight from "@/assets/class-icons/classicon_deathknight.jpg"
import classicon_shaman from "@/assets/class-icons/classicon_shaman.jpg"
import classicon_mage from "@/assets/class-icons/classicon_mage.jpg"
import classicon_warlock from "@/assets/class-icons/classicon_warlock.jpg"
import classicon_druid from "@/assets/class-icons/classicon_druid.jpg"

export const CLASS_ICONS: Record<number, string> = {
  1: classicon_warrior,
  2: classicon_paladin,
  3: classicon_hunter,
  4: classicon_rogue,
  5: classicon_priest,
  6: classicon_deathknight,
  7: classicon_shaman,
  8: classicon_mage,
  9: classicon_warlock,
  11: classicon_druid,
}
