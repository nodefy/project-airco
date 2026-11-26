#!/usr/bin/env node
/*
  Fase 0 is klaar als de referentie geen kapot beeld toont: elke img, video en source geeft 200.

    node tools/controleer_referentie.mjs                 serveert referentie/ zelf en loopt elke pagina na
    node tools/controleer_referentie.mjs --json          schrijft ook .controle/referentie.json

  Per pagina (NL, en/ en mails/) opent het script de pagina in Chromium en verzamelt:
  - src en srcset van img en source, src en poster van video, en het href van <link rel=preload as=image>;
  - achtergrondbeelden uit de stijl (url(...) in de berekende background-image);
  - alles wat de pagina zelf nog ophaalt terwijl hij laadt en tot onderaan scrolt (beelden die een script kiest).
  Elk adres wordt daarna één keer opgevraagd. Alles wat geen 200 geeft, komt in de lijst en het script eindigt met 1.

  Zet PLAYWRIGHT_CHROMIUM_PATH als de meegeleverde browser een andere versie is dan die van het playwright-pakket.
*/
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { serveer } from "./serveer.mjs";

const MAP = "referentie";
const PAGINAS = "site-versie-tom";
const OVERZICHT = new Set(["00_opzet.html", "mails.html"]); // overzichten voor Tom, geen pagina's van de site

function htmlBestanden(map, basis = map) {
  const uit = [];
  for (const e of fs.readdirSync(map, { withFileTypes: true })) {
    const p = path.join(map, e.name);
    if (e.isDirectory()) uit.push(...htmlBestanden(p, basis));
    else if (e.name.endsWith(".html") && !OVERZICHT.has(e.name)) uit.push(path.relative(basis, p).split(path.sep).join("/"));
  }
  return uit.sort();
}

const { server, adres } = await serveer(MAP, 0);
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const status = new Map(); // adres → status
const waar = new Map(); // adres → eerste pagina waar hij voorkomt
const fouten = [];
const paginas = htmlBestanden(path.join(MAP, PAGINAS));

for (const rel of paginas) {
  const pagina = await context.newPage();
  const gezien = new Set();
  pagina.on("response", (r) => {
    const t = r.request().resourceType();
    if (t === "image" || t === "media") {
      gezien.add(r.url());
      if (!status.has(r.url())) status.set(r.url(), r.status());
    }
  });
  pagina.on("requestfailed", (r) => {
    const t = r.resourceType();
    if ((t === "image" || t === "media") && !status.has(r.url())) status.set(r.url(), 0);
    gezien.add(r.url());
  });
  await pagina.goto(`${adres}/${PAGINAS}/${rel}`, { waitUntil: "load" });
  // tot onderaan, zodat lazy beelden en wat scripts kiezen ook geladen worden
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo(0, 0);
  });
  await pagina.waitForLoadState("networkidle").catch(() => {});
  const uitDom = await pagina.evaluate(() => {
    const uit = new Set();
    const abs = (u) => {
      try {
        return new URL(u, document.baseURI).href;
      } catch {
        return null;
      }
    };
    const voeg = (u) => u && !u.startsWith("data:") && uit.add(abs(u));
    for (const el of document.querySelectorAll("img, source, video")) {
      voeg(el.getAttribute("src"));
      voeg(el.getAttribute("poster"));
      for (const deel of (el.getAttribute("srcset") ?? "").split(",")) voeg(deel.trim().split(/\s+/)[0]);
    }
    for (const el of document.querySelectorAll('link[rel="preload"][as="image"]')) voeg(el.getAttribute("href"));
    for (const el of document.querySelectorAll("*")) {
      const bg = getComputedStyle(el).backgroundImage;
      for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) voeg(m[1]);
    }
    return [...uit].filter(Boolean);
  });
  for (const u of [...uitDom, ...gezien]) if (!waar.has(u)) waar.set(u, rel);
  await pagina.close();
}

// alles wat in de DOM staat maar niet geladen is (bv. een andere srcset-breedte): één keer opvragen
const open = [...waar.keys()].filter((u) => !status.has(u));
let i = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (i < open.length) {
      const u = open[i++];
      try {
        const r = await context.request.get(u, { timeout: 30_000 });
        status.set(u, r.status());
      } catch {
        status.set(u, 0);
      }
    }
  }),
);
await browser.close();
server.close();

for (const [u, s] of status) if (s !== 200 && s !== 206 && s !== 304) fouten.push({ status: s, adres: u.replace(adres, ""), pagina: waar.get(u) });
fouten.sort((a, b) => a.adres.localeCompare(b.adres));
console.log(`${paginas.length} pagina's, ${status.size} beelden en films, ${fouten.length} kapot`);
for (const f of fouten.slice(0, 60)) console.log(`  ${String(f.status).padStart(3)}  ${f.adres}   (${f.pagina})`);
if (fouten.length > 60) console.log(`  … en nog ${fouten.length - 60}`);
if (process.argv.includes("--json")) {
  fs.mkdirSync(".controle", { recursive: true });
  fs.writeFileSync(".controle/referentie.json", JSON.stringify({ paginas: paginas.length, beelden: status.size, fouten }, null, 1));
}
process.exit(fouten.length ? 1 : 0);
