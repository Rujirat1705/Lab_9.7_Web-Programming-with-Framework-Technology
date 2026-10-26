require('dotenv').config(); // Lab 9.6: โหลด Environment Variables จากไฟล์ .env
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Lab 9.4: JWT
const db = require('./db');

const app = express();

// ==================== Lab 9.7: CORS Configuration (Support Local & Production Vercel) ====================
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    // ยอมรับ origin จาก localhost, โดเมน .vercel.app ทั้งหมด และ FRONTEND_URL
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isVercel = origin.endsWith('.vercel.app');
    const isConfiguredFrontend = process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL.replace(/\/$/, '');

    if (isLocalhost || isVercel || isConfiguredFrontend) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ==================== Lab 9.6: JWT SECRET จาก Environment Variable ====================
const JWT_SECRET = process.env.JWT_SECRET || 'my_bookstore_secret';

// ==================== Lab 9.6: EMAIL TRANSPORTER จาก Environment Variable ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || '67310078@go.buu.ac.th',
    pass: process.env.EMAIL_PASS || 'hbkzvsnxvzwrdjar'
  }
});

// ==================== Root Health Check ====================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Book Store API Backend (Lab 9.4 - JWT Auth)',
    lab: '9.4',
    endpoints: {
      public: {
        register: 'POST /api/register',
        verify: 'GET /api/verify-email?token=...',
        login: 'POST /api/login'
      },
      protected: {
        note: 'ต้องส่ง Authorization: Bearer <token> ใน Header',
        profile: 'GET /api/profile',
        getBooks: 'GET /api/books',
        getBook: 'GET /api/books/:id',
        createBook: 'POST /api/books',
        updateBook: 'PUT /api/books/:id',
        deleteBook: 'DELETE /api/books/:id'
      }
    }
  });
});

// ==================== Lab 9.4: Step 5 — Authentication Middleware ====================
// Middleware นี้ทำหน้าที่ "ยาม" ที่ตรวจตั๋ว (Token) ตอบคำถาม: "Who are you? (คุณคือใคร?)"
function authenticateToken(req, res, next) {
  // อ่าน Header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // แยก "Bearer " ออก

  // ไม่มี Token หรือรูปแบบไม่ถูกต้อง → 401 Unauthorized
  if (!token) {
    return res.status(401).json({
      message: 'Access token required',
      error: 'Unauthorized',
      hint: 'ส่ง Header: Authorization: Bearer <your_token>'
    });
  }

  // ตรวจสอบความถูกต้องของ Token
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        message: 'Invalid or expired token',
        error: 'Forbidden'
      });
    }

    // Token ถูกต้อง: แนบข้อมูล User (id, email, name, role) ลงใน req.user
    req.user = decoded;
    console.log('[Auth] Authenticated user:', req.user);
    next();
  });
}

// ==================== Lab 9.5: Step 5 — Authorization Middleware (RBAC) ====================
// Middleware นี้ทำหน้าที่ตอบคำถาม: "What are you allowed to do? (คุณมีสิทธิ์ทำสิ่งนี้หรือไม่?)"
// ใช้งาน: authorizeRole('viewer', 'editor', 'admin') หรือ authorizeRole('admin')
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    console.log('[RBAC] Required roles:', allowedRoles, '| User role:', req.user?.role);

    // ตรวจสอบว่า Role ของ user อยู่ใน allowedRoles หรือไม่
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Forbidden'
      });
    }

    next();
  };
}

