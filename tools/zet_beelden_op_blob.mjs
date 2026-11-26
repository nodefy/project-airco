#!/usr/bin/env node
/*
  Beelden en films naar Vercel Blob (01_MIGRATIE.md, stap 4; fase 0 van de superprompt).

    node tools/zet_beelden_op_blob.mjs --proef      laat zien wat er zou gebeuren, zonder token en zonder iets te wijzigen
    node tools/zet_beelden_op_blob.mjs              uploaden, het manifest aanvullen en de referentie herschrijven

  Wat het doet:
  1. leest assets/manifest.json (gemaakt door migreer_naar_repo.py);
  2. zet elk bestand op Blob onder site/…:
       - assets/beelden en assets/downloads krijgen een inhoudshash in de naam (site/beelden/<pad>.<hash>.<ext>).
         Een beeld vervang je dus nooit: een nieuw beeld is een nieuwe naam.
       - referentie/_site/img houdt zijn pad (site/referentie/<versie>/img/<pad>), zonder hash. De referentiepagina's
         stellen paden in JavaScript samen (MAP='../_site/img/beeldlijn/' + naam), dus een hash in de naam breekt ze.
         De referentie is bevroren; verandert er toch een bestand, dan weigert het script en geef je een nieuwe versie
         op met --referentie-versie v2. Zo wordt ook daar nooit iets overschreven.
  3. vult per bestand in het manifest aan: id, blob_pad, url, type, breedte en hoogte (beelden);
  4. herschrijft in referentie/site-versie-tom/ (html) en referentie/_site/_astro/ (css) de paden ../_site/img/…
     naar de Blob-url, zodat de referentie overal werkt, ook in CI.

  Het script is herhaalbaar: wat al op Blob staat (zelfde hash) slaat het over.
  Token: BLOB_READ_WRITE_TOKEN in de omgeving. Het komt nooit in git en wordt nooit getoond.
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TYPEN = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".pdf": "application/pdf", ".json": "application/json", ".ico": "image/x-icon",
};
const BEELD = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"]);
const REF_MAP = "referentie/_site/img/";
const JAAR = 60 * 60 * 24 * 365;
const GROOT = 20 * 1024 * 1024; // daarboven in delen uploaden (films)

export function sha1Van(pad) {
  const h = crypto.createHash("sha1");
  h.update(fs.readFileSync(pad));
  return h.digest("hex");
}

/** Het id waarmee de inhoud naar een beeld verwijst: leesbaar en vast, los van de Blob-url. */
export function idVan(pad) {
  if (pad.startsWith(REF_MAP)) return "ref/" + pad.slice(REF_MAP.length);
  if (pad.startsWith("assets/beelden/")) return "set/" + pad.slice("assets/beelden/".length);
  if (pad.startsWith("assets/downloads/")) return "download/" + pad.slice("assets/downloads/".length);
  return pad;
}

