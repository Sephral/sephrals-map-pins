/**
 * Pins you discover and quest marks. A pin can be hidden until it is discovered: players do not see it on the map, in
 * the list or in a preview before. A player's own client notices when the position of a hidden pin is in the fog of
 * war the player has explored (core's own exploration, so reveals by Map Knowledge count as well) or in sight, and
 * asks the active GM to write that into the pin. The GM can also reveal a pin by hand. The pin keeps the list of
 * users who found it in its flags, so it stays discovered.
 */

import {MODULE_ID, addSettingsGear, applyRemovals, esc, flagsOf, onOtherLevel, setting, t} from "./config.mjs";
import {EVERYBODY, blockedList, changeFound, cleanQuest, foundList, isDiscovered, isHiddenPin, newlyExplored,
  revealResult, undiscoveredFor} from "./discover-logic.mjs";
import {describePin, refreshPin} from "./note-style.mjs";
import {request} from "./player-pins.mjs";
import {localFound} from "./state.mjs";
import {countFeature} from "./usage.mjs";

/** Does each pin of the viewed scene show to this user? Used to tell a pin that just appeared. */
const known = new Map();

/** Pins whose appearance was announced already. */
const announced = new Set();

/** Pins reported to the GM and waiting for the answer. */
const pending = new Set();

let timer = 0;
let retryAfter = 0;
const timers = new Set();

/* -------------------------------------------- */
/*  What a player's client does                 */
/* -------------------------------------------- */

/**
 * Is a point explored by this user, or in sight right now?
 * @param {{x: number, y: number}} point
 * @param {number} tolerance
 * @returns {boolean}
 */
function explored(point, tolerance) {
  if ( canvas.fog?.isPointExplored?.(point) ) return true;
  try {
    return !!canvas.visibility?.testVisibility?.(point, {tolerance});
  } catch(err) {
    return false;
  }
}

/**
 * Can discovery by exploring work in the viewed scene? It needs token vision and fog exploration, else a hidden pin
 * waits for the GM.
 * @returns {boolean}
 */
export function discoveryWorks() {
  return !!canvas?.ready && !!canvas.fog?.tokenVision && !!canvas.fog?.fogExploration;
}

/**
 * Look for hidden pins in explored ground and report them to the GM. Players only.
 */
export function checkDiscovery() {
  if ( game.user.isGM || !setting("discoverAuto") || !discoveryWorks() || (Date.now() < retryAfter) ) return;
  const notes = canvas.scene.notes.contents.filter(n => isHiddenPin(flagsOf(n)) && !onOtherLevel(n));
  if ( !notes.length ) return;
  const pins = notes.map(n => ({id: n.id, flags: flagsOf(n), x: n.x, y: n.y, size: n.iconSize}));
  const ids = newlyExplored(pins, game.user.id, (point, pin) => explored(point, (pin.size ?? 40) / 4),
    new Set([...pending, ...localFound]));
  if ( ids.length ) report(ids);
}

/** Check after a short pause, so several changes of the fog in a row count once. */
export function scheduleCheck() {
  if ( timer || game.user.isGM ) return;
  timer = setTimeout(() => {
    timer = 0;
    checkDiscovery();
  }, 300);
}

/**
 * Tell the active GM about discovered pins and show them at once.
 * @param {string[]} ids
 */
async function report(ids) {
  const scene = canvas.scene;
  for ( const id of ids ) {
    pending.add(id);
    localFound.add(id);
    refreshPin(id);
  }
  const result = await request("discover", {sceneId: scene.id, noteIds: ids});
  for ( const id of ids ) pending.delete(id);
  if ( result.ok ) {
    for ( const id of ids ) {
      known.set(id, true);
      const doc = scene.notes.get(id);
      if ( doc ) announce(doc);
    }
    return;
  }
  // Nobody wrote it down: show the pins as before and try again later
  for ( const id of ids ) {
    localFound.delete(id);
    refreshPin(id);
  }
  retryAfter = Date.now() + 20000;
}

/**
 * Show a player that a pin appeared: a short ping at the pin and a note.
 * @param {NoteDocument} doc
 */
function announce(doc) {
  if ( announced.has(doc.id) || game.user.isGM ) return;
  announced.add(doc.id);
  if ( !setting("discoverPing") ) return;
  const name = describePin({document: doc}).label;
  ui.notifications.info(t("SMP.Discover.found", {name}));
  if ( canvas.scene?.id !== doc.parent?.id ) return;
  try {
    canvas.ping({x: doc.x, y: doc.y});
  } catch(err) {
    console.debug(`${MODULE_ID} | Could not ping`, err);
  }
}

