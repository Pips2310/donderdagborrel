# Donderdag — Website_ready_v2

Deze repo bevat een Node.js/Express-app met een SQLite database (`data.db`) en een statische front-end (`index.html`, `style.css`, `script.js`).

## Lokale ontwikkeling

1. **Vereisten**: Node 18+
2. **Installeer dependencies**
   ```bash
   npm install
   ```
3. **(Optioneel) maak een `.env` aan** met waarden voor de onderstaande variabelen (alleen als je ze gebruikt in `server.js`): `ADMIN_PASSWORD, ADMIN_USERNAME, NODE_ENV, PORT, SESSION_SECRET`
4. **Start de server**
   ```bash
   npm start
   ```
5. De app draait op `http://localhost:3000` (of de `PORT` in je `.env`).

> Let op: `server.js` maakt zelf de SQLite-tabellen aan als ze nog niet bestaan. Commit de `data.db` **niet** verder; die is genegeerd in `.gitignore`.

## Klaarmaken voor GitHub

1. Maak een nieuwe GitHub-repo (privé of publiek).
2. Koppel en push:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Website_ready_v2"
   git branch -M main
   git remote add origin <jouw-repo-url>
   git push -u origin main
   ```

## Deployen op Render

We leveren een `render.yaml` mee zodat Render de service automatisch kan aanmaken.

### Data-persistentie
De app gebruikt SQLite (`data.db`). Op Render is het filesystem **niet persistent**; daarom mounten we een **Disk** op `/data` en linken die naar `./data.db` zodat je data blijft bestaan tussen deploys.

### Stappen

1. Push deze code naar GitHub.
2. Ga naar [Render](https://render.com), kies **New +** → **Blueprint** en selecteer je repo (met `render.yaml`).
3. Controleer de service-instellingen en klik **Apply**.

### Omgevingsvariabelen
Als `server.js` environment variables verwacht, stel die in onder **Environment** → **Environment Variables** (Render dashboard). Gedetecteerd in de code: `ADMIN_PASSWORD, ADMIN_USERNAME, NODE_ENV, PORT, SESSION_SECRET`.

---

## Structuur

```
Website_ready_v2/
├── index.html
├── style.css
├── script.js
├── admin.html
├── settings.html
├── reset-password.html
├── statistieken.html
├── server.js
├── package.json
└── data.db   # genegeerd door .gitignore (gebruik Render Disk)
```

## Veelvoorkomende issues

- **Port binding**: Render verwacht dat je luistert op `process.env.PORT`. In `server.js` is dit al zo.
- **CORS**: Zet eventueel `CORS_ORIGIN` (of pas de CORS-config aan in `server.js`). 
- **Email/Nodemailer**: Als je mail verstuurt, zet SMTP-waardes via environment variables.
