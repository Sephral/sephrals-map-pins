/**
 * The preview card on hover: title, picture and the first lines of the pin's journal. The rights come first: content of
 * a journal is read only after Foundry's permission check for this user passed (Observer for text and picture,
 * Limited shows the title only). The card is built from plain text with createElement, no HTML of a journal is ever
 * put into the page.
 */

import {MODULE_ID, flagsOf, setting, t} from "./config.mjs";
import {LIMITS, previewAccess, previewFromHtml, previewFromMarkdown, safeImageSrc} from "./pin-logic.mjs";
import {describePin} from "./note-style.mjs";
import {countFeature} from "./usage.mjs";

/** How long the pointer rests on a pin before the card appears, in milliseconds. */
const DELAY = 220;

let card = null;
let timer = 0;
let shownFor = null;

/**
 * The card's content for a pin and the user, or null when there is nothing to show. This is the rights check.
 * @param {Note} note
 * @param {User} [user=game.user]
 * @returns {{title: string, blocks: {kind: string, text: string}[], image: string, mode: string}|null}
 */
export function buildPreview(note, user = game.user) {
  const data = previewData(note, user);
  const quest = data ? describePin(note).quest : "";
  if ( data && quest ) data.quest = t(`SMP.Quest.state.${quest}`);
  return data;
}

/**
 * The card's content without the quest line.
 * @param {Note} note
 * @param {User} user
 * @returns {{title: string, blocks: {kind: string, text: string}[], image: string, mode: string}|null}
 */
function previewData(note, user) {
  const doc = note.document;
  const flags = flagsOf(doc);
  const d = describePin(note);
  if ( !d.style.preview || d.privateHidden || d.undiscovered ) return null;
  const maxChars = Math.min(Math.max(Number(setting("previewChars")) || 300, 80), 1000);
  const title = d.label;

  // A private pin: the owner reads the text kept on this device, the GM sees the title
  if ( flags.private ) {
    if ( flags.owner !== user.id ) return {title, blocks: [], image: "", mode: "title"};
    const lines = String(d.local?.text ?? "").split(/\n+/).filter(Boolean).map(text => ({kind: "p", text}));
    return {title, blocks: lines.length ? previewFromHtml(lines.map(l => `<p>${esc(l.text)}</p>`).join(""),
      {maxChars}).blocks : [], image: "", mode: "own"};
  }

  return previewFromParts({title, flags, entry: doc.entry, page: doc.page, user});
}

/**
 * The card's content for a title, the module's flags and the journal behind it. This is the rights check, the same for
 * pins and for areas.
 * @param {object} parts
 * @param {string} parts.title
 * @param {object} parts.flags            The module's flags (previewText and previewImage)
 * @param {JournalEntry|null} parts.entry
 * @param {JournalEntryPage|null} parts.page
 * @param {User} parts.user
 * @returns {{title: string, blocks: {kind: string, text: string}[], image: string, mode: string}|null}
 */
export function previewFromParts({title, flags, entry, page, user}) {
  const maxChars = Math.min(Math.max(Number(setting("previewChars")) || 300, 80), 1000);
  const test = page ?? entry;
  const access = previewAccess({
    isGM: !!user.isGM,
    hasEntry: !!entry,
    canObserve: !!test?.testUserPermission?.(user, "OBSERVER"),
    canLimited: !!test?.testUserPermission?.(user, "LIMITED")
  });
  if ( access === "none" ) return null;
  if ( access === "title" ) return {title, blocks: [], image: "", mode: "title"};

  // The pin's own text and picture win over the journal's
  let blocks = [];
  let image = safeImageSrc(flags.previewImage);
  const own = String(flags.previewText ?? "").trim().slice(0, LIMITS.previewText);
  if ( own ) {
    blocks = previewFromHtml(own.split(/\n+/).map(l => `<p>${esc(l)}</p>`).join(""), {maxChars}).blocks;
  }
  if ( access === "full" && entry && (!blocks.length || !image) ) {
    const found = readJournal(entry, page, user, maxChars);
    if ( !blocks.length ) blocks = found.blocks;
    if ( !image ) image = found.image;
  }
  if ( !blocks.length && !image ) return {title, blocks: [], image: "", mode: access};
  return {title, blocks, image, mode: access};
}

/**
 * Escape text for the little html the preview parser reads.
 * @param {string} text
 * @returns {string}
 */
