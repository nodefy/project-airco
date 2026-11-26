#!/usr/bin/env node
/*
  De controles die bij elke pull request draaien (superprompt §5), voor zover ze zonder de site zelf kunnen.
    node tools/controles/alles.mjs            in de repo
    node tools/controles/alles.mjs <map>      een andere map nalopen (voor de test)

  1. git        geen beelden of films in git; niets boven 1 MB behalve letters
  2. geheimen   geen sleutel, token of privésleutel in een bestand dat in git staat (naast gitleaks in CI)
  3. privacy    in seeds, fixtures en tests alleen verzonnen adressen (@example.com) en geen IBAN
  4. tekstregels geen verboden woord in de inhoud (tools/controles/tekstregels.json)
  5. vertaling  geen leeg EN-veld waar NL gevuld is
  6. referentie de verbodencontrole van de generator op de referentiepagina's (interne tekst, open besluiten)

  Een controle waarvan de map nog niet bestaat (bv. content/seed vóór fase 1) wordt overgeslagen en zo gemeld.
  Lighthouse, axe, de schermafbeeldingen en de volledigheid van de tekst hebben een draaiende site nodig; die
  staan in tools/vergelijk.mjs en tools/tekstknopen.mjs en komen er in fase 1 en 2 bij.
*/
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const LETTERS = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const BEELDMAPPEN = ["assets/beelden/", "assets/downloads/", "referentie/_site/img/"];
const TEKST = new Set([".json", ".md", ".mjs", ".js", ".ts", ".tsx", ".astro", ".html", ".css", ".yml", ".yaml", ".py", ".txt", ".csv", ".env", ""]);
const GEHEIM = [
  [/vercel_blob_rw_[A-Za-z0-9_]{20,}/, "Vercel Blob-token"],
  [/\b(live|test)_[A-Za-z0-9]{30,}\b/, "Mollie-sleutel"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "privésleutel"],
  [/\bre_[A-Za-z0-9_]{20,}\b/, "Resend-sleutel"],
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/, "betaalsleutel"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub-token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS-sleutel"],
];
// adressen van het bedrijf zelf mogen in de inhoud staan; alles van een persoon niet
const EIGEN_DOMEIN = /@(example\.(com|org|nl)|ayr\.amsterdam)$/i;
const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}[ ]?[A-Z]{4}[ ]?(?:\d{4}[ ]?){2}\d{2}\b/g;

