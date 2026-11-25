# THESLIBBI

## Spielbare Sortierrunde

Zwei bis vier Personen erhalten jeweils vier private Karten aus dem Zahlenbereich 1 bis 100. Alle Kartenwerte sind unterschiedlich. Das Team startet mit einem gemeinsamen Leben pro Person.

Jede Person entscheidet selbst, wann sie ihre kleinste Handkarte ausspielt. Der Host prüft den Zug gegen die kleinste noch gehaltene Karte am Tisch. Passt die Zahl, wandert sie auf die gemeinsame Ablage. Bei einem Fehlversuch verliert das Team ein Leben. Die Karte bleibt verdeckt auf der Hand und kann später richtig ausgespielt werden. Das Team gewinnt, wenn alle Karten aufsteigend abgelegt sind. Bei null Leben endet die Partie mit einer Niederlage. Aus dem Ergebnis führt „Zurück zur Lobby“ zu einer neuen Runde mit frischer Austeilung.

Während des Spiels pausiert der Raumchat. Wenn eine Verbindung ausfällt, pausieren die Züge bis zur Rückkehr. Jeder akzeptierte Zug erhöht den Spielstand um eine Version. Bei gleichzeitig eintreffenden Eingaben gilt die Reihenfolge beim Host. Eine Eingabe für einen überholten Spielstand lässt sich nach der Aktualisierung wiederholen und kostet kein Leben. Ein erneut gesendeter, bereits bestätigter Zug wirkt nur einmal.

## Online-Lobby

Auf der Detailseite und unter „Spielraum“ lässt sich eine THESLIBBI-Lobby für zwei, drei oder vier Personen öffnen. Die Runde tritt über einen privaten Link mit Spitznamen bei. Sitzbelegung, Bereitschaft und Lobbychat werden per PeerJS/WebRTC synchronisiert. Ein Gast kann nach einem Verbindungsabbruch im selben Tab auf seinen Platz zurückkehren, solange der Host-Tab geöffnet bleibt und der Platz reserviert ist.

Der Link allein berechtigt zum Beitritt auf einen freien Sitz. Der Raum und seine Chatnachrichten liegen im Arbeitsspeicher des Hosts. Der Gast-Tab merkt sich Spitznamen und Wiedereinstiegskennung im Sitzungsspeicher. Der Host-Browser verarbeitet alle Karten. Jede Spielansicht enthält nur die eigene Hand, die Kartenanzahl der übrigen Sitze und die öffentliche Ablage.

