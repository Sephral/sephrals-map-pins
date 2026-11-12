/**
 * The menu of a pin: a right click on a pin opens a small menu with what the module adds. The GM can hide a pin until
 * it is discovered, reveal it for everybody or chosen players, hide it again and set a quest state. Everybody who
 * builds routes can add the pin to the route. The menu is built from plain elements.
 */

import {MODULE_ID, flagsOf, setting, t} from "./config.mjs";
import {QUEST_STATES, cleanQuest, isHiddenPin} from "./discover-logic.mjs";
import {askReveal, revealPin, setHidden, setQuest} from "./discover.mjs";
import {describePin} from "./note-style.mjs";
import {addStop, canBuildRoute, inRoute} from "./route.mjs";

let menu = null;

/** The right button went down on a pin: {id, x, y, time}. */
let down = null;

/** Close the menu. */
export function closeMenu() {
  menu?.remove();
  menu = null;
  window.removeEventListener("pointerdown", onOutside, true);
  window.removeEventListener("keydown", onKey, true);
}

/**
 * Close the menu when something else is clicked.
 * @param {PointerEvent} event
 */
function onOutside(event) {
  if ( menu && !menu.contains(event.target) ) closeMenu();
}

/**
 * Close the menu on Escape.
 * @param {KeyboardEvent} event
 */
function onKey(event) {
  if ( event.key === "Escape" ) closeMenu();
}

/**
 * The entries of the menu of a pin for this user.
 * @param {NoteDocument} doc
 * @returns {{label: string, icon: string, run: Function, on?: boolean, divider?: boolean}[]}
 */
export function menuEntries(doc) {
  const flags = flagsOf(doc);
  const entries = [];
  if ( game.user.isGM ) {
    if ( isHiddenPin(flags) ) {
      entries.push({label: t("SMP.Menu.reveal"), icon: "fa-eye", run: () => askReveal(doc)});
      entries.push({label: t("SMP.Menu.unhide"), icon: "fa-eye-slash", run: () => setHidden(doc, false)});
      entries.push({label: t("SMP.Menu.revealAll"), icon: "fa-users", run: () => revealPin(doc, {all: true})});
    } else {
      entries.push({label: t("SMP.Menu.hide"), icon: "fa-eye-slash", run: () => setHidden(doc, true)});
    }
    const quest = cleanQuest(flags.quest);
    entries.push({divider: true});
    for ( const state of [...QUEST_STATES, ""] ) {
      entries.push({label: state ? t(`SMP.Quest.set.${state}`) : t("SMP.Quest.set.none"), icon: {open: "fa-circle-exclamation",
        done: "fa-circle-check", failed: "fa-circle-xmark", "": "fa-circle-minus"}[state], on: quest === state,
      run: () => setQuest(doc, state)});
    }
  }
  if ( canBuildRoute() ) {
    entries.push({divider: true});
    entries.push({label: t("SMP.Menu.addToRoute"), icon: "fa-route", on: inRoute(doc.id), run: () => addStop(doc.id)});
  }
  if ( game.user.isGM ) {
    entries.push({divider: true});
    entries.push({label: t("SMP.Menu.settings"), icon: "fa-gear", run: () => doc.sheet.render(true)});
  }
  return entries;
}

/**
 * Open the menu of a pin at a screen position.
 * @param {NoteDocument} doc
 * @param {{x: number, y: number}} at
 * @returns {HTMLElement|null}
 */
export function openMenu(doc, at) {
  closeMenu();
  const entries = menuEntries(doc);
  if ( !entries.length ) return null;
  menu = document.createElement("div");
  menu.className = "smp-app smp-menu";
  menu.dataset.smpTheme = setting("theme");
  menu.setAttribute("role", "menu");
  const title = document.createElement("div");
  title.className = "smp-menu-title";
  title.textContent = describePin({document: doc}).label;
  menu.append(title);
  for ( const entry of entries ) {
    if ( entry.divider ) {
      const line = document.createElement("hr");
      menu.append(line);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    if ( entry.on ) button.classList.add("is-on");
    const icon = document.createElement("i");
    icon.className = `fa-solid ${entry.icon}`;
    button.append(icon, document.createTextNode(` ${entry.label}`));
    button.addEventListener("click", () => {
      closeMenu();
      Promise.resolve(entry.run()).catch(err => console.error(`${MODULE_ID} | The pin menu failed`, err));
    });
    menu.append(button);
  }
  menu.style.visibility = "hidden";
  document.body.append(menu);
  const x = Math.min(Math.max(at.x, 8), Math.max(window.innerWidth - menu.offsetWidth - 8, 8));
  const y = Math.min(Math.max(at.y, 8), Math.max(window.innerHeight - menu.offsetHeight - 8, 8));
  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;
  menu.style.visibility = "";
  window.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("keydown", onKey, true);
  return menu;
}

/**
 * Listen for a right click on a pin. A press that moves (panning the map) does not open the menu. Call on
 * "canvasReady".
 */
export function bindMenu() {
  const stage = canvas.stage;
  stage.off("pointerdowncapture", onDown);
  stage.on("pointerdowncapture", onDown);
  stage.off("pointerupcapture", onUp);
  stage.on("pointerupcapture", onUp);
}

/**
 * The pin under a pointer event, when the event is on a pin's icon.
 * @param {FederatedPointerEvent} event
 * @returns {Note|null}
 */
function pinOf(event) {
  const note = event.target?.parent;
  if ( !note?.document || (note.document.documentName !== "Note") || (note.controlIcon !== event.target) ) return null;
  return note;
}

/**
 * @param {FederatedPointerEvent} event
 */
function onDown(event) {
  if ( event.button !== 2 ) return;
  const note = pinOf(event);
  down = note ? {id: note.id, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY, time: performance.now()} : null;
}

/**
 * @param {FederatedPointerEvent} event
 */
function onUp(event) {
  if ( (event.button !== 2) || !down ) return;
  const start = down;
  down = null;
  const note = pinOf(event);
  if ( !note || (note.id !== start.id) ) return;
  const moved = Math.hypot(event.nativeEvent.clientX - start.x, event.nativeEvent.clientY - start.y);
  if ( (moved > 6) || ((performance.now() - start.time) > 600) ) return;
  openMenu(note.document, {x: event.nativeEvent.clientX, y: event.nativeEvent.clientY});
}
