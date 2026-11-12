/**
 * Pure logic of Map Pins, without Foundry globals: how a pin looks (world defaults, category, pin), numbers, the
 * rights of the hover preview, the safe text of a preview and the cleanup of the module's flags.
 */

/** The values a pin's label can have. An empty value follows the world. */
export const LABEL_MODES = ["always", "hover", "never"];

/** The flag keys the module writes on a note, in the order of the note dialog. */
export const FLAG_KEYS = ["label", "background", "size", "minZoom", "number", "category", "preview", "previewText",
  "previewImage", "scene"];

/** The most characters of a pin's own preview text and of a player's pin text. */
export const LIMITS = {previewText: 600, name: 60, playerText: 1000, number: 8};

/* -------------------------------------------- */
/*  Appearance                                  */
/* -------------------------------------------- */

/**
 * A number from a value that can be empty.
 * @param {*} value
 * @returns {number|null}
 */
export function numberOrNull(value) {
  if ( (value === "") || (value === null) || (value === undefined) ) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The world defaults with missing values filled in.
 * @param {object} [world]
 * @returns {{labelMode: string, noBackground: boolean, constantSize: boolean, constantScale: number,
 *   minZoom: number, preview: boolean, numberFromName: boolean}}
 */
export function worldDefaults(world = {}) {
  return {
    labelMode: LABEL_MODES.includes(world.labelMode) ? world.labelMode : "hover",
    noBackground: !!world.noBackground,
    constantSize: !!world.constantSize,
    constantScale: Math.min(Math.max(numberOrNull(world.constantScale) ?? 100, 25), 300),
    minZoom: Math.max(numberOrNull(world.minZoom) ?? 0, 0),
    preview: world.preview !== false,
    numberFromName: world.numberFromName !== false
  };
}

/**
 * How a pin looks: the pin's own choice wins over the world default. The category only gives color and symbol.
 * @param {object} world             The world defaults
 * @param {object} [pin]             The module's flags of the note
 * @param {object|null} [category]   The category of the pin
 * @returns {{label: string, noBackground: boolean, constantSize: boolean, minZoom: number, preview: boolean,
 *   color: string|null, icon: string|null}}
 */
export function resolveStyle(world, pin = {}, category = null) {
  const w = worldDefaults(world);
  const flags = pin ?? {};
  const label = LABEL_MODES.includes(flags.label) ? flags.label : w.labelMode;
  const noBackground = (flags.background === "none") ? true : ((flags.background === "box") ? false : w.noBackground);
  const constantSize = (flags.size === "constant") ? true : ((flags.size === "scene") ? false : w.constantSize);
  const minZoom = Math.max(numberOrNull(flags.minZoom) ?? w.minZoom, 0);
  const preview = (flags.preview === "on") ? true : ((flags.preview === "off") ? false : w.preview);
  return {
    label, noBackground, constantSize, minZoom, preview,
    constantScale: w.constantScale,
    color: category?.color || null,
    icon: category?.icon || null
  };
}

/**
 * The screen scale of a pin that keeps its size on screen.
 * @param {number} zoom           The zoom of the canvas (the scale of the stage)
 * @param {number} [percent=100]  The size on screen relative to the pin's size
 * @returns {number}
 */
export function constantScale(zoom, percent = 100) {
  if ( !(zoom > 0) ) return 1;
  return percent / 100 / zoom;
}

/**
 * Is a pin too far away to be shown? The limit is in percent of the zoom, 0 never hides.
 * @param {number} zoom           The zoom of the canvas
 * @param {number} minZoomPercent
 * @returns {boolean}
 */
export function hiddenByZoom(zoom, minZoomPercent) {
  return (minZoomPercent > 0) && (zoom * 100 < minZoomPercent);
}

/* -------------------------------------------- */
/*  Numbers                                     */
/* -------------------------------------------- */

/**
 * Split a leading number off a journal name: "12. Hall" gives {number: "12", name: "Hall"}. A number is up to two
 * letters and up to four digits, followed by a dot, a bracket, a colon or a dash with spaces. "3 goblins" and
 * "1st floor" have none.
 * @param {string} text
 * @returns {{number: string, name: string}|null}
 */
export function numberFromName(text) {
  const match = String(text ?? "").match(/^\s*([A-Za-z]{0,2}\d{1,4})\s*(?:[.):]|\s[-–—]\s)\s*(\S.*)$/);
  if ( !match ) return null;
  return {number: match[1], name: match[2].trim()};
}

