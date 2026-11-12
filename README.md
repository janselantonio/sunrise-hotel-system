# Sunrise Hotel Management System

A complete, ready-to-run hotel management prototype for a 15-staff boutique hotel. It covers the full front-office cycle: reservations, guest records, check-in and check-out, room status, housekeeping, extra charges, billing and payments, plus management reports, an administrator database viewer, and a public guest booking website whose requests are approved by the front desk.

Built as a BS IT capstone prototype by **Jansel Antonio**.

- Runs on **Node.js + MySQL** - one npm dependency (`mysql2`), no build step, no internet connection needed.
- Data is stored in a real **MySQL 8** database (InnoDB) - for example the MySQL that ships with Laragon.
- The browser UI is plain HTML, CSS and ES modules served by the same Node server.
- Two front ends: the **staff system** at `/` and the **guest booking site** at `/book`.

---

## Quick start

### Requirements

- **Node.js 20 or newer** (Node 24 LTS recommended). Check with:
  ```bash
  node -v
  ```
- **MySQL 8** running locally. With Laragon, open Laragon and click **Start All** so the MySQL service is running on `127.0.0.1:3306`.
- Any modern browser (Chrome, Edge, Firefox).

The default connection is `root` with an empty password, which matches a fresh Laragon install. The app creates the `sunrise_hotel` database and its tables automatically.

### Run the system

```bash
cd sunrise-hotel-system
npm install
npm start
```

Open **http://localhost:3000** for the staff system, or **http://localhost:3000/book** for the guest booking site.

On the first run the app connects to MySQL, creates the `sunrise_hotel` database, builds the 10 tables, and seeds the demo hotel.

### Other commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the server on port 3000 |
| `npm run dev` | Start with auto-restart when server files change |
| `npm run reset` | Drop and recreate the `sunrise_hotel` database; demo data is reseeded on next start (stop the server first) |
| `PORT=3001 npm start` | Run on a different port |

### Database settings

Override the defaults with environment variables if your MySQL uses a different account or port:

```bash
MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD= MYSQL_DATABASE=sunrise_hotel npm start
```

On Windows PowerShell, set them first with `$env:MYSQL_PASSWORD="yourpassword"` and then run `npm start`.

Managed MySQL hosts usually provide a single connection URI. You can use it directly:

```bash
MYSQL_URL="mysql://user:password@host:3306/database?ssl-mode=REQUIRED" MYSQL_SSL=true npm start
```

`MYSQL_SSL=true` enables TLS for hosted databases. To verify the provider certificate, also set `MYSQL_SSL_CA` to a CA file path or `MYSQL_SSL_CA_PEM` to the certificate text.

### Open in VS Code

1. Open the `sunrise-hotel-system` folder in VS Code.
2. Run `npm install` once in the integrated terminal.
3. Press **F5** (a launch configuration is included in `.vscode/launch.json`), or run `npm start`.
4. Open http://localhost:3000 in your browser.

---

## Deploy online (free)

The app is ready for free hosting on **Render** with a managed **Aiven MySQL** database. The result is a public HTTPS link that works from any device.

See [DEPLOY.md](DEPLOY.md) for the complete step-by-step guide, including the environment variables (`MYSQL_URL`, `MYSQL_SSL`, `TZ`) and troubleshooting.

---

## Demo accounts

All demo accounts use the passwords below. Additional receptionist and housekeeping staff use `staff123`.

| Username | Password | Role | Staff member |
| --- | --- | --- | --- |
| `admin` | `admin123` | Administrator | Jansel Antonio |
| `reception` | `reception123` | Receptionist | Ana Cruz |
| `manager` | `manager123` | Manager | Elena Reyes |
| `housekeeping` | `housekeeping123` | Housekeeping | Lorna Diaz |
| `joey.lim`, `kim.tan`, `paolo.garcia` | `staff123` | Receptionist | Front desk team |
| `grace.uy`, `mila.reyes`, `nora.bautista`, `tess.ramos`, `joy.cruz`, `rina.lopez`, `beth.ong`, `carla.diaz` | `staff123` | Housekeeping | Housekeeping team |

Guests do not log in. Guest details and stays are managed by the front desk; guests can send a booking request from the public site at `/book`, which reception approves.

