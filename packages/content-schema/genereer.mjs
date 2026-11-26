#!/usr/bin/env node
/*
  Maakt de zod-typen uit het contentmodel (superprompt, fase 1: "packages/content-schema: zod-types uit
  content_schema.json"). Het JSON Schema blijft het contract; dit bestand leidt er alleen uit af.

    node genereer.mjs                      zoekt het schema en schrijft src/schema.gen.ts
    node genereer.mjs --schema <pad>       een ander schemabestand (of zet CONTENT_SCHEMA)
    node genereer.mjs --uit <pad>          een ander doelbestand
    node genereer.mjs --als-aanwezig       doet niets als er geen schema is (voor postinstall)
    node genereer.mjs --controleer         eindigt met 1 als src/schema.gen.ts niet bij het schema hoort

  Het schema wordt gezocht in packages/content-schema/content_schema.json en daarna in
  docs/migratie/content_schema.json (de twee plekken die de superprompt noemt).

  Per definitie in $defs komt er een interface en een zod-schema met dezelfde naam, en voor het geheel `Inhoud`.
  Wat het JSON Schema toelaat, laat zod toe, en omgekeerd; test/overeenkomst.test.mjs bewijst dat met Ajv.
  De regels van de omzetting:
    - object zonder additionalProperties   → z.looseObject (onbekende velden mogen en blijven staan)
    - additionalProperties: false          → z.strictObject
    - additionalProperties: <schema>       → z.record of .catchall
    - niet in required                     → .optional()  (null is geen "leeg": het schema kent geen null)
    - default                              → alleen een aantekening, net als in JSON Schema; zod vult niets in
    - $ref                                 → de naam van de definitie (elke definitie is lazy, dus kringen mogen)
  Een sleutelwoord dat hier niet staat, breekt de omzetting af met een melding. Zo kan het schema niet groeien
  zonder dat de typen meegroeien.
*/
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const AANTEKENING = new Set(["description", "title", "default", "examples", "readOnly", "$schema", "$id", "$comment"]);
const BEKEND = new Set([
  ...AANTEKENING, "$defs", "$ref", "allOf", "type", "enum",
  "properties", "required", "additionalProperties",
  "items", "minItems", "maxItems",
  "pattern", "format", "minLength", "maxLength",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
]);
const FORMATEN = { "date-time": "datumtijd", date: "datum", uri: "uri", email: "email" };
const TYPEN = new Set(["object", "array", "string", "number", "integer", "boolean"]);
const q = (w) => JSON.stringify(w);
const sp = (n) => "  ".repeat(n);

class Omzetfout extends Error {}

