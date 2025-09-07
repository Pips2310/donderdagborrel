// versie 1.1 - gefixt
require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt'); // Import bcrypt
const nodemailer = require('nodemailer'); // Import nodemailer

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: 'http://localhost:5500', // Allow requests from your frontend development server
    credentials: true // Crucial for sending cookies (sessions)
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Serve statische bestanden uit de projectroot
app.use(express.static(path.join(__dirname)));


// Sessie-configuratie
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_for_dev_ONLY', // Use environment variable!
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in production (HTTPS), false in development (HTTP)
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Database initialiseren
const db = new sqlite3.Database('./data.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

db.serialize(() => {
    // Aanwezigheid table with UNIQUE constraint
    db.run(`CREATE TABLE IF NOT EXISTS aanwezigheid (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gebruikersnaam TEXT NOT NULL,
        datum TEXT NOT NULL,
        UNIQUE(gebruikersnaam, datum)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS hosts (
        datum TEXT PRIMARY KEY,
        host TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user' NOT NULL,
        last_login TEXT DEFAULT NULL,
        reset_token TEXT DEFAULT NULL,
        reset_token_expires TEXT DEFAULT NULL,
        is_blocked INTEGER DEFAULT 0 NOT NULL
    )`);

    // Add last_login // reset / is_blocked kolommen als ze ontbreken
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error("Error checking users table info:", err);
            return;
        }
        const hasLastLogin = columns.some(col => col.name === 'last_login');
        if (!hasLastLogin) {
            db.run("ALTER TABLE users ADD COLUMN last_login TEXT DEFAULT NULL", (err) => {
                if (err) console.error("Error adding last_login column to users table:", err);
                else console.log("Added 'last_login' column to 'users' table.");
            });
        }
        const hasResetToken = columns.some(col => col.name === 'reset_token');
        const hasResetTokenExpires = columns.some(col => col.name === 'reset_token_expires');
        if (!hasResetToken) {
            db.run("ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT NULL", (err) => {
                if (err) console.error("Error adding reset_token column to users table:", err);
                else console.log("Added 'reset_token' column to 'users' table.");
            });
        }
        if (!hasResetTokenExpires) {
            db.run("ALTER TABLE users ADD COLUMN reset_token_expires TEXT DEFAULT NULL", (err) => {
                if (err) console.error("Error adding reset_token_expires column to users table:", err);
                else console.log("Added 'reset_token_expires' column to 'users' table.");
            });
        }
        const hasIsBlocked = columns.some(col => col.name === 'is_blocked');
        if (!hasIsBlocked) {
            db.run("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0 NOT NULL", (err) => {
                if (err) console.error("Error adding is_blocked column to users table:", err);
                else console.log("Added 'is_blocked' column to 'users' table.");
            });
        }
    });

    // Optioneel: admin gebruiker
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'default_admin_password'; // Change in .env!
    const saltRounds = 10;

    db.get("SELECT * FROM users WHERE username = ?", [adminUsername], (err, row) => {
        if (err) {
            console.error("Error checking for admin user:", err);
            return;
        }
        if (!row) {
            bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
                if (err) {
                    console.error("Error hashing admin password:", err);
                    return;
                }
                db.run("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
                    [adminUsername, 'admin@example.com', hash, 'admin'],
                    (err) => {
                        if (err) {
                            console.error("Error inserting admin user:", err);
                        } else {
                            console.log(`Admin user '${adminUsername}' created successfully.`);
                        }
                    }
                );
            });
        } else {
            console.log(`Admin user '${adminUsername}' already exists.`);
        }
    });
});

// Nodemailer transporter (MailHog standaard)
const transporter = nodemailer.createTransport({
    host: "localhost",
    port: 1025,
    secure: false,
    ignoreTLS: true,
});

// Helpers
function generateToken() {
    return require('crypto').randomBytes(20).toString('hex');
}

