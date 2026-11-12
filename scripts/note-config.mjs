/**
 * The "Map Pins" section of Foundry's note dialog. Its fields are named like the module's flags, so Foundry saves
 * them with the note. Empty choices mean "like the world" and are not stored (see cleanNoteChanges).
 */

import {DEFAULT_NOTE_ICON, MODULE_ID, TEMPLATES, applyRemovals, flagsOf, setting, t} from "./config.mjs";
import {FLAG_KEYS, cleanFlags, cleanNumber, nextNumber} from "./pin-logic.mjs";
import {usedNumbers} from "./numbering.mjs";
import {categoryList, worldStyle} from "./state.mjs";
import {QUEST_STATES, cleanQuest, foundList, isHiddenPin} from "./discover-logic.mjs";
import {askReveal} from "./discover.mjs";

/**
 * Options of a select, with the current value marked.
 * @param {[string, string][]} options   [value, label]
 * @param {string} current
 * @returns {{value: string, label: string, selected: boolean}[]}
 */
function choices(options, current) {
  return options.map(([value, label]) => ({value, label, selected: String(current ?? "") === value}));
}

/**
 * Hook "renderNoteConfig": add the section to the note dialog.
 * @param {ApplicationV2} app
 * @param {HTMLElement} html
 */
export async function onRenderNoteConfig(app, html) {
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  if ( !element || element.querySelector(".smp-config") ) return;
  const doc = app.document;
  const flags = flagsOf(doc);
  const world = worldStyle();
  const like = t("SMP.Config.like");
  const worldLabel = t(`SMP.Choice.label.${world.labelMode}`);
  const pick = (on, a, b) => t(on ? a : b);
  const texture = doc._source?.texture?.src || DEFAULT_NOTE_ICON;
  const scenes = game.scenes.contents.filter(s => game.user.isGM || s.visible)
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  const numbers = doc.parent ? usedNumbers(doc.parent) : [];
  const data = {
    prefix: `flags.${MODULE_ID}`,
    theme: setting("theme"),
    texture,
    values: {minZoom: flags.minZoom ?? "", number: flags.number ?? "", previewText: flags.previewText ?? "",
      previewImage: flags.previewImage ?? "", hidden: isHiddenPin(flags)},
    existing: !!doc.collection?.has(doc.id),
    foundText: isHiddenPin(flags) ? t("SMP.Config.foundBy", {count: foundList(flags).includes("*")
      ? t("SMP.Reveal.everybody") : foundList(flags).length}) : "",
    numberHint: nextNumber(numbers),
    choices: {
      label: choices([["", `${like} (${worldLabel})`], ["always", t("SMP.Choice.label.always")],
        ["hover", t("SMP.Choice.label.hover")], ["never", t("SMP.Choice.label.never")]], flags.label),
      background: choices([
        ["", `${like} (${pick(world.noBackground, "SMP.Choice.background.none", "SMP.Choice.background.box")})`],
        ["box", t("SMP.Choice.background.box")], ["none", t("SMP.Choice.background.none")]], flags.background),
      size: choices([
        ["", `${like} (${pick(world.constantSize, "SMP.Choice.size.constant", "SMP.Choice.size.scene")})`],
        ["constant", t("SMP.Choice.size.constant")], ["scene", t("SMP.Choice.size.scene")]], flags.size),
      category: choices([["", t("SMP.Config.noCategory")], ...categoryList().map(c => [c.id, c.name])], flags.category),
      preview: choices([
        ["", `${like} (${pick(world.preview, "SMP.Choice.preview.on", "SMP.Choice.preview.off")})`],
        ["on", t("SMP.Choice.preview.on")], ["off", t("SMP.Choice.preview.off")]], flags.preview),
      scene: choices([["", t("SMP.Config.noScene")], ...scenes.map(s => [s.id, s.name])], flags.scene),
      quest: choices([["", t("SMP.Quest.none")], ...QUEST_STATES.map(key => [key, t(`SMP.Quest.state.${key}`)])],
        cleanQuest(flags.quest))
    },
    text: Object.fromEntries(["title", "imageHint", "label", "background", "size", "minZoom", "minZoomHint", "number",
      "numberHint", "category", "preview", "previewText", "previewTextHint", "previewImage", "scene", "sceneHint",
      "like", "hidden", "hiddenHint", "reveal", "quest", "questHint"].map(key => [key, t(`SMP.Config.${key}`)]))
  };
  const markup = await foundry.applications.handlebars.renderTemplate(`${TEMPLATES}/note-section.hbs`, data);
  if ( element.querySelector(".smp-config") ) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup;
  const section = wrapper.firstElementChild;
  const body = element.querySelector(".form-body") ?? element.querySelector("form");
  if ( !body ) return;
  body.append(section);

  // The picture of the pin, from the icon fields of Foundry's own dialog
  const preview = section.querySelector("[data-smp-texture]");
  const form = element.matches("form") ? element : element.querySelector("form");
  const update = () => {
    const els = form?.elements;
    const src = els?.["icon.selected"]?.value || els?.["icon.custom"]?.value || texture;
    preview.src = src || DEFAULT_NOTE_ICON;
  };
  form?.addEventListener("change", event => {
    if ( ["icon.selected", "icon.custom"].includes(event.target?.name) ) update();
  });
  form?.addEventListener("input", event => {
    if ( event.target?.name === "icon.custom" ) update();
  });
  update();
  // Hidden until discovered: a new pin follows the world default, an existing one can be revealed from here
  if ( setting("discoverDefault") && !doc.collection?.has(doc.id) ) {
    const hiddenBox = form?.elements?.[`flags.${MODULE_ID}.hidden`];
    if ( hiddenBox && ("checked" in hiddenBox) ) hiddenBox.checked = true;
  }
  section.querySelector("[data-smp-reveal]")?.addEventListener("click", event => {
    event.preventDefault();
    askReveal(doc);
  });
  // New pins can be visible without line of sight by default
  if ( setting("newGlobal") && !doc.collection?.has(doc.id) ) {
    const box = form?.elements?.global;
    if ( box && ("checked" in box) ) box.checked = true;
  }
  app.setPosition?.({height: "auto"});
}

