/**
 * Self test: what the module relies on in Foundry, its storage and its texts.
 */

import {MODULE_ID, TEMPLATES, TESTED_VERSIONS, esc, t} from "./config.mjs";
import {previewFromHtml} from "./pin-logic.mjs";

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
  for ( const key of ["list.hbs", "categories.hbs", "note-section.hbs"] ) {
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
  const keys = ["SMP.gear", "SMP.SELFTEST.Title", "SMP.List.title", "SMP.Categories.title", "SMP.Config.title",
    "SMP.Player.newTitle", "SMP.Numbers.title", "SMP.Migrate.title", "SMP.Preview.title"];
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