// E-mail templates (Inter + informeel)
function emailBase({ title, bodyHtml }) {
    // Let op: webfonts worden niet overal ondersteund, maar we voegen Inter toe waar mogelijk
    return `
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <title>${title}</title>
  <style>
    body{margin:0;padding:0;background:#f6f8fb;font-family:'Inter',Arial,Helvetica,sans-serif;color:#111}
    .container{max-width:560px;margin:0 auto;padding:24px}
    .card{background:#ffffff;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,.06);padding:28px}
    h1{font-size:20px;line-height:1.2;margin:0 0 12px;font-weight:700;color:#1d72b8}
    p{font-size:14px;line-height:1.6;margin:0 0 14px}
    .btn{display:inline-block;padding:12px 18px;border-radius:10px;background:#1d72b8;color:#fff;text-decoration:none;font-weight:600}
    .muted{color:#667085;font-size:12px}
    .footer{margin-top:18px}
    .center{text-align:center}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      ${bodyHtml}
      <div class="footer muted">
        <p>Ciao,<br></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function resetMailHtml({ username, resetLink }) {
    const bodyHtml = `
      <p>Hoi <strong>${username}</strong>,</p>
      <p>Hier is de link om je wachtwoord opnieuw in te stellen:</p>
      <p class="center">
        <a class="btn" href="${resetLink}">Wachtwoord opnieuw instellen</a>
      </p>
      <p class="muted">De link blijft 1 uur geldig. Heb je dit niet zelf aangevraagd? Dan kun je deze mail gewoon weggooien.</p>
    `;
    return emailBase({ title: 'Wachtwoord opnieuw instellen', bodyHtml });
}

function passwordChangedMailHtml({ username, loginUrl }) {
    const bodyHtml = `
      <p>Hoi <strong>${username}</strong>,</p>
      <p>Top! Je wachtwoord is succesvol bijgewerkt.</p>
      <p class="center">
        <a class="btn" href="${loginUrl}">Naar inloggen</a>
      </p>
      <p class="muted">Was jij dit niet? Reset dan meteen je wachtwoord opnieuw.</p>
    `;
    return emailBase({ title: 'Je wachtwoord is gewijzigd', bodyHtml });
}

function welcomeMailHtml({ username, loginUrl }) {
    const bodyHtml = `
      <p>Hoi <strong>${username}</strong>,</p>
      <p>Top dat je er bent! <br>Je account is succesvol aangemaakt en je kunt nu inloggen om je aan te melden voor de donderdagborrrel en zien wie er nog meer komen.</p>
      <p class="center">
        <a class="btn" href="${loginUrl}">Naar inloggen</a>
      </p>
      <p class="muted">Veel plezier!</p>
    `;
    return emailBase({ title: 'Welkom bij de donderdagborrel', bodyHtml });
}

// Middleware for authorization

// Ensure the current session user is not blocked
function ensureNotBlocked(req, res, next) {
    if (!req.session || !req.session.userId) return next();
    db.get(`SELECT is_blocked FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
        if (err) {
            console.error('DB error checking block status:', err);
            return res.status(500).json({ message: 'Interne serverfout.' });
        }
        if (row && row.is_blocked) {
            req.session.destroy(() => {});
            return res.status(403).json({ message: 'Account is geblokkeerd.' });
        }
        next();
    });
}
function isAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn.' });
    }
    ensureNotBlocked(req, res, () => {
        if (req.session.role === 'admin') {
            next();
        } else {
            return res.status(403).json({ message: 'Toegang geweigerd: Onvoldoende rechten.' });
        }
    });
}
function isUser(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn.' });
    }
    ensureNotBlocked(req, res, next);
}

