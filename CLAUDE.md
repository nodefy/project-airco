# Regels voor elke Claude-sessie in deze repo

Deze repo is `AYR-studio/ayr-site`: de site www.ayr.amsterdam van AYR Studio B.V.
Het team: Tom (eigenaar, beslist), Jeremy (productie, B2B, het CRM) en Ruben (developer van de site).

De regels hieronder komen letterlijk uit `docs/migratie/03_SUPERPROMPT.md` (§3 en §7, versie 26-11-2026).
Verandert de superprompt, werk dit bestand dan bij; bij verschil geldt de superprompt.

Lees vóór je iets bouwt: `docs/migratie/02_BACKEND.md`, `docs/migratie/06_KOPPELINGEN.md`
(waar 02 en 06 verschillen, geldt 06), `docs/migratie/04_ADMIN_NAAR_CRM.md` en `DECISIONS.md`.

## Regels
1. **Geen geheimen in git:**
   - alle sleutels in de Vercel-env, alleen server-side;
   - zoek vóór elke commit op sleutels en persoonsgegevens (`git diff --cached`).
2. **Niets verdwijnt:**
   - verwijderen is archiveren (status `archief`);
   - elke publicatie is een versie;
   - elk logboekrecord bewaar je.
3. **Elke klanttekst komt uit de inhoud.** Een template heeft alleen een terugvalwaarde, en die is gelijk aan de referentie.
4. **NL en EN** voor elk tekstveld. Een ontbrekend EN-veld blokkeert publiceren.
5. **Tekstregels** (02_BACKEND.md §4.4), die gelden voor alles wat je zelf schrijft én voor de controle vóór publiceren:
   - geen twijfel in klantteksten ("nog niet getest/gemeten/bekend", "hangt af van");
   - garantie is 5 jaar;
   - geen "massief";
   - niet "handgemaakt in Amsterdam";
   - "aircover" zonder ™/®;
   - nooit verzonnen reviews (een reviewblok blijft leeg of is duidelijk een plaatshouder tot er echte zijn).
6. **Privacy (AVG):**
   - elk vinkje voor nieuws staat standaard uit;
   - geen tracking vóór toestemming (cookiemelding zoals in de referentie);
   - persoonsgegevens alleen in de berichten naar het CRM zoals in §7.4, en in de afgeschermde klantopslag van het CRM,
     waar de kassa draait (02_BACKEND.md §6.1);
   - nooit persoonsgegevens in logs, seeds, fixtures, schermafbeeldingen of testdata: alleen verzonnen namen en
     `@example.com`-adressen;
   - geen foto's van kamers bewaren zonder uitdrukkelijke toestemming.
7. **Geen mail de deur uit, en geen betaling live,** zonder Toms uitdrukkelijke ja:
   - Mollie in testmodus;
   - mailen alleen naar je eigen testadres;
   - de flows in het CRM blijven uit.
8. **Stijl van de backend:**
   - alleen de variabelen uit `packages/ui-tokens/crm` (`var(--…)`), nooit vaste kleuren;
   - geen hoofdletters met spatiëring en geen zwarte kaders;
   - zachte vorm (`--z-r` 20, `--z-r2` 14, `--z-r3` 10);
   - elk scherm ook in de nachtstand nakijken;
   - letter `"Matter","Helvetica Neue",Helvetica,Arial,sans-serif` (geen Matter-webfont: er is geen weblicentie).
9. **Stijl van de site:** precies de referentie (Figtree uit `referentie/_site/_astro`, kleuren en maten uit de referentie-CSS).
   Geen eigen "verbeteringen" aan het ontwerp. Zie je een fout in de referentie, meld hem en vraag het.
10. **Beelden:**
    - altijd via Blob en het manifest;
    - webp 480/800/1200/1600 met `srcset` en `sizes`;
    - focuspunt per beeld;
    - lazy behalve de hero;
    - een beeld nooit overschrijven: een nieuwe naam (hash).
11. **Klein en controleerbaar werken:**
    - één fase per branch;
    - kleine commits met een Nederlandse boodschap;
    - een pull request met schermafbeeldingen en de uitkomst van de controles (§5);
    - wacht op akkoord vóór de volgende fase.
12. **Besluiten** in `DECISIONS.md` (datum, wat, wie, waarom). Vul open keuzes niet stil zelf in: zet ze als vraag in de
    pull request, met jouw voorstel.
13. **Geld:**
    - één bron voor prijzen (Product → Prijzen in het CRM), ook als je ze vanuit Website → Producten aanpast;
    - een prijs van € 0 kan niet live, tenzij "op aanvraag";
    - prijzen wijzigen en bevestigen, terugbetalen en handmatige korting: iedere beheerder (rang beheerder of
      hoofdbeheerder), bewerkers en kijkers niet. Eén beheerder betaalt terug, nooit met een tweede akkoord. Bevestigen is
      een bewuste tweede klik, die dezelfde beheerder mag doen (Tom, 26-11; 04 §4.4);
    - één consumentenprijs voor alle landen; de btw per afleverland als instelling per land, niet vast in code (04 §4.2);
    - de klant kiest "Alles nu betalen" of "De helft nu, de rest bij levering" (art. 7:26 BW). De rest is betaald vóór
      verzending, of vóór of bij de montage. Er is geen "vooraf bestellen": de leverperiode staat per model;
    - een testbetaling maakt een testbestelling, en testbestellingen tellen nooit mee in omzet, kerncijfers of flows;
    - kostprijzen en marges nooit op de site, in de Content API of in een stuk voor buiten.

## Niet zonder Tom
- het domein of de DNS aanraken;
- Mollie live zetten, of de Mollie-webhook omzetten;
- Klarna "In drie delen" aanzetten (eerst de advocaat);
- de webshop op open zetten, of prijzen bevestigen;
- een echte terugbetaling, een echt verzendlabel of een verstuurde factuur (dat kost geld of is niet terug te draaien);
- gegevens in de oude admin wijzigen of wissen;
- een mail naar iemand anders dan jezelf;
- een flow in het CRM aanzetten;
- iets in het live-CRM wijzigen buiten je eigen branch;
- prijzen of teksten verzinnen;
- iets uit de referentie weglaten.

## Werkwijze
- Eén fase per branch, met een pull request en de uitkomst van de controles (`pnpm controles`). Stop na elke fase.
- Open keuzes vul je niet stil zelf in: zet ze als vraag in de pull request, met jouw voorstel, en leg een besluit vast
  in `DECISIONS.md`.
