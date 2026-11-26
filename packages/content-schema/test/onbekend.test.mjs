import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { onbekendeVelden } from "../onbekend.mjs";
import { maakAjv, pakket } from "./hulp.mjs";

const schema = JSON.parse(fs.readFileSync(path.join(pakket, "test/proefschema.json"), "utf8"));
const boek = () => ({ id: "a-1", titel: { nl: "Titel" }, soort: "gids", prijs_eur: 10, oud: null, nieuw: { wat: "dan ook" } });

test("een tikfout in een veldnaam komt door het schema, maar niet door deze controle", () => {
  const inhoud = { boeken: [{ ...boek(), trefwoordn: ["a"], maten: { breedte: 1, hogte: 2 } }], woorden: { "kop.een": { nl: "x" } }, bijgwerkt: "2027-01-14T12:00:00Z" };
  assert.equal(maakAjv(schema).getSchema("schema")(inhoud), true, "het schema vindt dit goed");
  assert.deepEqual(onbekendeVelden(schema, inhoud), [
    { pad: "boeken[0].trefwoordn", veld: "trefwoordn" },
    { pad: "boeken[0].maten.hogte", veld: "hogte" },
    { pad: "bijgwerkt", veld: "bijgwerkt" },
  ]);
});

test("wat het schema vrij laat, wordt niet gemeld", () => {
  const b = { ...boek(), opties: { wat: 1, dan: { ook: true } }, uitslag: { vast: true, "model-x": "past" }, inleiding: { nl: "a", en: "b" } };
  assert.deepEqual(onbekendeVelden(schema, b, "Boek"), []);
  // onder additionalProperties: false zegt het schema het zelf al
  assert.deepEqual(onbekendeVelden(schema, { ...boek(), titel: { nl: "a", fr: "b" } }, "Boek"), []);
  assert.deepEqual(onbekendeVelden(schema, { naam: "a", takken: [{ naam: "b", takken: [] }] }, "Tak"), []);
  assert.throws(() => onbekendeVelden(schema, {}, "Bestaat_niet"), /geen definitie/);
});
