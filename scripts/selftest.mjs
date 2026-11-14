/**
 * Self test: what the module relies on in Foundry, its storage and its texts.
 */

import {MODULE_ID, TEMPLATES, TESTED_VERSIONS, esc, t} from "./config.mjs";
import {changeFound, isDiscovered, newlyExplored} from "./discover-logic.mjs";
import {keyPageHtml, mergeGenerated} from "./key-logic.mjs";
import {previewFromHtml} from "./pin-logic.mjs";
import {dashSegments, routeStats, visiblePrefix} from "./route-logic.mjs";
import {areaAt, areaPolygon, newlyExploredAreas, samplePoints} from "./area-logic.mjs";
import {buildLinks, locateOnMap, pickPartyScene, pinChain} from "./party-logic.mjs";

/**
 * Run all checks.
 * @returns {Promise<{problems: string[], checks: number}>}
 */
async function checkAll() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(game.i18n.has(key) ? t(key, data) : key);
  };
  const api = foundry.applications?.api;
  check(typeof api?.DialogV2 === "function", "SMP.SELFTEST.Dialog");
  check(typeof api?.ApplicationV2 === "function" && typeof api?.HandlebarsApplicationMixin === "function",
    "SMP.SELFTEST.Application");
  check(typeof foundry.applications?.handlebars?.renderTemplate === "function", "SMP.SELFTEST.Templates");
  const Note = CONFIG.Note?.objectClass;
  check(!!Note && ["_refreshTooltip", "_drawControlIcon", "_onClickLeft2"].every(k => typeof Note.prototype[k] === "function"),
    "SMP.SELFTEST.Note");
  check(typeof foundry.canvas?.containers?.PreciseText === "function" && typeof PIXI?.Graphics === "function", "SMP.SELFTEST.Pixi");
  check(typeof game.socket?.emit === "function", "SMP.SELFTEST.Socket");
  check(!!CONST.JOURNAL_ENTRY_PAGE_FORMATS && !!CONFIG.JournalEntry?.noteIcons, "SMP.SELFTEST.Journal");
  check(game.settings.settings.has("core.notesDisplayToggle"), "SMP.SELFTEST.Toggle");
  for ( const key of ["list.hbs", "categories.hbs", "note-section.hbs", "route.hbs", "where.hbs", "area-section.hbs"] ) {
    const ok = await fetch(`${TEMPLATES}/${key}`, {method: "HEAD"}).then(r => r.ok).catch(() => false);
    check(ok, "SMP.SELFTEST.Template", {file: key});
  }
  // The safe preview must drop secrets and scripts
  const probe = previewFromHtml("<p>open</p><section class=\"secret\"><p>hidden</p></section><script>x()</script>");
  check((probe.blocks.length === 1) && (probe.blocks[0].text === "open"), "SMP.SELFTEST.Preview");
  const note = canvas?.notes?.placeables?.find(n => n.controlIcon);
  if ( note ) {
    const icon = note.controlIcon;
    check(!!icon.bg && !!icon.icon && !!icon.border && !!note.tooltip, "SMP.SELFTEST.Icon");
  }
  // Discovered pins: the logic and the fog of war it reads
  const flags = {hidden: true};
  const found = changeFound([], {all: true});
  check(!isDiscovered(flags, "u") && isDiscovered({...flags, found}, "u") && isDiscovered({}, "u")
    && (newlyExplored([{id: "a", flags, x: 1, y: 1}], "u", () => true).length === 1), "SMP.SELFTEST.Discover");
  if ( canvas?.ready ) {
    const fog = canvas.fog;
    check((typeof fog?.isPointExplored === "function") && (typeof fog?.addEventListener === "function")
      && (typeof canvas.visibility?.testVisibility === "function") && ("tokenVision" in fog) && ("fogExploration" in fog),
    "SMP.SELFTEST.Fog");
  }
  // Routes: measuring, the dashed line and the layer they are drawn on
  const stats = routeStats([{x: 0, y: 0}, {x: 300, y: 400}], {size: 100, distance: 5, speed: 5});
  check((Math.abs(stats.total - 25) < 1e-9) && (Math.abs(stats.hours - 5) < 1e-9)
    && dashSegments([{x: 0, y: 0}, {x: 100, y: 0}], 20, 10).length === 4
    && (visiblePrefix(["a", "b"], id => id === "a").length === 1)
    && (!canvas?.ready || (!!canvas.interface && !!canvas.dimensions?.size && (typeof PIXI?.Container === "function"))),
  "SMP.SELFTEST.Route");
  // The map key: its pages and merging a regenerated page
  const html = keyPageHtml({title: "A", blocks: [{kind: "p", text: "x"}]});
  check((mergeGenerated(`<p>mine</p>${html}`, html, `${html}<p>new</p>`).state === "replaced")
    && (CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML === 1) && (typeof CONFIG.JournalEntryPage?.documentClass === "function"),
  "SMP.SELFTEST.Key");
  // Where are we: the party's place, the maps above it and the scene's data they are read from
  const links = buildLinks([{id: "n1", scene: "town", target: "dungeon", x: 5, y: 6},
    {id: "n2", scene: "region", target: "town", x: 7, y: 8}]);
  check((pinChain(links, "dungeon").length === 2) && (locateOnMap(links, "dungeon", "region")?.id === "n2")
    && (pickPartyScene({active: "a", valid: new Set(["a"])})?.scene === "a")
    && (typeof game.users.activeGM !== "undefined") && !!game.scenes && (typeof game.time?.worldTime === "number")
    && (!canvas?.ready || (!!canvas.scene?.dimensions && (typeof canvas.scene.dimensions.sceneWidth === "number"))),
  "SMP.SELFTEST.Party");
  // Areas: the drawing class, its shape and the logic on top of it
  const Drawing = CONFIG.Drawing?.objectClass;
  const square = areaPolygon({x: 0, y: 0, rotation: 0, shape: {type: "r", width: 100, height: 100}});
  check(!!Drawing && ["_refreshState", "_refreshShape", "_refreshText"].every(k => typeof Drawing.prototype[k] === "function")
    && !!Drawing.SHAPE_TYPES && (areaAt([{id: "a", polygon: square}], {x: 50, y: 50}) === "a")
    && (samplePoints(square).length > 0)
    && (newlyExploredAreas([{id: "a", flags: {hidden: true}, samples: [{x: 1, y: 1}]}], "u", () => true).length === 1)
    && (!canvas?.ready || (!!canvas.drawings && (typeof canvas.stage?.toLocal === "function"))), "SMP.SELFTEST.Area");
  const keys = ["SMP.gear", "SMP.SELFTEST.Title", "SMP.List.title", "SMP.Categories.title", "SMP.Config.title",
    "SMP.Player.newTitle", "SMP.Numbers.title", "SMP.Migrate.title", "SMP.Preview.title", "SMP.Route.title", "SMP.Reveal.title",
    "SMP.Key.title", "SMP.Quest.state.open", "SMP.Menu.hide", "SMP.Where.title", "SMP.Where.youHere", "SMP.Area.newTitle",
    "SMP.Area.title"];
  const missing = keys.filter(key => !game.i18n.has(key));
  check(!missing.length, "SMP.SELFTEST.Texts", {keys: missing.join(", ")});
  return {problems, checks};
}

/**
 * Run the self test and report the result.
 * @param {object} [options]
 * @param {boolean} [options.report=true]
 * @returns {Promise<{problems: string[], checks: number}>}
 */
export async function runSelfTest({report = true} = {}) {
  const {problems, checks} = await checkAll();
  const summary = problems.length ? t("SMP.SELFTEST.Problems", {problems: problems.length, checks})
    : t("SMP.SELFTEST.Passed", {checks});
  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);
  if ( report ) {
    const versions = t("SMP.SELFTEST.Version", {current: game.version, tested: TESTED_VERSIONS.core});
    let content = `<h3>${esc(t("SMP.SELFTEST.Title"))}</h3><p>${esc(summary)}</p><p><small>${esc(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id],
      speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return {problems, checks};
}

/**
 * Tell the GM once when Foundry is newer than the version the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  if ( !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core) ) return;
  const signature = `core ${game.version}`;
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(t("SMP.SELFTEST.NewVersions", {versions: signature}), {permanent: true});
}
