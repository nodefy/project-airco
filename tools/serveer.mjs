#!/usr/bin/env node
/*
  Kleine statische server voor de referentie en voor de controles.
    node tools/serveer.mjs referentie 3000
  Geen afhankelijkheden; alleen lezen, alleen binnen de opgegeven map.
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPEN = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".gif": "image/gif", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2",
  ".woff": "font/woff", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};

/** Start de server; geeft { server, poort, adres } terug. Poort 0 kiest een vrije poort. */
export function serveer(map, poort = 3000) {
  const wortel = path.resolve(map);
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let pad = path.join(wortel, rel);
    // nooit buiten de map
    if (pad !== wortel && !pad.startsWith(wortel + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(pad) && fs.statSync(pad).isDirectory()) pad = path.join(pad, "index.html");
    if (!fs.existsSync(pad)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Niet gevonden");
      return;
    }
    const type = TYPEN[path.extname(pad).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(pad).pipe(res);
  });
  return new Promise((ok) =>
    server.listen(poort, "127.0.0.1", () => {
      const p = server.address().port;
      ok({ server, poort: p, adres: `http://127.0.0.1:${p}` });
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [map = "referentie", poort = "3000"] = process.argv.slice(2);
  const { adres } = await serveer(map, Number(poort));
  console.log(`${map} staat op ${adres}`);
}
