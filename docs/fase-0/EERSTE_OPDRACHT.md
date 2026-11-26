# Eerste opdracht: plan, bloksoorten, het gat met de admin en vragen voor Tom

26 november 2026 · van Ruben, opgesteld met Claude · antwoord op "Eerste opdracht (nu)" uit `03_SUPERPROMPT.md`

Dit stuk is gemaakt vóórdat de repo `AYR-studio/ayr-site` bestaat. Gelezen zijn: 00 t/m 06 van het pakket,
`content_schema.json`, `migreer_naar_repo.py`, `OVERDRACHT_RUBEN.md`, de 23 Nederlandse pagina's van `Site_publiek`
en de code van de site en admin van nu (`nodefy/lijn-website`, `main`). **Niet** gezien: de Engelse pagina's, de
mails, `tools/generator-tom/`, het voorbeeld `09b`, de CRM-repo en de live database.

## In het kort

1. **De planning past niet achter elkaar vóór 14 januari.** Alle fasen samen schat ik op negen tot elf weken werk; er
   zijn er zeven. Voorstel: op 14 januari gaat de nieuwe site live op de inhoud en de koppelingen, met de winkel op
   "alleen aanvragen". De winkel (fase 5b) volgt daarna. Zie §5.
2. **De referentie is gebouwd op de site van nu.** De pagina's dragen het merkteken van dezelfde Astro-bouw en
   laden dezelfde stylesheets. Fase 2 kan dus beginnen bij de bestaande componenten in plaats van bij nul.
3. **Eén afwijking van 01_MIGRATIE, als voorstel:** de beelden van de referentie houden op Blob hun pad, zonder hash
   in de naam. De pagina's stellen paden in JavaScript samen; met een hash breekt de referentie. Zie §1.3.
4. **Het schema mist dertien dingen die de pagina's wel hebben.** Het meest voorkomend: de gedeelde onderdelen op
   elke pagina, genummerde stappen en de pascheck als blok. De leidingkeuze heeft zes opties, het schema noemt er
   drie. Zie §2.
5. **De admin van nu doet zestien dingen die niet in 04 staan,** vooral rond geld en klantgegevens. Het zwaarst:
   de som van een order klopt niet met een naïeve formule, en terugbetalen kent grenzen die 04 niet noemt. Zie §3.
6. **De mails van de site komen mogelijk nu al niet aan.** De site verstuurt via Resend vanaf info@ayr.amsterdam,
   maar voor Resend staan er geen DNS-records op het domein. Zie §4, vraag 4.

## 1. (a) Het plan voor fase 0 en 1

### 1.1 Wat er al klaarstaat (gebouwd en getest, nog zonder de repo)

Deze bestanden staan klaar om over de gemigreerde repo heen te zetten. Ze botsen niet met wat het script neerzet.

| Bestand | Wat | Getest |
|---|---|---|
| `CLAUDE.md` | de regels, letterlijk uit de superprompt (§3 en §7) | – |
| `DECISIONS.md` | Toms besluiten van 25 en 26-11, twee voorstellen, en wat open staat | – |
| `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitignore` | de werkruimte met `apps/*` en `packages/*` | `pnpm install` |
| `tools/zet_beelden_op_blob.mjs` | uploaden naar Blob, het manifest aanvullen, de referentie herschrijven; met `--proef` | 7 tests met een nagebootste Blob; proefrun op de echte referentie |
| `tools/controleer_referentie.mjs` | elke `img`, `video` en `source` geeft 200 (de eis van fase 0) | gedraaid op de 23 pagina's |
| `tools/tekstknopen.mjs` | telt de zichtbare tekst per pagina en vergelijkt met de seed (de eis van fase 1) | gedraaid; vergelijking getest |
| `tools/vergelijk.mjs` | schermafbeeldingen tegen de referentie, 1440 en 390 px, grens 1,5 % (de eis van fase 2) | 4 tests; een pagina tegen zichzelf geeft 0,00 % |
| `tools/controles/alles.mjs` | git, geheimen, privacy, tekstregels, vertaling, de verbodencontrole | 5 tests |
| `tools/serveer.mjs` | een kleine server voor de referentie | via de andere tools |
| `.github/workflows/ci.yml` | de controles bij elke pull request, met gitleaks | nog niet gedraaid in GitHub |

