# Donderdag — Website

Dit is de website/app om aanwezigheid en hosts bij te houden voor de donderdagborrel.

## Stack
- Node.js + Express
- SQLite (lokaal bestand)
- Sessies met `express-session`
- E-mail via `nodemailer`

## Snel starten (lokaal)

```bash
# 1) Installeren
npm install

# 2) Zet je env-variabelen
cp .env.example .env
# Pas de waarden aan in .env (sterk wachtwoord, enz.)

# 3) Runnen
npm start
# App draait op http://localhost:3000
```

De database wordt standaard opgeslagen in `./.data/data.db` (wordt automatisch aangemaakt).

## Deploy naar GitHub

1. Maak een nieuwe lege GitHub-repo.
2. Voeg deze code toe als Git-repo en push:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<jouw-naam>/<jouw-repo>.git
   git push -u origin main
   ```

## Deploy naar Render

Deze repo bevat een `render.yaml` voor één-klik deploy via **Render Blueprints**.

### Stappen
1. Push deze code naar GitHub.
2. Ga naar Render → **New** → **Blueprint** en kies je GitHub-repo.
3. Vul de **Environment Variables** in op basis van `.env.example`.
4. Render maakt een **Web Service** aan met:
   - Build: `npm install`
   - Start: `npm start`
   - Persistent Disk op `/.data` (gemount op `/opt/render/project/src/.data`) voor SQLite.

> **Let op:** `/.data` staat in `.gitignore` en komt **niet** mee in GitHub. Render maakt deze map aan op de schijf.

### Vereiste variabelen
- `SESSION_SECRET` — sterk geheim voor sessies
- `ADMIN_USERNAME` — admin-login
- `ADMIN_PASSWORD` — admin-wachtwoord
- `NODE_ENV=production`

### Poort
Render levert de poort via `PORT`. De app gebruikt automatisch `process.env.PORT || 3000`.

## Mappenstructuur

- `server.js` — Express server + API + auth + SQLite
- `index.html`, `statistieken.html`, `style.css`, assets — front-end
- `.env.example` — voorbeeld van benodigde variabelen
- `/.data/` — **niet in Git**; bevat `data.db` op productie (Render) en lokaal

## Veiligheid
- Gebruik altijd een **sterk** `SESSION_SECRET` in productie.
- Houd `.env` uit Git (staat in `.gitignore`).
- Gebruik Render **Environment Variables** i.p.v. een `.env`-bestand op productie.

## Licentie
Kies zelf een licentie (bijv. MIT) en voeg `LICENSE` toe indien gewenst.


### Database op Render (test-only)
- Op Render gebruikt de app **in-memory SQLite** (`:memory:`). Er wordt **geen** data bewaard tussen deploys/restarts.
- Lokaal blijft SQLite schrijven naar `./.data/data.db` (staat in `.gitignore`).
