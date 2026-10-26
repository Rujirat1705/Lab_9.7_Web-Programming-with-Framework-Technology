require('dotenv').config();
const mysql = require('mysql2');

// Lab 9.7: Production Connection Pool รองรับ DB_PORT และ SSL สำหรับ Cloud MySQL (Aiven)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'bookstore_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// ตรวจสอบว่าถ้าไม่ใช่ localhost ให้เปิดใช้งาน SSL สำหรับ Aiven Cloud MySQL
if (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1') {
  dbConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = mysql.createPool(dbConfig);

module.exports = pool.promise();
