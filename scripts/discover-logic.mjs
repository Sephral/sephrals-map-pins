/**
 * Pure logic of discovered pins and quest marks, without Foundry globals. A pin can be hidden until it is discovered.
 * The flags on the note: hidden (true), found (list of user ids, "*" for everybody) and quest (open, done, failed).
 */

/** The states of a quest pin. */
export const QUEST_STATES = ["open", "done", "failed"];

/** The entry of the found list that stands for every user. */
export const EVERYBODY = "*";

/**
 * A quest state from a stored value, or "" for none.
 * @param {*} value
 * @returns {""|"open"|"done"|"failed"}
 */
export function cleanQuest(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return QUEST_STATES.includes(text) ? text : "";
}

/**
 * The next quest state when the mark is clicked: none, open, done, failed, none.
 * @param {string} state
 * @returns {string}
 */
export function nextQuest(state) {
  const list = ["", ...QUEST_STATES];
  return list[(list.indexOf(cleanQuest(state)) + 1) % list.length];
}

/**
 * Is a pin hidden until it is discovered?
 * @param {object} flags   The module's flags of the note
 * @returns {boolean}
 */
export function isHiddenPin(flags) {
  return flags?.hidden === true;
}

/**
 * The list of user ids that discovered a pin, cleaned.
 * @param {object} flags
 * @returns {string[]}
 */
export function foundList(flags) {
  const list = Array.isArray(flags?.found) ? flags.found : [];
  return [...new Set(list.filter(id => (typeof id === "string") && id))];
}

/**
 * The users for whom a pin was hidden again: it stays hidden for them even in explored ground until it is revealed
 * for them again.
 * @param {object} flags
 * @returns {string[]}
 */
export function blockedList(flags) {
  const list = Array.isArray(flags?.blocked) ? flags.blocked : [];
  return [...new Set(list.filter(id => (typeof id === "string") && id))];
}

/**
 * Did a user discover a pin? A pin that is not hidden counts as discovered for everybody.
 * @param {object} flags
 * @param {string} userId
 * @returns {boolean}
 */
export function isDiscovered(flags, userId) {
  if ( !isHiddenPin(flags) ) return true;
  const found = foundList(flags);
  return found.includes(EVERYBODY) || found.includes(userId);
}

/**
 * Must a pin stay unseen for a user? The GM sees every pin.
 * @param {object} flags
 * @param {string} userId
 * @param {boolean} isGM
 * @returns {boolean}
 */
export function undiscoveredFor(flags, userId, isGM) {
  return !isGM && !isDiscovered(flags, userId);
}

/**
 * The new found list after a GM reveals or hides a pin.
 * @param {string[]} found           The list now
 * @param {object} change
 * @param {string[]} change.playerIds   The ids of all players (not the GMs)
 * @param {boolean} [change.all]     Reveal for everybody
 * @param {string[]} [change.add]    Reveal for these users
 * @param {string[]} [change.remove] Hide again for these users
 * @param {boolean} [change.reset]   Hide again for everybody
 * @returns {string[]}
 */
export function changeFound(found, {playerIds = [], all = false, add = [], remove = [], reset = false} = {}) {
  if ( reset ) return [];
  if ( all ) return [EVERYBODY];
  let list = new Set(found);
  if ( remove.length && list.has(EVERYBODY) ) list = new Set(playerIds);
  for ( const id of remove ) list.delete(id);
  if ( !list.has(EVERYBODY) ) for ( const id of add ) list.add(id);
  return [...list];
}

/**
 * The result of a GM's reveal or hide: the new found list and the users who must not discover the pin by exploring
 * (those it was hidden from again).
 * @param {object} flags
 * @param {object} change   Like changeFound: {playerIds, all, add, remove, reset}
 * @returns {{found: string[], blocked: string[]}}
 */
export function revealResult(flags, {playerIds = [], all = false, add = [], remove = [], reset = false} = {}) {
  const before = foundList(flags);
  const found = changeFound(before, {playerIds, all, add, remove, reset});
  const knows = (list, id) => list.includes(EVERYBODY) || list.includes(id);
  const lost = playerIds.filter(id => knows(before, id) && !knows(found, id));
  const gained = new Set(all ? playerIds : add);
  const blocked = new Set([...blockedList(flags), ...lost]);
  for ( const id of gained ) blocked.delete(id);
  return {found, blocked: [...blocked]};
}

/**
 * Which pins does a player's fog of war newly cover? Pins that are hidden, not yet found by the user and whose
 * position is explored.
 * @param {{id: string, flags: object, x: number, y: number}[]} pins
 * @param {string} userId
 * @param {(point: {x: number, y: number}, pin: object) => boolean} explored
 * @param {Set<string>} [pending]   Pins already reported and waiting for the GM
 * @returns {string[]}   The ids of the pins to report
 */
export function newlyExplored(pins, userId, explored, pending = new Set()) {
  const result = [];
  for ( const pin of pins ) {
    if ( !isHiddenPin(pin.flags) || isDiscovered(pin.flags, userId) || pending.has(pin.id) ) continue;
    if ( blockedList(pin.flags).includes(userId) ) continue;
    if ( explored({x: pin.x, y: pin.y}, pin) ) result.push(pin.id);
  }
  return result;
}
