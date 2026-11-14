import assert from "node:assert/strict";
import {test} from "node:test";
import {LEVELS, cleanRecord, cleanRumorMode, entryOwnershipAfter, levelFor, markRecord, nextHidden, ownershipAfter,
  ownershipChange, planParts, previewParts, readableByAll, rumorModeFor, secretSections, setAllSecrets, setSecrets,
  summarize, trimStore, unannounced, unseen} from "../scripts/rumor-logic.mjs";

const PLAYERS = ["p1", "p2", "p3"];

/* Which parts */

test("the mode follows the journal: pages for a pin on the whole journal, secrets for a pin on one page", () => {
  assert.equal(rumorModeFor({hasPage: false, pageCount: 3}), "pages");
  assert.equal(rumorModeFor({hasPage: true, pageCount: 3}), "secrets");
  assert.equal(rumorModeFor({hasPage: false, pageCount: 1}), "secrets");
  assert.equal(cleanRumorMode("pages"), "pages");
  assert.equal(cleanRumorMode("x"), "");
  assert.equal(cleanRumorMode(true), "");
});

const HTML = "<p>Intro</p><section class=\"secret\" id=\"secret-a\"><p>One</p></section><p>Between</p>"
  + "<section class=\"secret revealed\" id=\"secret-b\"><p>Two</p><section><p>nested</p></section></section>"
  + "<section class='secret'><p>Three</p></section>";

test("secret sections are found in order, with their state", () => {
  const found = secretSections(HTML);
  assert.equal(found.length, 3);
  assert.deepEqual(found.map(s => s.revealed), [false, true, false]);
  assert.deepEqual(found.map(s => s.key), ["secret-a", "secret-b", "#2"]);
  assert.equal(found[0].inner, "<p>One</p>");
  assert.ok(found[1].inner.includes("nested"));
  assert.equal(secretSections("<p>none</p><section><p>x</p></section>").length, 0);
  assert.equal(secretSections(null).length, 0);
});

test("revealing a secret adds the class revealed and keeps the rest of the page", () => {
  const out = setSecrets(HTML, new Map([[0, true]]));
  assert.ok(out.includes("<section class=\"secret revealed\" id=\"secret-a\">"));
  assert.ok(out.startsWith("<p>Intro</p>"));
  assert.ok(out.includes("<p>Between</p>"));
  assert.deepEqual(secretSections(out).map(s => s.revealed), [true, true, false]);
  const back = setSecrets(out, {1: false});
  assert.deepEqual(secretSections(back).map(s => s.revealed), [true, false, false]);
});

test("all secrets can be hidden or revealed at once", () => {
  assert.deepEqual(secretSections(setAllSecrets(HTML, false)).map(s => s.revealed), [false, false, false]);
  assert.deepEqual(secretSections(setAllSecrets(HTML, true)).map(s => s.revealed), [true, true, true]);
  assert.equal(setAllSecrets("<p>x</p>", true), "<p>x</p>");
});

test("a secret without a class attribute value keeps its other attributes", () => {
  const out = setAllSecrets("<section id=\"x\" class=\"secret\" data-a=\"1\"><p>a</p></section>", true);
  assert.equal(out, "<section id=\"x\" class=\"secret revealed\" data-a=\"1\"><p>a</p></section>");
});

/* Ownership */

test("a user's level comes from their own entry, the default or the parent", () => {
  assert.equal(levelFor({default: 0, p1: 2}, "p1"), 2);
  assert.equal(levelFor({default: 0, p1: 2}, "p2"), 0);
  assert.equal(levelFor({default: -1}, "p2", {default: 2}), 2);
  assert.equal(levelFor({default: -1, p2: 0}, "p2", {default: 2}), 0);
  assert.equal(levelFor({default: -1}, "p2"), 0);
});

test("a page is readable by all when its default or the inherited default is Observer", () => {
  assert.equal(readableByAll({default: 2}, {default: 0}), true);
  assert.equal(readableByAll({default: -1}, {default: 2}), true);
  assert.equal(readableByAll({default: -1}, {default: 1}), false);
  assert.equal(readableByAll({default: 0}, {default: 3}), false);
  assert.equal(readableByAll(undefined, undefined), false);
});

test("telling a page to everyone sets Observer and drops lower entries of players", () => {
  const next = ownershipAfter({default: -1, p1: 0, gm: 3}, {everyone: true, playerIds: PLAYERS});
  assert.equal(next.default, LEVELS.OBSERVER);
  assert.equal("p1" in next, false);
  assert.equal(next.gm, 3);
  assert.equal(ownershipAfter({default: 3}, {everyone: true, playerIds: PLAYERS}).default, 3);
});

test("telling a page to chosen players closes the default and opens it for them only", () => {
  const next = ownershipAfter({default: 2, p3: 2}, {everyone: false, users: ["p1"], playerIds: PLAYERS});
  assert.equal(next.default, LEVELS.NONE);
  assert.equal(next.p1, LEVELS.OBSERVER);
  assert.equal("p3" in next, false);
  const hidden = ownershipAfter({default: -1}, {everyone: false, users: [], playerIds: PLAYERS});
  assert.deepEqual(hidden, {default: 0});
});

test("a higher level of a player or a GM entry stays when parts are told or hidden", () => {
  const next = ownershipAfter({default: 0, p1: 3, gm: 3}, {everyone: false, users: [], playerIds: PLAYERS});
  assert.equal(next.p1, 3);
  assert.equal(next.gm, 3);
});

