# Stichrunde · Spiele-Plattform

Stichrunde ist der Kartenspielraum für eine Freundesgruppe. Xeri ist lokal gegen den Computer spielbar. Mit dem Cloudflare-Worker kommen Xeri online, ab6super6, Benutzerkonten, Freundschaften, Einladungen und private Lobby-Chats hinzu. Lügen zeigt „Mach ich bald“. MindSync ist im Katalog vorgemerkt.

## Lokal starten

Node.js 24 und npm werden empfohlen. Der Mindeststand ist Node.js 22.12.

```sh
npm ci
npm run dev
```

Vite zeigt die lokale Adresse mit dem Pfad `/Spiele-Plattform/` an. Die Geräteeinstellungen für Sound und Animation bleiben nach dem Neuladen erhalten. Die aktuelle Solo-Partie gilt für die geöffnete Tischansicht.

## Lokal mit Online-Funktionen starten

Starte das Backend und das Frontend in zwei Terminals. Die folgenden Variablen gelten für diese lokale Entwicklungsinstanz.

```sh
npm run dev:api -- --port 8787 --var APP_URL:http://localhost:5173/Spiele-Plattform/ --var REQUIRE_INVITE:false
```

```sh
VITE_API_URL=http://127.0.0.1:8787 npm run dev -- --port 5173 --strictPort
```

Öffne [die lokale Plattform](http://localhost:5173/Spiele-Plattform/) und erstelle ein Konto. Ein privates Fenster bietet eine getrennte zweite Sitzung. In Produktion ist ein eigenes Worker-Secret für die Registrierung vorgesehen.

## Prüfen

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:online
```

`npm test` führt die Originalregressionen von Xeri und die Regeltests für ab6super6 aus. `npm run test:e2e` prüft den lokalen Produktionsbuild in Desktop- und mobilen Chromium-Ansichten. `npm run test:online` startet Vite und einen lokalen Cloudflare-Worker mit getrennten Browserprofilen. Mit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` lässt sich eine installierte Chromium-Binärdatei auswählen.

## GitHub Pages

Der Workflow baut, testet und veröffentlicht den Produktionsbuild von `main` über GitHub Pages. Dazu muss in **Settings → Pages** die Quelle **GitHub Actions** ausgewählt sein. Die öffentliche Worker-Adresse wird als Repository-Variable `VITE_API_URL` eingebunden. Interne Ansichten verwenden URL-Fragmente, damit sie beim Neuladen dieselbe Einstiegsdatei nutzen. Nach erfolgreicher Zwischenspeicherung kann Xeri offline starten. [Pages-Einstellungen](https://github.com/GTheCreator1/Spiele-Plattform/settings/pages)

## Projektstand

- [Entwicklungsbericht und offene Abnahme](docs/entwicklungsstand.md)
- [Architektur und übernommene Xeri-Komponenten](docs/architektur.md)
- [Cloudflare-Free-Tier und Einrichtung](docs/backend-entscheidung.md)
- [ab6super6-Hausregeln](docs/ab6super6-regeln.md)
- [MindSync-Spezifikationsstand](docs/mindsync-regeln.md)

Die Titelbilder sind für Stichrunde erstellt. DM Sans wird lokal geladen. Die [SIL Open Font License](src/assets/dm-sans-OFL.txt) liegt bei der Schrift.
