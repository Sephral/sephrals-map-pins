/**
 * Numbering the pins of a scene: the tool "Number the pins of this scene", new pins getting the next number, and the
 * numbers taken from journal names.
 */

import {MODULE_ID, esc, flagsOf, setting, t} from "./config.mjs";
import {assignNumbers, cleanNumber, nextNumber, numberFromName, orderPins} from "./pin-logic.mjs";
import {countFeature} from "./usage.mjs";

const {DialogV2} = foundry.applications.api;

/**
 * Number the pins of a scene.
 * @param {Scene} [scene=canvas.scene]
 * @param {object} [options]
 * @param {"reading"|"columns"|"name"|"listed"} [options.order="reading"]
 * @param {string} [options.prefix=""]       Letters in front of every number
 * @param {number} [options.start=1]         The first number
 * @param {boolean} [options.keep=false]     Leave pins that have a number alone
 * @param {boolean} [options.fromNames=false]  Take "12." from the start of a pin's name first
 * @returns {Promise<{changed: number, total: number}>}
 */
export async function numberPins(scene = canvas.scene, {order = "reading", prefix = "", start = 1, keep = false,
  fromNames = false} = {}) {
  if ( !game.user.isGM ) throw new Error("Only a GM can number pins");
  if ( !scene ) return {changed: 0, total: 0};
  const notes = scene.notes.contents.filter(n => !flagsOf(n).private);
  const updates = new Map();
  const pins = notes.map(note => {
    const flags = flagsOf(note);
    let number = cleanNumber(flags.number);
    if ( fromNames && !number ) {
      const parsed = numberFromName(note.page?.name || note.entry?.name || "");
      if ( parsed ) {
        number = parsed.number;
        updates.set(note.id, parsed.number);
      }
    }
    return {id: note.id, x: note.x, y: note.y, name: note.label, sort: note.sort, number};
  });
  const band = Math.max(scene.grid?.size ?? 100, 50);
  const ordered = orderPins(pins, order, band);
  const effectiveKeep = keep || fromNames;
  for ( const change of assignNumbers(ordered, {prefix, start, keep: effectiveKeep}) ) {
    updates.set(change.id, change.number);
  }
  const data = [];
  for ( const [id, number] of updates ) {
    if ( cleanNumber(flagsOf(scene.notes.get(id)).number) !== number ) {
      data.push({_id: id, [`flags.${MODULE_ID}.number`]: number});
    }
  }
  if ( data.length ) await scene.updateEmbeddedDocuments("Note", data);
  countFeature(MODULE_ID, "pinsNumbered");
  return {changed: data.length, total: notes.length};
}

/**
 * Ask how to number the pins of the viewed scene, then do it.
 * @returns {Promise<{changed: number, total: number}|null>}
 */
export async function numberDialog() {
  if ( !game.user.isGM || !canvas.scene ) return null;
  const orders = ["reading", "columns", "name", "listed"];
  const content = `<div class="smp-app smp-dialog" data-smp-theme="${esc(setting("theme"))}">
    <p>${esc(t("SMP.Numbers.intro", {scene: canvas.scene.name, count: canvas.scene.notes.size}))}</p>
    <div class="form-group"><label>${esc(t("SMP.Numbers.order"))}</label><div class="form-fields"><select name="order">
      ${orders.map(o => `<option value="${o}">${esc(t(`SMP.Numbers.orders.${o}`))}</option>`).join("")}</select></div></div>
    <div class="form-group"><label>${esc(t("SMP.Numbers.prefix"))}</label><div class="form-fields">
      <input type="text" name="prefix" maxlength="2" value="" placeholder="B"></div></div>
    <div class="form-group"><label>${esc(t("SMP.Numbers.start"))}</label><div class="form-fields">
      <input type="number" name="start" min="0" max="9999" value="1"></div></div>
    <div class="form-group"><label>${esc(t("SMP.Numbers.keep"))}</label><div class="form-fields">
      <input type="checkbox" name="keep"></div><p class="hint">${esc(t("SMP.Numbers.keepHint"))}</p></div>
    <div class="form-group"><label>${esc(t("SMP.Numbers.fromNames"))}</label><div class="form-fields">
      <input type="checkbox" name="fromNames" checked></div><p class="hint">${esc(t("SMP.Numbers.fromNamesHint"))}</p></div>
  </div>`;
  const options = await DialogV2.prompt({
    window: {title: t("SMP.Numbers.title"), icon: "fa-solid fa-arrow-down-1-9"},
    position: {width: 520},
    content,
    rejectClose: false,
    ok: {
      label: t("SMP.Numbers.go"),
      icon: "fa-solid fa-check",
      callback: (event, button) => {
        const fd = new foundry.applications.ux.FormDataExtended(button.form).object;
        return {order: fd.order, prefix: fd.prefix, start: Number(fd.start), keep: !!fd.keep, fromNames: !!fd.fromNames};
      }
    }
  });
  if ( !options ) return null;
  const result = await numberPins(canvas.scene, options);
  ui.notifications.info(t("SMP.Numbers.done", result));
  return result;
}

/**
 * Hook "preCreateNote": a new pin gets the next number, and a new pin can be visible without line of sight.
 * @param {NoteDocument} doc
 * @param {object} data
 * @param {object} options
 * @param {string} userId
 */
/**
 * The numbers in use on a scene, including the ones taken from journal names.
 * @param {Scene} scene
 * @returns {string[]}
 */
export function usedNumbers(scene) {
  const fromNames = setting("numberFromName");
  return scene.notes.map(n => {
    const own = cleanNumber(flagsOf(n).number);
    if ( own || !fromNames ) return own;
    return numberFromName(n.page?.name || n.entry?.name || "")?.number ?? "";
  }).filter(Boolean);
}

export function onPreCreateNote(doc, data, options, userId) {
  if ( userId !== game.user.id ) return;
  const flags = doc._source?.flags?.[MODULE_ID] ?? {};
  if ( flags.owner ) return;
  if ( setting("newGlobal") && !("global" in (data ?? {})) ) doc.updateSource({global: true});
  // A pin made without the dialog (dropped on the map) follows the world default for hidden pins
  if ( setting("discoverDefault") && game.user.isGM && !("hidden" in (data?.flags?.[MODULE_ID] ?? {})) ) {
    doc.updateSource({[`flags.${MODULE_ID}.hidden`]: true});
  }
  if ( setting("autoNumber") && game.user.isGM && !cleanNumber(flags.number) && doc.parent ) {
    doc.updateSource({[`flags.${MODULE_ID}.number`]: nextNumber(usedNumbers(doc.parent))});
  }
}
