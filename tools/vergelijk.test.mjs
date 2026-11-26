import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { verschil } from "./vergelijk.mjs";

const vlak = (w, h, kleur) => sharp({ create: { width: w, height: h, channels: 4, background: kleur } }).png().toBuffer();
const wit = { r: 255, g: 255, b: 255, alpha: 1 };

test("gelijke beelden: 0 %", async () => {
  const a = await vlak(100, 200, wit);
  assert.equal((await verschil(a, a)).procent, 0);
});

test("ruis onder de drempel telt niet, een echt kleurverschil wel", async () => {
  const a = await vlak(100, 100, wit);
  assert.equal((await verschil(a, await vlak(100, 100, { r: 245, g: 250, b: 255, alpha: 1 }))).procent, 0);
  assert.equal((await verschil(a, await vlak(100, 100, { r: 200, g: 255, b: 255, alpha: 1 }))).procent, 100);
});

test("een langere pagina: het stuk dat de ander mist telt volledig mee", async () => {
  const r = await verschil(await vlak(100, 100, wit), await vlak(100, 125, wit));
  assert.equal(r.procent, 20);
  assert.deepEqual([r.hoogteA, r.hoogteB, r.hoogte], [100, 125, 125]);
});

test("wat afgedekt is (een film, een klok) telt niet mee", async () => {
  const a = await vlak(100, 100, wit);
  const b = await sharp(a).composite([{ input: await vlak(50, 50, { r: 0, g: 0, b: 0, alpha: 1 }), left: 0, top: 0 }]).png().toBuffer();
  assert.equal((await verschil(a, b)).procent, 25);
  assert.equal((await verschil(a, b, { a: [{ x: 0, y: 0, width: 50, height: 50 }], b: [] })).procent, 0);
});