function inGit(wortel) {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: wortel, encoding: "utf8", maxBuffer: 64 << 20 }).split("\0").filter(Boolean);
  } catch {
    return null; // geen git-map (de test): dan alle bestanden
  }
}
function alle(map, basis = map) {
  if (!fs.existsSync(map)) return [];
  const uit = [];
  for (const e of fs.readdirSync(map, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(map, e.name);
    if (e.isDirectory()) uit.push(...alle(p, basis));
    else uit.push(path.relative(basis, p).split(path.sep).join("/"));
  }
  return uit;
}

export function controleer(wortel = ".") {
  const bestanden = inGit(wortel) ?? alle(wortel);
  const uitslag = [];
  const meld = (naam, fouten, overgeslagen) => uitslag.push({ naam, fouten, overgeslagen });
  const lees = (rel) => fs.readFileSync(path.join(wortel, rel), "utf8");
  const bestaat = (rel) => fs.existsSync(path.join(wortel, rel));

  // 1. git
  const git = [];
  for (const f of bestanden) {
    if (!bestaat(f)) continue;
    if (BEELDMAPPEN.some((m) => f.startsWith(m))) git.push(`${f}: hoort op Blob, niet in git`);
    else if (fs.statSync(path.join(wortel, f)).size > 1_000_000 && !LETTERS.has(path.extname(f).toLowerCase())) git.push(`${f}: groter dan 1 MB`);
  }
  meld("git", git);

  // 2. geheimen
  const geheimen = [];
  for (const f of bestanden) {
    if (!bestaat(f) || !TEKST.has(path.extname(f).toLowerCase()) || fs.statSync(path.join(wortel, f)).size > 3_000_000) continue;
    if (f.startsWith("tools/controles/")) continue; // de patronen zelf
    const t = lees(f);
    for (const [re, wat] of GEHEIM) if (re.test(t)) geheimen.push(`${f}: lijkt op een ${wat}`);
  }
  meld("geheimen", geheimen);

  // 3. privacy
  const proef = bestanden.filter((f) => f.startsWith("content/seed/") || /(^|\/)(fixtures?|testdata|__fixtures__)\//.test(f) || /\.test\.[a-z]+$/.test(f));
  const privacy = [];
  for (const f of proef) {
    if (!bestaat(f) || f.startsWith("tools/controles/")) continue;
    const t = lees(f);
    for (const m of new Set(t.match(MAIL) ?? [])) if (!EIGEN_DOMEIN.test(m)) privacy.push(`${f}: mailadres ${m.replace(/^[^@]+/, "…")} (gebruik @example.com)`);
    if (IBAN.test(t)) privacy.push(`${f}: een IBAN`);
    IBAN.lastIndex = 0;
  }
  meld("privacy", privacy, proef.length ? undefined : "nog geen seeds, fixtures of tests");

  // 4 en 5. tekstregels en vertaling, op de inhoud
  const seed = bestanden.filter((f) => f.startsWith("content/seed/") && f.endsWith(".json"));
  if (!seed.length) {
    meld("tekstregels", [], "content/seed bestaat nog niet (fase 1)");
    meld("vertaling", [], "content/seed bestaat nog niet (fase 1)");
  } else {
    const regels = JSON.parse(fs.readFileSync(path.join(hier, "tekstregels.json"), "utf8")).regels.map((r) => ({ re: new RegExp(r.patroon, "i"), waarom: r.waarom }));
    const tekst = [], vertaling = [];
    for (const f of seed) {
      const loop = (w, pad) => {
        if (typeof w === "string") {
          for (const r of regels) if (r.re.test(w)) tekst.push(`${f} ${pad}: "${w.match(r.re)[0]}" (${r.waarom})`);
        } else if (Array.isArray(w)) w.forEach((x, i) => loop(x, `${pad}[${i}]`));
        else if (w && typeof w === "object") {
          if (typeof w.nl === "string" && w.nl.trim() && !(typeof w.en === "string" && w.en.trim())) vertaling.push(`${f} ${pad}: EN ontbreekt`);
          for (const [k, v] of Object.entries(w)) loop(v, pad ? `${pad}.${k}` : k);
        }
      };
      loop(JSON.parse(lees(f)), "");
    }
    meld("tekstregels", tekst);
    meld("vertaling", vertaling);
  }

  // 6. de verbodencontrole van de generator op de referentie
  const script = "tools/generator-tom/site_tom_neutraal.py";
  if (bestaat(script) && bestaat("referentie/site-versie-tom")) {
    const r = spawnSync("python3", [script, "controleer", "referentie/site-versie-tom"], { cwd: wortel, encoding: "utf8" });
    meld("referentie", r.status === 0 ? [] : (r.stdout + r.stderr).trim().split("\n").slice(-25));
  } else meld("referentie", [], "de generator of de referentie staat er nog niet (draai eerst de migratie)");

  return uitslag;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const uitslag = controleer(process.argv[2] ?? ".");
  let fout = 0;
  for (const u of uitslag) {
    const stand = u.overgeslagen ? "overgeslagen" : u.fouten.length ? `${u.fouten.length} fout${u.fouten.length === 1 ? "" : "en"}` : "goed";
    console.log(`${u.naam.padEnd(12)} ${stand}${u.overgeslagen ? ` (${u.overgeslagen})` : ""}`);
    for (const f of u.fouten.slice(0, 30)) console.log(`   ${f}`);
    if (u.fouten.length > 30) console.log(`   … en nog ${u.fouten.length - 30}`);
    fout += u.fouten.length;
  }
  process.exit(fout ? 1 : 0);
}
