import assert from "node:assert/strict";
import test from "node:test";
import {GROUPS, REFRESH_HOOK, touched} from "../scripts/refresh-logic.mjs";

const ID = "sephrals-map-pins";

test("the hook is the translator's", () => {
  assert.equal(REFRESH_HOOK, "sephrals-translator.refresh");
});

test("private pin label keys touch only the labels", () => {
  assert.deepEqual(touched({moduleId: ID, keys: ["SMP.Player.privateOf"]}, ID), {labels: true, party: false, trail: false});
  assert.equal(touched({moduleId: ID, keys: ["SMP.Player.unknownPrivate"]}, ID).labels, true);
});

test("party banner and trail date keys", () => {
  assert.deepEqual(touched({moduleId: ID, keys: ["SMP.Where.partyHere", "SMP.Where.dayAt"]}, ID), {labels: false, party: true, trail: true});
  assert.equal(touched({moduleId: ID, keys: ["SMP.Where.youHere"]}, ID).party, true);
});

test("keys that are not on the canvas touch nothing", () => {
  assert.deepEqual(touched({moduleId: ID, keys: ["SMP.Route.title", "SMP.Where.unknownPlace"]}, ID), {labels: false, party: false, trail: false});
});

test("another module's payload touches nothing, null keys touch everything", () => {
  assert.deepEqual(touched({moduleId: "x", keys: ["SMP.Player.privateOf"]}, ID), {labels: false, party: false, trail: false});
  assert.deepEqual(touched(null, ID), {labels: false, party: false, trail: false});
  assert.deepEqual(touched({module: ID, keys: null}, ID), {labels: true, party: true, trail: true});
  assert.deepEqual(Object.keys(GROUPS), ["labels", "party", "trail"]);
});