/**
 * Is this value usable as a pin number? Up to eight letters and digits.
 * @param {*} value
 * @returns {string} The cleaned number, or an empty string
 */
export function cleanNumber(value) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9]{1,8}$/.test(text) ? text : "";
}

/**
 * The next number for a new pin: one above the highest plain number, with the prefix of the highest one.
 * @param {string[]} numbers   The numbers already used on the scene
 * @returns {string}
 */
export function nextNumber(numbers) {
  let best = null;
  for ( const raw of numbers ?? [] ) {
    const match = String(raw ?? "").match(/^([A-Za-z]*)(\d+)$/);
    if ( !match ) continue;
    const value = Number(match[2]);
    // A plain number beats a prefixed one when both are equal, so a scene with 1 to 5 and B9 goes on with 6
    const plain = !match[1];
    if ( !best || (plain && !best.plain) || ((plain === best.plain) && (value > best.value)) ) {
      best = {prefix: match[1], value, plain, width: match[2].length};
    }
  }
  if ( !best ) return "1";
  return `${best.prefix}${String(best.value + 1).padStart(best.width, "0")}`;
}

/**
 * Sort pins for numbering.
 * @param {{id: string, x: number, y: number, name?: string, sort?: number}[]} pins
 * @param {"reading"|"columns"|"name"|"listed"} order   Reading order (rows from top to bottom, each from left to
 *   right), columns (left to right, each from top to bottom), by name, or the order Foundry keeps them in
 * @param {number} [band=100]   The height of a row in reading order
 * @returns {object[]}
 */
export function orderPins(pins, order = "reading", band = 100) {
  const list = [...pins];
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  switch ( order ) {
    case "columns":
      return list.sort((a, b) => (Math.floor(a.x / band) - Math.floor(b.x / band)) || (a.y - b.y) || (a.x - b.x)
        || byId(a, b));
    case "name":
      return list.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined,
        {numeric: true}) || byId(a, b));
    case "listed":
      return list.sort((a, b) => ((a.sort ?? 0) - (b.sort ?? 0)) || byId(a, b));
    default:
      return list.sort((a, b) => (Math.floor(a.y / band) - Math.floor(b.y / band)) || (a.x - b.x) || (a.y - b.y)
        || byId(a, b));
  }
}

/**
 * Give numbers to ordered pins.
 * @param {{id: string, number?: string}[]} ordered   The pins in the order they get their numbers
 * @param {object} [options]
 * @param {string} [options.prefix=""]   Letters in front of every number
 * @param {number} [options.start=1]     The first number
 * @param {boolean} [options.keep=false] Leave pins that have a number alone, the others take the free numbers
 * @returns {{id: string, number: string}[]} The changes, only for pins whose number changes
 */
export function assignNumbers(ordered, {prefix = "", start = 1, keep = false} = {}) {
  const letters = String(prefix ?? "").replace(/[^A-Za-z]/g, "").slice(0, 2);
  const used = new Set(keep ? ordered.map(p => p.number).filter(Boolean) : []);
  let counter = Math.max(Math.floor(Number(start)) || 1, 0);
  const changes = [];
  for ( const pin of ordered ) {
    if ( keep && pin.number ) continue;
    let number = `${letters}${counter}`;
    while ( used.has(number) ) number = `${letters}${++counter}`;
    counter++;
    used.add(number);
    if ( pin.number !== number ) changes.push({id: pin.id, number});
  }
  return changes;
}

/* -------------------------------------------- */
/*  Rights of the preview                       */
/* -------------------------------------------- */

/**
 * What a user may see in the hover preview of a pin. Only the user's permission on the page (or the entry when the
 * pin points at the whole entry) counts: the GM and Observers see content, Limited users only the title, everybody
 * else nothing of the journal. A pin without a journal has only its own preview text.
 * @param {object} access
 * @param {boolean} access.isGM
 * @param {boolean} access.hasEntry      The pin points at a journal entry
 * @param {boolean} access.canObserve    The user has at least Observer permission on the page or entry
 * @param {boolean} access.canLimited    The user has at least Limited permission on the page or entry
 * @returns {"full"|"title"|"none"|"own"}
 */
export function previewAccess({isGM, hasEntry, canObserve, canLimited}) {
  if ( !hasEntry ) return "own";
  if ( isGM || canObserve ) return "full";
  if ( canLimited ) return "title";
  return "none";
}