function esc(text) {
  return String(text).replace(/[&<>]/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"})[ch]);
}

/**
 * The first lines and the first picture of a journal entry, only from pages this user may observe.
 * @param {JournalEntry} entry
 * @param {JournalEntryPage|undefined} page   The page the pin points at, or undefined for the whole entry
 * @param {User} user
 * @param {number} maxChars
 * @returns {{blocks: {kind: string, text: string}[], image: string}}
 */
export function readJournal(entry, page, user, maxChars) {
  const pages = page ? [page] : entry.pages.contents.sort((a, b) => a.sort - b.sort);
  // Permission first: a page the user may not observe is never read
  const readable = pages.filter(p => user.isGM || p.testUserPermission(user, "OBSERVER"));
  let blocks = [];
  let image = "";
  for ( const p of readable ) {
    if ( p.type === "image" ) {
      image ||= safeImageSrc(p.src);
      continue;
    }
    if ( p.type !== "text" ) continue;
    const formats = CONST.JOURNAL_ENTRY_PAGE_FORMATS;
    const found = (p.text?.format === formats.MARKDOWN)
      ? previewFromMarkdown(p.text?.markdown ?? "", {maxChars})
      : previewFromHtml(p.text?.content ?? "", {maxChars});
    image ||= found.image;
    if ( !blocks.length ) blocks = found.blocks;
    if ( blocks.length && image ) break;
  }
  return {blocks, image};
}

/* -------------------------------------------- */
/*  The card                                    */
/* -------------------------------------------- */

/**
 * Build the card element for a preview.
 * @param {object} data   The result of buildPreview
 * @returns {HTMLElement}
 */
export function buildCard(data) {
  const el = document.createElement("div");
  el.id = "smp-preview";
  el.className = "smp-app smp-card";
  el.dataset.smpTheme = setting("theme");
  el.setAttribute("role", "tooltip");
  if ( data.image ) {
    const img = document.createElement("img");
    img.className = "smp-card-image";
    img.alt = "";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";
    img.src = data.image;
    img.addEventListener("error", () => img.remove());
    el.append(img);
  }
  const title = document.createElement("div");
  title.className = "smp-card-title";
  title.textContent = data.title;
  el.append(title);
  if ( data.quest ) {
    const quest = document.createElement("div");
    quest.className = "smp-card-quest";
    quest.textContent = data.quest;
    el.append(quest);
  }
  if ( data.blocks.length ) {
    const body = document.createElement("div");
    body.className = "smp-card-body";
    for ( const block of data.blocks ) {
      const line = document.createElement("p");
      line.className = `smp-card-${block.kind}`;
      line.textContent = block.text;
      body.append(line);
    }
    el.append(body);
  }
  return el;
}

/**
 * Put the card next to the pin, on the side with room, inside the window.
 * @param {HTMLElement} el
 * @param {Note} note
 */
function place(el, note) {
  const view = canvas.app?.view?.getBoundingClientRect();
  const bounds = note.controlIcon?.getBounds?.();
  if ( !view || !bounds ) return;
  placeBox(el, {left: view.left + bounds.x, top: view.top + bounds.y, width: bounds.width, height: bounds.height});
}

/**
 * Put the card next to a box on the screen, on the side with room, inside the window.
 * @param {HTMLElement} el
 * @param {{left: number, top: number, width: number, height: number}} box   In screen pixels
 */
function placeBox(el, box) {
  const gap = 12;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const left = box.left;
  const right = left + box.width;
  let x = right + gap;
  if ( (x + width) > (window.innerWidth - 8) ) x = left - gap - width;
  x = Math.min(Math.max(x, 8), Math.max(window.innerWidth - width - 8, 8));
  let y = box.top + (box.height / 2) - (height / 2);
  y = Math.min(Math.max(y, 8), Math.max(window.innerHeight - height - 8, 8));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

/**
 * Show a card for something that is not a pin (an area) next to a box on the screen. The card is removed with
 * hidePreview, like the one of a pin.
 * @param {object} data   The result of buildPreview or previewFromParts
 * @param {{left: number, top: number, width: number, height: number}} box
 * @param {string} key    What the card is for
 */
export function showCardAt(data, box, key) {
  hidePreview();
  card = buildCard(data);
  card.style.visibility = "hidden";
  document.body.append(card);
  placeBox(card, box);
  card.style.visibility = "";
  shownFor = key;
}

/**
 * What the card shows now, if anything.
 * @returns {string|null}
 */
export function cardKey() {
  return card ? shownFor : null;
}

/** Remove the card. */
export function hidePreview() {
  clearTimeout(timer);
  timer = 0;
  shownFor = null;
  card?.remove();
  card = null;
}

/**
 * Show the card of a pin now.
 * @param {Note} note
 * @returns {boolean} Whether a card was shown
 */
export function showPreview(note) {
  hidePreview();
  if ( !note || note.destroyed || !canvas.ready ) return false;
  const data = buildPreview(note);
  if ( !data ) return false;
  card = buildCard(data);
  card.style.visibility = "hidden";
  document.body.append(card);
  place(card, note);
  card.style.visibility = "";
  shownFor = note.id;
  countFeature(MODULE_ID, "previewShown");
  return true;
}

/**
 * Hook "hoverNote": show the card after a short rest, hide it when the pointer leaves.
 * @param {Note} note
 * @param {boolean} hovered
 */
export function onHoverNote(note, hovered) {
  clearTimeout(timer);
  if ( !hovered ) {
    if ( !shownFor || (shownFor === note.id) ) hidePreview();
    return;
  }
  timer = setTimeout(() => showPreview(note), DELAY);
}

/** Keep the card at its pin while the canvas moves. */
export function followPin() {
  // The card of an area sits at the pointer, not at a pin
  if ( !card || !shownFor || String(shownFor).startsWith("area:") ) return;
  const note = canvas.notes?.get(shownFor);
  if ( note ) place(card, note);
  else hidePreview();
}