test("the journal opens for those who get a part", () => {
  assert.equal(entryOwnershipAfter({default: 2}, {everyone: true}), null);
  assert.deepEqual(entryOwnershipAfter({default: 0}, {everyone: true}), {default: 2});
  assert.deepEqual(entryOwnershipAfter({default: 0}, {everyone: false, users: ["p1"]}), {default: 0, p1: 2});
  assert.equal(entryOwnershipAfter({default: 2}, {everyone: false, users: ["p1"]}), null);
  assert.equal(entryOwnershipAfter({default: 0, p1: 2}, {everyone: false, users: ["p1"]}), null);
});

test("the ownership change lists changed entries and removed ones", () => {
  assert.equal(ownershipChange({default: 0}, {default: 0}), null);
  assert.deepEqual(ownershipChange({default: 0, p1: 2}, {default: 2}), {default: 2, "-=p1": null});
  assert.deepEqual(ownershipChange({default: 0}, {default: 0, p2: 2}), {p2: 2});
});

/* Parts */

test("the next part is the first one not everybody can read", () => {
  assert.equal(nextHidden([{all: true}, {all: false}, {all: false}]), 1);
  assert.equal(nextHidden([{all: true}]), -1);
  assert.equal(nextHidden([]), -1);
  assert.deepEqual(summarize([{all: true, users: []}, {all: false, users: ["p1"]}, {all: false, users: []}]),
    {total: 3, all: 1, some: 1, none: 1});
});

test("the plan keeps only the parts that change", () => {
  const parts = [{key: "a", all: true, users: [...PLAYERS]}, {key: "b", all: false, users: ["p1"]},
    {key: "c", all: false, users: []}];
  const desired = {
    a: {everyone: true, users: PLAYERS},
    b: {everyone: false, users: ["p1"]},
    c: {everyone: false, users: ["p2", "p3"]}
  };
  assert.deepEqual(planParts(desired, parts, PLAYERS), {c: {everyone: false, users: ["p2", "p3"]}});
  const all = planParts({b: {everyone: false, users: PLAYERS}}, parts, PLAYERS);
  assert.deepEqual(all.b.everyone, true);
  const hide = planParts({a: {everyone: false, users: []}}, parts, PLAYERS);
  assert.deepEqual(hide, {a: {everyone: false, users: []}});
});

/* What a player has seen */

test("a record keeps clean lists", () => {
  assert.deepEqual(cleanRecord({known: ["a", "a", "", 3], seen: "x"}), {known: ["a"], seen: []});
  assert.deepEqual(cleanRecord(null), {known: [], seen: []});
});

test("announced and seen parts are told apart", () => {
  const record = {known: ["a"], seen: []};
  assert.deepEqual(unannounced(["a", "b"], record), ["b"]);
  assert.deepEqual(unseen(["a", "b"], record), ["a", "b"]);
  const next = markRecord(record, {seen: ["b"]});
  assert.deepEqual(next, {known: ["a", "b"], seen: ["b"]});
  assert.deepEqual(unseen(["a", "b"], next), ["a"]);
  assert.deepEqual(unannounced(["a", "b"], next), []);
});

test("the store keeps the newest pins", () => {
  const store = {};
  for ( let i = 0; i < 350; i++ ) store[`p${i}`] = {known: [], seen: []};
  const trimmed = trimStore(store);
  assert.equal(Object.keys(trimmed).length, 300);
  assert.ok("p349" in trimmed);
  assert.ok(!("p0" in trimmed));
});

/* The preview */

const ITEMS = [
  {key: "a", name: "First", revealed: true, kind: "html", text: "<p>The well is poisoned.</p><section class=\"secret\"><p>by the baker</p></section>"},
  {key: "b", name: "Second", revealed: false, kind: "html", text: "<p>The baker did it.</p>"},
  {key: "c", name: "Third", revealed: true, kind: "markdown", text: "# Rumor\nA ghost in the mill."},
  {key: "d", name: "Map", revealed: true, kind: "image", src: "icons/map.webp"}
];

test("players get only the parts that are revealed", () => {
  const shown = previewParts(ITEMS, {isGM: false, maxChars: 200, seen: ["a"]});
  assert.deepEqual(shown.parts.map(p => p.key), ["a", "c", "d"]);
  assert.deepEqual(shown.parts.map(p => p.isNew), [false, true, true]);
  assert.deepEqual(shown.keys, ["a", "c", "d"]);
  assert.equal(shown.image, "icons/map.webp");
  const text = JSON.stringify(shown);
  assert.ok(!text.includes("baker"));
  assert.ok(text.includes("poisoned"));
});

test("the GM sees all parts with the hidden ones marked and unread", () => {
  const shown = previewParts(ITEMS, {isGM: true, maxChars: 200});
  assert.equal(shown.parts.length, 4);
  const hidden = shown.parts.find(p => p.key === "b");
  assert.equal(hidden.hidden, true);
  assert.deepEqual(hidden.blocks, []);
  assert.equal(shown.parts.some(p => p.isNew), false);
});

test("of many parts the newest few are shown", () => {
  const many = Array.from({length: 9}, (_, i) => ({key: `k${i}`, name: `P${i}`, revealed: true, kind: "html", text: `<p>t${i}</p>`}));
  const shown = previewParts(many, {isGM: false, maxChars: 100, max: 4});
  assert.deepEqual(shown.parts.map(p => p.key), ["k5", "k6", "k7", "k8"]);
  assert.equal(shown.more, 5);
  assert.equal(shown.keys.length, 9);
});
