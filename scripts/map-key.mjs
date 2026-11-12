/**
 * The map key: a journal "Map key: <scene>" with one page per numbered pin in number order, so the GM has a keyed
 * handout of the adventure map. Each page holds the number, the title, a link to the pin's journal, the category, the
 * quest state and the first lines or the full text of the journal. Updating rewrites only the generated part of a
 * page, so what the GM wrote before or after it stays (see mergeGenerated).
 */

import {MODULE_ID, addSettingsGear, esc, flagsOf, setting, t} from "./config.mjs";
import {cleanQuest, isHiddenPin} from "./discover-logic.mjs";
import {cleanKeyText, keyPageHtml, keyPins, planKey} from "./key-logic.mjs";
import {describePin} from "./note-style.mjs";
import {previewFromHtml} from "./pin-logic.mjs";
import {readJournal} from "./preview.mjs";
import {countFeature, markUsed} from "./usage.mjs";

/** The most characters of "the full text" of a page. */
const FULL = 60000;

/**
 * The journal of a scene's map key, when there is one.
 * @param {Scene} scene
 * @returns {JournalEntry|null}
 */
export function keyJournal(scene) {
  return game.journal.find(j => j.flags?.[MODULE_ID]?.keyScene === scene.id) ?? null;
}

/**
 * The text lines of a pin for its key page.
 * @param {NoteDocument} doc
 * @param {string} text   "lines", "full" or "title"
 * @returns {{kind: string, text: string}[]}
 */
function textOf(doc, text) {
  if ( text === "title" ) return [];
  const max = (text === "full") ? FULL : Math.min(Math.max(Number(setting("previewChars")) || 300, 80), 1000);
  const own = String(flagsOf(doc).previewText ?? "").trim();
  const entry = doc.entry;
  if ( entry ) {
    const found = readJournal(entry, doc.page, game.user, max).blocks;
    if ( found.length && ((text === "full") || !own) ) return found;
  }
  if ( own ) return previewFromHtml(own.split(/\n+/).map(l => `<p>${l.replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;",
    ">": "&gt;"})[c])}</p>`).join(""), {maxChars: max}).blocks;
  return [];
}

/**
 * The enricher text of a link to the journal of a pin.
 * @param {NoteDocument} doc
 * @param {string} title
 * @returns {string}
 */
function linkOf(doc, title) {
  const target = doc.page ?? doc.entry;
  if ( !target ) return "";
  return `@UUID[${target.uuid}]{${title.replace(/[\]}[{]/g, "")}}`;
}

/**
 * Create or update the map key of a scene (GM).
 * @param {Scene} [scene]
 * @param {object} [options]
 * @param {"lines"|"full"|"title"} [options.text]   What each page holds besides the title, the setting by default
 * @param {boolean} [options.open=true]   Open the journal afterwards
 * @returns {Promise<{journal: JournalEntry, created: number, updated: number, kept: number, removed: number}|null>}
 */
