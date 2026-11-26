# Besluiten

Elk besluit met datum, wat, wie en waarom (zoals in het CRM). Nieuwste bovenaan per blok.
Een open keuze vul je niet stil in: zet hem als vraag in de pull request, met een voorstel, en leg het antwoord hier vast.

## Besloten door Tom

| Datum | Wat | Waarom / bron |
|---|---|---|
| 26-11-2026 | **De lancering is donderdag 14 januari 2027.** Geen Black Friday-acties. In het CRM de instelling `lancering`. | superprompt, fase 6 |
| 26-11-2026 | **De kassa draait in het CRM.** Het volledige adres staat in de afgeschermde klantopslag van het CRM. | "crm dan?"; 04 §4.5, 02 §6.1 |
| 26-11-2026 | **Terugbetalen:** één beheerder, nooit een tweede akkoord. | "nooit; mag alleen" |
| 26-11-2026 | **Prijzen wijzigen en bevestigen, terugbetalen en handmatige korting:** iedere beheerder. Bewerkers en kijkers niet. Bevestigen is een bewuste tweede klik; dezelfde beheerder mag die doen. | "iedere beheerder"; 04 §4.4 |
| 26-11-2026 | **Eén consumentenprijs voor alle landen.** De btw wordt per afleverland berekend, als instelling per land. | "denk prijs hetzelfde maar btw verschilt per land"; 04 §4.2 |
| 26-11-2026 | **Productnamen: de site is leidend.** Kader = Strata, Studio = Vienna, Horizontaal = Mesa, Lijn = Vesper. Mosaïek en Sober zijn geen product. Oude records gaan mee als archief. | "alles wat op de website staat is leidend"; 04 §5 |
| 26-11-2026 | **Geen "vooraf bestellen" meer.** Alle zes worden geleverd in het eerste kwartaal van 2027. De leverperiode is een veld per model. | 00_LEESMIJ |
| 26-11-2026 | **De klant kiest in de kassa:** "Alles nu betalen" of "De helft nu, de rest bij levering". Bij de helft gaat de betaallink voor de rest mee als de order klaar is, met een herinnering. Verzenden kan pas als de rest binnen is; bij montage is de rest betaald vóór of bij de montage. | art. 7:26 BW; 04 §4.1 |
| 26-11-2026 | **Klarna erbij,** als "Later betalen". Betaalmethoden staan aan of uit in Instellingen → Betalen: iDEAL, kaart, Bancontact, Klarna. "In drie delen" pas na de advocaat. | "ja zet erbij; werkt in mollie" |
| 26-11-2026 | **Schakelaars per pagina, standaard uit,** door een beheerder om te zetten, met voorbeeld vóór publiceren: "Partners tonen" op Over AYR en "Geurnamen tonen" op Geur (uit: de seizoenen). | 02 §4.6 |
| 26-11-2026 | **De hero van Home kies je in de backend:** Dag, A Gracht, B Club, C Salon, Loft, Penthouse of Koloniaal (nu C Salon), of een nieuwe, ook op een datum. Kan de film niet spelen, dan vloeien de drie stills over. | 04 §4.6 |
| 26-11-2026 | **De app voor installateurs gaat live als demo:** de pagina is zichtbaar. | 00_LEESMIJ |
| 26-11-2026 | **De EU-kennisgeving over de wettelijke garantie staat erin:** onder de koopknop, in de voettekst, op Contact, in de kassa en in de bevestigingsmail. De bestanden in `_site/img/garantie/` niet aanpassen. Het GARAN-label pas na de advocaat. | verplicht sinds 27-09-2026; 05 §6, punt 5 |
| 26-11-2026 | **Prijzen zijn plekhouders.** De € 599 in de referentie is een werkgetal. De site toont een prijs pas na bevestiging in het CRM (de prijspoort): zonder bevestigde prijs geen bedrag, geen koopknop en geen `offers` in de JSON-LD. | 01 §2b; 06 §3 |
| 25-11-2026 | **De backend wordt optie B:** een pijler "Website" in het CRM. Optie A (een eigen backend in deze repo) is alleen een terugvaloptie. | 00_LEESMIJ, 02 §6 |
| 25-11-2026 | **Ruben draait de migratie zelf,** met de vier gedeelde mappen. Beelden en films gaan naar Vercel Blob, niet in git. | 01_MIGRATIE |

## Voorstellen die nog een ja van Tom nodig hebben

| Datum | Voorstel | Waarom | Stand |
|---|---|---|---|
| 26-11-2026 | **De beelden van de referentie houden op Blob hun pad** (`site/referentie/v1/img/…`), zonder inhoudshash. De site-set (`assets/beelden`, `assets/downloads`) krijgt wel een hash in de naam. | 01_MIGRATIE stap 4 vraagt overal een hash. De referentiepagina's stellen paden in JavaScript samen (`MAP='../_site/img/beeldlijn/'` + naam, op 22 pagina's; ook `front/` en `interieurs/`), dus met een hash in de naam toont de referentie kapotte beelden. "Nooit overschrijven" blijft gelden: verandert een referentiebeeld, dan weigert het script en komt er een nieuwe versie (`v2`). | open |
| 26-11-2026 | **De routes van de nieuwe site** zoals in `tools/vergelijk.paginas.json`: wat nu live staat houdt zijn adres (`/collectie`, `/covers/<model>`, `/en/collection`), de rest volgt de naam van de pagina. | 06_KOPPELINGEN §5 noemt dit zelf een voorstel; de doorverwijzingen en de vergelijking hangen eraan. | open |

## Open bij Tom (uit het pakket, 26-11)

- De werkgebieden naast de rangen van het CRM (04 §4.4).
- Btw per land, met de boekhouder: vanaf wanneer geldt het tarief van het land van de klant (04 §4.2).
- Strata staat in de admin gepubliceerd met € 0,00.
- Welke pagina's live gaan bij de lancering (voorstel: Accessoires, Geur en Partner offline).
- Standaardhout op de site: noten of eiken.
- Wie de bevestiging van een herroeping meteen stuurt: de site of een flow in het CRM (06 §8).
- De punten in `docs/migratie/05_SCHOON_EN_OPEN_BESLUITEN.md` §6 (prijzen, retourkosten, cookietabel en Clarity, de pagina /garantie, de toets door de advocaat).