**Niet getest:** een echte upload naar Vercel Blob (er is nog geen token) en de workflow in GitHub Actions.

### 1.2 Wat fase 0 nog vraagt

1. Ruben draait `migreer_naar_repo.py` op zijn Mac (proefrun, dan `--uitvoeren`) en maakt `AYR-studio/ayr-site` aan.
2. De bestanden uit §1.1 erbij; eerste commit; `main` beschermen.
3. Een Vercel-project met een Blob-store; `BLOB_READ_WRITE_TOKEN` in de omgeving.
4. `pnpm beelden:proef`, dan `pnpm beelden` (± 345 MB, 1.319 bestanden).
5. `pnpm controleer:referentie` moet 0 kapotte beelden geven; daarna gaat die stap aan in CI.
6. Een preview per pull request.

### 1.3 Het voorstel over de namen op Blob

01_MIGRATIE (stap 4) vraagt een inhoudshash in elke naam. Dat werkt voor de site-set, maar niet voor de referentie:
- op 22 pagina's staat `MAP='../_site/img/beeldlijn/'`, waar een script de bestandsnaam achter plakt;
- hetzelfde gebeurt met `front/` en `interieurs/`.

Voorstel, zo gebouwd:
- `assets/beelden` en `assets/downloads` → `site/beelden/<pad>.<hash>.<ext>`: een nieuw beeld is een nieuwe naam;
- `referentie/_site/img` → `site/referentie/v1/img/<pad>`: het pad blijft, dus samengestelde paden werken;
- verandert er toch een referentiebeeld, dan weigert het script en komt er een `v2`. Er wordt nooit iets overschreven.

De proefrun herschrijft 1.431 verwijzingen in de 23 pagina's en laat geen lokaal pad over.

### 1.4 Fase 1: het contentmodel en de eerste inhoud

**Mappen en pakketten die erbij komen**

```
packages/content-schema/     content_schema.json, de zod-typen, en een test dat beide hetzelfde goedkeuren
tools/haal_inhoud.mjs        referentie (NL, EN, mails) → content/seed/*.json
content/seed/                paginas/, producten.json, inspiratie.json, teksten.json, navigatie.json, faq.json,
                             juridisch/, mails/, formulieren.json, pascheck.json, instellingen.json
```

**Aanpak**
- **Typen.** De zod-typen worden uit `content_schema.json` gegenereerd en meegecommit. Een test valideert elke seed
  tegen het JSON Schema én tegen zod, zodat de twee niet uit elkaar lopen.
- **Inhoud ophalen.** Per pagina de secties in `<main>` omzetten naar blokken. NL komt uit de pagina, EN uit dezelfde
  plek in `en/`; `vertaling_en.json` is de controle. Beelden verwijzen naar het `id` uit het manifest
  (`ref/…`, `set/…`), nooit naar een url.
- **De maatstaf.** In de 23 Nederlandse pagina's staan **5.670 tekstknopen, 1.644 unieke** (§2.5). Daarvan moet
  100 % in de seed staan.
- **Wat die telling mist.** Tekst die een script pas in de browser neerzet, en of iets verborgen is. Daarvoor komt
  een tweede telling op de pagina zoals de browser hem toont.
- **Eerst het schema aanvullen.** §2.2 noemt dertien dingen die de pagina's hebben en het schema niet. Die
  aanvullingen gaan als voorstel in de pull request van fase 1, vóór de inhoud wordt opgehaald.
- **Deelbeelden.** In og:image en de JSON-LD staat 46 keer een adres `https://www.ayr.amsterdam/_site/img/…`. Dat
  adres bestaat op de nieuwe site niet; de site vult het uit het manifest.

**Klaar als:** 100 % van de tekstknopen in de seed, en de lijst met ontbrekende EN-velden leeg of als vraag in de
pull request.

## 2. (b) De bloksoorten in de pagina's, naast het schema

Gelezen: de 23 Nederlandse pagina's, ontleed met scripts. De toewijzing van een sectie aan een bloksoort is een
lezing: het schema geeft de soorten alleen een naam, en `opties` is vrij.

