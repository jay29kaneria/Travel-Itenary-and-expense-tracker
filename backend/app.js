const path = require('node:path');
require('node:process').loadEnvFile(path.join(__dirname, '../.env'));
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');

const app = express();
let pool;
app.use(express.json());
app.use(express.static(path.join(__dirname, '../front-end')));
app.get('/', (req, res) => res.redirect('/login.html'));
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const required = (body, fields) => {
    for (const field of fields) {
        if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '')
            throw fail(`${field} is required`);
    }
};
const date = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
        throw fail('Enter a valid date');
    return value;
};
const coordinate = (value, limit) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > limit) throw fail('Invalid coordinates');
    return number;
};
const itineraryValues = body => {
    required(body, ['destination', 'travelerName', 'travelDate', 'returnDate']);
    const start = date(body.travelDate), end = date(body.returnDate);
    if (end < start) throw fail('Return date must be on or after travel date');
    const status = body.status || 'Planned';
    if (!['Planned', 'Ongoing', 'Completed', 'Cancelled'].includes(status)) throw fail('Invalid status');
    return [body.destination, body.travelerName, start, end, status, body.notes || '', coordinate(body.latitude, 90), coordinate(body.longitude, 180)];
};
const findItinerary = async id => {
    const [rows] = await pool.execute('SELECT * FROM itineraries WHERE id = ?', [id]);
    if (!rows.length) throw fail('Itinerary not found', 404);
    return rows[0];
};

app.post('/api/admin/register', route(async (req, res) => {
    required(req.body, ['name', 'email', 'password']);
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await pool.execute('INSERT INTO admins (name, email, password) VALUES (?, ?, ?)', [name, email, hash]);
    res.status(201).json({ message: 'Admin registered successfully' });
}));

app.post('/api/admin/login', route(async (req, res) => {
    required(req.body, ['email', 'password']);
    const [rows] = await pool.execute('SELECT * FROM admins WHERE email = ?', [req.body.email]);
    const admin = rows[0];
    if (!admin || !await bcrypt.compare(req.body.password, admin.password)) throw fail('Invalid email or password', 401);
    const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token, admin: { id: admin.id, name: admin.name, email: admin.email } });
}));

app.post('/api/itineraries', route(async (req, res) => {
    required(req.body, ['tripId']);
    const values = itineraryValues(req.body);
    const [result] = await pool.execute('INSERT INTO itineraries (tripId, destination, travelerName, travelDate, returnDate, status, notes, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [req.body.tripId, ...values]);
    res.status(201).json({ message: 'Itinerary added successfully', itinerary: await findItinerary(result.insertId) });
}));

app.get('/api/itineraries', route(async (req, res) => {
    const [rows] = await pool.query('SELECT i.*, COALESCE(e.totalExpense, 0) AS totalExpense FROM itineraries i LEFT JOIN (SELECT itineraryId, SUM(amount) AS totalExpense FROM expenses GROUP BY itineraryId) e ON e.itineraryId = i.id ORDER BY i.travelDate');
    res.json(rows);
}));
app.get('/api/itineraries/:id', route(async (req, res) => res.json(await findItinerary(req.params.id))));
app.put('/api/itineraries/:id', route(async (req, res) => {
    await findItinerary(req.params.id);
    await pool.execute('UPDATE itineraries SET destination=?, travelerName=?, travelDate=?, returnDate=?, status=?, notes=?, latitude=?, longitude=? WHERE id=?', [...itineraryValues(req.body), req.params.id]);
    res.json({ message: 'Itinerary updated successfully', itinerary: await findItinerary(req.params.id) });
}));
app.delete('/api/itineraries/:id', route(async (req, res) => {
    const [result] = await pool.execute('DELETE FROM itineraries WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) throw fail('Itinerary not found', 404);
    res.json({ message: 'Itinerary and its expenses deleted successfully' });
}));
app.post('/api/expenses', route(async (req, res) => {
    required(req.body, ['itineraryId', 'category', 'amount', 'expenseDate']);
    const { itineraryId, category, description, expenseDate } = req.body;
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) throw fail('Amount must be a non-negative number');
    await findItinerary(itineraryId);
    const [result] = await pool.execute('INSERT INTO expenses (itineraryId, category, description, amount, expenseDate) VALUES (?, ?, ?, ?, ?)', [itineraryId, category, description || '', amount, date(expenseDate)]);
    const [rows] = await pool.execute('SELECT * FROM expenses WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Expense added successfully', expense: rows[0] });
}));
app.get('/api/expenses/:itineraryId', route(async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM expenses WHERE itineraryId = ? ORDER BY expenseDate', [req.params.itineraryId]);
    res.json(rows);
}));
app.delete('/api/expenses/:id', route(async (req, res) => {
    const [result] = await pool.execute('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) throw fail('Expense not found', 404);
    res.json({ message: 'Expense deleted successfully' });
}));
app.use((err, req, res, next) => {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Admin email already exists' });
    console.error(err.message);
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Database or server error. Check the backend terminal.' });
});

async function start() {
    const database = process.env.DB_NAME || 'travel_tracker_db';
    if (!/^[a-zA-Z0-9_]+$/.test(database)) throw Error('Invalid DB_NAME');
    if (!process.env.JWT_SECRET) throw Error('JWT_SECRET is required');
    const config = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', dateStrings: true, decimalNumbers: true };
    const connection = await mysql.createConnection(config);
    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.changeUser({ database });
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        for (const statement of schema.split(';').filter(s => s.trim())) await connection.query(statement);
    } finally {
        await connection.end();
    }
    pool = mysql.createPool({ ...config, database, waitForConnections: true, connectionLimit: 10 });
    const port = Number(process.env.PORT || 5000);
    app.listen(port, () => console.log(`Connected to MySQL. Server running on http://localhost:${port}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