/* -------------------------------------------- */
/*  Safe preview text                           */
/* -------------------------------------------- */

const ENTITIES = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", ndash: "–",
  mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»"};

/**
 * Decode the HTML entities of a text. The result is plain text and is never put back into HTML.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  return String(text ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, body) => {
    if ( body[0] === "#" ) {
      const code = (body[1] === "x" || body[1] === "X") ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return (code > 0 && code < 0x110000) ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[body.toLowerCase()] ?? all;
  });
}

/**
 * Text of a journal without Foundry's enrichment syntax: links keep their label, inline rolls and references go.
 * @param {string} text
 * @returns {string}
 */
export function plainEnrichers(text) {
  return String(text ?? "")
    .replace(/@[A-Za-z]+\[[^\]]*\](?:\{([^}]*)\})?/g, (all, label) => label ?? "")
    .replace(/&[A-Za-z]+\[[^\]]*\]/g, "")
    .replace(/\[\[[^\]]*\]\](?:\{([^}]*)\})?/g, (all, label) => label ?? "");
}

/**
 * Is an image address safe to show in a preview? Relative paths and http(s) addresses; no scripts, no data, no
 * blobs.
 * @param {*} src
 * @returns {string} The address, or an empty string
 */
export function safeImageSrc(src) {
  const text = String(src ?? "").trim();
  if ( !text || (text.length > 2000) || /[\u0000-\u001f<>"'`\\]/.test(text) ) return "";
  if ( /^[a-z][a-z0-9+.-]*:/i.test(text) ) return /^https?:\/\//i.test(text) ? text : "";
  if ( text.startsWith("//") ) return "";
  return text;
}

const BLOCK_TAGS = new Set(["p", "div", "section", "article", "li", "ul", "ol", "blockquote", "table", "tr", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6", "figure", "figcaption", "header", "footer", "dd", "dt", "dl", "pre", "details",
  "summary"]);
const DROP_TAGS = new Set(["script", "style", "template", "iframe", "object", "embed", "noscript", "svg", "math",
  "head", "title", "select", "textarea", "button"]);
const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source",
  "track", "wbr"]);

/**
 * Reduce the HTML of a journal page to a few lines of plain text and the first image. Nothing of the HTML is kept:
 * no tags, no attributes, no styles. Secret sections (GM only parts) are dropped for everybody.
 * @param {string} html
 * @param {object} [options]
 * @param {number} [options.maxChars=300]   The most characters of text
 * @returns {{blocks: {kind: string, text: string}[], image: string, truncated: boolean}}
 */
export function previewFromHtml(html, {maxChars = 300} = {}) {
  const source = String(html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const tokens = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  const blocks = [];
  let image = "";
  let current = "";
  let kind = "p";
  let skip = null;       // {tag, depth} while inside a dropped element
  const stack = [];      // open block tags
  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if ( text ) blocks.push({kind, text});
    current = "";
  };
  let match;
  while ( (match = tokens.exec(source)) ) {
    const [, closing, rawTag, attrs, text] = match;
    if ( rawTag === undefined ) {
      if ( skip || (text === undefined) ) continue;
      current += plainEnrichers(decodeEntities(text));
      continue;
    }
    const tag = rawTag.toLowerCase();
    if ( skip ) {
      if ( tag === skip.tag ) {
        if ( closing ) {
          if ( --skip.depth === 0 ) skip = null;
        } else if ( !VOID_TAGS.has(tag) ) skip.depth++;
      }
      continue;
    }
    if ( !closing ) {
      const secret = (tag === "section") && /class\s*=\s*("[^"]*\bsecret\b[^"]*"|'[^']*\bsecret\b[^']*')/i.test(attrs);
      if ( secret || DROP_TAGS.has(tag) ) {
        flush();
        skip = {tag, depth: 1};
        continue;
      }
      if ( (tag === "img") && !image ) {
        const src = attrs.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        image = safeImageSrc(decodeEntities(src?.[1] ?? src?.[2] ?? src?.[3] ?? ""));
        continue;
      }
    }
    if ( BLOCK_TAGS.has(tag) ) {
      flush();
      if ( !closing && !VOID_TAGS.has(tag) ) {
        stack.push(tag);
        kind = /^h[1-6]$/.test(tag) ? "h" : ((tag === "li") ? "li" : ((tag === "blockquote") ? "quote" : "p"));
      } else if ( closing ) {
        for ( let i = stack.length - 1; i >= 0; i-- ) {
          if ( stack[i] === tag ) {
            stack.length = i;
            break;
          }
        }
        const top = [...stack].reverse().find(t => /^h[1-6]$/.test(t) || (t === "li") || (t === "blockquote"));
        kind = !top ? "p" : (/^h[1-6]$/.test(top) ? "h" : ((top === "li") ? "li" : "quote"));
      }
    }
  }
  flush();
  return limitBlocks(blocks, image, maxChars);
}

