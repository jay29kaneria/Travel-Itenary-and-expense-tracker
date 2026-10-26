# Travel Itinerary & Expense Tracker — MySQL

## Files

- front-end/: login.html, signup.html, dashboard.html.
- backend/: app.js, schema.sql, package.json, package-lock.json.
- .env: MySQL credentials, server port and JWT secret.
- README.md: setup instructions.

## Run the project

1. Install Node.js 20.12 or newer and MySQL Server. Start your MySQL service. MySQL Workbench is a client; the MySQL server must be running.
2. Extract the ZIP completely.
3. Edit the root .env file. Set DB_USER and DB_PASSWORD to your MySQL credentials. For example:

```env
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD="your_actual_mysql_password"
DB_NAME=travel_tracker_db
```

Keep the supplied JWT_SECRET line. If your local MySQL account has no password, set DB_PASSWORD="".

4. Open a terminal in the extracted project folder:

```bash
cd backend
npm ci
npm start
```

5. Wait for: Connected to MySQL. Server running on http://localhost:5000
6. Open http://localhost:5000. Click Sign Up, register a new account, then log in.
7. Add itineraries and expenses. Stop the server with Ctrl+C. Use npm start inside backend for later runs.

The server creates travel_tracker_db and the admins, itineraries and expenses tables automatically using backend/schema.sql. The configured MySQL account needs database/table creation permissions for startup. No separate SQL import is needed. Existing tables are retained.

The backend also serves the frontend. Do not open HTML files directly or use Live Server. Internet is needed for the Tailwind CDN, Leaflet and map tiles.

## View the data in MySQL Workbench

```sql
USE travel_tracker_db;
SHOW TABLES;
SELECT id, name, email, createdAt FROM admins;
SELECT * FROM itineraries;
SELECT * FROM expenses;
```

## Implementation

The backend uses Express and mysql2/promise, parameterized SQL queries, bcrypt password hashing and JWT login tokens. Records have integer id values. Expenses reference itineraries with a foreign key and ON DELETE CASCADE. Deleting an itinerary also deletes its expenses. Amounts use DECIMAL(12,2). Frontend API requests use the same host and port as the page.

This version uses MySQL only. Existing MongoDB records are not migrated; register a new account in MySQL. The original app's itinerary and expense routes remain without server-side JWT enforcement; this is a local practical project.

node_modules is intentionally excluded. npm ci recreates it. Keep package.json and package-lock.json because they are needed to install the dependencies reliably.

## Troubleshooting

- Access denied: correct DB_USER and DB_PASSWORD in .env.
- ECONNREFUSED: start MySQL and check DB_HOST and DB_PORT.
- CREATE command denied: use a local account with database/table creation privileges.
- EADDRINUSE: stop the other process or change PORT and open the new URL.
- loadEnvFile is not a function: use Node.js 20.12 or newer.
- Missing styles/maps: check internet access.

## Verification

Backend and frontend JavaScript syntax were checked. Live database CRUD verification requires a running MySQL server; none was available in the preparation environment.