---

## What each role can do

| Module | Administrator | Receptionist | Manager | Housekeeping |
| --- | --- | --- | --- | --- |
| Dashboard | Full | Full | View only | View only |
| Front desk (arrivals, departures, in-house) | Full | Full | View only | No access |
| Reservations | Create, edit, cancel | Create, edit, cancel | View only | No access |
| Rooms | Add/edit rooms and change status | Change room status | View only | View only |
| Housekeeping board | Full | Full | View only | Change room status |
| Guests | Full | Full | View only | No access |
| Billing / invoices | Full, including void | Create charges, record payments | View only | No access |
| Reports and activity history | Full | No access | Full (read-only) | No access |
| Administration (staff, roles, hotel settings) | Full | No access | No access | No access |
| Database viewer (schema and records) | Read-only | No access | No access | No access |

Role checks are enforced on the server for every API request, not only hidden in the interface.

---

## Main workflows

### Reservation to checkout

1. **Reserve** - Receptionist opens *Reservations -> New reservation*, chooses dates, picks an available room and selects or creates a guest. Availability is checked against overlapping stays.
2. **Check in** - On the arrival date the booking appears in *Front desk*. Checking in marks the room **occupied** and the reservation **in-house**.
3. **Check out** - From *Front desk* or the reservation detail, check out the guest. The system builds an invoice from room nights plus any extra charges, applies a discount and VAT, records the payment, marks the room **needs cleaning** and opens the printable receipt.
4. **Clean** - Housekeeping marks the room **clean**, returning it to **available**.
5. **Report** - Occupancy, revenue, collections and booking figures update in *Reports*.

Open balances can be settled later from *Billing*: open the invoice, add a payment, add or remove extra charges, or print the receipt.

### Online booking request (guest website)

1. **Browse** - The guest opens `/book` and sees the room types, rates, photos and live availability for the chosen dates.
2. **Request** - The guest picks a room and enters name, phone, optional email and notes. The request is saved as **reserved + pending** with source `website`. Pending requests do not block the room.
3. **Review** - The request appears in *Online booking requests* on the Dashboard and Front desk, and under *Reservations -> Requests*.
4. **Approve** - Reception presses **Approve request**. The system re-checks availability. If the room is free, the booking becomes **confirmed** and joins the arrivals list. If it was taken in the meantime, staff must decline it.
5. **Decline** - Reception can decline with an optional reason. The request becomes **cancelled + declined** and the dates remain open.
6. **Continue** - An approved stay follows the normal check-in, check-out and billing flow.

Staff-created reservations are stored with source `front_desk` and are confirmed immediately. The `source` column also supports `phone` and `walk_in` for future reporting.

### Room statuses

| Status | Meaning |
| --- | --- |
| Available | Clean and ready to sell |
| Occupied | Guest currently in house |
| Reserved | Arrival booked for today (derived on the room board) |
| Needs cleaning | Vacated, waiting for housekeeping |
| Out of service | Blocked for maintenance |

### Billing rules

- Room revenue = nightly rate x number of nights.
- Extra charges can be food and beverage, service, or other.
- VAT is read from hotel settings (12% by default) and stored on the invoice at issue time.
- Changing the VAT rate later does not change invoices that were already issued.
- Invoices are **open**, **paid**, or **void**. An invoice becomes **paid** when payments cover the total.
- Voiding an invoice is restricted to the Administrator.

---

## Demo walkthrough (for the presentation)

This sequence shows every module from the proposal in about 8-10 minutes.

