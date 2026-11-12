# Deploy Sunrise Hotel online (free)

This guide puts the Node.js app on **Render** and the database on **Aiven MySQL**. The result is a public HTTPS link your professor can open from anywhere.

```
Browser  ->  Render (Node.js app)  ->  Aiven MySQL (sunrise_hotel / defaultdb)
```

Free-tier limits to expect:

- Render sleeps after about 15 minutes idle, so the first visit can take 30-60 seconds.
- Render restarts clear staff sessions, so users sign in again.
- Aiven free MySQL includes enough storage for this demo.
- The database persists across app restarts and redeploys.

---

## 1. Put the project on GitHub

Render deploys from a Git repository.

1. Create an empty repository on GitHub, for example `sunrise-hotel-system`.
2. Open a terminal inside the `sunrise-hotel-system` folder.
3. Run:

```bash
git init
git add .
git commit -m "Sunrise Hotel Management System"
git branch -M main
git remote add origin https://github.com/YOURNAME/sunrise-hotel-system.git
git push -u origin main
```

The included `.gitignore` keeps `node_modules` and `.env` out of the repository.

If Git asks for your name or email:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

You can also use VS Code: **Source Control -> Publish to GitHub**.

---

## 2. Create the free MySQL database on Aiven

1. Sign up at https://aiven.io.
2. Click **Create service**.
3. Choose **MySQL**, plan **Free**, and the region closest to you (for the Philippines, Singapore is usually best).
4. Click **Create service** and wait until the status is **Running**.
5. Open the service **Overview** and copy the **Service URI**. It looks like:

```
mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
```

Keep this URI private. It contains the database password.

The app can use Aiven's `defaultdb` as-is. If you prefer a named database, create `sunrise_hotel` in the Aiven **Databases** tab and replace `/defaultdb` in the URI with `/sunrise_hotel`.

### Optional: verify the TLS certificate

Aiven also provides a CA certificate on the Overview page. For a class demo, `MYSQL_SSL=true` already encrypts the connection. If you want full certificate verification:

1. Download `ca.pem`.
2. Put it in the project as `certs/aiven-ca.pem` and push it to GitHub.
3. Add the Render env var `MYSQL_SSL_CA` with the value `certs/aiven-ca.pem`.

---

## 3. Create the free web service on Render

1. Sign up at https://render.com with your GitHub account.
2. Click **New + -> Web Service** and connect the repository.
3. Fill in:
   - **Name:** `sunrise-hotel`
   - **Language:** Node
   - **Branch:** `main`
   - **Root Directory:** leave blank if `package.json` is at the repository root
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Add these environment variables:

| Key | Value |
| --- | --- |
| `MYSQL_URL` | The full Aiven Service URI |
| `MYSQL_SSL` | `true` |
| `TZ` | `Asia/Manila` |
| `NODE_VERSION` | `22` |

`MYSQL_SSL=true` is required for Aiven. The app also understands `?ssl-mode=REQUIRED` in the URI.

5. Click **Create Web Service** and wait for the status **Live**.
6. Open the URL Render gives you, for example `https://sunrise-hotel.onrender.com`.

On the first request the app creates all 10 tables in Aiven and seeds the demo hotel. This can take a minute on the free tier.

### Using `render.yaml` instead

The repository includes `render.yaml`. After pushing to GitHub, choose **New + -> Blueprint**, select the repository, and Render reads the service settings automatically. It still asks you for `MYSQL_URL`.

---

## 4. Check the deployment

1. Open the Render URL.
2. Sign in with `admin` / `admin123`.
3. Open **Database** in the sidebar. It should show:
   - **MySQL 8.x**
   - **InnoDB**
   - the Aiven host and database name
   - 10 tables with seeded rows
4. Open `/book` on the same domain for the guest website.
5. In Aiven, the same tables can be browsed from the service **Data browser** or with HeidiSQL using the Aiven host, port, user and password.

Change the administrator password after the first sign-in if the link is public: **Administration -> staff account -> password**.

---

## 5. Updating the deployed app

```bash
git add .
git commit -m "Describe the change"
git push
```

Render redeploys automatically. The Aiven database is not touched, so demo data survives redeploys.

---

## Important deployment notes

- Do **not** run `npm run reset` against a hosted database. It is disabled when `MYSQL_URL`, `DATABASE_URL` or `RENDER` is set. Manage the database from Aiven instead.
- Staff sessions are in memory. A Render restart or free-tier sleep signs everyone out; that is expected.
- The app creates its tables and demo data automatically, so no manual SQL import is required.
- The demo staff passwords are public in this documentation. Use a private admin password for a real deployment.
- Date logic follows the server timezone. `TZ=Asia/Manila` keeps "today" aligned with Philippine time.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Render says the service crashed | Open **Logs**; the app usually prints the database error there |
| `ECONNREFUSED` or `ETIMEDOUT` | The Aiven URI is wrong or the service is not running |
| `ER_ACCESS_DENIED_ERROR` | Copy the URI again; special characters in the password must stay URL-encoded |
| TLS or handshake error | Set `MYSQL_SSL=true` and keep `ssl-mode=REQUIRED` in the URI |
| First page load is very slow | Render free tier is waking up; wait and retry |
| `Reset is disabled for hosted databases` | Expected; empty or recreate the database in Aiven |
| Foreign keys look missing | Check that you connected to the Aiven MySQL database, not another database |

---

## Alternative free MySQL hosts

If Aiven asks for a payment method, the same environment variables work with any MySQL 8 host, including filess.io or db4free.net:

| Key | Value |
| --- | --- |
| `MYSQL_HOST` | Host name |
| `MYSQL_PORT` | Port |
| `MYSQL_USER` | Username |
| `MYSQL_PASSWORD` | Password |
| `MYSQL_DATABASE` | Database name |
| `MYSQL_SSL` | `true` if the host requires TLS |

You can also use `MYSQL_URL` instead of the individual values.
