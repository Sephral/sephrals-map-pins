/**
 * Map Pins' part of the debug file of Sephral's modules. Fill describeState with what helps a bug report, without
 * personal texts.
 */

import {MODULE_ID, flagsOf, setting, t} from "./config.mjs";
import {categoryList, hiddenCategories, privatePins} from "./state.mjs";
import {DebugTrace, registerDebugMenu, registerDebugProvider} from "./debug-file.mjs";

/** The recent decisions of the module. */
export const trace = new DebugTrace();

/**
 * What the module knows right now.
 * @returns {object}
 */
export function describeState() {
  const notes = canvas?.ready ? canvas.notes.placeables : [];
  const count = test => notes.filter(n => test(flagsOf(n.document))).length;
  return {
    foundry: game.version,
    scene: canvas?.ready ? {
      pins: notes.length,
      withCategory: count(f => !!f.category),
      withNumber: count(f => !!f.number),
      linkedToScene: count(f => !!f.scene),
      playerPins: count(f => !!f.owner),
      privatePins: count(f => !!f.private),
      ownLabelChoice: count(f => !!f.label),
      zoom: Number((canvas.stage.scale.x).toFixed(3))
    } : null,
    settings: Object.fromEntries(["labelMode", "noBackground", "constantSize", "constantScale", "minZoom",
      "numberFromName", "autoNumber", "preview", "previewChars", "newGlobal", "notesOn", "playerPins", "playerPinsPrivate",
      "playerPinLimit", "theme"].map(key => [key, setting(key)])),
    categories: categoryList().length,
    categoriesHiddenHere: hiddenCategories().size,
    privateTextsOnThisDevice: Object.keys(privatePins()).length,
    activeGM: !!game.users?.activeGM,
    pinCushionActive: !!game.modules.get("pin-cushion")?.active
  };
}

/**
 * The button in the settings and the module's part of the file. Call in "init".
 */
export function registerDebug() {
  registerDebugMenu(MODULE_ID, {name: "SMP.DEBUG.Title", label: "SMP.DEBUG.Save", hint: "SMP.DEBUG.Hint"});
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => t("SMP.DEBUG.Entry"),
    notice: file => t("SMP.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()}),
    trace
  });
}
