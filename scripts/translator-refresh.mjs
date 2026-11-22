/**
 * Sephral's Translator shows texts live. What PIXI draws on the canvas is not rebuilt by a render, so the translator
 * calls the hook "sephrals-translator.refresh" with the changed keys and this module redraws only what they touch:
 * the label of private pins, the banner above the party's pin and the dates of the trail. Without the translator the
 * hook is never called.
 */

import {MODULE_ID, flagsOf} from "./config.mjs";
import {applyStyle} from "./note-style.mjs";
import {drawTrail, markNote} from "./party.mjs";
import {REFRESH_HOOK, touched} from "./refresh-logic.mjs";

/**
 * Redraw the canvas texts that the changed keys touch.
 * @param {{moduleId?: string, keys?: string[]|null}} payload
 * @returns {{labels: number, party: number, trail: boolean}}   What was redrawn
 */
export function onTranslatorRefresh(payload) {
  const done = {labels: 0, party: 0, trail: false};
  if ( !canvas?.ready ) return done;
  const what = touched(payload, MODULE_ID);
  const notes = canvas.notes?.placeables ?? [];
  if ( what.labels ) {
    for ( const note of notes ) {
      if ( note.destroyed || !flagsOf(note.document).private ) continue;
      applyStyle(note);
      done.labels++;
    }
  }
  if ( what.party ) {
    // markNote builds the banner again when its text changed and leaves every other note alone
    for ( const note of notes ) {
      markNote(note);
      done.party++;
    }
  }
  if ( what.trail ) {
    drawTrail();
    done.trail = true;
  }
  return done;
}

/** Listen to the hook. Call once in "init". */
export function startTranslatorRefresh() {
  Hooks.on(REFRESH_HOOK, onTranslatorRefresh);
}