1. **Guest booking site** - open `/book`. Show the room cards, search live availability, select a room and submit a request. Point out the reference number and the "waiting for reception confirmation" message.
2. **Sign in** as `admin` - the Dashboard greets Jansel and shows occupancy, arrivals, departures, revenue, the 7-day trend, room-status chart and recent activity.
3. **Approve the request** - in *Online booking requests*, press **Approve**. The pending request becomes a confirmed reservation and joins the arrivals list. This is the "guest requests, front desk confirms" flow from the proposal.
4. **Front desk** - show arrivals, departures and in-house guests. Checking in marks the room **occupied**.
5. **Reservations** - use the tabs and filters, open a booking and point out the booking channel and approval status.
6. **Check out** - open an arrival, check the guest in, then check them out from Front desk. Add an F&B charge, show the 12% VAT, record the payment and print the receipt.
7. **Housekeeping** - show the room board, mark the vacated room as cleaned, and show the housekeeping history.
8. **Guests** - search a guest and open the stay and invoice history.
9. **Billing** - open a folio, add a charge or payment, and show how the balance closes.
10. **Reports** - choose a date range and show occupancy, revenue, collections, payment methods and room-type breakdowns.
11. **Administration** - show staff accounts, role permissions and hotel settings.
12. **Database** - show the live MySQL tables, the `reservations` columns (`source`, `approval_status`), foreign keys, indexes and the masked `users.password_hash`. Optionally open the same `sunrise_hotel` database in HeidiSQL or phpMyAdmin from Laragon.

Optional role check: sign in as `reception`, `manager` and `housekeeping` to show that menus and server permissions change with the role.

Before presenting, stop the server, run `npm run reset`, then `npm start` for a clean mid-November demo day.

---

## Project structure

```
sunrise-hotel-system/
|-- server.js              HTTP server, static files, API dispatcher
|-- package.json           Scripts, mysql2 dependency, Node version requirement
|-- .vscode/launch.json    F5 launch configuration
|-- database/schema.sql    MySQL table, index and foreign-key definitions
|-- src/
|   |-- db.js              MySQL pool, transaction helper, schema, date helpers
|   |-- auth.js            Password hashing (scrypt), sessions, cookies
|   |-- api.js             HTTP handlers and route table
|   |-- services.js        Business logic and database queries
|   |-- seed.js            Demo data (staff, rooms, guests, stays, invoices)
|   |-- reset.js           Drops and recreates the MySQL database
|   `-- errors.js          HTTP error helpers
`-- public/
    |-- index.html         Staff app shell
    |-- book.html          Guest booking website
    |-- assets/            Logo and room photography
    |-- css/styles.css     Staff design system and print styles
    |-- css/book.css       Guest website styles
    `-- js/
        |-- app.js         Login, routing, navigation, session handling
        |-- book.js        Guest site: availability, room cards, booking form
        |-- api.js         Fetch wrapper for the JSON API
        |-- flows.js       Modals: reservation, approval, check-in/out, invoice, guests, rooms, staff
        |-- charts.js      Custom SVG area and bar charts
        |-- utils.js       Formatting, pills, modals, toasts, CSV
        |-- icons.js       Inline SVG icon set
        |-- store.js       Session/config cache
        `-- views/         Dashboard, Front desk, Reservations, Rooms, Housekeeping,
                           Guests, Billing, Reports, Administration, Database
```

---

## API reference

All endpoints return JSON. Authentication uses an HttpOnly session cookie (`sunrise_session`, 8-hour lifetime). Unauthenticated requests receive `401`.

