# content-schema

De typen van de site, afgeleid uit het contentmodel (`content_schema.json`). Het JSON Schema is het contract tussen
het CRM en de site; dit pakket maakt er zod-schema's en TypeScript-typen van en bewijst dat beide hetzelfde oordelen.

## Gebruiken

```sh
pnpm --filter @ayr/content-schema genereer     # schrijft src/schema.gen.ts
pnpm --filter @ayr/content-schema test
node packages/content-schema/genereer.mjs --controleer   # horen de typen nog bij het schema?
```

Het schema wordt gezocht in `packages/content-schema/content_schema.json` en daarna in
`docs/migratie/content_schema.json`. Een andere plek: `--schema <pad>` of `CONTENT_SCHEMA=<pad>`.
Bij `pnpm install` worden de typen vanzelf gemaakt als het schema er staat.

```ts
import { Pagina, Inhoud } from "@ayr/content-schema";

const pagina = Pagina.parse(antwoord);          // gooit een fout als het antwoord niet klopt
function kop(p: Pagina) { /* het type heet net zo */ }
```

Per definitie in `$defs` is er een type en een zod-schema met dezelfde naam; het geheel heet `Inhoud`.
`src/schema.gen.ts` staat niet in git: het is uitvoer. Wijzig het schema, niet dit bestand.

## Wat de omzetting doet

| In het schema | In zod |
|---|---|
| object zonder `additionalProperties` | `z.looseObject`: onbekende velden mogen en blijven staan |
| `additionalProperties: false` | `z.strictObject` |
| `additionalProperties: <schema>` | `z.record`, of `.catchall` als er ook vaste velden zijn |
| niet in `required` | `.optional()`; `null` is geen leeg veld, het schema kent geen `null` |
| `default` | een aantekening, zoals in JSON Schema: zod vult niets in |
| `$ref` | de naam van de definitie (elke definitie is lazy, dus een model mag naar zichzelf wijzen) |
| `format` | `src/formaten.ts` |

Een sleutelwoord dat de omzetter niet kent (`oneOf`, een lijst van typen, `if`), breekt het genereren af met de
plek erbij. Zo kan het schema niet groeien zonder dat de typen meegroeien.

## Wat de test bewijst

`test/overeenkomst.test.mjs` maakt bij elke definitie voorbeelden (alleen het verplichte, alles, om en om) en
verandert daar telkens één ding aan: een veld weg, een verkeerd type, net buiten een grens, een onbekend veld erbij.
Elk geval gaat langs Ajv (JSON Schema 2020-12, strikt) en langs zod. De test slaagt als ze over elk geval hetzelfde
zeggen, en als de gegenereerde bron door de TypeScript-controle komt.

- Op het proefschema (`test/proefschema.json`, verzonnen, met elk sleutelwoord): ruim 4.000 gevallen.
- Op het contentmodel v1.1 van 26-11-2026: 45 definities, 50.768 gevallen, 0 verschillen.
- Een derde test maakt de omzetter op zestien punten kapot en eist dat de vergelijking dat merkt.

Zonder `content_schema.json` wordt de test op het contentmodel overgeslagen; dat staat dan in de uitvoer.

## Waar zod strenger is dan het schema

Zod laat nooit iets toe dat het schema afkeurt. Andersom is er een korte lijst, vastgelegd in
`test/formaten.test.mjs`:

| Formaat | Het schema neemt aan, zod niet |
|---|---|
| `date-time` | een spatie of kleine `t` tussen datum en tijd, een tijdzone zonder dubbele punt (`+0100`), een schrikkelseconde (`23:59:60`) |
| `uri` | een schema zonder adres (`https://`) |
| `email` | een domein dat op één letter eindigt (`naam@example.c`) |
| `integer` | een geheel getal buiten ±2^53 |

Het CRM hoort datums te sturen als `2027-01-14T12:00:00+01:00` of met `Z`.

## Onbekende velden

Het contentmodel laat bijna overal extra velden toe; alleen `Tekst` is dicht. Een tikfout in de naam van een veld
dat niet verplicht is, komt dus door het schema en door zod. `onbekend.mjs` vindt die velden:

```js
import { onbekendeVelden } from "@ayr/content-schema/onbekend";
onbekendeVelden(schema, inhoud);            // [{ pad: "paginas[3].blokken[1].kopp", veld: "kopp" }]
onbekendeVelden(schema, pagina, "Pagina");
```

De controle van de seed (fase 1) gebruikt dit als waarschuwing naast de controle tegen het schema.