Alle Personen tragen kryptografischen Zufall zur Austeilung bei. Nach einem Sieg können die Browser den Spielverlauf nachrechnen. Bei einer Niederlage bleiben die Zufallsbeiträge und das vollständige Zugprotokoll privat, da sich daraus die noch verdeckten Karten rekonstruieren ließen. [Einladungen und Vertrauensmodell](backend-entscheidung.md#einladungen-und-daten)

## Dokumentierte Wünsche für die Kampagne

Die folgende Levelstaffel, ihre Belohnungen, der einstimmige Impuls und das Entfernen übersprungener Karten gehören zur gewünschten Nachbildung des Originalablaufs. Die Regeln sind hier dokumentiert. Sie sind kein Bestandteil der spielbaren Sortierrunde.

| Personen | Level | Startleben | Startimpulse |
| --- | ---: | ---: | ---: |
| 2 | 12 | 2 | 1 |
| 3 | 10 | 3 | 1 |
| 4 | 8 | 4 | 1 |

Der Wunschstand sieht 100 unterschiedliche Zahlenkarten von 1 bis 100 vor. Pro Level wird neu und kryptografisch sicher gemischt. Jede Person erhält so viele Karten wie die Levelnummer und sieht nur die eigene Hand. Jede entscheidet selbst über den Zeitpunkt, an dem sie ihre niedrigste Handkarte offen spielt. Das Team legt gemeinsam aufsteigend ab. Es gibt keine Zugfolge. Absprachen über Kartenwerte und geheime Signale sind unzulässig. Während aktiver Level ist der Chat gesperrt.

Ein zu frühes Ausspielen kostet ein gemeinsames Leben. Alle noch gehaltenen Karten mit niedrigerem Wert als die ausgespielte Karte werden abgelegt. Bei null Leben endet die Partie. Ein einstimmig angenommener Impuls verbraucht einen gemeinsamen Impuls. Jede Person, die noch Karten hält, legt daraufhin ihre niedrigste Handkarte offen ab. Für die erfolgreich abgeschlossenen Level 2, 5 und 8 gibt es je einen Impuls, für die Level 3, 6 und 9 je ein Leben. Es gelten die Höchstwerte fünf Leben und drei Impulse. Die Partie endet nach dem letzten Level der jeweiligen Gruppengröße. [NSV · Referenz zum gewünschten Spielablauf](https://www.nsv.de/infocenter/the-mind-original/)

## Schutzrechtsprüfung für den privaten Einsatz am 25. November 2026

- **Regeln und Gestaltung.** Aufsteigendes Ablegen und private Hände sind funktionale Spielideen. Schutz nach § 2 UrhG setzt eine persönliche geistige Schöpfung voraus. Das LG Köln hat bei einem anderen Spiel erläutert, dass eine konkrete schöpferische Auswahl oder Anordnung von Spielelementen im Einzelfall schutzfähig sein kann. Auch konkrete Illustrationen und Regeltexte können geschützt sein. § 69a UrhG erfasst die Ausdrucksformen eines Computerprogramms und nimmt zugrunde liegende Ideen und Grundsätze aus. Die Lobby und die Kartenansicht verwenden eigens für Stichrunde erstellte Oberflächen, Motive und Texte. [§ 2 UrhG](https://www.gesetze-im-internet.de/urhg/__2.html) · [§ 69a UrhG](https://www.gesetze-im-internet.de/urhg/__69a.html) · [LG Köln, 14 O 441/23](https://nrwe.justiz.nrw.de/lgs/koeln/lg_koeln/j2024/14_O_441_23_Urteil_20240111.html)
- **Einladung im Freundeskreis.** Persönliche Beziehungen sind nach § 15 Abs. 3 UrhG bei der Frage der Öffentlichkeit relevant. Die Weitergabe der Links innerhalb einer persönlich verbundenen Runde spricht für eine private Nutzung. Eine künftig frei abrufbare Pages-Website wäre öffentlich zugänglich, auch wenn ihre Spielräume einen Link erfordern. [§ 15 UrhG](https://www.gesetze-im-internet.de/urhg/__15.html) · [§ 19a UrhG](https://www.gesetze-im-internet.de/urhg/__19a.html)
- **Geschäftlicher Verkehr.** Der beschriebene Eigengebrauch ohne Werbung, Käufe und Vermarktung spricht gegen eine Nutzung im geschäftlichen Verkehr im Sinne von §§ 14 und 15 MarkenG. Der wettbewerbsrechtliche Nachahmungsschutz nach § 4 Nr. 3 UWG knüpft an das Angebot im Wettbewerb an. [§ 14 MarkenG](https://www.gesetze-im-internet.de/markeng/__14.html) · [§ 15 MarkenG](https://www.gesetze-im-internet.de/markeng/__15.html) · [§ 2 UWG](https://www.gesetze-im-internet.de/uwg_2004/__2.html) · [§ 4 UWG](https://www.gesetze-im-internet.de/uwg_2004/__4.html)
- **Name THESLIBBI.** Die Websuche nach der exakten Schreibweise ergab keinen Treffer. Eine vollständige Identitäts- und Ähnlichkeitsrecherche in DPMAregister und den europäischen und internationalen Registern steht aus. Der Name ist ein Arbeitstitel. [DPMA · Marken recherchieren](https://www.dpma.de/recherchieren/schutzrechte-recherchieren/marken-recherchieren)

Für die private Nutzung und eigenständige Gestaltung hat die Recherche kein konkretes entgegenstehendes Schutzrecht ergeben. Auch aus der Ähnlichkeit abstrakter Mechaniken allein ergibt sich hier kein konkretes Verbot.
