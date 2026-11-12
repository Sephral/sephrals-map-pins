/**
 * Cached reads of the module's settings, so styling hundreds of pins does not read the settings again and again.
 * The caches are dropped whenever a setting changes.
 */

import {MODULE_ID, setting} from "./config.mjs";
import {cleanCategories, worldDefaults} from "./pin-logic.mjs";

let world = null;
let categories = null;
let hidden = null;
let privateData = null;

/** Drop all cached values. */
export function invalidate() {
  world = null;
  categories = null;
  hidden = null;
  privateData = null;
}

/**
 * The world defaults for the look of pins.
 * @returns {ReturnType<typeof worldDefaults>}
 */
export function worldStyle() {
  world ??= worldDefaults({
    labelMode: setting("labelMode"),
    noBackground: setting("noBackground"),
    constantSize: setting("constantSize"),
    constantScale: setting("constantScale"),
    minZoom: setting("minZoom"),
    preview: setting("preview"),
    numberFromName: setting("numberFromName")
  });
  return world;
}

/**
 * The world's categories.
 * @returns {{id: string, name: string, icon: string, color: string}[]}
 */
export function categoryList() {
  categories ??= cleanCategories(setting("categories"));
  return categories;
}

/**
 * One category by id.
 * @param {string} id
 * @returns {{id: string, name: string, icon: string, color: string}|null}
 */
export function categoryById(id) {
  return id ? (categoryList().find(c => c.id === id) ?? null) : null;
}

/**
 * The categories this user hid for themselves.
 * @returns {Set<string>}
 */
export function hiddenCategories() {
  hidden ??= new Set(setting("hiddenCategories") ?? []);
  return hidden;
}

/**
 * Hide or show a category for this user.
 * @param {string} id
 * @param {boolean} hide
 */
export async function setCategoryHidden(id, hide) {
  const next = new Set(hiddenCategories());
  if ( hide ) next.add(id);
  else next.delete(id);
  await game.settings.set(MODULE_ID, "hiddenCategories", [...next]);
}

/**
 * The texts of this user's private pins in this world, by note id. They live in this browser only.
 * @returns {Record<string, {name: string, text: string}>}
 */
export function privatePins() {
  privateData ??= foundry.utils.deepClone(setting("privatePins")?.[game.world.id] ?? {});
  return privateData;
}

/**
 * Store the text of one private pin on this device, or remove it.
 * @param {string} noteId
 * @param {{name: string, text: string}|null} data
 */
export async function savePrivatePin(noteId, data) {
  const all = foundry.utils.deepClone(setting("privatePins") ?? {});
  const mine = all[game.world.id] ??= {};
  if ( data ) mine[noteId] = {name: String(data.name ?? ""), text: String(data.text ?? "")};
  else delete mine[noteId];
  if ( !Object.keys(mine).length ) delete all[game.world.id];
  await game.settings.set(MODULE_ID, "privatePins", all);
}

/**
 * The pins this client discovered a moment ago and reported to the GM. They show at once, before the GM's write
 * arrives. Cleared when the scene changes.
 * @type {Set<string>}
 */
export const localFound = new Set();
