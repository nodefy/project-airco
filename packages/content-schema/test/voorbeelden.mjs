/*
  Voorbeelden bij een JSON Schema, voor de test dat Ajv en zod hetzelfde oordelen.

    maak(wortel, knoop, { rng, vol })     een waarde die bij het schema hoort
    mutaties(wortel, knoop, waarde)       dezelfde waarde met telkens één ding veranderd (veld weg, verkeerd type,
                                          buiten de grenzen, onbekend veld erbij). Een mutatie hoeft niet fout te
                                          zijn: de test vraagt alleen dat beide hetzelfde zeggen.

  Kent dezelfde sleutelwoorden als genereer.mjs. De patronen die het aankan zijn de eenvoudige: ^ en $, letterlijke
  tekens, \d, klassen als [a-z0-9-] en de herhalingen {n}, +, * en ?.
*/

/** Een vaste reeks "toevallige" getallen, zodat een test die faalt opnieuw precies zo faalt. */
export function maakRng(zaad = 1) {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORMAAT = {
  "date-time": ["2027-01-14T12:00:00+01:00", "2026-11-26T09:30:00Z"],
  date: ["2027-01-14", "2028-02-29"],
  uri: ["https://example.com/beeld.0123456789.webp", "https://www.example.com/pad?x=1#y"],
  email: ["naam@example.com", "iemand.anders@example.com"],
};

/** Een tekst die bij het patroon past. Gooit een fout bij een patroon buiten de eenvoudige soort. */
export function uitPatroon(patroon, rng = maakRng()) {
  let i = 0, uit = "";
  const kies = (tekens) => tekens[Math.floor(rng() * tekens.length)];
  const fout = () => new Error(`voorbeelden: het patroon ${JSON.stringify(patroon)} kan deze generator niet aan (bij teken ${i})`);
  if (patroon[i] === "^") i++;
  while (i < patroon.length && !(patroon[i] === "$" && i === patroon.length - 1)) {
    let tekens;
    const c = patroon[i];
    if (c === "\\") {
      const d = patroon[++i];
      if (d === "d") tekens = "0123456789";
      else if (/[.\-\/+*?()[\]{}|^$\\]/.test(d)) tekens = d;
      else throw fout();
      i++;
    } else if (c === "[") {
      const eind = patroon.indexOf("]", i);
      if (eind < 0 || patroon[i + 1] === "^") throw fout();
      const klasse = patroon.slice(i + 1, eind);
      tekens = "";
      for (let j = 0; j < klasse.length; j++) {
        if (klasse[j] === "\\") throw fout();
        if (klasse[j + 1] === "-" && j + 2 < klasse.length) {
          for (let k = klasse.charCodeAt(j); k <= klasse.charCodeAt(j + 2); k++) tekens += String.fromCharCode(k);
          j += 2;
        } else tekens += klasse[j];
      }
      i = eind + 1;
    } else if (/[.()|*+?{}$^]/.test(c)) throw fout();
    else {
      tekens = c;
      i++;
    }
    let aantal = 1;
    const m = /^\{(\d+)(?:,(\d*))?\}/.exec(patroon.slice(i));
    if (m) {
      aantal = Number(m[1]);
      i += m[0].length;
    } else if (patroon[i] === "+") {
      aantal = 1 + Math.floor(rng() * 6);
      i++;
    } else if (patroon[i] === "*" || patroon[i] === "?") {
      aantal = Math.floor(rng() * 2);
      i++;
    }
    for (let j = 0; j < aantal; j++) uit += kies(tekens);
  }
  if (!new RegExp(patroon, "u").test(uit)) throw fout();
  return uit;
}

/** Volgt $ref en een allOf met één deel, tot de knoop die de eisen draagt. */
export function los(wortel, knoop) {
  let k = knoop;
  for (let stap = 0; stap < 20; stap++) {
    if (k && typeof k === "object" && k.$ref) k = wortel.$defs[k.$ref.replace("#/$defs/", "")];
    else if (k && typeof k === "object" && k.allOf) {
      if (k.allOf.length !== 1 || k.type || k.enum) throw new Error("voorbeelden: een allOf met meer delen kan deze generator niet aan");
      k = k.allOf[0];
    } else return k;
  }
  throw new Error("voorbeelden: een kring van $ref zonder inhoud");
}

/**
  Een waarde die bij de knoop hoort. vol: "min" (alleen wat moet), "max" (alles) of "wissel" (om en om, met rng).
  Voorbij maxDiepte wordt het "min", zodat een model dat naar zichzelf wijst ophoudt.
*/
export function maak(wortel, knoop, { rng = maakRng(), vol = "max", diepte = 0, maxDiepte = 3 } = {}) {
  const k = los(wortel, knoop);
  if (k === true || !k) return "iets";
  const hoe = diepte > maxDiepte ? "min" : vol;
  const dieper = (kind) => maak(wortel, kind, { rng, vol, diepte: diepte + 1, maxDiepte });
  if (k.enum) return k.enum[Math.floor(rng() * k.enum.length)];
  switch (k.type) {
    case "boolean":
      return rng() < 0.5;
    case "string": {
      if (k.pattern) return uitPatroon(k.pattern, rng);
      if (k.format) return FORMAAT[k.format][Math.floor(rng() * 2)];
      let t = ["tekst", "Een zin met é en een “aanhaling”.", "x"][Math.floor(rng() * 3)];
      while ([...t].length < (k.minLength ?? 0)) t += "x";
      return k.maxLength !== undefined ? [...t].slice(0, k.maxLength).join("") : t;
    }
    case "integer":
    case "number": {
      let w = k.minimum ?? (k.exclusiveMinimum !== undefined ? k.exclusiveMinimum + 1 : 1);
      if (k.maximum !== undefined && rng() < 0.5) w = k.maximum;
      if (k.type === "number" && k.maximum === undefined && rng() < 0.5) w += 0.5;
      return w;
    }
    case "array": {
      const min = k.minItems ?? 0;
      const n = hoe === "min" ? min : Math.max(min, Math.min(2, k.maxItems ?? 2));
      return Array.from({ length: n }, () => (k.items === undefined ? "iets" : dieper(k.items)));
    }
    case "object": {
      const uit = {};
      for (const [naam, kind] of Object.entries(k.properties ?? {})) {
        const moet = (k.required ?? []).includes(naam);
        if (moet || hoe === "max" || (hoe === "wissel" && rng() < 0.5)) uit[naam] = dieper(kind);
      }
      if (k.additionalProperties && typeof k.additionalProperties === "object" && hoe !== "min") {
        uit["sleutel.een"] = dieper(k.additionalProperties);
        uit["sleutel.twee"] = dieper(k.additionalProperties);
      }
      return uit;
    }
    default:
      return "iets";
  }
}

const soort = (w) => (w === null ? "null" : Array.isArray(w) ? "lijst" : typeof w);

function vervang(waarde, pad, nieuw, weg = false) {
  const kopie = structuredClone(waarde);
  if (!pad.length) return nieuw;
  let p = kopie;
  for (const s of pad.slice(0, -1)) p = p[s];
  const laatste = pad.at(-1);
  if (weg) delete p[laatste];
  else p[laatste] = nieuw;
  return kopie;
}

/** Elke mutatie van de waarde: { wat, waarde }. Per lijst alleen de eerste twee items, dat is genoeg. */
export function* mutaties(wortel, knoop, waarde) {
  function* loop(kn, w, pad) {
    const k = los(wortel, kn) ?? {};
    const waar = pad.join("/") || "(de waarde zelf)";
    const met = (nieuw) => vervang(waarde, pad, nieuw);
    for (const fout of [null, 42.5, 7, "__fout__", [], {}, true]) {
      if (soort(fout) !== soort(w) || (typeof fout === "number" && fout !== w)) yield { wat: `${waar}: ${JSON.stringify(fout)} in plaats van ${soort(w)}`, waarde: met(fout) };
    }
    if (typeof w === "string") {
      yield { wat: `${waar}: lege tekst`, waarde: met("") };
      yield { wat: `${waar}: andere tekst`, waarde: met("!! geen ??") };
      if (k.maxLength !== undefined) yield { wat: `${waar}: te lang`, waarde: met("0".repeat(k.maxLength + 1)) };
      if (k.maxLength !== undefined) yield { wat: `${waar}: te lang in UTF-16, niet in tekens`, waarde: met("😀".repeat(k.maxLength)) };
      if (k.minLength) yield { wat: `${waar}: te kort`, waarde: met("0".repeat(k.minLength - 1)) };
      if (k.pattern) yield { wat: `${waar}: patroon met een teken ervoor`, waarde: met(" " + w) };
      if (k.pattern) yield { wat: `${waar}: patroon met een regel erachter`, waarde: met(w + "\nx") };
      if (k.enum) yield { wat: `${waar}: enum in hoofdletters`, waarde: met(w.toUpperCase() + "_") };
    }
    if (typeof w === "number") {
      for (const d of [-1, 1, 0.5, -1000000, 1000000]) yield { wat: `${waar}: ${w} ${d < 0 ? "-" : "+"} ${Math.abs(d)}`, waarde: met(w + d) };
      for (const g of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) {
        if (k[g] === undefined) continue;
        for (const d of [-1, 0, 1]) yield { wat: `${waar}: ${g} ${k[g]} ${d < 0 ? "-" : "+"} ${Math.abs(d)}`, waarde: met(k[g] + d) };
      }
      yield { wat: `${waar}: het getal als tekst`, waarde: met(String(w)) };
    }
    if (Array.isArray(w)) {
      yield { wat: `${waar}: lege lijst`, waarde: met([]) };
      if (k.minItems) yield { wat: `${waar}: één item te weinig`, waarde: met(w.slice(0, k.minItems - 1)) };
      if (k.maxItems !== undefined && w.length) yield { wat: `${waar}: één item te veel`, waarde: met(Array.from({ length: k.maxItems + 1 }, (_, i) => w[i % w.length])) };
      if (w.length) yield { wat: `${waar}: een item dubbel`, waarde: met([...w, w[0]]) };
      for (let i = 0; i < Math.min(2, w.length); i++) yield* loop(k.items ?? {}, w[i], [...pad, i]);
    }
    if (w && typeof w === "object" && !Array.isArray(w)) {
      yield { wat: `${waar}: een onbekend veld erbij`, waarde: met({ ...w, __onbekend__: 1 }) };
      yield { wat: `${waar}: leeg object`, waarde: met({}) };
      for (const naam of Object.keys(w)) {
        yield { wat: `${waar}/${naam}: veld weg`, waarde: vervang(waarde, [...pad, naam], undefined, true) };
        const kind = k.properties?.[naam] ?? (typeof k.additionalProperties === "object" ? k.additionalProperties : {});
        yield* loop(kind, w[naam], [...pad, naam]);
      }
    }
  }
  yield* loop(knoop, waarde, []);
}