// --- Register endpoint ---
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Vul alle velden in.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
    }

    db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [username, email], async (err, row) => {
        if (err) {
            console.error('Database error during user check:', err);
            return res.status(500).json({ message: 'Registratie mislukt door een interne serverfout.' });
        }
        if (row) {
            if (row.username === username) return res.status(409).json({ message: 'Deze gebruikersnaam is al in gebruik.' });
            if (row.email === email) return res.status(409).json({ message: 'Dit e-mailadres is al in gebruik.' });
        }

        const saltRounds = 10;
        try {
            const hash = await bcrypt.hash(password, saltRounds);

            db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`, [username, email, hash, 'user'], function(insertErr) {
                if (insertErr) {
                    console.error('Error inserting new user:', insertErr);
                    return res.status(500).json({ message: 'Fout bij registratie.' });
                }

                // Stuur welkomstmail
                const loginUrl = '/index.html';
                const welcomeMail = {
                    from: 'Donderdagborrel <no-reply@donderdagborrel.nl>',
                    to: email,
                    subject: 'Welkom bij de donderdagborrel!',
                    html: welcomeMailHtml({ username, loginUrl })
                };

                transporter.sendMail(welcomeMail, (mailErr, info) => {
                    if (mailErr) {
                        console.error('Kon welkomstmail niet versturen:', mailErr);
                        // Fout loggen, maar de API-call slaagt wel
                    } else {
                        console.log('Welkomstmail verzonden:', info.messageId);
                    }
                });

                res.status(201).json({ message: 'Account succesvol aangemaakt.' });
            });
        } catch (hashError) {
            console.error('Error hashing password during registration:', hashError);
            res.status(500).json({ message: 'Fout bij verwerken wachtwoord.' });
        }
    });
});

// --- Login endpoint ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Gebruikersnaam/e-mailadres en wachtwoord zijn verplicht.' });
    }

    db.get(`SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)`, [username, username], (err, user) => {
        if (err) {
            console.error('DB error during login (fetching user):', err);
            return res.status(500).json({ message: 'Inloggen mislukt door een interne serverfout.' });
        }
        if (!user) {
            return res.status(401).json({ message: 'Ongeldige gebruikersnaam of wachtwoord.' });
        }

        if (user.is_blocked) {
            return res.status(403).json({ message: 'Dit account is geblokkeerd. Neem contact op met een beheerder.' });
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                console.error('Bcrypt error during password comparison:', err);
                return res.status(500).json({ message: 'Inloggen mislukt door een interne serverfout.' });
            }
            if (!result) { // Wachtwoord komt niet overeen
                return res.status(401).json({ message: 'Ongeldige gebruikersnaam of wachtwoord.' });
            }

            // Update last_login timestamp
            const now = new Date().toISOString();
            db.run(`UPDATE users SET last_login = ? WHERE id = ?`, [now, user.id], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating last_login:', updateErr);
                }
            });

            // Inloggen succesvol: sessievariabelen instellen
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;

            console.log('✓ Inloggen succesvol, sessie:', req.session);

            res.json({
                message: 'Succesvol ingelogd!',
                gebruikersnaam: user.username,
                role: user.role
            });
        });
    });
});

// --- Logout endpoint ---
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ message: 'Fout bij uitloggen.' });
        }
        res.clearCookie('connect.sid'); // Clear the session cookie from the client
        res.status(200).json({ message: 'Succesvol uitgelogd.' });
    });
});

// --- API endpoints ---

// Aanwezigheid registreren
app.post('/api/aanwezigheid', (req, res) => {
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn om aanwezigheid te registreren.' });
    }

    const { gebruikersnaam, datum } = req.body;

    if (!gebruikersnaam || !datum) {
        return res.status(400).json({ message: 'Gebruikersnaam en datum zijn verplicht.' });
    }

    if (req.session.role !== 'admin' && gebruikersnaam !== req.session.username) {
        return res.status(403).json({ message: 'Niet toegestaan om aanwezigheid voor een andere gebruiker te wijzigen.' });
    }

    db.run(
        `INSERT INTO aanwezigheid (gebruikersnaam, datum) VALUES (?, ?)`,
        [gebruikersnaam, datum],
        function(err) {
            if (err) {
                console.error('Error inserting attendance:', err);
                if (err.errno === 19 && err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ message: `${gebruikersnaam} is al aangemeld voor deze datum.` });
                }
                return res.status(500).json({ message: 'Fout bij opslaan aanwezigheid.' });
            }
            res.status(201).json({ message: 'Aanwezigheid opgeslagen.', id: this.lastID });
        }
    );
});

// Aanwezigheid verwijderen
app.delete('/api/aanwezigheid', (req, res) => {
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn om aanwezigheid te verwijderen.' });
    }

    const { gebruikersnaam, datum } = req.body;

    if (!gebruikersnaam || !datum) {
        return res.status(400).json({ message: 'Gebruikersnaam en datum zijn verplicht.' });
    }

    if (req.session.role !== 'admin' && gebruikersnaam !== req.session.username) {
        return res.status(403).json({ message: 'Niet toegestaan om aanwezigheid voor een andere gebruiker te wijzigen.' });
    }

    db.run(
        `DELETE FROM aanwezigheid WHERE gebruikersnaam = ? AND datum = ?`,
        [gebruikersnaam, datum],
        function(err) {
            if (err) {
                console.error('Error deleting attendance:', err);
                return res.status(500).json({ message: 'Fout bij verwijderen aanwezigheid.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Aanwezigheid niet gevonden (misschien al afgemeld?).' });
            }
            res.status(200).json({ message: 'Aanwezigheid verwijderd.' });
        }
    );
});

// Aanwezigen per datum
app.get('/api/aanwezigheid/datum/:datum', (req, res) => {
    const { datum } = req.params;
    db.all(
        `SELECT gebruikersnaam FROM aanwezigheid WHERE datum = ?`,
        [datum],
        (err, rows) => {
            if (err) {
                console.error('Error fetching attendance by date:', err);
                return res.status(500).json({ message: 'Fout bij ophalen aanwezigheden.' });
            }
            const namen = rows.map(r => r.gebruikersnaam);
            res.json(namen);
        }
    );
});

// Alle datums voor gebruiker
app.get('/api/aanwezigheid/gebruiker/:gebruikersnaam', (req, res) => {
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn.' });
    }
    if (req.session.username !== req.params.gebruikersnaam && req.session.role !== 'admin') {
        return res.status(403).json({ message: 'Niet toegestaan om aanwezigheid van een andere gebruiker op te halen.' });
    }

    const { gebruikersnaam } = req.params;
    db.all(
        `SELECT datum FROM aanwezigheid WHERE gebruikersnaam = ? ORDER BY datum ASC`,
        [gebruikersnaam],
        (err, rows) => {
            if (err) {
                console.error('Error fetching user attendance dates:', err);
                return res.status(500).json({ message: 'Fout bij ophalen aanwezigheid gebruiker.' });
            }
            const datums = rows.map(r => r.datum);
            res.json(datums);
        }
    );
});

// Stats helpers
app.get('/api/attendance/user/:user', (req, res) => {
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn.' });
    }

    const { user } = req.params;
    db.all(
        `SELECT datum FROM aanwezigheid WHERE gebruikersnaam = ? ORDER BY datum ASC`,
        [user],
        (err, rows) => {
            if (err) {
                console.error('Error fetching user attendance dates:', err);
                return res.status(500).json({ message: 'Fout bij ophalen aanwezigheid gebruiker.' });
            }
            const datums = rows.map(r => r.datum);
            res.json(datums);
        }
    );
});

// Host ophalen
app.get('/api/host/:datum', (req, res) => {
    const { datum } = req.params;
    db.get(`SELECT host FROM hosts WHERE datum = ?`, [datum], (err, row) => {
        if (err) {
            console.error('Error fetching host:', err);
            return res.status(500).json({ message: 'Fout bij ophalen host.' });
        }
        res.json({ host: row ? row.host : null });
    });
});

// Host verwijderen
app.delete('/api/host/:datum', (req, res) => {
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn.' });
    }
    const { datum } = req.params;
    const { host } = req.body;

    if (req.session.username !== host) {
        return res.status(403).json({ message: 'Toegang geweigerd: Alleen de host kan zichzelf afmelden.' });
    }

    db.run(
        `DELETE FROM hosts WHERE datum = ? AND host = ?`,
        [datum, host],
        function(err) {
            if (err) {
                console.error('Error deleting host:', err);
                return res.status(500).json({ message: 'Fout bij het verwijderen van de hoststatus.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Hoststatus niet gevonden.' });
            }
            res.status(200).json({ message: 'Hoststatus succesvol verwijderd.' });
        }
    );
});

// Host datums per gebruiker
app.get('/api/hosts/gebruiker/:gebruikersnaam', (req, res) => {
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Niet geautoriseerd: U moet ingelogd zijn.' });
    }

    const { gebruikersnaam } = req.params;
    db.all(
        `SELECT datum FROM hosts WHERE host = ? ORDER BY datum ASC`,
        [gebruikersnaam],
        (err, rows) => {
            if (err) {
                console.error('Error fetching user host dates:', err);
                return res.status(500).json({ message: 'Fout bij ophalen hostingdata gebruiker.' });
            }
            const datums = rows.map(r => r.datum);
            res.json(datums);
        }
    );
});

// Host toewijzen (ingelogde gebruiker)
app.post('/api/host', isUser, (req, res) => {
    const { datum } = req.body;
    const host = req.session.username;

    if (!datum) {
        return res.status(400).json({ message: 'Datum is verplicht.' });
    }

    db.run(
        `INSERT INTO hosts (datum, host)
         VALUES (?, ?)
         ON CONFLICT(datum) DO UPDATE SET host=excluded.host`,
        [datum, host],
        function(err) {
            if (err) {
                console.error('Error saving host to hosts table:', err);
                return res.status(500).json({ message: 'Fout bij opslaan host.' });
            }
            res.status(200).json({ message: 'Host succesvol opgeslagen.' });
        }
    );
});

// Host updaten (admin)
app.post('/api/host/update/:datum', isAdmin, (req, res) => {
    const { datum } = req.params;
    const { host } = req.body;

    if (typeof host !== 'string' || host.trim() === '') {
        return res.status(400).json({ message: 'Host naam mag niet leeg zijn.' });
    }

    const trimmedHost = host.trim();
    console.log(`Admin '${req.session.username}' wijzigt host voor datum ${datum} naar '${trimmedHost}'`);

    db.run(
        `INSERT INTO hosts (datum, host)
         VALUES (?, ?)
         ON CONFLICT(datum) DO UPDATE SET host=excluded.host`,
        [datum, trimmedHost],
        function(err) {
            if (err) {
                console.error('Error saving host to hosts table:', err);
                return res.status(500).json({ message: 'Fout bij opslaan host.' });
            }

            // Zorg dat de host ook als aanwezig staat
            db.run(
                `INSERT INTO aanwezigheid (gebruikersnaam, datum) VALUES (?, ?)
                 ON CONFLICT(gebruikersnaam, datum) DO NOTHING`,
                [trimmedHost, datum],
                (err) => {
                    if (err) {
                        console.error('Error adding host to attendance table:', err);
                    }
                    res.status(200).json({ message: 'Host succesvol opgeslagen en aanwezigheid bijgewerkt.' });
                }
            );
        }
    );
});

// Gebruikerslijst (admin)
app.get('/api/users', isAdmin, (req, res) => {
  db.all(
    `SELECT username, email, last_login, role, is_blocked FROM users`,
    (err, rows) => {
      if (err) {
        console.error('Error fetching all users:', err);
        return res
          .status(500)
          .json({ message: 'Fout bij ophalen gebruikerslijst.' });
      }
      return res.json(rows);
    }
  );
});

// Block a user
app.post('/api/users/:username/block', isAdmin, (req, res) => {
    const { username } = req.params;
    db.run(`UPDATE users SET is_blocked = 1 WHERE username = ?`, [username], function(err) {
        if (err) return res.status(500).json({ message: 'Fout bij blokkeren gebruiker.' });
        if (this.changes === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        return res.json({ message: `Gebruiker '${username}' is geblokkeerd.` });
    });
});

// Unblock a user
app.post('/api/users/:username/unblock', isAdmin, (req, res) => {
    const { username } = req.params;
    db.run(`UPDATE users SET is_blocked = 0 WHERE username = ?`, [username], function(err) {
        if (err) return res.status(500).json({ message: 'Fout bij deblokkeren gebruiker.' });
        if (this.changes === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        return res.json({ message: `Gebruiker '${username}' is gedeblokkeerd.` });
    });
});

// Unieke gebruikers (voor statistieken)
app.get('/api/users/list', (req, res) => {
    const sql = `
        SELECT username AS user FROM users
        UNION
        SELECT gebruikersnaam AS user FROM aanwezigheid
        UNION
        SELECT host AS user FROM hosts
        ORDER BY user ASC
    `;
    db.all(sql, (err, rows) => {
        if (err) {
            console.error('Error fetching list of unique users for statistics:', err);
            return res.status(500).json({ message: 'Fout bij ophalen gebruikerslijst voor statistieken.' });
        }
        const usernames = rows.map(row => row.user);
        console.log('Backend: All unique users for statistics:', usernames);
        res.json(usernames);
    });
});

// Aanwezigheid samenvatting
app.get('/api/attendance/summary', (req, res) => {
    const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    console.log(`Backend: Fetching attendance summary for dates between ${startOfYear} and ${today}`);
    const sql = `SELECT gebruikersnaam AS user, COUNT(*) AS count
                 FROM aanwezigheid
                 WHERE datum >= ? AND datum <= ?
                 GROUP BY gebruikersnaam
                 ORDER BY count DESC`;
    db.all(sql, [startOfYear, today], (err, rows) => {
        if (err) {
            console.error('Error fetching attendance summary:', err);
            return res.status(500).json({ message: 'Fout bij ophalen aanwezigheidsstatistieken.' });
        }
        console.log('Backend: Attendance summary rows:', rows);
        res.json(rows);
    });
});

// Hosts samenvatting
app.get('/api/hosts/summary', (req, res) => {
    const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    console.log(`Backend: Fetching hosts summary for dates between ${startOfYear} and ${today}`);
    const sql = `SELECT host AS user, COUNT(*) AS count
                 FROM hosts
                 WHERE datum >= ? AND datum <= ?
                 GROUP BY host
                 ORDER BY count DESC`;
    db.all(sql, [startOfYear, today], (err, rows) => {
        if (err) {
            console.error('Error fetching hosts summary:', err);
            return res.status(500).json({ message: 'Fout bij ophalen hostingstatistieken.' });
        }
        console.log('Backend: Hosts summary rows:', rows);
        res.json(rows);
    });
});

// Wachtwoord vergeten aanvraag (informeel + Inter)
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'E-mailadres is verplicht.' });
    }

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) {
            console.error('Database error during forgot-password:', err);
            return res.status(500).json({ message: 'Er is een interne serverfout opgetreden.' });
        }
        // Altijd zelfde antwoord om enumeratie te voorkomen
        const genericResponse = { message: 'Als het e-mailadres bekend is, is er een link voor het opnieuw instellen van het wachtwoord verzonden.' };
        if (!user) {
            return res.status(200).json(genericResponse);
        }

        const token = generateToken();
        const expires = Date.now() + 3600000; // 1 uur

        db.run(`UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`,
            [token, expires, user.id],
            (updateErr) => {
                if (updateErr) {
                    console.error('Error updating reset token:', updateErr);
                    return res.status(500).json({ message: 'Fout bij het genereren van de resetlink.' });
                }

                const resetLink = `/reset-password.html?token=${token}`;
                const mailOptions = {
                    from: 'Donderdagborrel <no-reply@donderdagborrel.nl>',
                    to: user.email,
                    subject: 'Wachtwoord opnieuw instellen',
                    html: resetMailHtml({ username: user.username, resetLink })
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending email:', error);
                        return res.status(500).json({ message: 'Fout bij het verzenden van de e-mail.' });
                    }
                    console.log('Reset e-mail verzonden:', info.messageId);
                    res.status(200).json(genericResponse);
                });
            }
        );
    });
});

// Wachtwoord opnieuw instellen + bevestigingsmail
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token en nieuw wachtwoord zijn verplicht.' });
    }

    db.get(`SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?`, [token, Date.now()], async (err, user) => {
        if (err) {
            console.error('Database error during reset-password (fetching user):', err);
            return res.status(500).json({ message: 'Er is een interne serverfout opgetreden.' });
        }
        if (!user) {
            return res.status(400).json({ message: 'Ongeldige of verlopen resetlink.' });
        }

        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            db.run(
                `UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?`,
                [hashedPassword, user.id],
                (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating password:', updateErr);
                        return res.status(500).json({ message: 'Fout bij het bijwerken van het wachtwoord.' });
                    }

                    // Verstuur bevestigingsmail (informeel + Inter)
                    const loginUrl = '/index.html';
                    const confirmMail = {
                        from: 'Donderdagborrel <no-reply@donderdagborrel.nl>',
                        to: user.email,
                        subject: 'Je wachtwoord is gewijzigd',
                        html: passwordChangedMailHtml({ username: user.username, loginUrl })
                    };

                    transporter.sendMail(confirmMail, (mailErr, info) => {
                        if (mailErr) {
                            // Loggen maar de API-call zelf slaagt gewoon
                            console.error('Kon bevestigingsmail niet versturen:', mailErr);
                        } else {
                            console.log('Bevestigingsmail verzonden:', info.messageId);
                        }
                        // In alle gevallen een succesvolle response geven na password update
                        res.status(200).json({ message: 'Wachtwoord succesvol opnieuw ingesteld.' });
                    });
                }
            );
        } catch (hashError) {
            console.error('Error hashing new password:', hashError);
            res.status(500).json({ message: 'Fout bij het verwerken van het nieuwe wachtwoord.' });
        }
    });
});

// NIEUW ENDPOINT: Suggestie versturen
app.post('/api/suggestie', isUser, async (req, res) => {
    const { gebruikersnaam, suggestie } = req.body;

    if (!suggestie) {
        return res.status(400).json({ message: 'De suggestie kan niet leeg zijn.' });
    }

    const mailOptions = {
        from: `Donderdagborrel <no-reply@donderdagborrel.nl>`,
        to: 'administrator@donderdagborrel.nl',
        subject: `Nieuwe suggestie van ${gebruikersnaam}`,
        html: `
            <p><strong>Gebruiker:</strong> ${gebruikersnaam}</p>
            <p><strong>Suggestie:</strong></p>
            <p>${suggestie}</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Suggestie van ${gebruikersnaam} succesvol verstuurd.`);
        res.status(200).json({ message: 'Suggestie succesvol verstuurd.' });
    } catch (error) {
        console.error('Fout bij versturen suggestie-mail:', error);
        res.status(500).json({ message: 'Fout bij het versturen van de suggestie.' });
    }
});


app.listen(port, () => {
    console.log(`Backend draait op http://localhost:${port}`);
    console.log(`Zorg ervoor dat uw frontend draait op http://localhost:5500 of pas de CORS origin aan.`);
    if (!process.env.SESSION_SECRET) {
        console.warn('\n--- WAARSCHUWING: SESSION_SECRET is niet ingesteld in .env! Gebruikt fallback secret. ---');
        console.warn('--- Genereer een sterke, willekeurige string en voeg deze toe aan uw .env bestand. ---\n');
    }
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'default_admin_password') {
        console.warn('\n--- WAARSCHUWING: ADMIN_PASSWORD is niet sterk of is standaard ingesteld in .env! ---');
        console.warn('--- Verander dit direct in een sterk wachtwoord in uw .env bestand. ---\n');
    }
});

// Homepage expliciet serveren
// Alias-routes voor losse HTML-pagina's
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));
app.get('/statistieken', (req, res) => res.sendFile(path.join(__dirname, 'statistieken.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'reset-password.html')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});