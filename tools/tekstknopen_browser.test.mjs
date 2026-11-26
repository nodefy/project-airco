import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { meet } from "./tekstknopen_browser.mjs";

const PAGINA = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Proefpagina</title>
<style>.uit{display:none}.onzichtbaar{visibility:hidden}.smal{display:none}@media (max-width:600px){.smal{display:block}.breed{display:none}}</style></head>
<body>
<h1>Zichtbare kop</h1>
<p class="uit">Variant die uit staat</p>
<p class="onzichtbaar">Tekst met visibility hidden</p>
<p class="smal">Alleen op de telefoon</p>
<p class="breed">Alleen op de computer</p>
<details><summary>Een vraag</summary><p>Het antwoord in een dichte vraag</p></details>
<button aria-label="Sluit het menu" class="uit">×</button>
<img alt="Een kast in eiken" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<div id="mand"></div>
<script>document.getElementById("mand").textContent = "Je winkelwagen is leeg"; document.title = "Proefpagina (0)";</script>
</body></html>`;

test("de browsertelling vindt tekst uit een script en tekst die nergens zichtbaar is", async () => {
  const wortel = fs.mkdtempSync(path.join(os.tmpdir(), "tekstknopen-"));
  fs.mkdirSync(path.join(wortel, "paginas"));
  fs.writeFileSync(path.join(wortel, "paginas/proef.html"), PAGINA);
  let uitslag;
  try {
    uitslag = await meet(path.join(wortel, "paginas"));
  } catch (fout) {
    if (/Executable doesn't exist|browserType.launch/.test(String(fout))) assert.fail("Chromium ontbreekt: draai `pnpm exec playwright install chromium` of zet PLAYWRIGHT_CHROMIUM_PATH.\n" + fout.message);
    throw fout;
  } finally {
    fs.rmSync(wortel, { recursive: true, force: true });
  }
  const u = uitslag["proef.html"];
  const teksten = (lijst) => lijst.map((k) => k.tekst).sort();
  assert.deepEqual(teksten(u.alleenBrowser), ["Je winkelwagen is leeg", "Proefpagina (0)"], "wat het script neerzet");
  assert.deepEqual(teksten(u.nooitZichtbaar), ["Het antwoord in een dichte vraag", "Sluit het menu", "Tekst met visibility hidden", "Variant die uit staat"], "in het bestand, bij het laden nergens te zien");
  assert.equal(u.alleenSmal, 1, "alleen op 390 px");
  assert.equal(u.alleenBreed, 1, "alleen op 1440 px");
  // bestand: titel, kop, 4 alinea's, de vraag en het antwoord, aria-label, alt (de × heeft geen letter)
  assert.equal(u.bestand, 10);
});
