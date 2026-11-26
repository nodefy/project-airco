# Voorbereiding voor `AYR-studio/ayr-site`

26 november 2026. Deze map bevat wat er van fase 0 al gebouwd kon worden vóórdat de repo `AYR-studio/ayr-site`
bestaat. Alles staat op het pad dat het in die repo krijgt.

## Wat hier staat

- `docs/fase-0/EERSTE_OPDRACHT.md`: het antwoord op de eerste opdracht uit de superprompt: het plan, de
  bloksoorten naast het schema, het gat met de admin van nu, de vragen voor Tom en de planning. **Begin hier.**
- `CLAUDE.md`, `DECISIONS.md`: de regels en de besluiten.
- `tools/`: het uploadscript voor de beelden, de controle van de referentie, de tekstmeting, de vergelijking met
  schermafbeeldingen en de controles voor CI. Elk bestand begint met wat het doet en hoe je het draait.
- `.github/workflows/ci.yml`, `package.json`, `pnpm-workspace.yaml`.

## Zo zet je het in de nieuwe repo

1. Draai de migratie (01_MIGRATIE.md, stap 1 en 2), zodat `~/Code/ayr-site` gevuld is.
2. Kopieer deze map eroverheen, zonder `.git` en `node_modules`:

   ```bash
   rsync -a --exclude .git --exclude node_modules --exclude VOORBEREIDING.md <deze map>/ ~/Code/ayr-site/
   ```

   De `.gitignore` hier is die van het migratiescript, met twee regels erbij voor de uitvoer van de controles.
3. `pnpm install`, dan `pnpm test` (16 tests) en `pnpm controles`.
4. `pnpm beelden:proef` laat zien wat er naar Blob gaat. Met `BLOB_READ_WRITE_TOKEN` in je omgeving: `pnpm beelden`.
5. `pnpm controleer:referentie` moet daarna 0 kapotte beelden geven.

## Wat nog niet getest is

- Een echte upload naar Vercel Blob: er was geen token. Het script is getest met een nagebootste Blob en met een
  proefrun op de 23 echte referentiepagina's.
- De workflow in GitHub Actions. `gitleaks-action` vraagt voor een organisatie een licentiesleutel.
- Alles wat de Engelse pagina's, de mails, `tools/generator-tom/` of de CRM-repo nodig heeft.
