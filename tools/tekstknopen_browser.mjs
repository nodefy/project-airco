#!/usr/bin/env node
/*
  De tweede telling van fase 1: de tekst zoals de browser hem toont.

  tools/tekstknopen.mjs leest de html-bestanden. Dat mist twee dingen, en die meet dit script:
  1. tekst die een script pas in de browser neerzet (staat niet in het bestand, moet wel in de inhoud);
  2. tekst die in het bestand staat maar bij het laden nergens zichtbaar is (een dicht menu, een dichtgeklapte
     vraag, een venster, een variant van het ontwerp die uit staat). Die lijst is om na te lopen: een dichtgeklapte
     vraag is gewoon klanttekst, een variant die uit staat misschien niet.

    node tools/tekstknopen_browser.mjs referentie/site-versie-tom                 meet en schrijft .controle/tekstknopen_browser.json
    node tools/tekstknopen_browser.mjs referentie/site-versie-tom content/seed    eist ook dat de tekst uit 1 in de seed staat

  --wortel <map>     de map die geserveerd wordt (standaard de map boven de pagina's, zodat ../_site/ werkt)
  --alleen a,b       alleen deze bestanden (zonder .html)

  Elke pagina wordt geopend op 1440 en 390 px breed en tot onderaan gescrold. Zichtbaar is wat de browser
  weergeeft (checkVisibility: geen display:none, geen visibility:hidden, niet in een dichte <details>).
  Een tekst telt als zichtbaar als hij dat op minstens één van de twee breedtes is.

  Wat ook dit script niet ziet: tekst die pas na een handeling verschijnt (iets in de winkelwagen leggen, de
  pascheck invullen, een formulier versturen met een fout). Die lijst staat in docs/fase-1/ en wordt met de hand
  nagelopen.

  Zet PLAYWRIGHT_CHROMIUM_PATH als de meegeleverde browser een andere versie is dan die van het playwright-pakket.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveer } from "./serveer.mjs";
import { seedTeksten, tekstknopen } from "./tekstknopen.mjs";

export const BREEDTES = [1440, 390];
const ATTRIBUTEN = ["alt", "title", "aria-label", "placeholder", "data-kort", "data-naam", "data-alt", "data-alt-eiken", "data-alt-noten"];

/** Alle teksten van de geopende pagina: { tekst, waar, zichtbaar }. Dezelfde regels als tekstknopen.mjs. */
export async function tekstenInBrowser(pagina) {
  return pagina.evaluate((ATTRIBUTEN) => {
    const schoon = (t) => t.replace(/[ \s]+/g, " ").trim();
    const telt = (t) => /\p{L}/u.test(t);
    const OVERSLAAN = "script,style,noscript,template,svg";
    const zichtbaar = (el) => el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
    const uit = [];
    const voeg = (tekst, waar, el) => {
      const t = schoon(tekst ?? "");
      if (t && telt(t)) uit.push({ tekst: t, waar, zichtbaar: el ? zichtbaar(el) : true });
    };
    voeg(document.title, "title", null);
    const loper = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let k = loper.nextNode(); k; k = loper.nextNode()) {
      const el = k.parentElement;
      if (el && !el.closest(OVERSLAAN)) voeg(k.nodeValue, "tekst", el);
    }
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest(OVERSLAAN)) continue;
      for (const a of ATTRIBUTEN) if (el.hasAttribute(a)) voeg(el.getAttribute(a), a, el);
      if (el instanceof HTMLInputElement && ["submit", "button"].includes(el.type) && el.value) voeg(el.value, "value", el);
    }
    return uit;
  }, ATTRIBUTEN);
}

/** Opent één adres op één breedte, scrolt tot onderaan en geeft de teksten. */
export async function meetAdres(browser, adres, breedte) {
  const context = await browser.newContext({ viewport: { width: breedte, height: 900 }, reducedMotion: "reduce", locale: "nl-NL" });
  const pagina = await context.newPage();
  try {
    const antwoord = await pagina.goto(adres, { waitUntil: "load", timeout: 60_000 });
    if (!antwoord || antwoord.status() >= 400) throw new Error(`${adres} gaf ${antwoord?.status() ?? "geen antwoord"}`);
    await pagina.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      scrollTo(0, 0);
    });
    await pagina.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    return await tekstenInBrowser(pagina);
  } finally {
    await context.close();
  }
}

