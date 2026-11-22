import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {PEOPLE, cardData, listData, menuData, partsData, playerPinData, revealData, routeData, sampleCategories, samplePicture,
  whereData} from "../scripts/sample-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const get = (obj, key) => key.split(".").reduce((o, k) => o?.[k], obj);

/** The text function of the samples, over the English file. */
const t = (key, data) => String(get(en, key) ?? key).replace(/\{(\w+)\}/g, (all, name) => data?.[name] ?? all);
const icon = key => `icons/${key}.svg`;

test("every text the sample data asks for exists", () => {
  const asked = [];
  const spy = (key, data) => {
    asked.push(key);
    return t(key, data);
  };
  for ( const gm of [true, false] ) listData({gm, t: spy, icon});
  for ( const kind of ["gm", "player", "empty"] ) routeData(kind, spy);
  for ( const gm of [true, false] ) for ( const index of [0, 1] ) whereData({gm, index, t: spy, place: "Mill"});
  for ( const kind of ["journal", "rumor"] ) cardData(kind, spy);
  for ( const kind of ["hidden", "rumor", "start", "player"] ) menuData(kind, spy);
  for ( const mode of ["pages", "secrets"] ) partsData(mode, spy);
  revealData(spy);
  playerPinData(spy);
  assert.ok(asked.length > 60);
  for ( const key of asked ) assert.notEqual(get(en, key), undefined, key);
});

test("the pin list rows carry what the template reads", () => {
  const gm = listData({gm: true, t, icon});
  assert.equal(gm.empty, false);
  assert.ok(gm.pins.length >= 6);
  assert.ok(gm.pins.some(p => p.hiddenPin) && gm.pins.some(p => p.rumor) && gm.pins.some(p => p.canRumor) && gm.pins.some(p => p.questLabel));
  assert.ok(gm.areas.length >= 2 && gm.areas.some(a => a.hiddenPin));
  for ( const pin of gm.pins ) {
    assert.ok(pin.id && pin.name && pin.icon);
    assert.ok(pin.needle.includes(pin.name.toLowerCase()));
  }
  assert.equal(new Set(gm.pins.map(p => p.id)).size, gm.pins.length);
  const player = listData({gm: false, t, icon});
  assert.ok(player.pins.some(p => p.newParts > 0) && player.pins.some(p => p.canEdit));
  assert.ok(!player.pins.some(p => p.hiddenPin || p.rumor || p.canRumor));
});

test("the category chips count pins and areas, a switched off one is marked for the GM", () => {
  const gm = listData({gm: true, t, icon});
  const danger = gm.categories.find(c => c.id === "sample-danger");
  assert.equal(danger.count, 2);
  assert.equal(danger.hidden, true);
  assert.equal(gm.categories.find(c => c.id === "sample-quest").count, 2);
  assert.ok(listData({gm: false, t, icon}).categories.every(c => !c.hidden));
  assert.deepEqual(sampleCategories(t, icon).map(c => c.id), ["sample-quest", "sample-shop", "sample-danger"]);
});

test("an empty list has no rows but keeps the chips", () => {
  const empty = listData({gm: true, empty: true, t, icon});
  assert.equal(empty.empty, true);
  assert.deepEqual(empty.pins, []);
  assert.equal(empty.categories.length, 3);
  assert.ok(empty.categories.every(c => c.count === 0));
});

test("routes: the GM's own, the player's own with a shared one, and none", () => {
  const gm = routeData("gm", t);
  assert.equal(gm.blocks.length, 1);
  assert.equal(gm.blocks[0].count, gm.blocks[0].stops.length);
  assert.equal(gm.blocks[0].stops[0].leg, "");
  assert.ok(gm.blocks[0].stops[1].leg.endsWith("mi"));
  const player = routeData("player", t);
  assert.deepEqual(player.blocks.map(b => b.editable), [true, false]);
  assert.match(player.blocks[1].css, /^#[0-9a-f]{6}$/);
  assert.deepEqual(routeData("empty", t).blocks, []);
});

test("where are we: marks, the trail and two maps", () => {
  const gm = whereData({gm: true, t, place: "Mill"});
  assert.equal(gm.several, true);
  assert.equal(gm.pins.find(p => p.here).mark, en.SMP.Where.partyHere);
  assert.equal(gm.focusX, gm.pins.find(p => p.focus).x);
  assert.ok(gm.trail.some(entry => entry.unknown));
  const player = whereData({gm: false, index: 1, t, place: "Mill"});
  assert.equal(player.pins.find(p => p.here).mark, en.SMP.Where.youHere);
  assert.equal(player.maps.filter(m => m.selected).length, 1);
  assert.equal(player.maps[1].selected, true);
  assert.equal(whereData({gm: true, empty: true, t, place: "Mill"}).empty, true);
  for ( const pin of gm.pins ) assert.ok(pin.x <= gm.width && pin.y <= gm.height);
});

test("the cards show every kind of line", () => {
  const journal = cardData("journal", t);
  assert.ok(journal.scene.name && journal.quest && journal.blocks.length && journal.image.startsWith("data:image/svg+xml"));
  const rumor = cardData("rumor", t);
  assert.ok(rumor.parts.some(p => p.isNew) && rumor.parts.some(p => p.hidden) && rumor.more > 0);
});

test("the menus match the state of the pin", () => {
  const labels = kind => menuData(kind, t).filter(e => e.label).map(e => e.label);
  assert.ok(labels("hidden").includes(en.SMP.Menu.reveal) && !labels("hidden").includes(en.SMP.Menu.hide));
  assert.ok(labels("rumor").includes(en.SMP.Menu.rumorStop) && labels("rumor").includes(en.SMP.Menu.hide));
  assert.ok(labels("start").includes(en.SMP.Menu.rumorStart));
  assert.deepEqual(labels("player"), [en.SMP.Menu.addToRoute]);
  assert.equal(menuData("hidden", t).filter(e => e.on).length, 1);
});

test("rumor parts: players, who reads what", () => {
  const pages = partsData("pages", t);
  assert.equal(pages.players, PEOPLE);
  assert.equal(pages.parts[0].all, true);
  assert.deepEqual(pages.parts[2].users, []);
  const secrets = partsData("secrets", t);
  assert.equal(secrets.parts[0].name, "Part 1");
  assert.equal(revealData(t).users.filter(u => u.knows).length, 2);
});

test("the sample picture is a data address of the asked size", () => {
  const decoded = decodeURIComponent(samplePicture("valley").split(",")[1]);
  assert.match(decoded, /width="2400" height="1600"/);
  assert.match(samplePicture("nothing"), /^data:image\/svg\+xml/);
});

test("the pin a player sent has a name, a text and a color", () => {
  const data = playerPinData(t);
  assert.ok(data.pin.name && data.pin.text && /^#[0-9a-f]{6}$/.test(data.pin.color));
  assert.ok(data.secret.name && data.secret.text);
});
