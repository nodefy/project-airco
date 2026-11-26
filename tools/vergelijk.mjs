#!/usr/bin/env node
/*
  Fase 2 is klaar als de nieuwe site er net zo uitziet als de referentie (superprompt, fase 2):
  per pagina een schermafbeelding van beide, op 1440 en 390 px breed, in NL en EN, en het verschil
  is kleiner dan 1,5 % van de pixels. Films en klokken worden afgedekt.

    node tools/vergelijk.mjs --nieuw http://localhost:4321
    node tools/vergelijk.mjs --nieuw https://<preview>.vercel.app --alleen index,collectie --taal nl

  --referentie <adres>   standaard serveert het script referentie/ zelf
  --grens 1.5            het toegestane verschil in procenten
  --paginas <bestand>    een andere lijst met paren
  De paren (referentiebestand → pad op de nieuwe site) staan in tools/vergelijk.paginas.json.

  Uitvoer in .vergelijk/: per paar referentie.png, nieuw.png en verschil.png, en uitslag.json met de getallen.
  Het script eindigt met 1 als een paar boven de grens zit of een pagina niet laadt.

  Hoe het verschil geteld wordt: beide beelden op dezelfde breedte; is er één langer, dan telt het stuk dat de
  ander mist volledig als verschil. Een pixel verschilt als een kleurkanaal meer dan 24 (van 255) afwijkt, zodat
  ruis van anti-aliasing en compressie niet meetelt.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { serveer } from "./serveer.mjs";

const BREEDTES = [1440, 390];
const DREMPEL = 24;
const hier = path.dirname(fileURLToPath(import.meta.url));

/** Vergelijkt twee png-buffers. Geeft { procent, breedte, hoogte, verschil (png-buffer) }. */
export async function verschil(a, b, maskers = { a: [], b: [] }) {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const breedte = Math.min(ma.width, mb.width);
  const hoogte = Math.max(ma.height, mb.height);
  const ruw = async (buf, meta) =>
    sharp(buf)
      .extract({ left: 0, top: 0, width: breedte, height: meta.height })
      .extend({ bottom: hoogte - meta.height, background: { r: 255, g: 0, b: 255, alpha: 1 } })
      .ensureAlpha()
      .raw()
      .toBuffer();
  const [ra, rb] = await Promise.all([ruw(a, ma), ruw(b, mb)]);
  const gemeenschappelijk = Math.min(ma.height, mb.height);
  const afgedekt = new Uint8Array(breedte * hoogte);
  for (const m of [...maskers.a, ...maskers.b]) {
    const x0 = Math.max(0, Math.floor(m.x)), x1 = Math.min(breedte, Math.ceil(m.x + m.width));
    const y0 = Math.max(0, Math.floor(m.y)), y1 = Math.min(hoogte, Math.ceil(m.y + m.height));
    for (let y = y0; y < y1; y++) afgedekt.fill(1, y * breedte + x0, y * breedte + x1);
  }
  const uit = Buffer.alloc(breedte * hoogte * 4);
  let anders = 0, geteld = 0;
  for (let i = 0, p = 0; p < breedte * hoogte; i += 4, p++) {
    const y = Math.floor(p / breedte);
    let wijkt;
    if (afgedekt[p]) wijkt = false;
    else {
      geteld++;
      wijkt = y >= gemeenschappelijk || Math.abs(ra[i] - rb[i]) > DREMPEL || Math.abs(ra[i + 1] - rb[i + 1]) > DREMPEL || Math.abs(ra[i + 2] - rb[i + 2]) > DREMPEL;
    }
    if (wijkt) {
      anders++;
      uit[i] = 220; uit[i + 1] = 30; uit[i + 2] = 60; uit[i + 3] = 255;
    } else {
      const grijs = afgedekt[p] ? 200 : Math.round((ra[i] + ra[i + 1] + ra[i + 2]) / 3 / 2 + 127);
      uit[i] = uit[i + 1] = uit[i + 2] = grijs; uit[i + 3] = 255;
    }
  }
  const png = await sharp(uit, { raw: { width: breedte, height: hoogte, channels: 4 } }).png().toBuffer();
  return { procent: geteld ? (anders / geteld) * 100 : 0, breedte, hoogte, hoogteA: ma.height, hoogteB: mb.height, verschil: png };
}