### 2.1 Wat het schema dekt

Het schema kent 16 bloksoorten. Veertien komen voor:

| Bloksoort | Waar in de referentie |
|---|---|
| `hero` | home (`section.hero`), geur |
| `tekst` | home, over, geur, de productpagina's |
| `beeld_tekst` | home, montage, over, contact, zakelijk (4×), de productpagina's |
| `tegels` | home, zakelijk, over (partners), proefstalen, geur, montage, muur, de productpagina's |
| `fronten_strook` | home, collectie, de productpagina's |
| `verwachtingen` | home, over |
| `voor_na` | home |
| `vragen` | contact (33 vragen in 6 hoofdstukken), de productpagina's, geur |
| `formulier` | contact, zakelijk, geur, muur, en de nieuwsbrief in de voet |
| `eigenschappen` | de productpagina's, zakelijk, partner, proefstalen |
| `maak_het_af` | collectie, de productpagina's, mijn bestelling, accessoires |
| `verder_kijken` | negen pagina's |
| `juridisch_document` | juridisch (5 documenten) |
| `hoofdstukken` | interieurs (4 hoofdstukken) |

`reviews` en `downloads` komen in de referentie niet voor.

### 2.2 Wat ontbreekt, op hoe vaak het voorkomt

| # | Waar | Wat de pagina heeft | Wat er nodig is |
|---|---|---|---|
| 1 | 22 pagina's | Gedeelde onderdelen zonder plek: de servicestrook (`.vb-service`), het venster met de EU-garantie (`dialog.eu-gar`), de zekerheden in de voet (`.tf-zeker`), en de winkelwagenlade (`.ml`), waarvan de teksten vast in het script staan. | Een type voor de gedeelde onderdelen, of sleutels in `teksten`. `Instellingen.bedrijf` mist het veld `adres`. |
| 2 | 14 pagina's | De paginakop: een label boven de titel (`p.tc-label` + `h1`). | Op `Pagina` een veld `label` en een intro, of een hero zonder beeld. |
| 3 | 14 pagina's | De regel "Alle beelden zijn impressies." | Een sleutel in `teksten` en een schakelaar per pagina. |
| 4 | 10 pagina's | Genummerde stappen (`ol.tm-stappen`, `ol.tz-stappen`, `ol.ex-stappen` en zeven andere). | Een bloksoort `stappen`, met per stap een nummer of bovenschrift. |
| 5 | 7 pagina's | De pascheck (`section.tc-past#past-het`) op collectie en de productpagina's. | Een bloksoort `pascheck`. `Pasvorm` mist de zin per maat (per front anders), de tips en de fout- en uitslagteksten. |
| 6 | 6 pagina's | De kop van de productpagina: kruimelpad, galerij, koopblok en de lade met de leidingkeuze. | Geen blok maar het sjabloon. `Product` mist: de leidingopties, het fronttype (dicht of open), een derde stand per maat ("nog niet te bestellen"), de naam van de variantgroep ("Stof") en de lijst met feiten. |
| 7 | 6 formulieren | Partner, herroeping, de wachtlijst bij accessoires en de melding voor maat L. | Vier sleutels en bestemmingen erbij in `Formulier`; een veldsoort datum; voorwaardelijke velden per onderwerp (contact). |
| 8 | montage, geur | Een film of tekening zonder tekst, en losse lijsten ("wat je nodig hebt", de legenda). | Een bloksoort `beeld` (of `beeld_tekst` zonder tekst) en `lijst`. |
| 9 | muur, app | Het werkblad van Aan jouw muur (`.tw.tw-werk`). | Een bloksoort `muur`, met de voorbeeldfoto en de plek van de cover. |
| 10 | juridisch | 41 tussenkoppen met een anker, 2 tabellen, de inhoudsopgave en het modelformulier om te kopiëren. | `Opmaaktekst` met koppen en tabellen; een plek voor het modelformulier. |
| 11 | accessoires | De standen "In ontwikkeling" en "Later", een detailregel, een knop en een brede tegel. | Velden erbij op `Artikel`. |
| 12 | elk één pagina | Contact: de keuze van het onderwerp en de kanalen, met de openingstijden vast in de pagina (ma–za 9–17). Bestellen: de vier stappen, het overzicht en het bedankscherm. Mijn bestelling: het zoekformulier en de uitkomst. | Tekstsleutels per pagina; de openingstijden naar `Instellingen`. |
| 13 | home | De hero: de tijdcodes van de film, de temperatuurcurve, de wisselende kop en de knop "Licht achter de cover". | Velden erbij op `Hero`. |

