# Melonenclips – Anleitung

Melonenclips ist ein Video-Editor als Windows-Programm mit Launcher.
**Updates veröffentlichst du mit ein paar Klicks direkt im Launcher** – deine Freunde klicken
in ihrem Launcher nur noch auf **UPDATEN**.

GitHub dient dabei nur als kostenloser Speicherplatz für die Updates. Die Einrichtung machst du **einmal**.

---

## 1. Einmalige Einrichtung (ca. 15 Minuten)

### a) GitHub-Konto und Repository
1. Konto erstellen: https://github.com/signup
2. Neues Repository: https://github.com/new
   - Name: `melonenclips`
   - **Public** auswählen (sonst finden die Launcher keine Updates)
   - **Create repository**
3. Auf **„uploading an existing file“** klicken, den Inhalt des entpackten Ordners `Melonenclips`
   komplett hineinziehen (Strg+A im Ordner) und **Commit changes** klicken.
   - Der Ordner `.github` muss dabei sein. Unsichtbar? Explorer → **Ansicht → Einblenden → Ausgeblendete Elemente**.
4. Reiter **Actions** öffnen und warten, bis der Bau grün ist (5–10 Minuten).
5. Unter **Releases** (rechts auf der Repository-Seite) liegt jetzt `Melonenclips-Setup-1.0.0.exe`.
   Installiere sie selbst.

### b) Den „Veröffentlichen“-Knopf freischalten
1. Token erstellen: https://github.com/settings/personal-access-tokens/new
   - Name: `Melonenclips`
   - Ablaufdatum: z. B. 1 Jahr
   - **Repository access → Only select repositories →** `melonenclips`
   - **Permissions → Repository permissions → Contents → Read and write**
   - **Generate token** und den Token kopieren (beginnt mit `github_pat_`).
2. Launcher öffnen und **Strg + Umschalt + P** drücken.
3. Repository eintragen (`DeinName/melonenclips`), Token einfügen, **Speichern**.
   Ab jetzt hast **nur du** oben im Launcher den Knopf **🚀 Update veröffentlichen**.
   Der Token bleibt verschlüsselt auf deinem PC.

## 2. Freunde einladen

Schick ihnen den Link (die Setup-Datei ist größer als das Discord-Limit von 10 MB):

```
https://github.com/DeinName/melonenclips/releases/latest
```

Einmal installieren, danach immer den **Melonenclips Launcher** öffnen.

> Windows-Warnung „Der Computer wurde durch Windows geschützt“: **Weitere Informationen → Trotzdem ausführen**.
> Das kommt bei Programmen ohne kostenpflichtiges Zertifikat.

## 3. Ein Update veröffentlichen (jedes Mal, ca. 1 Minute)

1. Launcher öffnen → **🚀 Update veröffentlichen**
2. **Datei wählen …** → die neue `index.html` auswählen
3. Versionsnummer steht schon drin (wird automatisch hochgezählt)
4. Bei **„Was ist neu?“** kurz reinschreiben, was sich geändert hat
5. **🚀 Veröffentlichen** – fertig.

Deine Freunde sehen beim nächsten Öffnen des Launchers **„Update auf Version … verfügbar“**,
klicken auf **UPDATEN** – nach ein paar Sekunden ist es installiert. Kein Neuinstallieren, keine Windows-Warnung.

### Programm-Updates (selten)
Nur wenn sich das Programm selbst (Launcher, Fenster usw.) ändert, setzt du beim Veröffentlichen
den Haken **„Auch das Programm (.exe) neu bauen“**. GitHub baut dann in 5–10 Minuten eine neue .exe,
und die Launcher bieten das Programm-Update automatisch an.

## 4. Wenn ein Freund einen Fehler hat

Er klickt im Launcher auf **📋 Fehlerprotokoll kopieren** (oder im Editor oben auf **Fehler melden**)
und fügt es in Discord ein (Strg+V) – zusammen mit einer kurzen Beschreibung, was er gemacht hat.

## Ordner im Projekt

| Ordner / Datei | Inhalt |
|---|---|
| `content/` | die aktuelle Editor-Version, die die Launcher herunterladen (wird vom Veröffentlichen-Knopf gepflegt) |
| `app/` | der Editor, der mit der .exe mitinstalliert wird |
| `launcher/` | der Launcher |
| `electron/` | das Windows-Programm drumherum |
| `build/icon.png` | das App-Symbol |
| `.github/workflows/` | Bauanleitung für die .exe |
| `package.json` | Programmname und Programmversion |

## Selbst am PC testen (optional)

Node.js installieren (https://nodejs.org), dann im Ordner:

```
npm install
npm start
```
