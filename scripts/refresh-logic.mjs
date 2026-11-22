/**
 * Pure part of the answer to the translator's refresh hook: which kinds of canvas text a list of changed keys touches.
 * No Foundry, so node can test it.
 */

/** The hook of Sephral's Translator, called after a preview change with the changed keys. */
export const REFRESH_HOOK = "sephrals-translator.refresh";

/** The keys that show on the canvas (or are cached there), by kind. */
export const GROUPS = Object.freeze({
  /** Label of a private pin (PIXI text of the note). */
  labels: /^SMP\.Player\.(unknownPrivate|privateOf)$/,
  /** Banner above the pin that leads to the party (PIXI text). */
  party: /^SMP\.Where\.(partyHere|youHere)$/,
  /** Dates at the stops of the party trail (PIXI text). */
  trail: /^SMP\.Where\.dayAt$/
});

/**
 * Which groups does a refresh payload touch? A payload of another module touches none. `keys` null means every key.
 * @param {{moduleId?: string, keys?: string[]|null}|null} payload
 * @param {string} moduleId
 * @param {Record<string, RegExp>} [groups]
 * @returns {Record<string, boolean>}
 */
export function touched(payload, moduleId, groups = GROUPS) {
  const result = {};
  const mine = !!payload && ((payload.moduleId ?? payload.module) === moduleId);
  for ( const [name, test] of Object.entries(groups) ) {
    result[name] = mine && (!Array.isArray(payload.keys) || payload.keys.some(key => test.test(String(key))));
  }
  return result;
}