/** Waar een bestand op Blob komt. */
export function blobPad(pad, sha1, { prefix = "site/", versie = "v1" } = {}) {
  if (pad.startsWith(REF_MAP)) return `${prefix}referentie/${versie}/img/${pad.slice(REF_MAP.length)}`;
  const ext = path.extname(pad);
  const zonder = pad.slice(0, pad.length - ext.length).replace(/^assets\//, "");
  return `${prefix}${zonder}.${sha1.slice(0, 10)}${ext.toLowerCase()}`;
}

/** Vervangt ../_site/img/ (elke diepte) en een eerdere Blob-basis door de nieuwe basis. Geeft [tekst, aantal]. */
export function herschrijf(tekst, basisUrl, vorigeBasis = [], { css = false } = {}) {
  let n = 0;
  const doel = basisUrl.endsWith("/") ? basisUrl : basisUrl + "/";
  let uit = tekst.replace(/(?:\.\.\/)+_site\/img\//g, () => (n++, doel));
  // een stylesheet in _site/_astro verwijst naar zijn buurmap met url(../img/…)
  if (css) uit = uit.replace(/(url\(\s*["']?)\.\.\/img\//g, (_, voor) => (n++, voor + doel));
  for (const oud of vorigeBasis) {
    if (!oud || oud === doel) continue;
    uit = uit.split(oud).join(doel);
  }
  return [uit, n];
}

function alleBestanden(map, extensies) {
  if (!fs.existsSync(map)) return [];
  const uit = [];
  for (const e of fs.readdirSync(map, { withFileTypes: true })) {
    const p = path.join(map, e.name);
    if (e.isDirectory()) uit.push(...alleBestanden(p, extensies));
    else if (extensies.includes(path.extname(e.name).toLowerCase())) uit.push(p);
  }
  return uit;
}

async function inParallel(lijst, aantal, werk) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(aantal, lijst.length) }, async () => {
      while (i < lijst.length) await werk(lijst[i++]);
    }),
  );
}

/**
  Het werk zelf. `blob` is { put, head } (in het echt uit @vercel/blob; in de test een nep), `maten` leest
  breedte en hoogte van een beeld.
*/
export async function voerUit(opties, { blob, maten, log = console.log } = {}) {
  const { wortel = ".", proef = false, versie = "v1", token, basis } = opties;
  const manifestPad = path.join(wortel, "assets/manifest.json");
  if (!fs.existsSync(manifestPad)) throw new Error("assets/manifest.json ontbreekt. Draai eerst migreer_naar_repo.py --uitvoeren.");
  const manifest = JSON.parse(fs.readFileSync(manifestPad, "utf8"));
  const prefix = manifest.blob_prefix || "site/";
  const telling = { nieuw: 0, overgeslagen: 0, ontbreekt: [], gewijzigd: [], bytes: 0 };

  await inParallel(manifest.bestanden, 6, async (b) => {
    const lokaal = path.join(wortel, b.pad);
    if (!fs.existsSync(lokaal)) {
      telling.ontbreekt.push(b.pad);
      return;
    }
    const sha1 = sha1Van(lokaal);
    const ext = path.extname(b.pad).toLowerCase();
    const doel = blobPad(b.pad, sha1, { prefix, versie });
    // een referentiebestand dat veranderde zou hetzelfde pad overschrijven: dat doen we niet
    if (b.url && b.blob_pad === doel && b.sha1 && b.sha1 !== sha1) {
      telling.gewijzigd.push(b.pad);
      return;
    }
    const klaar = b.url && b.blob_pad === doel && b.sha1 === sha1;
    b.id = idVan(b.pad);
    b.type = TYPEN[ext] ?? "application/octet-stream";
    if (klaar) {
      telling.overgeslagen++;
      return;
    }
    telling.nieuw++;
    telling.bytes += fs.statSync(lokaal).size;
    if (proef) return;
    if (BEELD.has(ext) && maten) {
      const m = await maten(lokaal).catch(() => null);
      if (m) Object.assign(b, { breedte: m.width ?? null, hoogte: m.height ?? null });
    }
    let url;
    try {
      const r = await blob.put(doel, fs.createReadStream(lokaal), {
        access: "public",
        addRandomSuffix: false,
        contentType: b.type,
        cacheControlMaxAge: JAAR,
        multipart: fs.statSync(lokaal).size > GROOT,
        token,
      });
      url = r.url;
    } catch (fout) {
      // bestaat al (een eerdere run die het manifest niet meer kon schrijven): dan is het dezelfde inhoud of,
      // bij de referentie, hetzelfde pad. Haal de url op in plaats van te overschrijven.
      if (!/already exists|BlobAlreadyExists/i.test(String(fout?.message ?? fout))) throw fout;
      const staat = await blob.head(doel, { token });
      // zelfde pad, andere inhoud: alleen mogelijk bij de referentie (de rest heeft de hash in de naam)
      if (staat.size !== undefined && staat.size !== fs.statSync(lokaal).size) {
        telling.nieuw--;
        telling.gewijzigd.push(b.pad);
        return;
      }
      url = staat.url;
    }
    Object.assign(b, { sha1, blob_pad: doel, url });
    log(`  ↑ ${b.pad}`);
  });

  if (telling.gewijzigd.length) {
    throw new Error(
      `Deze referentiebestanden zijn veranderd sinds de vorige upload:\n  ${telling.gewijzigd.join("\n  ")}\n` +
        `Een beeld overschrijven we nooit. Draai opnieuw met --referentie-versie <nieuwe versie> (nu ${versie}).`,
    );
  }

  // de basis waaronder de referentiebeelden staan: uit een geüploade url, of opgegeven (proef)
  const voorbeeld = manifest.bestanden.find((b) => b.url && b.pad.startsWith(REF_MAP));
  const refBasis = voorbeeld
    ? voorbeeld.url.slice(0, voorbeeld.url.length - voorbeeld.pad.slice(REF_MAP.length).length)
    : basis
      ? `${basis.replace(/\/$/, "")}/${prefix}referentie/${versie}/img/`
      : null;

  const herschreven = { bestanden: 0, verwijzingen: 0, over: [], absoluut: 0 };
  if (refBasis) {
    const vorige = manifest.referentie_basis && manifest.referentie_basis !== refBasis ? [manifest.referentie_basis] : [];
    const doelen = [
      ...alleBestanden(path.join(wortel, "referentie/site-versie-tom"), [".html"]),
      ...alleBestanden(path.join(wortel, "referentie/_site/_astro"), [".css"]),
    ];
    for (const p of doelen) {
      const tekst = fs.readFileSync(p, "utf8");
      const [nieuw, n] = herschrijf(tekst, refBasis, vorige, { css: p.endsWith(".css") });
      if (nieuw !== tekst) {
        herschreven.bestanden++;
        herschreven.verwijzingen += n;
        if (!proef) fs.writeFileSync(p, nieuw);
      }
      // og:image en JSON-LD noemen https://www.ayr.amsterdam/_site/img/…: dat zijn adressen voor de nieuwe site
      // (die ze uit het manifest haalt), geen beelden die de referentie laadt. Die tellen we apart.
      herschreven.absoluut += (nieuw.match(/ayr\.amsterdam\/_site\/img\//g) ?? []).length;
      if (/(?<!ayr\.amsterdam\/)_site\/img\//.test(nieuw)) herschreven.over.push(path.relative(wortel, p));
    }
    if (!proef) manifest.referentie_basis = refBasis;
  }

  if (!proef) {
    manifest.bijgewerkt = new Date().toISOString();
    manifest.referentie_versie = versie;
    fs.writeFileSync(manifestPad, JSON.stringify(manifest, null, 1) + "\n");
  }
  return { telling, herschreven, refBasis, totaal: manifest.bestanden.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const waarde = (naam) => (a.includes(naam) ? a[a.indexOf(naam) + 1] : undefined);
  const proef = a.includes("--proef");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!proef && !token) {
    console.error("BLOB_READ_WRITE_TOKEN ontbreekt. Zet hem in je omgeving (nooit in git), of draai met --proef.");
    process.exit(1);
  }
  const blob = proef ? null : await import("@vercel/blob");
  const sharp = proef ? null : (await import("sharp")).default;
  try {
    const r = await voerUit(
      { wortel: ".", proef, versie: waarde("--referentie-versie") ?? "v1", token, basis: waarde("--basis") },
      { blob, maten: sharp ? (p) => sharp(p).metadata() : null },
    );
    const mb = (r.telling.bytes / 1e6).toFixed(1);
    console.log(`\n${proef ? "Proefrun (niets geüpload, niets gewijzigd)" : "Klaar"}`);
    console.log(`- in het manifest: ${r.totaal} bestanden`);
    console.log(`- ${proef ? "te uploaden" : "geüpload"}: ${r.telling.nieuw} (${mb} MB); al aanwezig: ${r.telling.overgeslagen}`);
    console.log(`- lokaal niet gevonden: ${r.telling.ontbreekt.length}`);
    for (const p of r.telling.ontbreekt.slice(0, 20)) console.log(`    ${p}`);
    if (r.refBasis) {
      console.log(`- referentie: ${r.herschreven.verwijzingen} verwijzingen in ${r.herschreven.bestanden} bestanden ${proef ? "te herschrijven" : "herschreven"} naar ${r.refBasis}`);
      if (r.herschreven.over.length) console.log(`  let op, nog een lokaal pad in: ${r.herschreven.over.join(", ")}`);
      if (r.herschreven.absoluut) console.log(`  ter info: ${r.herschreven.absoluut}× een adres https://www.ayr.amsterdam/_site/img/… in og:image of JSON-LD (blijft staan; de nieuwe site vult dat uit het manifest)`);
    } else {
      console.log("- referentie: nog niet herschreven (geef bij een proefrun --basis https://<winkel>.public.blob.vercel-storage.com mee om het te tellen)");
    }
    if (r.telling.ontbreekt.length && !proef) process.exit(1);
  } catch (fout) {
    console.error(String(fout.message ?? fout));
    process.exit(1);
  }
}
