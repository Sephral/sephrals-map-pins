/**
 * Pure logic of the map key: the page of a pin, merging a regenerated page with what the GM added, and the plan of
 * an update. No Foundry globals.
 */

/** The texts a key page can hold. */
export const KEY_TEXTS = ["lines", "full", "title"];

/**
 * A text mode from a stored value.
 * @param {*} value
 * @returns {"lines"|"full"|"title"}
 */
export function cleanKeyText(value) {
  return KEY_TEXTS.includes(value) ? value : "lines";
}

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * Compare two pin numbers: numbers by their digits (2 before 10), then letters.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareNumbers(a, b) {
  return String(a).localeCompare(String(b), "en", {numeric: true, sensitivity: "base"});
}

/**
 * The pins of a key in number order: only numbered pins, equal numbers keep their given order.
 * @param {{id: string, number: string}[]} pins
 * @returns {object[]}
 */
export function keyPins(pins) {
  return pins.filter(p => p.number).map((p, i) => ({p, i}))
    .sort((a, b) => compareNumbers(a.p.number, b.p.number) || (a.i - b.i)).map(e => e.p);
}

/**
 * The generated HTML of one key page.
 * @param {object} pin
 * @param {string} pin.title
 * @param {string} [pin.link]       The enricher text of the link to the pin's journal, empty without
 * @param {string} [pin.category]
 * @param {string} [pin.quest]      Already translated quest state, empty without
 * @param {string} [pin.hidden]     Already translated "hidden until discovered" hint, empty without
 * @param {{kind: string, text: string}[]} [pin.blocks]
 * @returns {string}
 */
export function keyPageHtml({title, link = "", category = "", quest = "", hidden = "", blocks = []}) {
  const parts = [];
  parts.push(link ? `<p><strong>${link}</strong></p>` : `<p><strong>${escapeHtml(title)}</strong></p>`);
  const meta = [category, quest, hidden].filter(Boolean).map(escapeHtml);
  if ( meta.length ) parts.push(`<p><em>${meta.join(" · ")}</em></p>`);
  let list = [];
  const flushList = () => {
    if ( list.length ) parts.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for ( const block of blocks ) {
    if ( block.kind === "li" ) {
      list.push(`<li>${escapeHtml(block.text)}</li>`);
      continue;
    }
    flushList();
    if ( block.kind === "h" ) parts.push(`<h3>${escapeHtml(block.text)}</h3>`);
    else if ( block.kind === "quote" ) parts.push(`<blockquote><p>${escapeHtml(block.text)}</p></blockquote>`);
    else parts.push(`<p>${escapeHtml(block.text)}</p>`);
  }
  flushList();
  return parts.join("");
}

/**
 * HTML reduced to what survives a trip through the editor: no whitespace between tags.
 * @param {string} html
 * @returns {string}
 */
export function normalizeHtml(html) {
  return String(html ?? "").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/>\s+</g, "><")
    .replace(/\s+/g, " ").trim();
}

/**
 * Put a regenerated text into a page the GM may have extended. Only the generated part is replaced: what the GM wrote
 * before or after it stays. When the generated part itself was edited, the page is kept as it is.
 * @param {string} current     The page's text now
 * @param {string} previous    The text the module generated last time ("" when unknown)
 * @param {string} next        The text to generate now
 * @returns {{content: string, state: "same"|"replaced"|"kept"}}
 */
export function mergeGenerated(current, previous, next) {
  const now = String(current ?? "");
  if ( normalizeHtml(now) === normalizeHtml(next) ) return {content: now, state: "same"};
  if ( !previous ) return {content: next, state: "replaced"};
  if ( normalizeHtml(now) === normalizeHtml(previous) ) return {content: next, state: "replaced"};
  const at = now.indexOf(previous);
  if ( at >= 0 ) return {content: now.slice(0, at) + next + now.slice(at + previous.length), state: "replaced"};
  // The editor may have changed the markup a little: compare on the normalized text
  const flat = normalizeHtml(now);
  const old = normalizeHtml(previous);
  const flatAt = old ? flat.indexOf(old) : -1;
  if ( flatAt >= 0 ) return {content: flat.slice(0, flatAt) + next + flat.slice(flatAt + old.length), state: "replaced"};
  return {content: now, state: "kept"};
}

/**
 * The plan of a key update.
 * @param {{id: string, number: string, html: string}[]} pins   The key pins in number order with their new page text
 * @param {{id: string, pin: string, content: string, generated: string}[]} pages   The generated pages that exist
 * @returns {{create: object[], update: object[], remove: string[], kept: string[]}}
 */
export function planKey(pins, pages) {
  const byPin = new Map(pages.map(p => [p.pin, p]));
  const plan = {create: [], update: [], remove: [], kept: []};
  const seen = new Set();
  pins.forEach((pin, index) => {
    seen.add(pin.id);
    const page = byPin.get(pin.id);
    if ( !page ) {
      plan.create.push({pin: pin.id, index, html: pin.html});
      return;
    }
    const merged = mergeGenerated(page.content, page.generated, pin.html);
    if ( merged.state === "kept" ) {
      plan.kept.push(page.id);
      plan.update.push({id: page.id, pin: pin.id, index, content: null, generated: page.generated});
    } else plan.update.push({id: page.id, pin: pin.id, index, content: merged.content, generated: pin.html,
      changed: merged.state === "replaced"});
  });
  for ( const page of pages ) {
    if ( seen.has(page.pin) ) continue;
    // A page of a pin that is gone is removed only when nobody touched it
    if ( normalizeHtml(page.content) === normalizeHtml(page.generated) ) plan.remove.push(page.id);
    else plan.kept.push(page.id);
  }
  return plan;
}
