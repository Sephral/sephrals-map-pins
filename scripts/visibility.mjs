/**
 * Which pins this user may see, on any scene. The pin list, the quick look at a map above and the party's trail all
 * ask the same question, so the answer lives here.
 */

import {flagsOf, isV14} from "./config.mjs";
import {undiscoveredFor} from "./discover-logic.mjs";
import {hiddenPrivatePin} from "./pin-logic.mjs";
import {hiddenCategories, localFound} from "./state.mjs";

/**
 * May this user see a pin? The rights of the map without the token vision that comes and goes: pins of other players,
 * pins not yet discovered and pins whose journal the user may not even see are out. The category filter of the user is
 * not part of it (a hidden category dims a pin in the list, it does not remove it).
 * @param {NoteDocument} doc
 * @returns {boolean}
 */
export function pinVisible(doc) {
  const flags = flagsOf(doc);
  if ( hiddenPrivatePin(flags, game.user.id, game.user.isGM) ) return false;
  if ( undiscoveredFor(flags, game.user.id, game.user.isGM) && !localFound.has(doc.id) ) return false;
  if ( game.user.isGM || flags.private ) return true;
  const journal = doc.page ?? doc.entry;
  if ( journal ) return journal.testUserPermission(game.user, "LIMITED");
  // Without a journal Foundry 13 shows the pin to everybody, Foundry 14 only when a player wrote it
  // (the module shows pins that link to a scene as Foundry 13 does)
  if ( !isV14() || flags.scene ) return true;
  return (doc._source.author === null) || !(doc.author?.isGM ?? true);
}

/**
 * Has this user switched the category of a pin (or area) off for themselves?
 * @param {object} flags   The module's flags
 * @returns {boolean}
 */
export function categoryOff(flags) {
  return !!flags?.category && hiddenCategories().has(flags.category);
}