| Method | Endpoint | Purpose | Allowed roles |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in | Public |
| `POST` | `/api/auth/logout` | Sign out | Signed in |
| `GET` | `/api/auth/me` | Current user and hotel settings | Signed in |
| `GET` | `/api/public/hotel` | Hotel profile, room types, rates, photos and stats | Public |
| `GET` | `/api/public/availability?check_in&check_out&adults&children` | Live room availability for the guest site | Public |
| `POST` | `/api/public/bookings` | Submit an online booking request | Public (rate limited) |
| `GET` | `/api/dashboard` | KPIs, arrivals, departures, trend, activity | Signed in |
| `GET` | `/api/frontdesk` | Arrivals, departures, in-house, overdue | Admin, receptionist, manager |
| `GET` | `/api/rooms` | Room board with derived statuses | Signed in |
| `GET` | `/api/rooms/availability?check_in&check_out` | Rooms free for a date range | Signed in |
| `GET` | `/api/rooms/:id` | Room detail, stay, housekeeping history | Signed in |
| `POST` | `/api/rooms` | Create a room | Admin |
| `PATCH` | `/api/rooms/:id` | Edit room / change status | Admin (details), admin + receptionist + housekeeping (status) |
| `GET` | `/api/guests` | Guest records (`?q=` search) | Admin, receptionist, manager |
| `GET` | `/api/guests/:id` | Guest profile and stay history | Admin, receptionist, manager |
| `POST` | `/api/guests` | Create guest | Admin, receptionist |
| `PATCH` | `/api/guests/:id` | Update guest | Admin, receptionist |
| `GET` | `/api/reservations` | Reservation book (`status`, `approval`, `from`, `to`, `q`) | Admin, receptionist, manager |
| `GET` | `/api/reservations/:id` | Reservation detail | Admin, receptionist, manager |
| `POST` | `/api/reservations` | Create reservation | Admin, receptionist |
| `PATCH` | `/api/reservations/:id` | Update reservation | Admin, receptionist |
| `POST` | `/api/reservations/:id/approve` | Confirm an online booking request | Admin, receptionist |
| `POST` | `/api/reservations/:id/decline` | Decline an online request with optional reason | Admin, receptionist |
| `POST` | `/api/reservations/:id/cancel` | Cancel reservation | Admin, receptionist |
| `POST` | `/api/reservations/:id/check-in` | Check in | Admin, receptionist |
| `POST` | `/api/reservations/:id/check-out` | Check out, create invoice, record payment | Admin, receptionist |
| `GET` | `/api/invoices` | Invoice list and billing summary | Admin, receptionist, manager |
| `GET` | `/api/invoices/:id` | Invoice with items and payments | Admin, receptionist, manager |
| `POST` | `/api/invoices/:id/items` | Add extra charge | Admin, receptionist |
| `DELETE` | `/api/invoices/:id/items/:itemId` | Remove extra charge | Admin, receptionist |
| `POST` | `/api/invoices/:id/payments` | Record a payment | Admin, receptionist |
| `PATCH` | `/api/invoices/:id` | Update discount or notes | Admin, receptionist |
| `POST` | `/api/invoices/:id/void` | Void invoice | Admin |
| `GET` | `/api/reports?from&to` | Occupancy, revenue, collections, breakdowns | Admin, manager |
| `GET` | `/api/activity` | Recent activity log | Admin, manager |
| `GET` | `/api/users` | Staff accounts and role counts | Admin |
| `POST` | `/api/users` | Create staff account | Admin |
| `PATCH` | `/api/users/:id` | Edit, reset password, enable/disable | Admin |
| `GET` | `/api/settings` | Hotel profile and staff summary | Admin |
| `PATCH` | `/api/settings` | Update hotel profile and VAT | Admin |
| `GET` | `/api/database/tables` | Database engine, data size and table row counts | Admin |
| `GET` | `/api/database/tables/:name?limit&offset` | Columns, foreign keys, indexes and records | Admin |

Example:

```bash
curl -c cookies.txt -H "Content-Type: application/json" \
  -d '{"username":"reception","password":"reception123"}' \
  http://localhost:3000/api/auth/login

curl -b cookies.txt http://localhost:3000/api/dashboard
```

---

## Data model

### Where the database lives

The system uses **MySQL 8** with the InnoDB engine. Laragon is the recommended way to run it on a laptop: start Laragon, click **Start All**, and the MySQL server listens on `127.0.0.1:3306`.

Default connection:

| Setting | Default |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `3306` |
| User | `root` |
| Password | *(empty, as in a fresh Laragon install)* |
| Database | `sunrise_hotel` |

The app creates the `sunrise_hotel` database, the 10 tables and all demo data automatically the first time you run `npm start`. Each `CREATE TABLE` uses `ENGINE=InnoDB`, `utf8mb4` and named foreign keys. A copy of the table definitions is included in [`database/schema.sql`](database/schema.sql) for documentation and submission; it can also be imported directly in phpMyAdmin or HeidiSQL.

To inspect the database:

- **Built in**: sign in as the Administrator and open **Database** in the sidebar. It shows the MySQL version, InnoDB storage engine, data size, every table, row count, column type, primary key, foreign key, index and record. Staff password hashes are masked.
- **Laragon -> HeidiSQL**: open HeidiSQL from Laragon, connect to `127.0.0.1` as `root` with an empty password, and expand the `sunrise_hotel` database.
- **phpMyAdmin**: if it is installed in Laragon, open it from the Laragon menu and choose `sunrise_hotel`.
- **Command line** (Laragon terminal):
  ```bash
  mysql -u root
  SHOW DATABASES;
  USE sunrise_hotel;
  SHOW TABLES;
  SELECT * FROM reservations;
  ```