/**
  Legt het bestand naast wat de browser toont.
  Geeft { bestand, browser, alleenBrowser, nooitZichtbaar }: aantallen en de twee lijsten.
*/
export function legNaast(html, perBreedte) {
  const inBestand = new Set(tekstknopen(html).map((k) => k.tekst));
  const inBrowser = new Map(); // tekst → { waar, zichtbaar op: [breedtes] }
  for (const [breedte, lijst] of Object.entries(perBreedte)) {
    for (const k of lijst) {
      const r = inBrowser.get(k.tekst) ?? { waar: k.waar, zichtbaarOp: new Set() };
      if (k.zichtbaar) r.zichtbaarOp.add(Number(breedte));
      inBrowser.set(k.tekst, r);
    }
  }
  const alleenBrowser = [...inBrowser].filter(([t]) => !inBestand.has(t)).map(([tekst, r]) => ({ tekst, waar: r.waar, zichtbaar: r.zichtbaarOp.size > 0 }));
  const nooitZichtbaar = [...inBrowser].filter(([t, r]) => inBestand.has(t) && r.zichtbaarOp.size === 0).map(([tekst, r]) => ({ tekst, waar: r.waar }));
  const alleenSmal = [...inBrowser].filter(([, r]) => r.zichtbaarOp.size === 1 && r.zichtbaarOp.has(390)).length;
  const alleenBreed = [...inBrowser].filter(([, r]) => r.zichtbaarOp.size === 1 && r.zichtbaarOp.has(1440)).length;
  return { bestand: inBestand.size, browser: inBrowser.size, zichtbaar: [...inBrowser.values()].filter((r) => r.zichtbaarOp.size).length, alleenSmal, alleenBreed, alleenBrowser, nooitZichtbaar };
}

function htmlBestanden(map, basis = map) {
  const uit = [];
  for (const e of fs.readdirSync(map, { withFileTypes: true })) {
    const p = path.join(map, e.name);
    if (e.isDirectory()) uit.push(...htmlBestanden(p, basis));
    else if (e.name.endsWith(".html")) uit.push(path.relative(basis, p).split(path.sep).join("/"));
  }
  return uit.sort();
}

export async function meet(map, { wortel = path.dirname(path.resolve(map)), alleen, browser } = {}) {
  const { server, adres } = await serveer(wortel, 0);
  const eigen = browser ?? (await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}));
  const onder = path.relative(wortel, path.resolve(map)).split(path.sep).join("/");
  const uit = {};
  try {
    for (const rel of htmlBestanden(map)) {
      if (alleen && !alleen.includes(rel.replace(/\.html$/, ""))) continue;
      const perBreedte = {};
      for (const b of BREEDTES) perBreedte[b] = await meetAdres(eigen, `${adres}/${onder ? onder + "/" : ""}${rel}`, b);
      uit[rel] = legNaast(fs.readFileSync(path.join(map, rel), "utf8"), perBreedte);
    }
  } finally {
    if (!browser) await eigen.close();
    server.close();
  }
  return uit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const waarde = (naam) => (a.includes(naam) ? a[a.indexOf(naam) + 1] : undefined);
  const los = a.filter((x, i) => !x.startsWith("--") && !a[i - 1]?.startsWith("--"));
  const [map = "referentie/site-versie-tom", seed] = los;
  const uitslag = await meet(map, { wortel: waarde("--wortel"), alleen: waarde("--alleen")?.split(",") });
  console.log("pagina".padEnd(26), "bestand".padStart(8), "browser".padStart(8), "zichtbaar".padStart(10), "door script".padStart(12), "nooit zichtb.".padStart(14), "alleen 390".padStart(11), "alleen 1440".padStart(12));
  const som = { bestand: 0, browser: 0, zichtbaar: 0, script: 0, nooit: 0 };
  for (const [naam, u] of Object.entries(uitslag)) {
    console.log(naam.padEnd(26), String(u.bestand).padStart(8), String(u.browser).padStart(8), String(u.zichtbaar).padStart(10), String(u.alleenBrowser.length).padStart(12), String(u.nooitZichtbaar.length).padStart(14), String(u.alleenSmal).padStart(11), String(u.alleenBreed).padStart(12));
    som.bestand += u.bestand; som.browser += u.browser; som.zichtbaar += u.zichtbaar; som.script += u.alleenBrowser.length; som.nooit += u.nooitZichtbaar.length;
  }
  console.log("totaal".padEnd(26), String(som.bestand).padStart(8), String(som.browser).padStart(8), String(som.zichtbaar).padStart(10), String(som.script).padStart(12), String(som.nooit).padStart(14));
  const uniekScript = new Set(Object.values(uitslag).flatMap((u) => u.alleenBrowser.map((k) => k.tekst)));
  const uniekNooit = new Set(Object.values(uitslag).flatMap((u) => u.nooitZichtbaar.map((k) => k.tekst)));
  console.log(`\nUniek over alle pagina's: ${uniekScript.size} teksten die een script neerzet, ${uniekNooit.size} teksten die bij het laden nergens zichtbaar zijn.`);
  fs.mkdirSync(".controle", { recursive: true });
  fs.writeFileSync(".controle/tekstknopen_browser.json", JSON.stringify(uitslag, null, 1));
  console.log("De lijsten staan in .controle/tekstknopen_browser.json");

  if (seed) {
    const alles = seedTeksten(seed).join("\n");
    let mist = 0;
    for (const [naam, u] of Object.entries(uitslag)) {
      const weg = u.alleenBrowser.filter((k) => !alles.includes(k.tekst));
      if (!weg.length) continue;
      mist += weg.length;
      console.log(`\n${naam}: ${weg.length} teksten uit een script ontbreken in de seed`);
      for (const k of weg.slice(0, 8)) console.log(`  [${k.waar}] ${k.tekst.slice(0, 110)}`);
    }
    console.log(`\nIn de seed: ${som.script - mist} van ${som.script} teksten die een script neerzet`);
    if (mist) process.exit(1);
  }
}
