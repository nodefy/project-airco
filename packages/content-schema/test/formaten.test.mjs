/*
  De formaten: zod (src/formaten.ts) tegenover Ajv met ajv-formats.
  De regel is dat zod nooit iets toelaat dat het JSON Schema afkeurt. Waar zod strenger is, staat het geval hier
  met naam in STRENGER; verandert een van beide bibliotheken van mening, dan faalt deze test en weten we het.
*/
import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as formaat from "../src/formaten.ts";

const ZOD = { "date-time": formaat.datumtijd(), date: formaat.datum(), uri: formaat.uri(), email: formaat.email() };

// alledaagse waarden, goed en fout: hier moeten beide hetzelfde zeggen
const GEWOON = {
  "date-time": ["2027-01-14T12:00:00+01:00", "2027-01-14T12:00:00Z", "2027-01-14T12:00:00.123Z", "2027-01-14T12:00:00-00:00", "2027-01-14T12:00:00", "2027-01-14T12:00Z", "2027-02-30T12:00:00Z", "2027-01-14T25:00:00Z", "2027-01-14", "14-01-2027 12:00", "geen", ""],
  date: ["2027-01-14", "2028-02-29", "2027-02-29", "2027-02-30", "2027-1-14", "14-01-2027", "2027-13-01", "2027-01-14T12:00:00Z", "geen", ""],
  uri: [
    "https://example.com/a.webp", "http://example.com", "https://example.com/a%20b.webp?x=1#y", "HTTPS://EXAMPLE.COM/", "mailto:info@example.com", "tel:+31205500006", "urn:isbn:0451450523",
    "https://example.com/a b.webp", "https://exämple.com/", "https://example.com/é", "https://example.com/100%", "https://example.com/a%zzb", "https://example.com/<a>", "/pad/alleen", "example.com", "geen", "",
  ],
  email: ["naam@example.com", "naam+tag@example.com", "n.a.a.m@sub.example.com", "NAAM@EXAMPLE.COM", "naam@example", "@example.com", "naam@", "naam @example.com", "Naam <naam@example.com>", "näam@example.com", "naam..x@example.com", "naam@-example.com", "geen", ""],
};

// het JSON Schema vindt het goed, zod niet: schrijfwijzen die het CRM niet maakt
const STRENGER = {
  "date-time": ["2027-01-14 12:00:00Z", "2027-01-14t12:00:00z", "2027-01-14T12:00:00+0100", "2027-01-14T23:59:60Z"],
  date: [],
  uri: ["https://"],
  email: ["naam@example.c"],
};

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);

for (const naam of Object.keys(ZOD)) {
  const volgensAjv = ajv.compile({ type: "string", format: naam });
  const zod = (w) => ZOD[naam].safeParse(w).success;
  test(`${naam}: alledaagse waarden, beide zeggen hetzelfde`, () => {
    const anders = GEWOON[naam].filter((w) => volgensAjv(w) !== zod(w)).map((w) => ({ waarde: w, ajv: volgensAjv(w), zod: zod(w) }));
    assert.deepEqual(anders, []);
    assert.ok(GEWOON[naam].some((w) => zod(w)) && GEWOON[naam].some((w) => !zod(w)), "de lijst heeft goede en foute waarden");
  });
  test(`${naam}: waar zod strenger is, is dat precies de lijst`, () => {
    for (const w of STRENGER[naam]) assert.deepEqual({ waarde: w, ajv: volgensAjv(w), zod: zod(w) }, { waarde: w, ajv: true, zod: false });
  });
}

test("een geheel getal buiten het veilige bereik: het schema neemt het aan, zod niet", async () => {
  const { z } = await import("zod");
  const volgensAjv = ajv.compile({ type: "integer" });
  assert.equal(volgensAjv(1e300), true);
  assert.equal(z.int().safeParse(1e300).success, false);
  assert.equal(z.int().safeParse(Number.MAX_SAFE_INTEGER).success, true);
});