/** De omzetting zelf. Geeft de TypeScript-bron terug. */
export function naarBron(schema, { wortel = "Inhoud", bron = "content_schema.json", sha = "" } = {}) {
  const defs = schema.$defs ?? {};
  for (const naam of Object.keys(defs)) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(naam)) throw new Omzetfout(`$defs/${naam}: de naam moet met een hoofdletter beginnen en alleen letters en cijfers hebben`);
  }
  if (wortel in defs) throw new Omzetfout(`$defs/${wortel} botst met de naam van het geheel`);

  const commentaar = (knoop, n) => {
    const d = knoop?.description;
    return d ? `${sp(n)}/** ${String(d).replace(/\*\//g, "* /").replace(/\s+/g, " ")} */\n` : "";
  };

  /** Eén knoop → { z: zod-bron, t: type-bron }. `n` is de inspringing van de regel waarop de knoop begint. */
  function zet(knoop, pad, n) {
    if (knoop === true) return { z: "z.unknown()", t: "unknown" };
    if (knoop === null || typeof knoop !== "object" || Array.isArray(knoop)) throw new Omzetfout(`${pad}: hier hoort een schema`);
    for (const k of Object.keys(knoop)) if (!BEKEND.has(k)) throw new Omzetfout(`${pad}: het sleutelwoord "${k}" kent de omzetter niet`);
    const delen = [];
    if (knoop.$ref !== undefined) {
      const m = /^#\/\$defs\/([A-Za-z0-9]+)$/.exec(knoop.$ref);
      if (!m || !(m[1] in defs)) throw new Omzetfout(`${pad}: $ref "${knoop.$ref}" wijst niet naar een definitie in $defs`);
      delen.push({ z: m[1], t: m[1] });
    }
    if (knoop.allOf !== undefined) {
      if (!Array.isArray(knoop.allOf) || !knoop.allOf.length) throw new Omzetfout(`${pad}: allOf is leeg`);
      knoop.allOf.forEach((d, i) => delen.push(zet(d, `${pad}/allOf/${i}`, n)));
    }
    const eigen = zelf(knoop, pad, n);
    if (eigen) delen.push(eigen);
    if (!delen.length) return { z: "z.unknown()", t: "unknown" };
    return delen.reduce((a, b) => ({ z: `z.intersection(${a.z}, ${b.z})`, t: `${a.t} & ${b.t}` }));
  }

  /** De eisen van de knoop zelf (type, enum en wat daarbij hoort); null als hij er geen heeft. */
  function zelf(knoop, pad, n) {
    const { type } = knoop;
    if (type !== undefined && !TYPEN.has(type)) throw new Omzetfout(`${pad}: type ${q(type)} kent de omzetter niet (alleen één type per knoop)`);
    const mag = {
      object: ["properties", "required", "additionalProperties"],
      array: ["items", "minItems", "maxItems"],
      string: ["pattern", "format", "minLength", "maxLength"],
      number: ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"],
      integer: ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"],
      boolean: [],
    };
    // een eis die bij een ander type hoort, zou in JSON Schema stil niets doen: liever een melding
    for (const [t, sleutels] of Object.entries(mag)) {
      for (const s of sleutels) {
        if (knoop[s] !== undefined && !(mag[type] ?? []).includes(s)) throw new Omzetfout(`${pad}: "${s}" hoort bij type ${t}, maar de knoop heeft ${type ? `type ${type}` : "geen type"}`);
      }
    }
    if (knoop.enum !== undefined) {
      const waarden = knoop.enum;
      if (!Array.isArray(waarden) || !waarden.length) throw new Omzetfout(`${pad}: enum is leeg`);
      for (const w of waarden) {
        const soort = typeof w;
        if (!["string", "number", "boolean"].includes(soort)) throw new Omzetfout(`${pad}: enum-waarde ${q(w)} kent de omzetter niet`);
        const past = type === undefined || type === soort || (type === "integer" && Number.isInteger(w));
        if (!past) throw new Omzetfout(`${pad}: enum-waarde ${q(w)} past niet bij type ${type}`);
      }
      if ((mag[type] ?? []).some((s) => knoop[s] !== undefined)) throw new Omzetfout(`${pad}: enum samen met andere eisen kent de omzetter niet`);
      const t = waarden.map(q).join(" | ");
      return waarden.every((w) => typeof w === "string") ? { z: `z.enum([${waarden.map(q).join(", ")}])`, t } : { z: `z.literal([${waarden.map(q).join(", ")}])`, t };
    }
    if (type === undefined) return null;
    if (type === "boolean") return { z: "z.boolean()", t: "boolean" };
    if (type === "string") {
      let z = "z.string()";
      if (knoop.format !== undefined) {
        if (!(knoop.format in FORMATEN)) throw new Omzetfout(`${pad}: format ${q(knoop.format)} kent de omzetter niet`);
        z = `formaat.${FORMATEN[knoop.format]}()`;
      }
      if (knoop.pattern !== undefined) {
        try {
          new RegExp(knoop.pattern, "u");
        } catch (f) {
          throw new Omzetfout(`${pad}: pattern ${q(knoop.pattern)} is geen geldige reguliere expressie (${f.message})`);
        }
        z += `.regex(new RegExp(${q(knoop.pattern)}, "u"))`;
      }
      // JSON Schema telt tekens (codepunten), niet UTF-16-eenheden
      if (knoop.minLength !== undefined) z += `.refine((w) => [...w].length >= ${Number(knoop.minLength)}, "te kort")`;
      if (knoop.maxLength !== undefined) z += `.refine((w) => [...w].length <= ${Number(knoop.maxLength)}, "te lang")`;
      return { z, t: "string" };
    }
    if (type === "number" || type === "integer") {
      let z = type === "integer" ? "z.int()" : "z.number()";
      if (knoop.minimum !== undefined) z += `.min(${Number(knoop.minimum)})`;
      if (knoop.maximum !== undefined) z += `.max(${Number(knoop.maximum)})`;
      if (knoop.exclusiveMinimum !== undefined) z += `.gt(${Number(knoop.exclusiveMinimum)})`;
      if (knoop.exclusiveMaximum !== undefined) z += `.lt(${Number(knoop.exclusiveMaximum)})`;
      return { z, t: "number" };
    }
    if (type === "array") {
      const item = knoop.items === undefined ? { z: "z.unknown()", t: "unknown" } : zet(knoop.items, `${pad}/items`, n);
      let z = `z.array(${item.z})`;
      if (knoop.minItems !== undefined) z += `.min(${Number(knoop.minItems)})`;
      if (knoop.maxItems !== undefined) z += `.max(${Number(knoop.maxItems)})`;
      return { z, t: `Array<${item.t}>` };
    }
    // object
    const velden = knoop.properties ?? {};
    const verplicht = knoop.required ?? [];
    for (const v of verplicht) if (!(v in velden)) throw new Omzetfout(`${pad}: "${v}" is verplicht maar staat niet in properties`);
    const extra = knoop.additionalProperties;
    const zr = [], tr = [];
    for (const [naam, kind] of Object.entries(velden)) {
      const k = zet(kind, `${pad}/${naam}`, n + 1);
      const moet = verplicht.includes(naam);
      zr.push(`${sp(n + 1)}${q(naam)}: ${k.z}${moet ? "" : ".optional()"},\n`);
      tr.push(`${commentaar(kind, n + 1)}${sp(n + 1)}${q(naam)}${moet ? "" : "?"}: ${k.t};\n`);
    }
    const lijf = zr.length ? `{\n${zr.join("")}${sp(n)}}` : "{}";
    if (extra === false) return { z: `z.strictObject(${lijf})`, t: tr.length ? `{\n${tr.join("")}${sp(n)}}` : "Record<string, never>" };
    if (extra === undefined || extra === true) {
      return { z: `z.looseObject(${lijf})`, t: `{\n${tr.join("")}${sp(n + 1)}[sleutel: string]: unknown;\n${sp(n)}}` };
    }
    const rest = zet(extra, `${pad}/additionalProperties`, n);
    if (!zr.length) return { z: `z.record(z.string(), ${rest.z})`, t: `Record<string, ${rest.t}>` };
    return { z: `z.object(${lijf}).catchall(${rest.z})`, t: `{\n${tr.join("")}${sp(n)}} & Record<string, ${rest.t}>` };
  }

  const uit = [];
  uit.push(`// GEGENEREERD door packages/content-schema/genereer.mjs uit ${bron}. Niet met de hand wijzigen:`);
  uit.push(`// pas het schema aan en draai \`pnpm --filter @ayr/content-schema genereer\`.`);
  uit.push(`import { z } from "zod";`);
  uit.push(`import * as formaat from "./formaten.ts";`);
  uit.push("");
  uit.push(`/** De sha256 van het schema waaruit dit bestand komt; \`genereer.mjs --controleer\` vergelijkt hem. */`);
  uit.push(`export const SCHEMA_SHA256 = ${q(sha)};`);
  uit.push(`export const SCHEMA_TITEL = ${q(schema.title ?? "")};`);
  uit.push("");
  const namen = [];
  const schrijf = (naam, knoop, pad) => {
    const { z, t } = zet(knoop, pad, 0);
    const alsInterface = t.startsWith("{") && t.endsWith("}") && !t.includes("} &");
    uit.push(commentaar(knoop, 0) + (alsInterface ? `export interface ${naam} ${t}` : `export type ${naam} = ${t};`));
    uit.push(`export const ${naam}: z.ZodType<${naam}> = z.lazy(() => ${z});`);
    uit.push("");
    namen.push(naam);
  };
  for (const [naam, knoop] of Object.entries(defs)) schrijf(naam, knoop, `$defs/${naam}`);
  const { $defs: _weg, ...geheel } = schema;
  schrijf(wortel, geheel, "(het geheel)");
  uit.push(`/** Alle definities op naam, voor wie er doorheen wil lopen (de controles, de backend). */`);
  uit.push(`export const definities = { ${namen.join(", ")} } as const;`);
  uit.push("");
  return uit.join("\n");
}

