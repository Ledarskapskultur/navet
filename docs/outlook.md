# Koppla Outlook (kalender och flaggade mail) till Navet

Navet läser din Outlook-kalender och dina flaggade mail via Microsoft Graph. Det är
**läsbehörighet** – Navet ändrar ingenting i Outlook.

## 1. Registrera Navet i Microsoft Entra (en gång, ca 10 min)

Logga in på **https://entra.microsoft.com** med ditt administratörskonto.

1. **Applications → App registrations → New registration**
   - Name: `Navet`
   - Supported account types: **Accounts in this organizational directory only** (single tenant)
   - Redirect URI: välj **Web** och skriv
     `https://navet-orcin.vercel.app/api/auth/microsoft/callback`
   - Klicka **Register**.
2. På översiktssidan, kopiera:
   - **Application (client) ID**
   - **Directory (tenant) ID**
3. **Certificates & secrets → Client secrets → New client secret**
   - Beskrivning `Navet`, giltighet 24 månader → **Add**
   - Kopiera **Value** direkt (visas bara en gång). *Inte* "Secret ID".
4. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, bocka i:
   `offline_access`, `User.Read`, `Calendars.Read`, `Mail.Read` → **Add permissions**.
   Klicka sedan **Grant admin consent for …** → **Yes**.

## 2. Lägg in värdena i Vercel

Vercel → projektet **navet** → **Settings → Environment Variables**:

| Key | Value |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Client secret **Value** |
| `MICROSOFT_TENANT_ID` | Directory (tenant) ID |
| `SESSION_SECRET` | En lång slumpmässig text (minst 32 tecken) – krypterar kopplingen |
| `APP_URL` | `https://navet-orcin.vercel.app` |

Gör sedan **Deployments → ⋯ → Redeploy**.

## 3. Koppla

Navet → **Inställningar → Kopplingar → Koppla Outlook** → logga in med ditt Microsoft-konto.
Du kommer tillbaka till Kalendern, som nu visar dina riktiga möten. Kopplingen sparas på
servern, så den gäller på både telefon och dator.

## Bra att veta

- **Mail att hantera** visar mail du flaggat i Outlook. Ta bort flaggan i Outlook när
  mailet är hanterat, så försvinner det från Navet.
- Klientsecreten går ut efter den tid du valde (t.ex. 24 månader). Skapa då en ny i Entra,
  byt `MICROSOFT_CLIENT_SECRET` i Vercel och gör Redeploy.
- Koppla från: **Inställningar → Koppla från Outlook**. Vill du återkalla helt: ta bort
  appen under *Enterprise applications* i Entra.
