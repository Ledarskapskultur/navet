# Navet med Tasker – röst även när telefonen är låst

Android låter inga appar öppnas från en låst telefon, inte heller Navet. Tasker kan däremot
köra i bakgrunden: det lyssnar på dig, skickar det du säger till Navet och läser upp svaret.
Navet behöver aldrig öppnas.

## 1. Skapa en nyckel (en gång)

1. Hitta på en lång slumpmässig nyckel, t.ex. 30–40 tecken från en lösenordsgenerator.
2. Vercel → projektet **navet** → **Settings → Environment Variables** → lägg till
   `NAVET_API_TOKEN` = nyckeln. Spara och gör **Redeploy**.

Nyckeln ger tillgång till Navet – lägg den bara i Tasker, dela den inte.

## 2. Tasker-uppgift: ”Navet röst”

Tasker → fliken **Tasks** → **+** → namn `Navet röst`. Lägg till tre åtgärder:

**A1 – Input → Get Voice**
- Prompt: `Navet lyssnar`
- Language: `sv-SE`
- Language Model: Free Form
- Resultatet hamnar i `%gv_heard` (i äldre Tasker-versioner `%VOICE`)

**A2 – Net → HTTP Request**
- Method: `POST`
- URL: `https://navet-orcin.vercel.app/api/assistant?format=text`
- Headers (en per rad):
  ```
  Authorization:Bearer DIN-NYCKEL
  Content-Type:text/plain
  ```
- Body: `%gv_heard`
- Timeout: `30`

**A3 – Alert → Say**
- Text: `%http_data`
- Language: svenska (sv)

Tryck på ▶ för att testa. Säg t.ex. *”Vad har jag idag?”* eller *”Ring Johan på torsdag”*.

## 3. Starta uppgiften när telefonen är låst

Välj det som passar dig – prova att det fungerar med låst skärm på just din telefon:

- **Snabbinställningsruta (rekommenderas):** lägg till åtgärden *Tasker → Quick Setting Tile*
  i en egen uppgift för att skapa en ruta som kör `Navet röst`. Dra sedan ner
  snabbinställningarna och lägg till rutan. På låst skärm: dra ner och tryck på rutan.
- **Skaka telefonen:** profil *Event → Sensor → Shake* → uppgift `Navet röst`.
- **I bilen:** profil *State → Net → BT Connected* (bilens Bluetooth) → uppgift `Navet röst`.

## Det här kan du säga

| Du säger | Navet |
|---|---|
| Vad har jag idag / imorgon / i veckan? | Läser upp dina saker |
| Vad är försenat? | Läser upp det som är försenat |
| Vilka förfrågningar har jag? | Nya och besvarade förfrågningar |
| Vad väntar jag på? / Vad har jag lovat (Martin)? | Väntar på / åtaganden |
| Vad händer i UGL? | Allt aktivt i projektet |
| Markera ring Johan som klar | Bockar av |
| Allt annat, t.ex. ”Ring Johan på torsdag” | Sparas i inkorgen |

## Teknisk referens

`POST /api/assistant` med `Authorization: Bearer <NAVET_API_TOKEN>`.
Body: ren text, eller JSON `{"text": "…"}`. Svar: JSON `{ "kind", "speech", … }`, eller bara
meningen att läsa upp med `?format=text`. Fungerar även när Navet är lösenordsskyddat –
nyckeln är den enda inloggningen.