/**
 * Start watching the viewed scene. Call on "canvasReady".
 */
export function startDiscovery() {
  stopDiscovery();
  for ( const doc of canvas.scene?.notes ?? [] ) {
    known.set(doc.id, !undiscoveredFor(flagsOf(doc), game.user.id, game.user.isGM));
  }
  if ( game.user.isGM ) return;
  canvas.fog?.addEventListener?.("explored", scheduleCheck);
  // The fog loads after the canvas: look again a few times
  for ( const delay of [800, 2500, 6000] ) timers.add(setTimeout(checkDiscovery, delay));
}

/**
 * Stop watching. Call on "canvasTearDown".
 */
export function stopDiscovery() {
  clearTimeout(timer);
  timer = 0;
  for ( const id of timers ) clearTimeout(id);
  timers.clear();
  known.clear();
  announced.clear();
  pending.clear();
  localFound.clear();
  retryAfter = 0;
  try {
    canvas.fog?.removeEventListener?.("explored", scheduleCheck);
  } catch(err) {
    // The canvas is going away
  }
}

/**
 * Hook "createNote": a pin that is new to this client counts as seen.
 * @param {NoteDocument} doc
 */
export function onCreateNote(doc) {
  if ( doc.parent === canvas.scene ) known.set(doc.id, !undiscoveredFor(flagsOf(doc), game.user.id, game.user.isGM));
}

/**
 * Hook "deleteNote".
 * @param {NoteDocument} doc
 */
export function onDeleteNote(doc) {
  known.delete(doc.id);
  announced.delete(doc.id);
  localFound.delete(doc.id);
}

/**
 * Hook "updateNote": show or hide the pin, tell a player when a pin newly appeared, look at the fog again.
 * @param {NoteDocument} doc
 * @param {object} changes
 */
export function onUpdateNote(doc, changes) {
  if ( !changes?.flags || !(MODULE_ID in changes.flags) || (doc.parent !== canvas.scene) ) return;
  // The saved flags decide from here on, not the pin shown a moment ago
  localFound.delete(doc.id);
  refreshPin(doc);
  const shown = !undiscoveredFor(flagsOf(doc), game.user.id, game.user.isGM);
  const was = known.get(doc.id);
  known.set(doc.id, shown);
  if ( !shown ) announced.delete(doc.id);
  else if ( (was === false) ) announce(doc);
  scheduleCheck();
}

/* -------------------------------------------- */
/*  What the GM does                            */
/* -------------------------------------------- */

/**
 * The socket request of a player: these pins are in explored ground. The active GM checks that the pins are hidden
 * pins of the scene and writes the user into their found lists.
 * @param {object} message
 * @param {User} sender
 * @returns {Promise<{ok: boolean, reason?: string, count?: number}>}   ok only when something was written
 */
export async function handleDiscover(message, sender) {
  const scene = game.scenes.get(String(message.sceneId ?? ""));
  if ( !scene ) return {ok: false, reason: "scene"};
  const ids = Array.isArray(message.noteIds) ? message.noteIds.slice(0, 50).map(String) : [];
  const updates = [];
  for ( const id of new Set(ids) ) {
    const note = scene.notes.get(id);
    if ( !note ) continue;
    const flags = flagsOf(note);
    if ( !isHiddenPin(flags) || isDiscovered(flags, sender.id) || blockedList(flags).includes(sender.id) ) continue;
    updates.push({_id: id, flags: {[MODULE_ID]: {found: changeFound(foundList(flags), {add: [sender.id]})}}});
  }
  if ( updates.length ) {
    await scene.updateEmbeddedDocuments("Note", updates);
    countFeature(MODULE_ID, "pinDiscovered");
  }
  return updates.length ? {ok: true, count: updates.length} : {ok: false, reason: "none"};
}

/**
 * Hide a pin until it is discovered, or show it to everybody like any pin (GM).
 * @param {NoteDocument} doc
 * @param {boolean} hidden
 */
export async function setHidden(doc, hidden) {
  const change = hidden ? {hidden: true} : applyRemovals({"-=hidden": null});
  await doc.update({flags: {[MODULE_ID]: change}});
}

