/**
 * Take over the look of pins from Pin Cushion: label always visible, background, preview text and picture. The flags of
 * Pin Cushion (module id "pin-cushion") are only read, nothing is deleted, and settings a pin already has here are
 * not replaced.
 */

import {MODULE_ID, esc, flagsOf, setting, t} from "./config.mjs";
import {fromPinCushion} from "./pin-logic.mjs";
import {countFeature} from "./usage.mjs";

const {DialogV2} = foundry.applications.api;

/** The module id Pin Cushion keeps its flags under. */
export const PIN_CUSHION_ID = "pin-cushion";

/**
 * What would change on a scene: the notes with Pin Cushion flags and the updates they give.
 * @param {Scene} scene
 * @returns {{id: string, flags: object}[]}
 */
function plan(scene) {
  const result = [];
  for ( const note of scene.notes ) {
    const patch = fromPinCushion(foundry.utils.getProperty(note, `flags.${PIN_CUSHION_ID}`));
    const mine = flagsOf(note);
    const flags = {};
    for ( const [key, value] of Object.entries(patch) ) if ( !(key in mine) ) flags[key] = value;
    if ( Object.keys(flags).length ) result.push({id: note.id, flags});
  }
  return result;
}

/**
 * Count what a migration would do.
 * @param {"scene"|"all"} scope
 * @returns {{scenes: number, pins: number, withFlags: number}}
 */
export function countPinCushion(scope = "scene") {
  const scenes = (scope === "all") ? game.scenes.contents : [canvas.scene].filter(Boolean);
  let pins = 0;
  let withFlags = 0;
  for ( const scene of scenes ) {
    pins += plan(scene).length;
    withFlags += scene.notes.filter(n => foundry.utils.getProperty(n, `flags.${PIN_CUSHION_ID}`)).length;
  }
  return {scenes: scenes.length, pins, withFlags};
}

/**
 * Take over the settings of Pin Cushion's pins.
 * @param {object} [options]
 * @param {"scene"|"all"} [options.scope="scene"]
 * @param {boolean} [options.dryRun=false]   Only count
 * @returns {Promise<{scenes: number, pins: number, withFlags: number}>}
 */
export async function migratePinCushion({scope = "scene", dryRun = false} = {}) {
  if ( !game.user.isGM ) throw new Error("Only a GM can take over Pin Cushion pins");
  const result = countPinCushion(scope);
  if ( dryRun ) return result;
  const scenes = (scope === "all") ? game.scenes.contents : [canvas.scene].filter(Boolean);
  for ( const scene of scenes ) {
    const updates = plan(scene).map(({id, flags}) => ({_id: id, flags: {[MODULE_ID]: flags}}));
    if ( updates.length ) await scene.updateEmbeddedDocuments("Note", updates);
  }
  countFeature(MODULE_ID, "pinCushionMigrated");
  return result;
}

/**
 * Ask what to take over and do it. Opened from the module settings.
 * @returns {Promise<object|null>}
 */
export async function migrateDialog() {
  if ( !game.user.isGM ) return null;
  const here = countPinCushion("scene");
  const all = countPinCushion("all");
  const content = `<div class="smp-app smp-dialog" data-smp-theme="${esc(setting("theme"))}">
    <p>${esc(t("SMP.Migrate.intro"))}</p>
    <div class="form-group"><label>${esc(t("SMP.Migrate.scope"))}</label><div class="form-fields"><select name="scope">
      <option value="scene" ${canvas.scene ? "" : "disabled"}>${esc(t("SMP.Migrate.scene", {count: here.pins, scene: canvas.scene?.name ?? "-"}))}</option>
      <option value="all" ${canvas.scene ? "" : "selected"}>${esc(t("SMP.Migrate.all", {count: all.pins, scenes: all.scenes}))}</option>
    </select></div></div>
    <p class="hint">${esc(t("SMP.Migrate.hint"))}</p>
  </div>`;
  const scope = await DialogV2.prompt({
    window: {title: t("SMP.Migrate.title"), icon: "fa-solid fa-right-left"},
    position: {width: 520},
    content,
    rejectClose: false,
    ok: {
      label: t("SMP.Migrate.go"),
      icon: "fa-solid fa-check",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object.scope
    }
  });
  if ( !scope ) return null;
  const result = await migratePinCushion({scope});
  ui.notifications.info(t("SMP.Migrate.done", {count: result.pins}));
  return result;
}
