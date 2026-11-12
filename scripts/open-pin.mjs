/**
 * What a double click on a pin does: open the linked scene, show a private pin to its author, or what Foundry does
 * (open the journal or the picture).
 */

import {MODULE_ID, flagsOf, onOtherLevel, t} from "./config.mjs";
import {showPrivatePin} from "./player-pins.mjs";
import {countFeature} from "./usage.mjs";

/**
 * May this user switch to a scene? The GM always, players when the scene is active or visible to them.
 * @param {Scene} scene
 * @returns {boolean}
 */
export function mayViewScene(scene) {
  return !!scene && (game.user.isGM || scene.active || scene.visible);
}

/**
 * Switch the view to the scene a pin links to.
 * @param {string} sceneId
 * @returns {Promise<boolean>} Whether the link was handled (also when the user may not follow it)
 */
export async function openLinkedScene(sceneId) {
  const scene = game.scenes.get(sceneId);
  if ( !scene ) {
    ui.notifications.warn(t("SMP.Open.sceneGone"));
    return false;
  }
  if ( !mayViewScene(scene) ) {
    ui.notifications.warn(t("SMP.Open.sceneDenied", {scene: scene.name}));
    return true;
  }
  if ( canvas.scene?.id !== scene.id ) await scene.view();
  countFeature(MODULE_ID, "sceneLinkOpened");
  return true;
}

/**
 * Hook "activateNote": a pin that links to a scene opens the scene instead of the journal.
 * @param {Note} note
 * @returns {boolean|undefined} false to stop Foundry from opening the journal
 */
export function onActivateNote(note) {
  const sceneId = flagsOf(note.document).scene;
  if ( !sceneId || !game.scenes.get(sceneId) ) return;
  openLinkedScene(sceneId);
  return false;
}

/**
 * The note object of a pin. A pin on another level of the viewed scene (Foundry 14) is not drawn: the view switches to
 * its level first.
 * @param {Note|NoteDocument} target
 * @returns {Promise<Note|null>}
 */
export async function noteOf(target) {
  const doc = target?.document ?? target;
  if ( !doc || !canvas.ready || (doc.parent !== canvas.scene) ) return null;
  if ( onOtherLevel(doc) ) {
    const level = [...doc.levels][0];
    if ( !level ) return null;
    await canvas.scene.view({level});
  }
  return canvas.notes.get(doc.id) ?? null;
}

/**
 * Open a pin as a double click does.
 * @param {Note} note
 * @returns {Promise<void>}
 */
export async function openPin(target) {
  const doc = target?.document ?? target;
  if ( !doc ) return;
  // A pin on another level is drawn only on that level: switch first
  const note = (target?.document ? target : null) ?? await noteOf(doc);
  if ( !note ) return;
  const flags = flagsOf(note.document);
  if ( note.document.entryId ) {
    // Foundry opens the journal or the picture and asks the hook above about the scene link
    note._onClickLeft2?.(new Event("dblclick"));
    return;
  }
  if ( flags.scene && await openLinkedScene(flags.scene) ) return;
  if ( flags.private ) await showPrivatePin(note);
}