export async function makeKey(scene = canvas.scene, {text, open = true} = {}) {
  if ( !game.user.isGM ) return null;
  if ( !scene ) return null;
  const mode = cleanKeyText(text ?? setting("keyText"));
  const pins = keyPins(scene.notes.map(doc => {
    const d = describePin({document: doc});
    return {doc, d, id: doc.id, number: d.number};
  })).map(pin => {
    const title = pin.d.label;
    const flags = pin.d.flags;
    const quest = cleanQuest(flags.quest);
    return {
      id: pin.id,
      number: pin.number,
      title,
      html: keyPageHtml({title, link: linkOf(pin.doc, title), category: pin.d.category?.name ?? "",
        quest: quest ? t(`SMP.Quest.state.${quest}`) : "", hidden: isHiddenPin(flags) ? t("SMP.Key.hiddenPin") : "",
        blocks: textOf(pin.doc, mode)})
    };
  });
  let journal = keyJournal(scene);
  if ( !journal ) {
    journal = await JournalEntry.create({
      name: t("SMP.Key.name", {scene: scene.name}),
      ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
      flags: {[MODULE_ID]: {keyScene: scene.id}}
    });
  }
  const html = CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;
  const pages = journal.pages.contents.filter(p => p.flags?.[MODULE_ID]?.keyFor).map(p => ({
    id: p.id,
    pin: p.flags[MODULE_ID].keyFor,
    // A page the GM turned into another format is left alone
    content: (p.text?.format === html) ? (p.text?.content ?? "") : null,
    generated: p.flags[MODULE_ID].generated ?? ""
  }));
  const editable = pages.filter(p => p.content !== null);
  const foreign = pages.filter(p => p.content === null).map(p => p.id);
  const plan = planKey(pins, editable);
  const byPin = new Map(pins.map(p => [p.id, p]));
  const sort = index => (index + 1) * 100000;
  const name = pin => `${pin.number}. ${pin.title}`;

  if ( plan.create.length ) {
    await journal.createEmbeddedDocuments("JournalEntryPage", plan.create.map(c => {
      const pin = byPin.get(c.pin);
      return {name: name(pin), type: "text", sort: sort(c.index), text: {content: c.html, format: html},
        flags: {[MODULE_ID]: {keyFor: c.pin, generated: c.html}}};
    }));
  }
  const updates = plan.update.map(u => {
    const pin = byPin.get(u.pin);
    const data = {_id: u.id, sort: sort(u.index)};
    if ( u.content !== null ) {
      data.name = name(pin);
      data["text.content"] = u.content;
      data[`flags.${MODULE_ID}.generated`] = u.generated;
    }
    return data;
  });
  if ( updates.length ) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
  if ( plan.remove.length ) await journal.deleteEmbeddedDocuments("JournalEntryPage", plan.remove);
  const result = {journal, created: plan.create.length, updated: plan.update.filter(u => u.changed).length,
    kept: plan.kept.length + foreign.length, removed: plan.remove.length};
  countFeature(MODULE_ID, "mapKeyMade");
  markUsed(MODULE_ID);
  ui.notifications.info(t("SMP.Key.done", {name: journal.name, ...result}));
  if ( open ) journal.sheet.render(true);
  return result;
}

/**
 * Ask what the key pages should hold, then make the key (GM).
 * @returns {Promise<object|null>}
 */
export async function keyDialog() {
  if ( !game.user.isGM || !canvas.scene ) return null;
  const scene = canvas.scene;
  const current = cleanKeyText(setting("keyText"));
  const numbered = scene.notes.filter(doc => describePin({document: doc}).number).length;
  const exists = !!keyJournal(scene);
  const options = ["lines", "full", "title"].map(key => `<option value="${key}" ${key === current ? "selected" : ""}>${
    esc(t(`SMP.SETTINGS.keyText.${key}`))}</option>`).join("");
  const content = `<div class="smp-app smp-keydialog" data-smp-theme="${esc(setting("theme"))}">
    <p>${esc(t(exists ? "SMP.Key.introUpdate" : "SMP.Key.intro", {scene: scene.name, count: numbered}))}</p>
    <div class="form-group"><label>${esc(t("SMP.Key.text"))}</label>
      <div class="form-fields"><select name="text">${options}</select></div></div>
    <p class="hint">${esc(t("SMP.Key.hint"))}</p></div>`;
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: {title: t("SMP.Key.title"), icon: "fa-solid fa-book-open"},
    position: {width: 460},
    content,
    rejectClose: false,
    render: (event, dialog) => addSettingsGear(dialog.element),
    ok: {
      label: t(exists ? "SMP.Key.update" : "SMP.Key.create"),
      icon: "fa-solid fa-check",
      callback: (event, button) => button.form.elements.text.value
    }
  });
  if ( !choice ) return null;
  return makeKey(scene, {text: choice});
}
