#!/usr/bin/env node
/*
  De maatstaf van fase 1: elke zichtbare tekst van elke referentiepagina staat in de inhoud.

    node tools/tekstknopen.mjs referentie/site-versie-tom                 telt per pagina en schrijft .controle/tekstknopen.json
    node tools/tekstknopen.mjs referentie/site-versie-tom content/seed    vergelijkt met de seed: welke teksten ontbreken

  Een tekstknoop is hier:
  - tekst tussen tags in <body>, buiten <script>, <style>, <noscript>, <template> en <svg>;
  - de klantteksten in attributen: alt, title, aria-label, placeholder, de value van een knop, en de bijschriften
    in data-kort, data-naam en data-alt(-eiken/-noten);
  - <title> en de meta's description, og:title en og:description.
  Witruimte wordt samengevoegd. Losse leestekens en getallen zonder letters tellen niet mee.

  Wat deze telling NIET ziet: tekst die een script pas in de browser neerzet (de winkelwagen, de uitslag van de
  pascheck, meldingen in de kassa), en of een element door de stijl verborgen is (de ontwerpvarianten op de home).
  Daarvoor komt in fase 1 een tweede telling op de pagina zoals de browser hem toont.

  De vergelijking zoekt elke tekst in alle tekstwaarden van de seed (JSON, elke diepte). Een tekst telt als gedekt
  als hij letterlijk voorkomt, als geheel of als deel van een veld (een alinea met een link erin is in de pagina
  meer dan één knoop, maar in de inhoud één veld).
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const OVERSLAAN = new Set(["script", "style", "noscript", "template", "svg"]);
// ook de bijschriften die een script uit een data-attribuut leest (de vergroting op Inspiratie, de duimen)
const ATTRIBUTEN = ["alt", "title", "aria-label", "placeholder", "data-kort", "data-naam", "data-alt", "data-alt-eiken", "data-alt-noten"];
const META = ["description", "og:title", "og:description", "twitter:title", "twitter:description"];

const schoon = (t) => t.replace(/[ \s]+/g, " ").trim();
const telt = (t) => /\p{L}/u.test(t);

/** Alle tekstknopen van één html-bestand, in de volgorde van de pagina. */
export function tekstknopen(html) {
  const wortel = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const uit = [];
  const voeg = (tekst, waar) => {
    const t = schoon(tekst);
    if (t && telt(t)) uit.push({ tekst: t, waar });
  };
  const titel = wortel.querySelector("title");
  if (titel) voeg(titel.text, "title");
  for (const m of wortel.querySelectorAll("meta")) {
    const naam = m.getAttribute("name") ?? m.getAttribute("property");
    if (naam && META.includes(naam)) voeg(m.getAttribute("content") ?? "", `meta:${naam}`);
  }
  const loop = (knoop) => {
    for (const kind of knoop.childNodes) {
      if (kind.nodeType === 3) voeg(kind.text, "tekst");
      else if (kind.nodeType === 1) {
        const tag = kind.rawTagName?.toLowerCase();
        if (OVERSLAAN.has(tag)) continue;
        for (const a of ATTRIBUTEN) if (kind.getAttribute(a)) voeg(kind.getAttribute(a), a);
        if (tag === "input" && ["submit", "button"].includes(kind.getAttribute("type") ?? "") && kind.getAttribute("value")) voeg(kind.getAttribute("value"), "value");
        loop(kind);
      }
    }
  };
  const body = wortel.querySelector("body");
  if (body) loop(body);
  return uit;
}

function htmlBestanden(map) {
  const uit = [];
  for (const e of fs.readdirSync(map, { withFileTypes: true })) {
    const p = path.join(map, e.name);
    if (e.isDirectory()) uit.push(...htmlBestanden(p));
    else if (e.name.endsWith(".html")) uit.push(p);
  }
  return uit.sort();
}

/** Alle tekstwaarden uit een map met JSON, elke diepte. */
export function seedTeksten(map) {
  const uit = [];
  const loop = (w) => {
    if (typeof w === "string") uit.push(schoon(w.replace(/<[^>]+>/g, " ")));
    else if (Array.isArray(w)) w.forEach(loop);
    else if (w && typeof w === "object") Object.values(w).forEach(loop);
  };
  const lees = (m) => {
    for (const e of fs.readdirSync(m, { withFileTypes: true })) {
      const p = path.join(m, e.name);
      if (e.isDirectory()) lees(p);
      else if (e.name.endsWith(".json")) loop(JSON.parse(fs.readFileSync(p, "utf8")));
    }
  };
  lees(map);
  return uit;
}

export function tel(map) {
  const paginas = {};
  for (const p of htmlBestanden(map)) paginas[path.relative(map, p)] = tekstknopen(fs.readFileSync(p, "utf8"));
  return paginas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [map = "referentie/site-versie-tom", seed] = process.argv.slice(2);
  const paginas = tel(map);
  const uniek = new Set(Object.values(paginas).flatMap((l) => l.map((k) => k.tekst)));
  let totaal = 0;
  console.log("pagina".padEnd(28), "knopen".padStart(7), "uniek".padStart(7));
  for (const [naam, lijst] of Object.entries(paginas)) {
    totaal += lijst.length;
    console.log(naam.padEnd(28), String(lijst.length).padStart(7), String(new Set(lijst.map((k) => k.tekst)).size).padStart(7));
  }
  console.log("totaal".padEnd(28), String(totaal).padStart(7), String(uniek.size).padStart(7), "(uniek over alle pagina's)");
  fs.mkdirSync(".controle", { recursive: true });
  fs.writeFileSync(".controle/tekstknopen.json", JSON.stringify(paginas, null, 1));

  if (seed) {
    const hooiberg = seedTeksten(seed);
    const heel = new Set(hooiberg);
    const alles = hooiberg.join("\n");
    const mist = {};
    let gedekt = 0;
    for (const [naam, lijst] of Object.entries(paginas)) {
      for (const k of lijst) {
        if (heel.has(k.tekst) || alles.includes(k.tekst)) gedekt++;
        else (mist[naam] ??= []).push(k);
      }
    }
    const pct = totaal ? ((gedekt / totaal) * 100).toFixed(2) : "100.00";
    console.log(`\nIn de seed: ${gedekt} van ${totaal} (${pct} %)`);
    fs.writeFileSync(".controle/tekstknopen_ontbreekt.json", JSON.stringify(mist, null, 1));
    for (const [naam, lijst] of Object.entries(mist)) {
      console.log(`\n${naam}: ${lijst.length} ontbreken`);
      for (const k of lijst.slice(0, 8)) console.log(`  [${k.waar}] ${k.tekst.slice(0, 110)}`);
    }
    if (gedekt !== totaal) process.exit(1);
  }
}