/**
 * Clean the module's part of the changes of a note before it is saved: empty choices are removed.
 * @param {NoteDocument} doc
 * @param {object} changes   The update, changed in place
 */
export function cleanNoteChanges(doc, changes) {
  const mine = changes?.flags?.[MODULE_ID];
  if ( !mine || (typeof mine !== "object") ) return;
  if ( "number" in mine ) mine.number = cleanNumber(mine.number);
  if ( "minZoom" in mine ) mine.minZoom = (mine.minZoom === "" || mine.minZoom === null) ? null : Number(mine.minZoom);
  const cleaned = cleanFlags(mine, flagsOf(doc));
  if ( cleaned ) changes.flags[MODULE_ID] = applyRemovals(cleaned);
  else {
    delete changes.flags[MODULE_ID];
    if ( !Object.keys(changes.flags).length ) delete changes.flags;
  }
}

/**
 * Remove empty module flags from a note that is about to be created.
 * @param {NoteDocument} doc
 */
export function cleanNewNote(doc) {
  const mine = doc._source?.flags?.[MODULE_ID];
  if ( !mine ) return;
  const data = {...mine};
  if ( "number" in data ) data.number = cleanNumber(data.number);
  const cleaned = cleanFlags(data, {}) ?? {};
  const changes = {};
  for ( const key of FLAG_KEYS ) if ( (key in mine) && !(key in cleaned) ) changes[`-=${key}`] = null;
  if ( cleaned.number && (cleaned.number !== mine.number) ) changes.number = cleaned.number;
  if ( Object.keys(changes).length ) doc.updateSource({flags: {[MODULE_ID]: applyRemovals(changes)}});
}
