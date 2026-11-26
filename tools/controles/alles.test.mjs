import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { controleer } from "./alles.mjs";

function repo(bestanden) {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "ayr-controle-"));
  for (const [rel, inhoud] of Object.entries(bestanden)) {
    fs.mkdirSync(path.dirname(path.join(w, rel)), { recursive: true });
    fs.writeFileSync(path.join(w, rel), inhoud);
  }
  return w;
}
const van = (uitslag, naam) => uitslag.find((u) => u.naam === naam);

test("een schone repo: alles goed of overgeslagen", () => {
  const u = controleer(repo({ "README.md": "hallo", "content/seed/paginas.json": JSON.stringify({ kop: { nl: "Zes fronten", en: "Six fronts" }, mail: "info@ayr.amsterdam" }) }));
  for (const c of u) assert.deepEqual(c.fouten, [], c.naam);
});

test("een beeld in git en een te groot bestand", () => {
  const u = controleer(repo({ "assets/beelden/hero.jpg": "x", "docs/groot.pdf": Buffer.alloc(1_100_000), "referentie/_site/_astro/figtree.woff2": Buffer.alloc(1_200_000) }));
  assert.equal(van(u, "git").fouten.length, 2);
});

test("een sleutel in een bestand", () => {
  const nep = ["vercel", "blob", "rw", "abcdefghijklmnopqrstuvwx"].join("_");
  assert.match(van(controleer(repo({ "apps/web/config.ts": `const t = "${nep}"` })), "geheimen").fouten[0], /Blob-token/);
});

test("een echt mailadres of een IBAN in een seed", () => {
  const u = controleer(repo({ "content/seed/orders.json": JSON.stringify({ email: ["jan", "gmail.com"].join("@"), ok: "klant@example.com", iban: "NL91 ABNA 0417 1643 00" }) }));
  assert.equal(van(u, "privacy").fouten.length, 2);
  assert.ok(!van(u, "privacy").fouten.join(" ").includes("jan@"), "het adres zelf staat niet in de melding");
});

test("een verboden woord en een leeg EN-veld in de inhoud", () => {
  const u = controleer(repo({ "content/seed/p.json": JSON.stringify({ a: { nl: "Massief eiken, 10 jaar garantie", en: "" }, b: { nl: "De aircover™", en: "The aircover" } }) }));
  assert.equal(van(u, "tekstregels").fouten.length, 3);
  assert.equal(van(u, "vertaling").fouten.length, 1);
});