Verder:
- **Een cookiemelding staat nergens:** niet in de referentie en niet in het schema. De superprompt (regel 6) vraagt
  er wel om.
- **De balk bovenaan** (`Balk` in het schema) heeft geen element in de referentie.
- **De partners staan zichtbaar** op Over AYR, terwijl de schakelaar "Partners tonen" standaard uit hoort te staan.

### 2.3 De interactieve onderdelen

| Onderdeel | Waar de gegevens nu staan | Dekt het schema het? |
|---|---|---|
| De houtknop eiken/noten | `data-eiken` en `data-noten` op de beelden (15 pagina's); de standaard (noten) staat vast | Ja (`PerHout`, `standaard_hout`). |
| Inspiratie | data-attributen per tegel (47 tegels, 4 films); filters op plek en front | Ja (`Kamer`). De teksten van de vergroting staan vast in het script. |
| De pascheck | ingebedde JSON: 292 modellen van 17 merken, en de instelling per pagina; de uitslag staat vast in het script | De modellen wel (`Pasvormmodel`), de teksten niet (zie 2.2, punt 5). |
| Aan jouw muur | alles in de browser; de foto verlaat de browser niet; de meldingen staan vast in het script | De beelden wel, de teksten niet. |
| De dagfilm en de dagpil | de gekozen hero, de tijdcodes, de klok en de teksten staan vast in het script | De film, de stills en de keuze wel; de rest niet (zie 2.2, punt 13). |
| De leidingkeuze | JSON op de pagina: zes opties met naam, korte naam en uitleg; de schetsen als ingebedde SVG | **Nee.** `Orderregel.leidingen` is een vrije tekst, en de beschrijving noemt drie opties in plaats van zes. |
| De configurator | data-attributen op `<main>` (maten, prijs, stof, levering); de mand staat in de browser | Grotendeels (`Product`, `Prijs`). |
| Het bestelpad | de labels in de pagina; foutmeldingen, de leverzin, de voorbeeldcodes en de btw vast in het script; het adres via PDOK | `Order`, `Actie` en `Instellingen` wel, de teksten niet. |
| Mijn bestelling | een voorbeeld en de statusstappen vast in het script | Geen plek voor de teksten. |

Geen enkel formulier in de referentie verstuurt iets. Welke soort bericht bij welk formulier hoort, volgt uit
06_KOPPELINGEN §2, niet uit de pagina's.

### 2.4 De zes productpagina's

Het is één sjabloon: dezelfde secties in dezelfde volgorde. De verschillen zijn voorwaarden, geen losse opmaak:
- **Stof.** Sora heeft een extra keuze "Stof" (linnen, salie, beige). Terra heeft één vaste uitvoering (travertin).
- **Maat L.** Bij Strata, Sora en Terra is L te kiezen met de melding "Nog niet te bestellen". Bij Vienna, Mesa en
  Vesper staat L uit, met een verwijzing naar de drie andere.
- **Dicht of open front.** Een dicht front heeft een extra rij "Bediening", een zevende feit en twee extra vragen.
- **Vragen per front:** zes, zes, zes, vijf, vier en vier.
- **De pascheck** heeft een eigen zin per front, en de open fronten sturen bij L door naar de collectie.

### 2.5 De telling

`tools/tekstknopen.mjs` telt **5.670 tekstknopen in de 23 pagina's, waarvan 1.644 unieke**. Dat is de tekst in de
pagina plus de klantteksten in attributen (alt, bijschriften, plekhouders). Twee dingen ziet die telling niet:
- tekst die een script pas in de browser neerzet (de winkelwagen, de uitslag van de pascheck, meldingen);
- of iets verborgen is. De home bevat ontwerpvarianten die de stijl verbergt: 99 van de 259 tekstknopen in de
  pagina zelf horen bij een variant die niet actief is.

Daarom komt er in fase 1 een tweede telling in de browser. Die bepaalt wat "zichtbaar" is.

## 3. (c) Wat de admin van nu doet en niet in 04 staat

Gelezen in de code van `nodefy/lijn-website` (`main`, commit 8e9705e van 12 november). De live database is niet
gezien. Elk punt heeft een bestandsverwijzing in die repo.

### 3.1 Ontbreekt in 04, op belang

**Geld**

| # | Wat de code doet | Waar | Waarom het ertoe doet |
|---|---|---|---|
| 1 | `discount_total` is niet alleen prijskorting. Bij gratis montage of verzending zit het kwijtgescholden bedrag er ook in, terwijl `shipping_total` en `installation_total` dan al 0 zijn. Het totaal is subtotaal − prijskorting + verzending + montage. | `src/server/core/pricing.ts:100` | De somcontrole per order in 04 §5 faalt met een naïeve formule. |
| 2 | Terugbetalen gaat alleen op de nieuwste betaalde betaling. Is die helemaal terug, dan krijgt de hele order de eindstatus "terugbetaald", ook bij een dubbele betaling. Extra geld op een geannuleerde order kan niet via de admin terug. Er is geen tabel voor terugbetalingen: alleen `payments.amount_refunded` en een regel in de tijdlijn. | `src/server/core/orders.ts:596` | Het nieuwe systeem krijgt een eigen type Terugbetaling; de oude gegevens hebben dat detail niet. |
| 3 | Bewaking bij betalen: het verwachte totaal moet kloppen (anders 409 `price_changed`); de webhook haalt de status zelf op bij Mollie, vergelijkt order, bedrag en munt, en vergrendelt de orderrij; de status `authorized` telt als betaald (dat raakt Klarna); betaling en terugbetaling hebben een idempotentiesleutel. | `orders.ts:127`, `orders.ts:375` | Dit moet de kassa in het CRM ook doen, anders kan een order dubbel of met een oud bedrag betaald worden. |
| 4 | Verloop: een onbetaalde order vervalt na 3 dagen, maar het annuleren draait alleen als iemand `/admin` opent (er is geen geplande taak). Een offertelink geldt 30 dagen en wordt nooit vanzelf geannuleerd. De klantlink geldt 183 dagen. | `src/pages/admin/index.astro:22`, `orders.ts:286`, `orders.ts:312` | In het CRM hoort dit een geplande taak te zijn. |
| 5 | De teller van een kortingscode is een reservering: +1 bij het plaatsen van een order (ook onbetaald), −1 bij annuleren of verlopen. Een actie verwijderen is een harde verwijdering. | `src/server/core/discounts.ts:48` | "Niets verdwijnt" geldt hier nu niet; bij de migratie verwijzen orders naar acties die weg kunnen zijn. |
| 6 | Orderregels hebben geen sleutel van maat of afwerking: alleen tekstlabels en een productslug zonder verwijzing. Een nieuwe slug werkt niet door in oude orderregels. | `src/server/db/schema.ts:424` | De migratie moet oude orderregels op tekst koppelen aan Strata, Vienna, Mesa en Vesper. |
| 7 | De winkel is pas open als hij aan staat én er een betaalprovider is; dan zijn prijzen altijd zichtbaar. | `src/server/site.ts:29` | Op `main` kun je prijzen dus niet verbergen met de winkel aan. De reparatie staat klaar (pull request 13) maar is niet live. |
| 8 | De kassa: Apple Pay, de adreszoeker van PDOK, akkoord met de voorwaarden met tijdstip, hooguit 30 regels en 20 stuks, de leidingkeuze als aparte regel, en de hint "nog N covers tot gratis montage". | `orders.ts:323`, `src/server/core/cart.ts:182` | Apple Pay staat niet in de lijst betaalmethoden van 26-11. |

**Klantgegevens**

| # | Wat de code doet | Waar | Waarom het ertoe doet |
|---|---|---|---|
| 9 | "Vergeten" doet meer dan 04 zegt: het weigert bij lopende orders, annuleert onbetaalde orders en maakt hun links ongeldig, en wist notities, de nieuwsbriefinschrijving, het adres in het maillogboek, het mailadres in het logboek en de redenen van terugbetalingen. De export bevat geen notities, betalingen of tijdlijn. | `src/server/core/customers.ts:113` | AVG: het CRM moet op dezelfde plekken wissen. |
| 10 | De nieuwsbrief heeft geen afmeldroute; de status "afgemeld" wordt nergens gezet. Verwijderen in de admin is een harde verwijdering. | zie 3.3 | Afmelden moet kunnen vóór er een nieuwsbrief uitgaat. |
| 11 | Toegang: een sessie vervalt na 8 uur stilte en uiterlijk na 7 dagen; een resetlink geldt 1 uur en wist de tweede factor; er is altijd minstens één eigenaar; inloggen is begrensd op 5 pogingen per kwartier. | `src/server/core/auth/sessions.ts:11`, `src/server/core/ratelimit.ts:38` | Het CRM heeft eigen regels; leg vast welke gelden. |

**Het overige**

| # | Wat de code doet | Waar |
|---|---|---|
| 12 | Negen mails: offerte, betaald, melding aan AYR, betaling op een verkeerde order, klaar, verzonden, melding van een aanvraag, bevestiging van een aanvraag, bevestiging van de nieuwsbrief. "Klaar" en "verzonden" gaan opnieuw uit als je de status terugzet. Er is geen mail bij annuleren of terugbetalen. Alles staat in `mail_log`, zonder scherm. | `orders.ts:566` |
| 13 | Het scherm van één aanvraag ontbreekt in 04: zes soorten, vijftien extra velden, de status "in behandeling", notities, gekoppelde offertes, definitief verwijderen. De status gaat vanzelf naar "offerte" en "gewonnen". | `src/pages/admin/aanvragen/[id].astro:43`, `src/server/core/enquiries.ts:21` |
| 14 | Elke uitrol schrijft in de database: migraties, en een catalogus-sync die bij een nieuwe versie teksten, maten en afwerkingen overschrijft. Daardoor staan in `settings` ook technische sleutels (de versleutelde Mollie-sleutel, versies, vlaggen). Pasvorm (hooguit 500 modellen) en de balk zijn JSON in `settings`, geen tabellen. | `scripts/db.ts:95` |
| 15 | Product: "toon als binnenkort" per maat (de pascheck antwoordt dan "binnenkort"); de eigenschap Levertijd wordt op naam herkend; opslaan vervangt alle maten en afwerkingen (nieuwe id's); een meerprijs mag negatief zijn. | `schema.ts:212`, `src/lib/lead.ts:14`, `src/server/core/catalog.ts:289` |
| 16 | Foto's: hooguit 2400 px breed, WebP in 480, 800, 1200 en 1600 als losse bestanden buiten de tabel. Producten verwijzen op url-tekst; verwijderen controleert niet of een foto nog gebruikt wordt. | `src/server/core/media.ts:24` |

### 3.2 Staat anders in 04 dan in de code

Deze dingen noemt 04 als nieuw of ontbrekend, maar bestaan al:
- **BE-06:** zoeken op nummer, naam en mailadres.
- **AA-03:** van aanvraag naar offerte, met de velden vooringevuld.
- **PD-10:** de doorverwijzing bij een nieuwe slug.
- **PR-01:** het productiebord, met vier kolommen.
- **BE-12, BE-13, BE-16:** korting, verzending en montage als eigen regels; de betaallink opnieuw sturen; notities met wie en wanneer.
- **OV-09 en §4.3:** de winkel aanzetten zonder Mollie of zonder bevestigde prijzen wordt al geweigerd.
- **FO-02:** de WebP-maten bestaan al. De alt-tekst is wel maar één taal.

En deze kloppen niet meer:
- **PO-01:** het prijsonderzoek is sinds 12 november gesloten; de API antwoordt met 410.
- **PV-02:** "past" telt ook "binnenkort" mee.
- **§5, de namen:** de site verwijst meer oude namen door dan 04 noemt: sober, essenza en grove (Strata), ritmo,
  slatted-v en silo (Vesper), piano en slatted-h (Mesa), tela en textile (Sora), rotan (Vienna), keramiek (Terra).
- **§5, "de modus uit Mollie halen":** een betaling kan van de testprovider zijn; die nummers bestaan niet bij Mollie.

### 3.3 De tabellen, voor de migratie

De database heeft 26 tabellen. 04 §5 noemt er zes niet: `user_tokens`, `sessions`, `rate_limits`, `product_slugs`,
`carts` met `cart_items`, en `mail_log`. Van `notes` noemt 04 alleen de notities bij orders.

| Tabel | In 04 §5 | Exporteren langs |
|---|---|---|
| `orders` | ja | `id`; `number` is uniek |
| `order_items`, `order_events` | ja | `id` |
| `payments` | ja | `id`; `provider` + `provider_id` is uniek |
| `customers` | ja | `id`; het mailadres is uniek |
| `enquiries`, `discounts`, `users`, `audit_log`, `fit_checks`, `survey_responses` | ja | `id` |
| `newsletter_subscribers` | ja | `id`; het mailadres is uniek |
| `products` | ja | `id` (de slug) |
| `product_sizes`, `product_finishes` | ja | `product_id` + `key` (het `id` wisselt bij elke opslag) |
| `faq_groups`, `faq_items` | ja | `key`; bij items `group_key` + `sort` (het `id` wisselt) |
| `media`, `materials` | ja | `id` |
| `settings` | deels | `key`; zonder de technische sleutels |
| `notes` | alleen bij orders | `id` |
| `product_slugs` | nee | `slug`: moet mee, als doorverwijzingen |
| `mail_log` | nee | `id`: bewijs van wat er verstuurd is |
| `carts`, `cart_items`, `sessions`, `user_tokens`, `rate_limits` | nee | hoeft niet mee |

Het ordernummer komt uit één reeks over alle jaren, met gaten. Ga in het CRM verder vanaf de stand van die reeks,
niet vanaf het hoogste nummer.

### 3.4 Niet zeker

- Of de 14 orders uit 04 echte orders zijn. Het script met voorbeeldgegevens maakt 13 orders, juist met de oude
  namen en de testprovider. Controleer vóór de migratie `settings.demo_data` en `payments.provider`.
- Het gedrag bij een dubbele betaling (punt 2) is uit de code gelezen, niet uitgevoerd.

## 4. (d) Vragen

### 4.1 De antwoorden op de vijf vragen aan Ruben (02 §11)

1. **Maakt iets in de CRM-repo optie B lastig?** Dat kan ik nog niet zeggen: ik heb geen toegang tot
   `AYR-studio/ayr-crm`. Nodig vóór fase 3.
2. **Waar staat de inhoud van de admin?** In Postgres (26 tabellen, zie §3.3); foto's in Vercel Blob. Pasvorm en de
   balk zijn JSON in de tabel `settings`. De lijst in 04 §5 mist zes tabellen.
3. **Bezwaar tegen de kassa in het CRM?** Geen bezwaar, wel een voorwaarde: de bewaking uit §3.1, punt 3 en 4, moet
   mee. Dat is nu het deel dat dubbele en verkeerde betalingen tegenhoudt.
4. **Welke mails stuurt de site, en vanaf welk adres?** Negen mails (§3.1, punt 12), vanaf `info@ayr.amsterdam`,
   via Resend. **Let op:** voor Resend staan er geen DNS-records op het domein (geen `resend._domainkey`, niets op
   `send.ayr.amsterdam`). Resend verstuurt meestal niet vanaf een domein dat niet geverifieerd is. Of er nu mail
   aankomt, is te zien in `mail_log`; dat heb ik niet kunnen bekijken.
5. **Een planning per fase.** Zie §5.

### 4.2 Vragen aan Tom, elk met een voorstel

| # | Vraag | Voorstel |
|---|---|---|
| 1 | De planning past niet (§5). Wat gaat op 14 januari live? | De nieuwe site op de inhoud en de koppelingen, de winkel op "alleen aanvragen". De winkel volgt. |
| 2 | Mogen de referentiebeelden op Blob hun pad houden, zonder hash (§1.3)? | Ja; anders toont de referentie kapotte beelden. |
| 3 | De routes van de nieuwe pagina's. | Zoals in `tools/vergelijk.paginas.json`: wat live staat houdt zijn adres, de rest volgt de paginanaam (`/over`, `/muur`, `/en/about`, `/en/wall`). |
| 4 | Gaan `app.html` en `partner.html` mee live? | App als demo (besloten); Partner offline tot jij hem aanzet. |
| 5 | Apple Pay staat nu in de kassa, maar niet in de lijst van 26-11. | Erbij als schakelaar in Instellingen → Betalen, standaard zoals nu. |
| 6 | Zijn de 14 orders in de admin echte orders of voorbeeldgegevens (§3.4)? | Voorbeeldgegevens niet migreren. |
| 7 | Mag ik bij de CRM-repo, alleen lezen, vóór fase 3? | Ja: `AYR-studio/ayr-crm`, de branch `website-koppelingen`. |
| 8 | Wie zet de Resend-records in de DNS, of mailt de nieuwe site via het CRM? | Tot de kassa in het CRM draait: Resend verifiëren (drie records bij TransIP). |
| 9 | Microsoft Clarity laadt op de site van nu zonder toestemming (05 §6, punt 6). | In Tag Manager achter de toestemming voor statistiek, vóór de lancering. |
| 10 | De adreszoeker in de kassa vraagt PDOK aan vanuit de browser, met postcode en huisnummer. | Zo laten (een dienst van de overheid) en noemen in de privacyverklaring, of via de eigen server. |
| 11 | De referentie heeft geen cookiemelding, de superprompt vraagt er wel een. | De melding van de site van nu overnemen, in de stijl van de referentie. |
| 12 | Op Over AYR staan de partners zichtbaar in de referentie; de schakelaar hoort standaard uit te staan. | De schakelaar wint: uit bij de lancering. De vergelijking met de referentie dekt dat blok dan af. |
| 13 | De home bevat ontwerpvarianten die verborgen zijn. Horen die teksten in de inhoud? | Nee: alleen wat de browser toont (hero C Salon en de actieve varianten). |
| 14 | De leidingkeuze heeft zes opties; het schema noemt er drie. | De zes uit de referentie zijn leidend; het schema volgt. |

## 5. De planning per fase

Dit zijn schattingen, in werkdagen voor één ontwikkelaar met Claude Code, zonder de wachttijd op akkoord.

| Fase | Wat | Schatting | Hangt af van |
|---|---|---|---|
| 0 | de basis | 1 tot 2 dagen | de repo, het Blob-token, het Vercel-project |
| 1 | het contentmodel en de eerste inhoud | 4 tot 6 dagen | de Engelse pagina's en de mails |
| 2 | de site op de inhoud | 8 tot 10 dagen | 23 pagina's × 2 talen × 2 breedtes binnen 1,5 % |
| 3 | de backend in het CRM | 8 tot 10 dagen | toegang tot de CRM-repo; de branch samengevoegd |
| 4 | concept, versies, rechten | 5 dagen | – |
| 5 | de koppeling met het CRM | 3 tot 4 dagen | de sleutels (na de update van het CRM) |
| 5b | de winkel in het CRM | 10 tot 15 dagen | een Mollie-testsleutel; de prijzen; btw per land |
| 6 | de overstap | 5 dagen | Toms moment voor de webhook en het domein |

Samen 44 tot 57 werkdagen. Tot 14 januari zijn er ongeveer 32, met de feestdagen eraf.

**Voorstel**
- **Vóór 14 januari:** fase 0, 1, 2 en 5 (de site, in beide talen, met de berichten en de standen uit het CRM), plus
  de doorverwijzingen en de meetpunten uit fase 6. De winkel staat op "alleen aanvragen".
- **Parallel, zodra er toegang is:** fase 3 en 4 in de CRM-repo. Tot die klaar zijn, komt de inhoud uit de seed in
  git; een tekst wijzigen gaat dan via een pull request.
- **Na de lancering:** fase 5b en de migratie van de admin. De oude admin blijft tot dan staan.