```mermaid
erDiagram
  USERS ||--o{ RESERVATIONS : creates
  USERS ||--o{ INVOICES : issues
  USERS ||--o{ PAYMENTS : receives
  USERS ||--o{ HOUSEKEEPING_LOGS : updates
  USERS ||--o{ ACTIVITY_LOG : performs
  GUESTS ||--o{ RESERVATIONS : books
  GUESTS ||--o{ INVOICES : billed_to
  ROOMS ||--o{ RESERVATIONS : assigned
  ROOMS ||--o{ INVOICES : billed_for
  RESERVATIONS ||--o| INVOICES : generates
  INVOICES ||--o{ INVOICE_ITEMS : contains
  INVOICES ||--o{ PAYMENTS : settled_by
  ROOMS ||--o{ HOUSEKEEPING_LOGS : history
```

| Table | Purpose |
| --- | --- |
| `users` | Staff accounts: username, scrypt password hash, role, active flag |
| `rooms` | Room number, type, floor, nightly rate, status, notes |
| `guests` | Guest contact details and ID information |
| `reservations` | Stay dates, room, rate, status, booking source, approval status, check-in/out timestamps |
| `invoices` | One per checked-out stay; totals, VAT, discount, status |
| `invoice_items` | Room charge and extra charges (F&B, service, other) |
| `payments` | Cash, card, GCash, or bank transfer against an invoice |
| `housekeeping_logs` | Every room status change with note and staff member |
| `activity_log` | Audit trail of reservations, check-ins, checkouts, payments, settings |
| `settings` | Hotel name, address, contact, currency, VAT rate, check-in/out times |

---

## Business rules implemented

- A room cannot be double-booked: overlapping date ranges are rejected, excluding cancelled stays.
- Online booking requests are saved as **pending** and do not block the room until reception approves them.
- Approving a request re-checks availability; if the room was taken, the request must be declined.
- A pending request cannot be checked in until it is approved.
- Check-out must be at least one night after check-in.
- Check-in is allowed only for reservations in **reserved** status.
- Check-out creates exactly one invoice per reservation with room nights, extras, discount and VAT.
- Partial payments are allowed; the invoice stays **open** until the balance reaches zero.
- Checkout automatically moves the room to **needs cleaning**.
- Housekeeping status changes move the room between **available**, **needs cleaning**, and **out of service**.
- The room board derives **reserved** when a room has an arrival scheduled for today and is not yet occupied.
- Reports cover a date range and count room nights, ADR, occupancy, invoiced amount, collections, revenue categories, payment methods, room types and booking statuses.
- Every sensitive action is written to the activity log.

---

## Notes and limitations

This is an academic prototype intended to demonstrate the proposed system end to end, not a production deployment.

- Single Node server with a local MySQL database; suitable for one front desk workstation or a small LAN demo.
- MySQL must be running before the app starts. If it is not, the app prints the connection target and asks you to start Laragon.
- Sessions are held in memory, so restarting the server signs everyone out.
- Dates follow the server's local date. No time-zone conversion is applied.
- No payment gateway, email, SMS or automated confirmation. The guest site submits a request; reception confirms it inside the staff system.
- The guest site is a request channel, not a guest account system. Guests still provide ID and details at the front desk.
- Demo data is generated on first run for a believable mid-November operating day.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Node.js 20 or newer is required` | Install the current Node.js LTS from nodejs.org |
| `Could not connect to the MySQL database` | Open Laragon and click **Start All**, then run `npm start` again |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL is not running, or `MYSQL_PORT` is wrong |
| `ER_ACCESS_DENIED_ERROR` | The MySQL user/password is wrong; set `MYSQL_USER` and `MYSQL_PASSWORD` |
| `Port 3000 is already in use` | Stop the other server or run `PORT=3001 npm start` |
| Login says invalid credentials | Use one of the demo accounts above; usernames are lowercase |
| Data looks wrong after experimenting | Stop the server, run `npm run reset`, then `npm start` |

---

## Author

**Jansel Antonio** - BS Information Technology capstone prototype.
