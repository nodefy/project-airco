import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { blobPad, herschrijf, idVan, sha1Van, voerUit } from "./zet_beelden_op_blob.mjs";

const BASIS = "https://voorbeeld.public.blob.vercel-storage.com";

/** Een nagebootste Blob: onthoudt wat er staat en weigert overschrijven, zoals de echte met addRandomSuffix: false. */
function nepBlob() {
  const staat = new Map();
  return {
    staat,
    async put(pad, stroom, opties) {
      assert.equal(opties.access, "public");
      assert.equal(opties.addRandomSuffix, false);
      if (staat.has(pad)) throw new Error("This blob already exists");
      let size = 0;
      for await (const deel of stroom) size += deel.length;
      staat.set(pad, { size, type: opties.contentType });
      return { url: `${BASIS}/${pad}` };
    },
    async head(pad) {
      return { url: `${BASIS}/${pad}`, size: staat.get(pad).size };
    },
  };
}

function proefRepo() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "ayr-blob-"));
  const schrijf = (rel, inhoud) => {
    fs.mkdirSync(path.dirname(path.join(w, rel)), { recursive: true });
    fs.writeFileSync(path.join(w, rel), inhoud);
  };
  schrijf("referentie/_site/img/beeldlijn/dag_middag.jpg", "middag");
  schrijf("referentie/_site/img/logos/ideal.svg", "<svg/>");
  schrijf("assets/beelden/public/images/home/hero.jpg", "hero");
  schrijf("assets/downloads/AYR_Montagehandleiding_v5_NL.pdf", "pdf");
  schrijf(
    "referentie/site-versie-tom/index.html",
    `<img src="../_site/img/logos/ideal.svg?v=toya34"><script>var MAP='../_site/img/beeldlijn/';</script>`,
  );
  schrijf("referentie/site-versie-tom/en/index.html", `<img src="../../_site/img/logos/ideal.svg">`);
  schrijf("referentie/_site/_astro/index.css", `.a{background:url(../img/logos/ideal.svg)}.b{src:url(figtree.woff2)}`);
  const bestanden = [
    "referentie/_site/img/beeldlijn/dag_middag.jpg",
    "referentie/_site/img/logos/ideal.svg",
    "assets/beelden/public/images/home/hero.jpg",
    "assets/downloads/AYR_Montagehandleiding_v5_NL.pdf",
  ].map((pad) => ({ pad, bytes: 1, sha1: null, bron: "x" }));
  schrijf("assets/manifest.json", JSON.stringify({ gemaakt: "2026-11-25T12:00:00", blob_prefix: "site/", bestanden }));
  return w;
}
const lees = (w, rel) => fs.readFileSync(path.join(w, rel), "utf8");
const manifest = (w) => JSON.parse(lees(w, "assets/manifest.json"));
const stil = { log() {} };

test("namen: de site-set krijgt een hash, de referentie houdt zijn pad", () => {
  assert.equal(blobPad("assets/beelden/public/images/home/hero.jpg", "abcdef0123456789"), "site/beelden/public/images/home/hero.abcdef0123.jpg");
  assert.equal(blobPad("referentie/_site/img/beeldlijn/dag.jpg", "abcdef0123456789"), "site/referentie/v1/img/beeldlijn/dag.jpg");
  assert.equal(blobPad("referentie/_site/img/a.png", "x".repeat(40), { versie: "v2" }), "site/referentie/v2/img/a.png");
  assert.equal(idVan("referentie/_site/img/logos/ideal.svg"), "ref/logos/ideal.svg");
  assert.equal(idVan("assets/beelden/public/images/home/hero.jpg"), "set/public/images/home/hero.jpg");
});

test("herschrijven: elke diepte, samengestelde paden in scripts, de versie-parameter blijft staan", () => {
  const [uit, n] = herschrijf(`a="../_site/img/x.jpg?v=1" b='../../_site/img/y/' MAP='../_site/img/beeldlijn/'`, BASIS + "/site/referentie/v1/img");
  assert.equal(n, 3);
  assert.ok(!uit.includes("_site/img"));
  assert.ok(uit.includes(`${BASIS}/site/referentie/v1/img/x.jpg?v=1`));
  assert.ok(uit.includes(`MAP='${BASIS}/site/referentie/v1/img/beeldlijn/'`));
});

test("een proefrun raakt niets aan", async () => {
  const w = proefRepo();
  const voor = lees(w, "assets/manifest.json");
  const r = await voerUit({ wortel: w, proef: true, basis: BASIS }, stil);
  assert.equal(r.telling.nieuw, 4);
  assert.equal(r.herschreven.verwijzingen, 4);
  assert.equal(lees(w, "assets/manifest.json"), voor);
  assert.ok(lees(w, "referentie/site-versie-tom/index.html").includes("../_site/img/"));
});