/**
 * Reveal a pin for players or hide it again (GM). A player the pin is hidden from again does not discover it by
 * exploring until it is revealed for that player again.
 * @param {NoteDocument} doc
 * @param {object} options
 * @param {boolean} [options.all]       Reveal for everybody
 * @param {string[]} [options.users]    Reveal for these users
 * @param {string[]} [options.hideFor]  Hide again for these users
 * @param {boolean} [options.reset]     Hide again for everybody
 * @returns {Promise<string[]>}  The found list now
 */
export async function revealPin(doc, {all = false, users = [], hideFor = [], reset = false} = {}) {
  const flags = flagsOf(doc);
  const playerIds = game.users.filter(u => !u.isGM).map(u => u.id);
  const {found, blocked} = revealResult(flags, {playerIds, all, add: users, remove: hideFor, reset});
  const change = {};
  if ( !isHiddenPin(flags) ) change.hidden = true;
  if ( found.length ) change.found = found;
  else if ( "found" in flags ) Object.assign(change, applyRemovals({"-=found": null}));
  if ( blocked.length ) change.blocked = blocked;
  else if ( "blocked" in flags ) Object.assign(change, applyRemovals({"-=blocked": null}));
  await doc.update({flags: {[MODULE_ID]: change}});
  if ( found.length ) countFeature(MODULE_ID, "pinRevealed");
  return found;
}

/**
 * Ask the GM whom to reveal a pin to, then do it. The window offers everybody, chosen players and hiding again.
 * @param {NoteDocument} doc
 * @returns {Promise<boolean>} Whether something was done
 */
export async function askReveal(doc) {
  const found = foundList(flagsOf(doc));
  const rows = game.users.filter(u => !u.isGM).map(user => {
    const knows = found.includes(EVERYBODY) || found.includes(user.id);
    return `<label class="smp-reveal-user"><input type="checkbox" name="user" value="${esc(user.id)}"
      ${knows ? "checked" : ""}><span class="smp-reveal-name" style="--smp-chip: ${esc(user.color?.css ?? user.color ?? "#888")}">
      <span class="smp-dot"></span>${esc(user.name)}</span>
      <small>${esc(user.active ? t("SMP.Reveal.online") : "")}${knows ? ` ${esc(t("SMP.Reveal.knows"))}` : ""}</small></label>`;
  });
  const content = `<div class="smp-app smp-reveal" data-smp-theme="${esc(setting("theme"))}">
    <p class="smp-reveal-name-line">${esc(describePin({document: doc}).label)}</p>
    <p class="hint">${esc(t(isHiddenPin(flagsOf(doc)) ? "SMP.Reveal.hint" : "SMP.Reveal.hintVisible"))}</p>
    <div class="smp-reveal-users">${rows.join("") || `<p>${esc(t("SMP.Reveal.noPlayers"))}</p>`}</div></div>`;
  const checked = button => [...button.form.querySelectorAll("input[name=user]:checked")].map(i => i.value);
  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: t("SMP.Reveal.title"), icon: "fa-solid fa-eye"},
    position: {width: 480},
    content,
    rejectClose: false,
    render: (event, dialog) => addSettingsGear(dialog.element),
    buttons: [
      {action: "all", label: t("SMP.Reveal.all"), icon: "fa-solid fa-users", default: true, callback: () => ({all: true})},
      {action: "chosen", label: t("SMP.Reveal.chosen"), icon: "fa-solid fa-user-check", callback: (event, button) => {
        const users = checked(button);
        const hideFor = [...button.form.querySelectorAll("input[name=user]:not(:checked)")].map(i => i.value);
        return {users, hideFor};
      }},
      {action: "reset", label: t("SMP.Reveal.reset"), icon: "fa-solid fa-eye-slash", callback: () => ({reset: true})},
      {action: "cancel", label: t("SMP.Reveal.cancel"), icon: "fa-solid fa-xmark", callback: () => null}
    ]
  });
  if ( !result ) return false;
  await revealPin(doc, result);
  return true;
}

/**
 * Set the quest state of a pin (GM).
 * @param {NoteDocument} doc
 * @param {string} state   "open", "done", "failed" or "" for none
 */
export async function setQuest(doc, state) {
  const quest = cleanQuest(state);
  await doc.update({flags: {[MODULE_ID]: quest ? {quest} : applyRemovals({"-=quest": null})}});
  if ( quest ) countFeature(MODULE_ID, "questSet");
}