/** Eén pagina fotograferen: alles stilzetten, tot onderaan scrollen voor lazy beelden, dan de hele pagina. */
export async function fotografeer(context, adres, maskerSelectors) {
  const pagina = await context.newPage();
  const antwoord = await pagina.goto(adres, { waitUntil: "load", timeout: 60_000 });
  if (!antwoord || antwoord.status() >= 400) {
    await pagina.close();
    throw new Error(`${adres} gaf ${antwoord?.status() ?? "geen antwoord"}`);
  }
  await pagina.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`,
  });
  await pagina.evaluate(async () => {
    for (const v of document.querySelectorAll("video")) {
      v.pause();
      v.removeAttribute("autoplay");
    }
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    scrollTo(0, 0);
    await document.fonts.ready;
  });
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(300);
  const maskers = await pagina.evaluate((selectors) => {
    const uit = [];
    for (const el of document.querySelectorAll(selectors.join(","))) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) uit.push({ x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height });
    }
    return uit;
  }, maskerSelectors);
  const png = await pagina.screenshot({ fullPage: true, animations: "disabled" });
  await pagina.close();
  return { png, maskers };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const waarde = (naam) => (a.includes(naam) ? a[a.indexOf(naam) + 1] : undefined);
  const nieuw = waarde("--nieuw");
  if (!nieuw) {
    console.error("Geef het adres van de nieuwe site mee: --nieuw http://localhost:4321");
    process.exit(1);
  }
  const grens = Number(waarde("--grens") ?? 1.5);
  const alleen = waarde("--alleen")?.split(",");
  const talen = waarde("--taal")?.split(",") ?? ["nl", "en"];
  const config = JSON.parse(fs.readFileSync(waarde("--paginas") ?? path.join(hier, "vergelijk.paginas.json"), "utf8"));
  let server;
  let referentie = waarde("--referentie");
  if (!referentie) {
    const s = await serveer("referentie", 0);
    server = s.server;
    referentie = `${s.adres}/site-versie-tom`;
  }
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  fs.mkdirSync(".vergelijk", { recursive: true });
  const uitslag = [];
  for (const p of config.paginas) {
    if (alleen && !alleen.includes(p.naam)) continue;
    for (const taal of talen) {
      for (const breedte of BREEDTES) {
        const context = await browser.newContext({ viewport: { width: breedte, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: taal === "en" ? "en-GB" : "nl-NL" });
        // de klok vastzetten, zodat de dagfilm en de dagpil in beide dezelfde stand hebben
        await context.addInitScript(() => {
          const vast = new Date("2027-01-14T12:00:00+01:00").getTime();
          Date.now = () => vast;
        });
        const sleutel = `${p.naam}.${taal}.${breedte}`;
        const refAdres = `${referentie}/${taal === "en" ? "en/" : ""}${p.referentie}`;
        const nieuwAdres = nieuw.replace(/\/$/, "") + (taal === "en" ? p.en : p.nl);
        try {
          const [r, n] = [await fotografeer(context, refAdres, config.maskers), await fotografeer(context, nieuwAdres, config.maskers)];
          const v = await verschil(r.png, n.png, { a: r.maskers, b: n.maskers });
          const map = path.join(".vergelijk", sleutel);
          fs.mkdirSync(map, { recursive: true });
          fs.writeFileSync(path.join(map, "referentie.png"), r.png);
          fs.writeFileSync(path.join(map, "nieuw.png"), n.png);
          fs.writeFileSync(path.join(map, "verschil.png"), v.verschil);
          const goed = v.procent < grens;
          uitslag.push({ pagina: p.naam, taal, breedte, procent: Number(v.procent.toFixed(3)), hoogte_referentie: v.hoogteA, hoogte_nieuw: v.hoogteB, goed });
          console.log(`${goed ? "goed " : "FOUT "} ${sleutel.padEnd(34)} ${v.procent.toFixed(2).padStart(6)} %   (hoogte ${v.hoogteA} → ${v.hoogteB})`);
        } catch (fout) {
          uitslag.push({ pagina: p.naam, taal, breedte, fout: String(fout.message ?? fout), goed: false });
          console.log(`FOUT  ${sleutel.padEnd(34)} ${String(fout.message ?? fout)}`);
        }
        await context.close();
      }
    }
  }
  await browser.close();
  server?.close();
  fs.writeFileSync(".vergelijk/uitslag.json", JSON.stringify({ grens, uitslag }, null, 1));
  const fout = uitslag.filter((u) => !u.goed);
  console.log(`\n${uitslag.length - fout.length} van ${uitslag.length} binnen ${grens} %`);
  process.exit(fout.length ? 1 : 0);
}