/** Het schemabestand: het opgegeven pad, of de eerste van de twee vaste plekken die bestaat. */
export function vindSchema(opgegeven = process.env.CONTENT_SCHEMA) {
  if (opgegeven) return path.resolve(opgegeven);
  const plekken = [path.join(hier, "content_schema.json"), path.join(hier, "../../docs/migratie/content_schema.json")];
  return plekken.find((p) => fs.existsSync(p)) ?? null;
}

export function genereer(schemaPad, uitPad) {
  const ruw = fs.readFileSync(schemaPad);
  const sha = crypto.createHash("sha256").update(ruw).digest("hex");
  const bron = naarBron(JSON.parse(ruw.toString("utf8")), { bron: path.basename(schemaPad), sha });
  fs.mkdirSync(path.dirname(uitPad), { recursive: true });
  fs.writeFileSync(uitPad, bron);
  return { sha, regels: bron.split("\n").length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const waarde = (naam) => (a.includes(naam) ? a[a.indexOf(naam) + 1] : undefined);
  const uitPad = path.resolve(waarde("--uit") ?? path.join(hier, "src/schema.gen.ts"));
  const schemaPad = vindSchema(waarde("--schema") ?? process.env.CONTENT_SCHEMA);
  if (!schemaPad || !fs.existsSync(schemaPad)) {
    if (a.includes("--als-aanwezig")) {
      console.log("content-schema: geen content_schema.json gevonden, dus geen typen gemaakt (zie LEESMIJ.md).");
      process.exit(0);
    }
    console.error("Geen content_schema.json gevonden. Zet hem in docs/migratie/ of geef --schema <pad> mee.");
    process.exit(1);
  }
  try {
    if (a.includes("--controleer")) {
      const sha = crypto.createHash("sha256").update(fs.readFileSync(schemaPad)).digest("hex");
      const staat = fs.existsSync(uitPad) ? /SCHEMA_SHA256 = "([0-9a-f]*)"/.exec(fs.readFileSync(uitPad, "utf8"))?.[1] : null;
      if (staat !== sha) {
        console.error(`De typen horen niet bij het schema (${staat ? "een oudere versie" : "nog niet gemaakt"}). Draai: pnpm --filter @ayr/content-schema genereer`);
        process.exit(1);
      }
      console.log("De typen horen bij het schema.");
    } else {
      const { sha, regels } = genereer(schemaPad, uitPad);
      console.log(`${path.relative(process.cwd(), uitPad)}: ${regels} regels uit ${path.relative(process.cwd(), schemaPad)} (sha256 ${sha.slice(0, 12)}…)`);
    }
  } catch (fout) {
    if (!(fout instanceof Omzetfout)) throw fout;
    console.error(`Het schema kan niet worden omgezet.\n  ${fout.message}`);
    process.exit(1);
  }
}
