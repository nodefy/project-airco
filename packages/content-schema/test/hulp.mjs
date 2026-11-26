/* Gedeeld door de tests: het schema omzetten, de typen laden, en Ajv en zod naast elkaar leggen. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { naarBron } from "../genereer.mjs";
import { maak, maakRng, mutaties } from "./voorbeelden.mjs";

export const pakket = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// de proefbestanden staan in src/, naast formaten.ts, zodat de import in de gegenereerde bron klopt
export const proefPad = (naam) => path.join(pakket, "src", `.proef.${naam}.gen.ts`);

export function maakAjv(schema) {
  const ajv = new Ajv2020({ strict: true, allErrors: false });
  addFormats(ajv);
  ajv.addSchema(schema, "schema");
  return ajv;
}

/** Zet het schema om, schrijft de bron naast formaten.ts en laadt hem. */
export async function laad(schema, naam) {
  const pad = proefPad(naam);
  fs.writeFileSync(pad, naarBron(schema, { bron: naam }));
  return { pad, typen: await import(`${pathToFileURL(pad).href}?${Date.now()}`) };
}

/**
  Legt Ajv en zod naast elkaar voor elke definitie en voor het geheel.
  Geeft { getest, goed, afgekeurd, verschillen } terug; verschillen is de lijst waar ze niet hetzelfde zeggen.
*/
export function vergelijk(schema, typen, { zaden = [1, 2, 3], maxDiepte = 2 } = {}) {
  const ajv = maakAjv(schema);
  const { $defs, ...geheel } = schema;
  const doelen = [...Object.keys($defs ?? {}).map((naam) => ({ naam, knoop: { $ref: `#/$defs/${naam}` }, ref: `schema#/$defs/${naam}` })), { naam: "Inhoud", knoop: geheel, ref: "schema" }];
  const uit = { getest: 0, goed: 0, afgekeurd: 0, verschillen: [], ongeldigeVoorbeelden: [] };
  for (const doel of doelen) {
    const volgensAjv = ajv.getSchema(doel.ref);
    const zod = typen[doel.naam];
    if (!zod) throw new Error(`De typen missen ${doel.naam}`);
    const leg = (waarde, wat, moetGoed) => {
      const a = volgensAjv(waarde) === true;
      const z = zod.safeParse(waarde).success;
      uit.getest++;
      if (a) uit.goed++;
      else uit.afgekeurd++;
      if (a !== z) uit.verschillen.push({ definitie: doel.naam, wat, ajv: a, zod: z });
      if (moetGoed && !a) uit.ongeldigeVoorbeelden.push({ definitie: doel.naam, wat, fout: ajv.errorsText(volgensAjv.errors) });
    };
    for (const zaad of zaden) {
      for (const vol of ["min", "max", "wissel"]) {
        const waarde = maak(schema, doel.knoop, { rng: maakRng(zaad), vol, maxDiepte });
        leg(waarde, `voorbeeld ${vol} (zaad ${zaad})`, true);
        if (zaad === zaden[0] || vol === "wissel") for (const m of mutaties(schema, doel.knoop, waarde)) leg(m.waarde, `${vol} (zaad ${zaad}) ${m.wat}`, false);
      }
    }
  }
  return uit;
}

export const toon = (lijst, n = 12) => lijst.slice(0, n).map((v) => `\n  ${JSON.stringify(v)}`).join("") + (lijst.length > n ? `\n  … en nog ${lijst.length - n}` : "");