// ==================== Lab 9.4 & 9.5: Step 3 — Login + Generate JWT with Role ====================
// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = users[0];

    // ตรวจสอบรหัสผ่าน (bcrypt หรือ plain-text)
    let isMatch = await bcrypt.compare(password, user.password).catch(() => false);
    if (!isMatch && user.password === password) {
      isMatch = true;
      const newHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: 'กรุณายืนยันตัวตนผ่านอีเมลก่อนเข้าสู่ระบบ' });
    }

    // ==================== Lab 9.5: Step 3 — ใส่ role เข้า JWT Payload ====================
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'viewer'
      },
      JWT_SECRET,
      {
        expiresIn: '1h' // อายุ Token 1 ชั่วโมง
      }
    );

    console.log(`[JWT] Token created for user: ${email} (Role: ${user.role})`);

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'viewer'
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Lab 9.4: แบบฝึกหัดเพิ่มเติม — GET /api/profile ====================
// Endpoint นี้ต้องมี JWT ที่ถูกต้องจึงจะเข้าถึงได้
// Backend ใช้ req.user.id (จาก JWT Payload) เพื่อค้นหาข้อมูล User จาก Database
//
// ทดสอบ:
//   ไม่มี JWT  → 401
//   JWT ถูกต้อง → 200 + ข้อมูล Profile (ไม่มี password)
//
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    // req.user.id มาจาก JWT Payload ที่ถูก decode แล้ว
    const [users] = await db.query(
      'SELECT id, name, email, is_verified, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้' });
    }

    const user = users[0];

    // ส่งเฉพาะข้อมูลที่เหมาะสม — ห้ามส่ง password หรือ password hash!
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_verified: user.is_verified,
      created_at: user.created_at,
      token_info: {
        issued_at: new Date(req.user.iat * 1000).toLocaleString('th-TH'),
        expires_at: new Date(req.user.exp * 1000).toLocaleString('th-TH')
      }
    });
  } catch (err) {
    console.error('GET /api/profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Lab 9.5: Step 6 & แบบฝึกหัดเพิ่มเติม — Protected Book REST API with RBAC ====================
// กำหนดสิทธิ์ตาม Role:
// GET    /api/books       → viewer, editor, manager, admin
// GET    /api/books/:id   → viewer, editor, manager, admin
// POST   /api/books       → editor, manager, admin
// PUT    /api/books/:id   → editor, manager, admin
// DELETE /api/books/:id   → manager, admin (ตามแบบฝึกหัดข้อ 33)

// 2.1 Read All — GET /api/books (viewer, editor, manager, admin)
app.get(
  '/api/books',
  authenticateToken,
  authorizeRole('viewer', 'editor', 'manager', 'admin'),
  async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM books ORDER BY id DESC');
      res.json(rows);
    } catch (err) {
      console.error('GET /api/books error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 2.2 Read One — GET /api/books/:id (viewer, editor, manager, admin)
app.get(
  '/api/books/:id',
  authenticateToken,
  authorizeRole('viewer', 'editor', 'manager', 'admin'),
  async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'ไม่พบหนังสือเล่มนี้' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error('GET /api/books/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 2.3 Create — POST /api/books (editor, manager, admin)
app.post(
  '/api/books',
  authenticateToken,
  authorizeRole('editor', 'manager', 'admin'),
  async (req, res) => {
    try {
      const { title, author, price, stock, category } = req.body;
      if (!title || !author || price === undefined || price === null || price === '') {
        return res.status(400).json({ error: 'กรุณากรอกชื่อหนังสือ ผู้แต่ง และราคา ให้ครบถ้วน' });
      }

      const bookPrice = parseFloat(price);
      const bookStock = parseInt(stock, 10) || 0;
      const bookCategory = category || 'ทั่วไป';

      const [result] = await db.query(
        'INSERT INTO books (title, author, price, stock, category) VALUES (?, ?, ?, ?, ?)',
        [title, author, bookPrice, bookStock, bookCategory]
      );

      console.log(`[Book] Added by user id=${req.user.id} (${req.user.email}, role=${req.user.role}): "${title}"`);

      res.status(201).json({
        id: result.insertId,
        title,
        author,
        price: bookPrice,
        stock: bookStock,
        category: bookCategory,
        added_by: req.user.email,
        message: 'เพิ่มหนังสือสำเร็จ'
      });
    } catch (err) {
      console.error('POST /api/books error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 2.4 Update — PUT /api/books/:id (editor, manager, admin)
app.put(
  '/api/books/:id',
  authenticateToken,
  authorizeRole('editor', 'manager', 'admin'),
  async (req, res) => {
    try {
      const { title, author, price, stock, category } = req.body;
      const bookPrice = parseFloat(price);
      const bookStock = parseInt(stock, 10) || 0;

      const [result] = await db.query(
        'UPDATE books SET title = ?, author = ?, price = ?, stock = ?, category = ? WHERE id = ?',
        [title, author, bookPrice, bookStock, category, req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'ไม่พบหนังสือที่ต้องการแก้ไข' });
      }

      console.log(`[Book] Updated id=${req.params.id} by user ${req.user.email} (role=${req.user.role})`);
      res.json({ message: 'อัปเดตข้อมูลหนังสือเรียบร้อย' });
    } catch (err) {
      console.error('PUT /api/books/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// 2.5 Delete — DELETE /api/books/:id (admin, manager ตามแบบฝึกหัด หรือ admin)
app.delete(
  '/api/books/:id',
  authenticateToken,
  authorizeRole('manager', 'admin'),
  async (req, res) => {
    try {
      const [result] = await db.query('DELETE FROM books WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'ไม่พบหนังสือที่ต้องการลบ' });
      }

      console.log(`[Book] Deleted id=${req.params.id} by user ${req.user.email} (role=${req.user.role})`);
      res.json({ message: 'ลบหนังสือเรียบร้อย' });
    } catch (err) {
      console.error('DELETE /api/books/:id error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ==================== Public Auth Endpoints (ไม่ต้องการ Token) ====================

// POST /api/register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await db.query(
      'INSERT INTO users (name, email, password, is_verified, verification_token) VALUES (?, ?, ?, false, ?)',
      [name, email, passwordHash, token]
    );

    const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyLink = `${backendBaseUrl}/api/verify-email?token=${token}`;

    const mailOptions = {
      from: '"Book Store System" <67310078@go.buu.ac.th>',
      to: email,
      subject: 'กรุณายืนยันตัวตนสำหรับสมัครสมาชิก - Book Store',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 500px;">
          <h2 style="color: #007bff;">ยินดีต้อนรับคุณ ${name} 👋</h2>
          <p>ขอบคุณที่สมัครสมาชิกกับ Book Store กรุณาคลิกลิงก์ด้านล่างเพื่อยืนยันตัวตน:</p>
          <div style="margin: 25px 0;">
            <a href="${verifyLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              คลิกที่นี่เพื่อยืนยันตัวตน
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">หรือคัดลอกลิงก์นี้:<br><a href="${verifyLink}">${verifyLink}</a></p>
        </div>
      `
    };

    let emailSent = false;
    try {
      await transporter.sendMail(mailOptions);
      emailSent = true;
    } catch (mailErr) {
      console.warn('Mail send failed:', mailErr.message);
      console.log(`[Dev] Verify link: ${verifyLink}`);
    }

    res.status(201).json({
      message: emailSent
        ? `ลงทะเบียนสำเร็จ! ส่งลิงก์ยืนยันตัวตนไปที่ ${email} แล้ว`
        : `ลงทะเบียนสำเร็จ! (เกิดปัญหาชั่วคราวในการส่งอีเมล)`,
      verifyLink,
      token
    });
  } catch (err) {
    console.error('Register Error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก: ' + err.message });
  }
});

// GET /api/verify-email และ /api/verify
const handleVerification = async (req, res) => {
  try {
    const { token } = req.query;
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (!token) return res.status(400).send('<h2>ไม่พบ Token</h2>');

    const [users] = await db.query('SELECT * FROM users WHERE verification_token = ?', [token]);
    if (users.length === 0) {
      return res.status(400).send(`
        <div style="text-align:center;margin-top:60px;font-family:Arial">
          <h2 style="color:#dc3545;">Token ไม่ถูกต้องหรือบัญชีนี้ยืนยันตัวตนไปแล้ว</h2>
          <p><a href="${frontendBaseUrl}/login" style="color:#007bff;">ไปยังหน้า Login</a></p>
        </div>
      `);
    }

    await db.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
      [users[0].id]
    );

    res.send(`
      <div style="text-align:center;margin-top:60px;font-family:Arial">
        <h1 style="color:#28a745;">ยืนยันตัวตนสำเร็จแล้ว! 🎉</h1>
        <p>ระบบกำลังนำคุณไปยังหน้า Login ใน 3 วินาที...</p>
        <a href="${frontendBaseUrl}/login" style="color:#007bff;">คลิกที่นี่ถ้าไม่เปลี่ยนหน้าอัตโนมัติ</a>
        <script>setTimeout(() => { window.location.href = '${frontendBaseUrl}/login'; }, 3000);</script>
      </div>
    `);
  } catch (err) {
    res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
  }
};

app.get('/api/verify-email', handleVerification);
app.get('/api/verify', handleVerification);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==============================================`);
  console.log(`  Book Store Backend — Lab 9.7 (Production Ready on Render)`);
  console.log(`  Running on port ${PORT} (0.0.0.0)`);
  console.log(`  Environment: DB_HOST=${process.env.DB_HOST || 'localhost'}, DB_PORT=${process.env.DB_PORT || '3306'}, DB_NAME=${process.env.DB_NAME || 'bookstore_db'}`);
  console.log(`==============================================`);
  console.log(`  [Public]    POST   /api/register`);
  console.log(`  [Public]    GET    /api/verify-email`);
  console.log(`  [Public]    POST   /api/login         → returns JWT with role`);
  console.log(`  [Protected] GET    /api/profile       → all logged-in users`);
  console.log(`  [RBAC]      GET    /api/books         → viewer, editor, manager, admin`);
  console.log(`  [RBAC]      GET    /api/books/:id     → viewer, editor, manager, admin`);
  console.log(`  [RBAC]      POST   /api/books         → editor, manager, admin`);
  console.log(`  [RBAC]      PUT    /api/books/:id     → editor, manager, admin`);
  console.log(`  [RBAC]      DELETE /api/books/:id     → manager, admin`);
  console.log(`==============================================\n`);
});