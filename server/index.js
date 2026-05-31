const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// API: ดึงข้อมูลสินค้าจาก PostgreSQL[cite: 19]
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ระบบ Real-time: เชื่อมต่อ Web และ Mobile[cite: 17]
io.on('connection', (socket) => {
  console.log('✅ Client Connected: ' + socket.id);
  
  // รับสัญญาณจากการกระทำบนมือถือ (เช่น ขายของ, รับซ่อม)[cite: 13, 17]
  socket.on('mobile:action', (data) => {
    io.emit('web:update', {
      ...data,
      time: new Date().toLocaleTimeString('th-TH')
    });
  });

  socket.on('disconnect', () => console.log('❌ Client Disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 FixIT Pro API รันที่พอร์ต ${PORT}`));