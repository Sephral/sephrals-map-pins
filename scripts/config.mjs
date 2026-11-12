/**
 * Constants and small helpers shared by the scripts of the module. The module runs on Foundry 13 and 14, so it uses
 * game.i18n instead of the v14 global _loc.
 */

/** The id of this module. */
export const MODULE_ID = "sephrals-map-pins";

/** The folder of the module's templates. */
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/** The Foundry versions the module was verified against (see the self test). */
export const TESTED_VERSIONS = {core: "14.370"};

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Localize a key, with optional data.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function t(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * Is a window open or on its way? While an application renders, its "rendered" flag is false, and a redraw asked
 * for in that moment would be lost.
 * @param {ApplicationV2|undefined} app
 * @returns {boolean}
 */
export function isShown(app) {
  const states = foundry.applications.api.ApplicationV2.RENDER_STATES;
  return !!app && ((app.state === states.RENDERED) || (app.state === states.RENDERING));
}

/**
 * Open Foundry's settings on the tab of this module.
 */
export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({force: true});
  try {
    sheet.changeTab(MODULE_ID, "categories");
  } catch(err) {
    console.warn(`${MODULE_ID} | The settings have no tab for this module`, err);
  }
  sheet.bringToFront?.();
}

/**
 * Put a gear into the title bar of a window that opens the settings of this module.
 * @param {HTMLElement} frame   The window frame
 */
export function addSettingsGear(frame) {
  const header = frame?.querySelector(".window-header");
  if ( !header || header.querySelector(".smp-settings") ) return;
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "header-control icon fa-solid fa-gear smp-settings";
  gear.dataset.tooltip = t("SMP.gear");
  gear.setAttribute("aria-label", t("SMP.gear"));
  gear.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });
  const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
  if ( anchor ) anchor.before(gear);
  else header.append(gear);
}

/** The socket event of this module (the manifest sets "socket": true). */
export const SOCKET = `module.${MODULE_ID}`;

/** The icon of a pin a player sets, tinted with the player's color. */
export const PLAYER_ICON = "icons/svg/direction.svg";

/** The icon Foundry gives a new note. */
export const DEFAULT_NOTE_ICON = "icons/svg/book.svg";

/**
 * The module's flags of a note document. Reads the data directly, so it is cheap enough for every refresh.
 * @param {Document|object} doc   A NoteDocument (or its data)
 * @returns {object}
 */
export function flagsOf(doc) {
  return doc?.flags?.[MODULE_ID] ?? {};
}

/**
 * Is Foundry 14 (or newer) running? The two versions differ in the note's pieces and in the level data.
 * @returns {boolean}
 */
export function isV14() {
  return game.release.generation >= 14;
}

/**
 * Is a note on another level than the viewed one? Only Foundry 14 has levels; a note without levels is on all of them.
 * @param {NoteDocument} doc
 * @returns {boolean}
 */
export function onOtherLevel(doc) {
  if ( !isV14() || !canvas.level || (typeof doc.includedInLevel !== "function") ) return false;
  return !doc.includedInLevel(canvas.level.id);
}

/**
 * Turn the "-=key" entries of an update into what the running Foundry wants for forced deletion: Foundry 14 asks for
 * a ForcedDeletion operator (the old syntax is deprecated), Foundry 13 still takes the "-=key" syntax.
 * @param {object} data   The update data, changed in place
 * @returns {object}
 */
export function applyRemovals(data) {
  const ForcedDeletion = foundry.data?.operators?.ForcedDeletion;
  if ( !ForcedDeletion ) return data;
  for ( const key of Object.keys(data) ) {
    if ( !key.startsWith("-=") ) continue;
    data[key.slice(2)] = new ForcedDeletion();
    delete data[key];
  }
  return data;
}
