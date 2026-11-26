/*
  Velden die het schema niet noemt.

  Het contentmodel laat bijna overal extra velden toe (alleen Tekst is dicht). Dat is goed voor later, maar het
  betekent ook dat een tikfout in een veldnaam ("kopp" in plaats van "kop") gewoon door de controle komt: het veld
  is niet verplicht, dus het schema mist niets, en de site toont het niet. Deze functie vindt die velden, zodat de
  seed en de backend ze kunnen melden.

    onbekendeVelden(schema, waarde)                 voor het geheel
    onbekendeVelden(schema, waarde, "Pagina")       voor één definitie uit $defs

  Geeft een lijst van { pad, veld }. Niet gemeld:
  - velden onder een object zonder eigen velden in het schema (vrije opties), en waarden zonder schema ({});
  - velden onder additionalProperties: false; die keurt het schema zelf al af.
*/

function samen(schema, knoop, diepte = 0) {
  // de knoop met alles uit $ref en allOf erbij: { velden, extra, items, vrij }
  if (!knoop || typeof knoop !== "object" || diepte > 20) return { velden: {}, extra: undefined, items: undefined, type: undefined };
  const uit = { velden: { ...(knoop.properties ?? {}) }, extra: knoop.additionalProperties, items: knoop.items, type: knoop.type };
  const delen = [];
  if (knoop.$ref) delen.push(schema.$defs?.[knoop.$ref.replace("#/$defs/", "")]);
  for (const d of knoop.allOf ?? []) delen.push(d);
  for (const d of delen) {
    const s = samen(schema, d, diepte + 1);
    uit.velden = { ...s.velden, ...uit.velden };
    uit.extra ??= s.extra;
    uit.items ??= s.items;
    uit.type ??= s.type;
  }
  return uit;
}

export function onbekendeVelden(schema, waarde, definitie) {
  const { $defs, ...geheel } = schema;
  const begin = definitie ? { $ref: `#/$defs/${definitie}` } : geheel;
  if (definitie && !$defs?.[definitie]) throw new Error(`Het schema heeft geen definitie ${definitie}`);
  const uit = [];
  const loop = (knoop, w, pad) => {
    const k = samen(schema, knoop);
    if (Array.isArray(w)) {
      if (k.items) w.forEach((item, i) => loop(k.items, item, `${pad}[${i}]`));
      return;
    }
    if (!w || typeof w !== "object") return;
    const heeftVelden = Object.keys(k.velden).length > 0;
    for (const [veld, kind] of Object.entries(w)) {
      const hier = pad ? `${pad}.${veld}` : veld;
      if (veld in k.velden) loop(k.velden[veld], kind, hier);
      else if (k.extra && typeof k.extra === "object") loop(k.extra, kind, hier);
      else if (k.extra === false) continue;
      else if (heeftVelden) uit.push({ pad: hier, veld });
    }
  };
  loop(begin, waarde, "");
  return uit;
}