/**
 * Reduce markdown to a few lines of plain text and the first image.
 * @param {string} markdown
 * @param {object} [options]
 * @param {number} [options.maxChars=300]
 * @returns {{blocks: {kind: string, text: string}[], image: string, truncated: boolean}}
 */
export function previewFromMarkdown(markdown, {maxChars = 300} = {}) {
  let image = "";
  const blocks = [];
  const text = String(markdown ?? "").replace(/<!--[\s\S]*?-->/g, "");
  for ( const raw of text.split(/\r?\n/) ) {
    let line = raw;
    line = line.replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, (all, src) => {
      if ( !image ) image = safeImageSrc(src);
      return "";
    });
    line = line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    let kind = "p";
    if ( /^\s{0,3}#{1,6}\s/.test(line) ) {
      kind = "h";
      line = line.replace(/^\s{0,3}#{1,6}\s+/, "");
    } else if ( /^\s*([-*+]|\d+[.)])\s+/.test(line) ) {
      kind = "li";
      line = line.replace(/^\s*([-*+]|\d+[.)])\s+/, "");
    } else if ( /^\s*>/.test(line) ) {
      kind = "quote";
      line = line.replace(/^\s*>\s?/, "");
    }
    line = plainEnrichers(line.replace(/<[^>]*>/g, "").replace(/[*_`~]+/g, "")).replace(/\s+/g, " ").trim();
    if ( line ) blocks.push({kind, text: line});
  }
  return limitBlocks(blocks, image, maxChars);
}

/**
 * Cut the blocks after a number of characters, at a word.
 * @param {{kind: string, text: string}[]} blocks
 * @param {string} image
 * @param {number} maxChars
 * @returns {{blocks: {kind: string, text: string}[], image: string, truncated: boolean}}
 */
export function limitBlocks(blocks, image, maxChars) {
  const limit = Math.max(Math.floor(Number(maxChars)) || 0, 0);
  const result = [];
  let used = 0;
  let truncated = false;
  for ( const block of blocks ) {
    if ( used >= limit ) {
      truncated = true;
      break;
    }
    const room = limit - used;
    if ( block.text.length <= room ) {
      result.push(block);
      used += block.text.length;
      continue;
    }
    const cut = block.text.slice(0, room);
    const space = cut.lastIndexOf(" ");
    const text = ((space > room * 0.5) ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "");
    if ( text ) result.push({kind: block.kind, text: `${text}…`});
    truncated = true;
    break;
  }
  return {blocks: result, image, truncated};
}

/* -------------------------------------------- */
/*  Flags                                       */
/* -------------------------------------------- */

/**
 * The module's flags with empty values taken out, for writing: an empty choice means "follow the world".
 * Returns the changes with removals as "-=key", so the note stays clean.
 * @param {object} changes   The module's part of an update or create, e.g. {label: "", number: "4"}
 * @param {object} [existing]   The module's flags the note has now
 * @returns {object|null} The cleaned changes, or null when nothing is left
 */
export function cleanFlags(changes, existing = {}) {
  if ( !changes || (typeof changes !== "object") ) return null;
  const result = {};
  for ( const [key, value] of Object.entries(changes) ) {
    if ( key.startsWith("-=") ) {
      result[key] = value;
      continue;
    }
    const empty = (value === "") || (value === null) || (value === undefined) || (value === false)
      || ((typeof value === "number") && Number.isNaN(value));
    if ( empty && FLAG_KEYS.includes(key) ) {
      if ( existing && (key in existing) ) result[`-=${key}`] = null;
      continue;
    }
    result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

/* -------------------------------------------- */
/*  Player pins                                 */
/* -------------------------------------------- */

/**
 * Check and clean what a player sends for a pin. Never trust the socket: everything is cut and checked here.
 * @param {object} raw   {name, text, color, private}
 * @returns {{name: string, text: string, color: string, private: boolean}|null} null without a name
 */
export function cleanPlayerPin(raw) {
  const name = String(raw?.name ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.name);
  if ( !name ) return null;
  const text = String(raw?.text ?? "").replace(/\r\n/g, "\n").trim().slice(0, LIMITS.playerText);
  const color = /^#[0-9a-f]{6}$/i.test(String(raw?.color ?? "")) ? String(raw.color).toLowerCase() : "#c0392b";
  return {name, text, color, private: raw?.private === true};
}

/**
 * Plain text as HTML paragraphs for a journal page: escaped, one paragraph per line.
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
  const escape = s => s.replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
  return String(text ?? "").split(/\n+/).map(line => line.trim()).filter(Boolean)
    .map(line => `<p>${escape(line)}</p>`).join("");
}

/**
 * Plain text of a player's page back from the HTML written by textToHtml.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  return previewFromHtml(html, {maxChars: LIMITS.playerText}).blocks.map(b => b.text).join("\n");
}

/**
 * May this user change or delete a player pin? Only the one who made it, and the GM.
 * @param {object} flags      The module's flags of the note
 * @param {string} userId     The user who asks
 * @param {boolean} isGM
 * @returns {boolean}
 */
export function mayEditPin(flags, userId, isGM) {
  if ( isGM ) return true;
  return !!flags?.owner && (flags.owner === userId);
}

/**
 * Does the note belong to a private player pin that this user must not see?
 * @param {object} flags
 * @param {string} userId
 * @param {boolean} isGM
 * @returns {boolean}
 */
export function hiddenPrivatePin(flags, userId, isGM) {
  if ( !flags?.private ) return false;
  return !isGM && (flags.owner !== userId);
}

/* -------------------------------------------- */
/*  Categories                                  */
/* -------------------------------------------- */

/**
 * Clean the list of categories: ids, short names, colors.
 * @param {*} list
 * @returns {{id: string, name: string, icon: string, color: string}[]}
 */
export function cleanCategories(list) {
  const result = [];
  const seen = new Set();
  for ( const item of Array.isArray(list) ? list : [] ) {
    const name = String(item?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if ( !name ) continue;
    let id = String(item?.id ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
    if ( !id || seen.has(id) ) id = `c${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    const color = /^#[0-9a-f]{6}$/i.test(String(item?.color ?? "")) ? String(item.color).toLowerCase() : "#9c3b22";
    result.push({id, name, icon: String(item?.icon ?? "").trim().slice(0, 500), color});
  }
  return result;
}

/* -------------------------------------------- */
/*  Pin Cushion                                 */
/* -------------------------------------------- */

/**
 * The module's flags that follow from the flags Pin Cushion (module id "pin-cushion") left on a note. Read only:
 * the names are the ones of Pin Cushion's constants (`textAlwaysVisible`, `hasBackground`, `pinIsTransparent`,
 * `doNotShowJournalPreview`, `tooltipCustomDescription`, `showImageExplicitSource`).
 * @param {object|null} pc   The note's flags under "pin-cushion"
 * @returns {object} The module's flags to set, possibly empty
 */
export function fromPinCushion(pc) {
  const out = {};
  if ( !pc || (typeof pc !== "object") ) return out;
  if ( pc.textAlwaysVisible === true || pc.textAlwaysVisible === "true" ) out.label = "always";
  if ( pc.hideLabel === true || pc.hideLabel === "true" ) out.label = "never";
  // hasBackground is written by Pin Cushion's note dialog (checked: a box), pinIsTransparent hides the icon's box
  if ( "hasBackground" in pc ) out.background = (pc.hasBackground === true || pc.hasBackground === "true"
    || pc.hasBackground === 1) ? "box" : "none";
  else if ( pc.pinIsTransparent === true || pc.pinIsTransparent === "true" ) out.background = "none";
  const preview = String(pc.doNotShowJournalPreview ?? "");
  if ( preview === "true" ) out.preview = "off";
  let text = String(pc.tooltipCustomDescription ?? "").trim();
  if ( /<[a-z!/]/i.test(text) ) {
    text = previewFromHtml(text, {maxChars: LIMITS.previewText}).blocks.map(b => b.text).join("\n");
  }
  if ( text ) out.previewText = text.slice(0, LIMITS.previewText);
  const image = safeImageSrc(pc.showImageExplicitSource);
  if ( image ) out.previewImage = image;
  return out;
}
