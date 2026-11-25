# MindSync · Spezifikationsstand

Die gewünschte Fassung orientiert sich an einem kooperativen Zahlenkartenspiel mit zwei bis vier Personen. Jede Person kennt ihre eigene Hand. Alle legen die jeweils niedrigste eigene Karte gemeinsam aufsteigend ab. Ein Fehler kostet ein gemeinsames Leben und entfernt übersprungene niedrigere Karten. Ein einstimmiger Impuls legt je eine niedrigste Karte offen zur Seite. Während aktiver Level sind Kartensignale und freier Chat gesperrt.

| Spieler | Gewünschte Level | Startleben | Startimpulse |
| --- | ---: | ---: | ---: |
| 2 | 12 | 2 | 1 |
| 3 | 10 | 3 | 1 |
| 4 | 8 | 4 | 1 |

Die gewünschte Fassung verwendet 100 Zahlenkarten von 1 bis 100. Die Handkartenzahl entspricht der Levelnummer. Eine erfolgreich abgeschlossene Stufe 2, 5 oder 8 gibt einen Impuls. Stufe 3, 6 oder 9 gibt ein Leben. Die Höchstwerte sind fünf Leben und drei Impulse. Es zählen die tatsächlich erreichten Stufen der jeweiligen Spieleranzahl.

Die Regeln oben halten die bestätigten Entscheidungen fest. Die Produktseite des Nürnberger Spielkarten-Verlags dient als Referenz für das gewünschte Vorbild. [NSV · Produkt und Anleitung](https://www.nsv.de/infocenter/the-mind-original/)

## Schutzrechtsprüfung vom 25. November 2026

- **Spielidee und Regeln.** Aufsteigendes Ablegen, private Karten und funktionale Spielregeln sind für sich genommen üblicherweise frei. § 2 Abs. 2 UrhG setzt eine persönliche geistige Schöpfung voraus. Das LG Köln hat bei einem Videospiel geprüft, ob eine solche Schöpfung in der Auswahl oder Anordnung der Elemente liegt. Die Entscheidung betraf ein anderes Spiel. Für die bestätigten Zahlenwerte und die abstrakte Spielmechanik von MindSync ergibt sich daraus kein konkretes rechtliches Verbot. [§ 2 UrhG](https://www.gesetze-im-internet.de/urhg/__2.html) · [LG Köln, 14 O 441/23](https://nrwe.justiz.nrw.de/lgs/koeln/lg_koeln/j2024/14_O_441_23_Urteil_20240111.html)
- **Karten, Regeltexte und Code.** Konkrete Originalillustrationen, grafisch geprägte Karten, individuell formulierte Anleitungstexte und Originalcode kommen bei erreichter Schöpfungshöhe als geschützte Inhalte in Betracht. Für Programmcode unterscheidet § 69a Abs. 2 UrhG die Ausdrucksform von zugrunde liegenden Ideen. Die Kartenvorschau verwendet eigene Formen, Farben, Texte und Code. [§ 2 UrhG](https://www.gesetze-im-internet.de/urhg/__2.html) · [§ 69a UrhG](https://www.gesetze-im-internet.de/urhg/__69a.html)
- **Produktdarstellung.** Bei einem geschäftlichen Angebot kann § 4 Nr. 3 UWG relevant werden, wenn eine Nachahmung über die Herkunft täuscht oder die Wertschätzung des Originals unangemessen ausnutzt. Eine Darstellung als offizielle Ausgabe oder eine übernommene Aufmachung wären dafür konkrete Prüfpunkte. [§ 4 UWG](https://www.gesetze-im-internet.de/uwg_2004/__4.html)
- **Name MindSync.** Im Google Play Store wird bereits ein digitales Rätselspiel unter „MindSync Game“ angeboten. Das ist ein konkreter Hinweis auf mögliche Verwechslung beim Spieltitel. §§ 5 und 15 MarkenG betreffen unter anderem Werktitel und verwechslungsfähige Bezeichnungen im geschäftlichen Verkehr. Das Store-Angebot belegt die Verwendung des Namens. Priorität, Schutzgebiet und Verwechslungsgefahr sind damit offen. Eine vollständige Ähnlichkeitsrecherche in den deutschen, europäischen und internationalen Registern liegt nicht vor. [Store-Eintrag](https://play.google.com/store/apps/details?id=com.swabivision.mindsync) · [§ 5 MarkenG](https://www.gesetze-im-internet.de/markeng/__5.html) · [§ 15 MarkenG](https://www.gesetze-im-internet.de/markeng/__15.html) · [DPMA-Recherchehinweise](https://www.dpma.de/recherchieren/schutzrechte-recherchieren/marken-recherchieren)

## Entwicklungsstand

Die Detailseite zeigt eigene Kartenvorderseiten, eine Rückseite und eine kurze Austeilanimation mit Unterstützung für reduzierte Bewegung. Die Rückseite erhält in der Komponente keinen Zahlenwert.

Der Produktionsbuild, 43 Regel- und Integrationstests, 11 Chromium-Browsertests und vier lokale WebRTC-Szenarien sind grün. Die neuen Browsertests prüfen die Vorschau auf Desktop und im Mobilformat. Die WebRTC-Szenarien prüfen Xeri und ab6super6 über den lokalen Relay.

MindSync bleibt im Katalog „In Entwicklung“. Der gewünschte vollständige spielmechanische Nachbau des bestehenden Spiels wurde nicht umgesetzt. Die bestätigte Spezifikation hat sich nicht geändert. GitHub Pages wird durch den Entwicklungsbranch nicht ausgelöst.
