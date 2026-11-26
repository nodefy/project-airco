/*
  De belofte van dit pakket: JSON Schema en zod oordelen hetzelfde.
  - op het proefschema (verzonnen, met elk sleutelwoord dat de omzetter kent): altijd;
  - op het echte contentmodel: zodra content_schema.json er staat (docs/migratie/ of CONTENT_SCHEMA).
  Daarnaast: de gegenereerde bron komt door de TypeScript-controle, dus elk zod-schema past bij zijn interface.
*/
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { naarBron, vindSchema } from "../genereer.mjs";
import { pathToFileURL } from "node:url";
import { laad, pakket, proefPad, toon, vergelijk } from "./hulp.mjs";

const proef = JSON.parse(fs.readFileSync(path.join(pakket, "test/proefschema.json"), "utf8"));
const echtPad = vindSchema();
const gemaakt = [];
after(() => gemaakt.forEach((p) => fs.rmSync(p, { force: true })));

function tsc(bestand) {
  try {
    execFileSync(process.execPath, [path.join(pakket, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--allowImportingTsExtensions", "--skipLibCheck", bestand], { cwd: pakket, stdio: "pipe" });
  } catch (fout) {
    assert.fail(`TypeScript keurt de gegenereerde bron af:\n${fout.stdout?.toString().slice(0, 3000)}`);
  }
}

async function bewijs(schema, naam, minimum) {
  const { pad, typen } = await laad(schema, naam);
  gemaakt.push(pad);
  const u = vergelijk(schema, typen);
  assert.deepEqual(u.ongeldigeVoorbeelden, [], `De voorbeeldgenerator maakt iets dat het schema afkeurt:${toon(u.ongeldigeVoorbeelden)}`);
  assert.equal(u.verschillen.length, 0, `Ajv en zod zeggen niet hetzelfde (${u.verschillen.length} van ${u.getest}):${toon(u.verschillen)}`);
  assert.ok(u.getest >= minimum, `te weinig gevallen: ${u.getest}`);
  assert.ok(u.goed > 0 && u.afgekeurd > u.getest / 10, `de gevallen zijn eenzijdig: ${u.goed} goed, ${u.afgekeurd} afgekeurd`);
  tsc(pad);
  return u;
}

test("proefschema: Ajv en zod zeggen hetzelfde, en de bron komt door TypeScript", async (t) => {
  const u = await bewijs(proef, "proef", 1500);
  t.diagnostic(`${u.getest} gevallen: ${u.goed} goed, ${u.afgekeurd} afgekeurd, 0 verschillen`);
});

test("contentmodel: Ajv en zod zeggen hetzelfde, en de bron komt door TypeScript", { skip: echtPad ? false : "geen content_schema.json in docs/migratie/ (zet CONTENT_SCHEMA=<pad>)" }, async (t) => {
  const schema = JSON.parse(fs.readFileSync(echtPad, "utf8"));
  const u = await bewijs(schema, "echt", 5000);
  t.diagnostic(`${Object.keys(schema.$defs).length} definities, ${u.getest} gevallen: ${u.goed} goed, ${u.afgekeurd} afgekeurd, 0 verschillen`);
});

test("de omzetter weigert wat hij niet kent, met de plek erbij", () => {
  const met = (extra) => ({ type: "object", properties: { veld: extra }, $defs: {} });
  assert.throws(() => naarBron(met({ oneOf: [{ type: "string" }] })), /veld: het sleutelwoord "oneOf" kent de omzetter niet/);
  assert.throws(() => naarBron(met({ type: ["string", "null"] })), /veld: type \["string","null"\]/);
  assert.throws(() => naarBron(met({ properties: { a: {} } })), /veld: "properties" hoort bij type object, maar de knoop heeft geen type/);
  assert.throws(() => naarBron(met({ type: "string", minimum: 1 })), /"minimum" hoort bij type number/);
  assert.throws(() => naarBron(met({ type: "object", required: ["x"], properties: {} })), /"x" is verplicht maar staat niet in properties/);
  assert.throws(() => naarBron(met({ $ref: "#/$defs/Bestaat_niet" })), /wijst niet naar een definitie/);
  assert.throws(() => naarBron(met({ type: "string", format: "ipv4" })), /format "ipv4" kent de omzetter niet/);
  assert.throws(() => naarBron(met({ type: "string", enum: [1] })), /past niet bij type string/);
  assert.throws(() => naarBron({ type: "object", $defs: { Inhoud: {} } }), /botst met de naam van het geheel/);
});

test("default vult niets in en onbekende velden blijven staan", async () => {
  const { pad, typen } = await laad(proef, "gedrag");
  gemaakt.push(pad);
  const boek = { id: "a-1", titel: { nl: "Titel" }, soort: "gids", prijs_eur: 10, oud: null, nieuw: 1, later_erbij: "x" };
  const uit = typen.Boek.parse(boek);
  assert.deepEqual(uit, boek, "wat erin gaat komt er zo uit: geen ingevulde default, geen weggelaten veld");
  assert.equal(typen.Tweetalig.safeParse({ nl: "a", fr: "b" }).success, false, "additionalProperties: false blijft dicht");
  assert.equal(typen.Boek.safeParse({ ...boek, zichtbaar: null }).success, false, "null is geen leeg veld");
  assert.deepEqual(Object.keys(typen.definities), Object.keys(proef.$defs).concat("Inhoud"));
});

// De vergelijking is alleen iets waard als ze een fout ook vindt. Elke regel hieronder maakt de gegenereerde bron
// op één punt kapot; de vergelijking moet dan verschillen melden.
const KAPOT = [
  ["open object dicht", (b) => b.replaceAll("z.looseObject", "z.strictObject")],
  ["dicht object open", (b) => b.replaceAll("z.strictObject", "z.looseObject")],
  ["een veld verplicht dat het niet is", (b) => b.replace(".optional()", "")],
  ["een verplicht veld zonder schema niet meer verplicht", (b) => b.replace('"oud": z.unknown(),', '"oud": z.unknown().optional(),')],
  ["exclusiveMinimum als minimum", (b) => b.replace(".gt(", ".min(")],
  ["maximum één te ruim", (b) => b.replace(".max(100)", ".max(101)")],
  ["integer als number", (b) => b.replace("z.int()", "z.number()")],
  ["enum met een waarde te veel", (b) => b.replace('"atlas"]', '"atlas", "ATLAS_"]')],
  ["enum van getallen als elk getal", (b) => b.replace("z.literal([301, 302])", "z.number()")],
  ["maxLength in UTF-16 geteld", (b) => b.replace("[...w].length <= 4", "w.length <= 8")],
  ["additionalProperties met schema als vrij", (b) => b.replace("z.record(z.string(), Tweetalig)", "z.record(z.string(), z.unknown())")],
  ["maxItems vergeten", (b) => b.replace(".max(3)", "")],
  ["minItems vergeten", (b) => b.replace(".min(1)", "")],
  ["format date vergeten", (b) => b.replace("formaat.datum()", "z.string()")],
  ["format uri vergeten", (b) => b.replace("formaat.uri()", "z.string()")],
  ["patroon zonder ankers", (b) => b.replace(String.raw`"^[A-Z]{2}$"`, '"[A-Z]{2}"')],
];

test("de vergelijking vindt een omzetter die het fout doet", async () => {
  const bron = naarBron(proef);
  for (const [i, [wat, maakKapot]] of KAPOT.entries()) {
    const kapot = maakKapot(bron);
    assert.notEqual(kapot, bron, `"${wat}" is niet toegepast: de gegenereerde bron ziet er anders uit dan deze test denkt`);
    const pad = proefPad(`kapot${i}`);
    gemaakt.push(pad);
    fs.writeFileSync(pad, kapot);
    const u = vergelijk(proef, await import(pathToFileURL(pad).href), { zaden: [1, 2] });
    assert.ok(u.verschillen.length > 0, `"${wat}" is niet opgemerkt`);
  }
});