test("uploaden: manifest gevuld, referentie herschreven, en een tweede keer doet niets", async () => {
  const w = proefRepo();
  const blob = nepBlob();
  const r = await voerUit({ wortel: w, token: "nep" }, { blob, maten: async () => ({ width: 10, height: 20 }), ...stil });
  assert.equal(r.telling.nieuw, 4);
  assert.equal(blob.staat.size, 4);
  const m = manifest(w);
  const hero = m.bestanden.find((b) => b.id === "set/public/images/home/hero.jpg");
  assert.equal(hero.sha1, sha1Van(path.join(w, hero.pad)));
  assert.match(hero.url, /site\/beelden\/public\/images\/home\/hero\.[0-9a-f]{10}\.jpg$/);
  assert.deepEqual([hero.breedte, hero.hoogte], [10, 20]);
  assert.equal(m.bestanden.find((b) => b.pad.endsWith(".pdf")).type, "application/pdf");
  assert.equal(m.referentie_basis, `${BASIS}/site/referentie/v1/img/`);
  for (const p of ["referentie/site-versie-tom/index.html", "referentie/site-versie-tom/en/index.html", "referentie/_site/_astro/index.css"]) {
    assert.ok(!/(\.\.\/)+(_site\/)?img\//.test(lees(w, p)), p);
  }
  assert.ok(lees(w, "referentie/_site/_astro/index.css").includes("url(figtree.woff2)"), "letters blijven lokaal");
  assert.ok(lees(w, "referentie/site-versie-tom/index.html").includes(`${BASIS}/site/referentie/v1/img/logos/ideal.svg?v=toya34`));

  const tweede = await voerUit({ wortel: w, token: "nep" }, { blob, ...stil });
  assert.equal(tweede.telling.nieuw, 0);
  assert.equal(tweede.telling.overgeslagen, 4);
  assert.equal(blob.staat.size, 4);
});

test("een nieuw beeld in de site-set krijgt een nieuwe naam; het oude blijft staan", async () => {
  const w = proefRepo();
  const blob = nepBlob();
  await voerUit({ wortel: w, token: "nep" }, { blob, ...stil });
  fs.writeFileSync(path.join(w, "assets/beelden/public/images/home/hero.jpg"), "een nieuwe hero");
  const r = await voerUit({ wortel: w, token: "nep" }, { blob, ...stil });
  assert.equal(r.telling.nieuw, 1);
  assert.equal([...blob.staat.keys()].filter((k) => k.includes("home/hero.")).length, 2);
});

test("een veranderd referentiebestand wordt niet overschreven", async () => {
  const w = proefRepo();
  const blob = nepBlob();
  await voerUit({ wortel: w, token: "nep" }, { blob, ...stil });
  fs.writeFileSync(path.join(w, "referentie/_site/img/logos/ideal.svg"), "<svg>anders</svg>");
  await assert.rejects(voerUit({ wortel: w, token: "nep" }, { blob, ...stil }), /--referentie-versie/);
  // ook als het manifest opnieuw gemaakt is (de migratie draaide nog eens) en dus niets meer weet
  const m = manifest(w);
  for (const b of m.bestanden) for (const k of ["url", "blob_pad", "id", "type"]) delete b[k];
  fs.writeFileSync(path.join(w, "assets/manifest.json"), JSON.stringify(m));
  await assert.rejects(voerUit({ wortel: w, token: "nep" }, { blob, ...stil }), /--referentie-versie/);
  // met een nieuwe versie lukt het, onder een nieuw pad
  const r = await voerUit({ wortel: w, token: "nep", versie: "v2" }, { blob, ...stil });
  assert.equal(r.refBasis, `${BASIS}/site/referentie/v2/img/`);
  assert.ok(blob.staat.has("site/referentie/v1/img/logos/ideal.svg") && blob.staat.has("site/referentie/v2/img/logos/ideal.svg"));
  assert.ok(lees(w, "referentie/site-versie-tom/index.html").includes("/referentie/v2/img/logos/ideal.svg"));
});

test("een bestand dat lokaal ontbreekt wordt gemeld, niet stil overgeslagen", async () => {
  const w = proefRepo();
  fs.rmSync(path.join(w, "assets/downloads/AYR_Montagehandleiding_v5_NL.pdf"));
  const r = await voerUit({ wortel: w, token: "nep" }, { blob: nepBlob(), ...stil });
  assert.deepEqual(r.telling.ontbreekt, ["assets/downloads/AYR_Montagehandleiding_v5_NL.pdf"]);
});
