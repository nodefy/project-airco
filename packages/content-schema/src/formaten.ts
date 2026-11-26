/*
  De vier formaten die het contentmodel gebruikt (date-time, date, uri, email), voor de gegenereerde typen.

  De regel: zod laat nooit iets toe dat het JSON Schema afkeurt. Waar zod strenger is, gaat het om schrijfwijzen
  die het CRM niet maakt; ze staan één voor één in test/formaten.test.mjs en in LEESMIJ.md.
*/
import { z } from "zod";

// De tekens die RFC 3986 in een URI toelaat. `new URL()` (waar z.url op leunt) neemt ook spaties en letters met
// accenten aan; een beeldadres met een spatie zou dan hier goed zijn en bij de controle tegen het schema fout.
const URI_TEKENS = /^[A-Za-z][A-Za-z0-9+.-]*:(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*$/;

/** RFC 3339 met hoofdletter T en een tijdzone: 2027-01-14T12:00:00+01:00 of …Z. */
export const datumtijd = () => z.iso.datetime({ offset: true });
/** Een bestaande dag: 2027-01-14. */
export const datum = () => z.iso.date();
/** Een volledige URI met schema, alleen ASCII; een spatie is %20. */
export const uri = () => z.url().refine((w) => URI_TEKENS.test(w), "geen geldige URI: alleen ASCII, een spatie is %20");
export const email = () => z.email();
