import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Lab 9.6: อ่าน API URL จาก Environment Variable (รองรับทั้ง CRA และ Vite)
const API_BASE =
  process.env.REACT_APP_API_URL ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  'http://localhost:5000/api';

// Helper ถอดรหัส JWT Payload รองรับภาษาไทย (UTF-8) และ Base64Url
const decodeJwt = (token) => {
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('JWT Decode Error:', err);
    return null;
  }
};

// ==================== Helper: สร้าง Axios instance ที่ใส่ JWT Header อัตโนมัติ ====================
// Lab 9.4 Step 4: Frontend ส่ง Authorization: Bearer <token> ใน Request Header
const authAxios = () => {
  const token = localStorage.getItem('token');
  return axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
};

// ==================== 1. Component ระบบจัดการหนังสือ (Book Management) ====================
function BookManagement({ user, onLogout }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [profile, setProfile] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  // Modal State
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    id: null, title: '', author: '', price: '', stock: '', category: 'Programming'
  });

  // Alert State
  const [alert, setAlert] = useState({ show: false, type: '', message: '' });
  const [tokenRemaining, setTokenRemaining] = useState(null);
  const [isTokenExpired, setIsTokenExpired] = useState(false);

  const showAlert = (type, message) => {
    setAlert({ show: true, type, message });
    setTimeout(() => setAlert({ show: false, type: '', message: '' }), 5000);
  };

  // ตรวจสอบสถานะการหมดอายุของ Token แบบ Real-time
  useEffect(() => {
    const checkTokenExpiry = () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsTokenExpired(true);
        setTokenRemaining(0);
        return;
      }
      const payload = decodeJwt(token);
      if (!payload || !payload.exp) {
        setIsTokenExpired(true);
        setTokenRemaining(0);
        return;
      }
      const diff = Math.floor((payload.exp * 1000 - Date.now()) / 1000);
      if (diff <= 0) {
        setIsTokenExpired(true);
        setTokenRemaining(0);
      } else {
        setIsTokenExpired(false);
        setTokenRemaining(diff);
      }
    };

    checkTokenExpiry();
    const interval = setInterval(checkTokenExpiry, 1000);
    return () => clearInterval(interval);
  }, []);

  // ==================== Lab 9.4 & 9.5: Handle 401/403 (Auth & RBAC) ====================
  const handleApiError = (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.reason || err.response?.data?.error || err.message;

    if (status === 401) {
      setIsTokenExpired(true);
      showAlert('error', '⛔ 401 Unauthorized: ไม่พบ Token หรือยังไม่เข้าสู่ระบบ กรุณา Login ใหม่');
      setTimeout(() => onLogout(), 2500);
    } else if (status === 403) {
      if (msg === 'Forbidden') {
        // Lab 9.5: RBAC Authorization Failed
        showAlert('error', `🚫 403 Forbidden: คุณไม่มีสิทธิ์ทำสิ่งนี้! (Role: ${user?.role || 'viewer'} ไม่ได้รับอนุญาต)`);
      } else {
        // Token หมดอายุหรือ Invalid
        setIsTokenExpired(true);
        showAlert('error', `🔒 403 Token Invalid/Expired (${msg}) — กรุณา Login ใหม่`);
        setTimeout(() => onLogout(), 3000);
      }
    } else {
      showAlert('error', msg);
    }
  };

  // Read All: GET /api/books (Protected — ต้องมี JWT)
  const fetchBooks = async () => {
    setLoading(true);
    try {
      const res = await authAxios().get('/books');
      setBooks(res.data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  // Load profile ครั้งแรก
  const fetchProfile = async () => {
    try {
      const res = await authAxios().get('/profile');
      setProfile(res.data);
    } catch (err) {
      console.warn('Profile fetch failed:', err.response?.data?.error);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read One: GET /api/books/:id
  const handleViewBook = async (id) => {
    try {
      const res = await authAxios().get(`/books/${id}`);
      setSelectedBook(res.data);
      setShowDetailModal(true);
    } catch (err) {
      handleApiError(err);
    }
  };

  // ==================== Lab 9.5: ตรวจสอบสิทธิ์ตาม Role (RBAC) ====================
  const userRole = user?.role || 'viewer';
  const canCreate = ['editor', 'manager', 'admin'].includes(userRole);
  const canEdit = ['editor', 'manager', 'admin'].includes(userRole);
  const canDelete = ['manager', 'admin'].includes(userRole);

  const handleOpenAddModal = () => {
    if (!canCreate) {
      showAlert('error', `🚫 403 Forbidden: คุณอยู่ในบทบาท "${userRole.toUpperCase()}" ไม่มีสิทธิ์เพิ่มหนังสือ (เฉพาะ editor, manager, admin)`);
      return;
    }
    if (isTokenExpired) {
      showAlert('error', '🔒 Access Token หมดอายุแล้ว! ไม่สามารถเพิ่มหนังสือได้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    setIsEditing(false);
    setFormData({ id: null, title: '', author: '', price: '', stock: '0', category: 'Programming' });
    setShowFormModal(true);
  };

  const handleOpenEditModal = (book) => {
    if (!canEdit) {
      showAlert('error', `🚫 403 Forbidden: คุณอยู่ในบทบาท "${userRole.toUpperCase()}" ไม่มีสิทธิ์แก้ไขหนังสือ (เฉพาะ editor, manager, admin)`);
      return;
    }
    if (isTokenExpired) {
      showAlert('error', '🔒 Access Token หมดอายุแล้ว! ไม่สามารถแก้ไขหนังสือได้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    setIsEditing(true);
    setFormData({ id: book.id, title: book.title, author: book.author, price: book.price, stock: book.stock, category: book.category || 'Programming' });
    setShowFormModal(true);
  };

  // Create: POST /api/books  |  Update: PUT /api/books/:id
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (isEditing && !canEdit) {
      showAlert('error', `🚫 403 Forbidden: บทบาท "${userRole.toUpperCase()}" ไม่สามารถแก้ไขได้`);
      setShowFormModal(false);
      return;
    }
    if (!isEditing && !canCreate) {
      showAlert('error', `🚫 403 Forbidden: บทบาท "${userRole.toUpperCase()}" ไม่สามารถเพิ่มหนังสือได้`);
      setShowFormModal(false);
      return;
    }
    if (isTokenExpired) {
      showAlert('error', '🔒 Access Token หมดอายุแล้ว! ปฏิเสธการบันทึก กรุณาเข้าสู่ระบบใหม่');
      setShowFormModal(false);
      return;
    }
    if (!formData.title.trim() || !formData.author.trim() || formData.price === '') {
      showAlert('error', 'กรุณากรอกชื่อหนังสือ ผู้แต่ง และราคา ให้ครบถ้วน');
      return;
    }
    try {
      const payload = { title: formData.title, author: formData.author, price: parseFloat(formData.price), stock: parseInt(formData.stock, 10) || 0, category: formData.category };
      if (isEditing) {
        await authAxios().put(`/books/${formData.id}`, payload);
        showAlert('success', `แก้ไขข้อมูลหนังสือ "${formData.title}" เรียบร้อย`);
      } else {
        await authAxios().post('/books', payload);
        showAlert('success', `เพิ่มหนังสือ "${formData.title}" สำเร็จ`);
      }
      setShowFormModal(false);
      fetchBooks();
    } catch (err) {
      handleApiError(err);
    }
  };

  // Delete: DELETE /api/books/:id
  const handleDeleteBook = async (id, title) => {
    if (!canDelete) {
      showAlert('error', `🚫 403 Forbidden: คุณอยู่ในบทบาท "${userRole.toUpperCase()}" ไม่มีสิทธิ์ลบหนังสือ! (เฉพาะ manager และ admin เท่านั้น)`);
      return;
    }
    if (isTokenExpired) {
      showAlert('error', '🔒 Access Token หมดอายุแล้ว! ไม่สามารถลบหนังสือได้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    if (window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบหนังสือ "${title}"?`)) {
      try {
        await authAxios().delete(`/books/${id}`);
        showAlert('success', `ลบหนังสือ "${title}" เรียบร้อย`);
        fetchBooks();
      } catch (err) {
        handleApiError(err);
      }
    }
  };

  // Step 9: Logout — ลบ Token ออกจาก localStorage
  const handleLogout = () => {
    localStorage.removeItem('token');  // Lab 9.4: ลบ JWT Token
    localStorage.removeItem('user');
    onLogout();
  };

  const filteredBooks = books.filter((b) => {
    const matchesSearch = b.title.toLowerCase().includes(searchTerm.toLowerCase()) || b.author.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || b.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(books.map((b) => b.category).filter(Boolean)));
  const totalStock = books.reduce((sum, b) => sum + (parseInt(b.stock, 10) || 0), 0);
  const totalPrice = books.reduce((sum, b) => sum + (parseFloat(b.price) || 0), 0);

  // แสดง JWT Token Info
  const jwtToken = localStorage.getItem('token');
  const tokenPayload = decodeJwt(jwtToken);

  return (
    <div style={{ maxWidth: '1100px', margin: '20px auto', padding: '0 15px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: 'white', padding: '20px 25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>📚 Book Management — Lab 9.5 (RBAC Authorization)</h1>
          <p style={{ margin: '5px 0 0 0', opacity: 0.9, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>ผู้ใช้: <b>{user?.name}</b> ({user?.email})</span>
            <span style={{
              backgroundColor: user?.role === 'admin' ? '#dc3545' : user?.role === 'editor' ? '#fd7e14' : user?.role === 'manager' ? '#6f42c1' : '#17a2b8',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              textTransform: 'uppercase'
            }}>
              Role: {user?.role || 'viewer'}
            </span>
            {tokenRemaining !== null && (
              <span style={{
                backgroundColor: isTokenExpired ? '#dc3545' : tokenRemaining <= 3 ? '#ffc107' : '#28a745',
                color: tokenRemaining <= 3 && !isTokenExpired ? '#212529' : 'white',
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                ⏳ Token เหลือเวลา: {isTokenExpired ? 'หมดอายุแล้ว (0s)' : `${tokenRemaining} วินาที`}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowProfile(!showProfile)}
            style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
          >
            👤 Profile
          </button>
          <button
            onClick={handleLogout}
            style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
          >
            🚪 Logout (ลบ JWT)
          </button>
        </div>
      </div>

      {/* Warning banner when Token is expired */}
      {isTokenExpired && (
        <div style={{
          marginTop: '15px',
          padding: '16px 20px',
          backgroundColor: '#fff3cd',
          border: '2px solid #dc3545',
          borderRadius: '10px',
          color: '#721c24',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 10px rgba(220,53,69,0.15)'
        }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>🔒 Access Token หมดอายุแล้ว (Token Expired)</h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              ท่านไม่สามารถแก้ไขข้อมูล เพิ่ม หรือลบหนังสือในระบบได้อีกต่อไป กรุณาเข้าสู่ระบบใหม่เพื่อขอรับ Access Token ใหม่
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginLeft: '15px'
            }}
          >
            🔑 Login ใหม่ทันที
          </button>
        </div>
      )}

      {/* RBAC Role Permission Banner */}
      <div style={{
        marginTop: '15px',
        padding: '12px 18px',
        borderRadius: '8px',
        backgroundColor: userRole === 'viewer' ? '#e2e3e5' : userRole === 'editor' ? '#fff3cd' : userRole === 'manager' ? '#e8daef' : '#d1e7dd',
        color: userRole === 'viewer' ? '#383d41' : userRole === 'editor' ? '#664d03' : userRole === 'manager' ? '#4a235a' : '#0f5132',
        border: `1px solid ${userRole === 'viewer' ? '#d3d6d8' : userRole === 'editor' ? '#ffecb5' : userRole === 'manager' ? '#d7bde2' : '#badbcc'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        fontSize: '13px'
      }}>
        <div>
          <b>🛡️ สิทธิ์ของบทบาท {userRole.toUpperCase()}:</b>{' '}
          <span>👁️ ดู (GET): <b style={{ color: '#198754' }}>✓</b></span> |{' '}
          <span>➕ เพิ่ม (POST): <b style={{ color: canCreate ? '#198754' : '#dc3545' }}>{canCreate ? '✓' : '✗'}</b></span> |{' '}
          <span>✏️ แก้ไข (PUT): <b style={{ color: canEdit ? '#198754' : '#dc3545' }}>{canEdit ? '✓' : '✗'}</b></span> |{' '}
          <span>🗑️ ลบ (DELETE): <b style={{ color: canDelete ? '#198754' : '#dc3545' }}>{canDelete ? '✓' : '✗'}</b></span>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
          {userRole === 'viewer' && 'ℹ️ คุณเป็น viewer: ดูหนังสือได้อย่างเดียว ไม่สามารถเพิ่ม แก้ไข หรือลบได้'}
          {userRole === 'editor' && 'ℹ️ คุณเป็น editor: ดู เพิ่ม และแก้ไขได้ (แต่ลบหนังสือไม่ได้)'}
          {userRole === 'manager' && 'ℹ️ คุณเป็น manager: มีสิทธิ์ดู เพิ่ม แก้ไข และลบหนังสือได้'}
          {userRole === 'admin' && '⭐ คุณเป็น admin: สิทธิ์สูงสุด จัดการหนังสือได้ครบทุกรายการ'}
        </div>
      </div>

      {/* Lab 9.5 JWT Info Panel */}
      {showProfile && (
        <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f0f8ff', border: '1px solid #b8daff', borderRadius: '10px', fontFamily: 'monospace', fontSize: '13px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#004085' }}>🔑 Lab 9.5 — JWT Token Payload (Step 3 & 4: role ใน Payload)</h4>
          {tokenPayload ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <p style={{ margin: '4px 0' }}><b>id:</b> {tokenPayload.id}</p>
                <p style={{ margin: '4px 0' }}><b>email:</b> {tokenPayload.email}</p>
                <p style={{ margin: '4px 0' }}><b>name:</b> {tokenPayload.name}</p>
                <p style={{ margin: '4px 0', color: '#d63384' }}><b>role:</b> <span style={{ fontWeight: 'bold', padding: '2px 6px', background: '#e2d9f3', borderRadius: '4px' }}>{tokenPayload.role || 'viewer'}</span></p>
                <p style={{ margin: '4px 0' }}><b>issued at (iat):</b> {new Date(tokenPayload.iat * 1000).toLocaleString('th-TH')}</p>
                <p style={{ margin: '4px 0' }}><b>expires at (exp):</b> {new Date(tokenPayload.exp * 1000).toLocaleString('th-TH')}</p>
              </div>
              <div>
                {profile && (
                  <>
                    <p style={{ margin: '4px 0', color: '#28a745' }}><b>GET /api/profile → 200 ✅</b></p>
                    <p style={{ margin: '4px 0' }}><b>is_verified:</b> {profile.is_verified ? '✅ ยืนยันแล้ว' : '❌ ยังไม่ยืนยัน'}</p>
                    <p style={{ margin: '4px 0' }}><b>สมัครเมื่อ:</b> {new Date(profile.created_at).toLocaleDateString('th-TH')}</p>
                  </>
                )}
                <p style={{ margin: '8px 0 4px 0', color: '#6c757d', fontSize: '11px', wordBreak: 'break-all' }}>
                  <b>Token Preview:</b> {jwtToken?.substring(0, 40)}...
                </p>
              </div>
            </div>
          ) : (
            <p style={{ color: '#dc3545' }}>ไม่พบ JWT Token</p>
          )}
        </div>
      )}

      {/* Alert */}
      {alert.show && (
        <div style={{ marginTop: '15px', padding: '12px 20px', borderRadius: '8px', backgroundColor: alert.type === 'success' ? '#d4edda' : '#f8d7da', color: alert.type === 'success' ? '#155724' : '#721c24', border: `1px solid ${alert.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`, fontWeight: '500' }}>
          {alert.message}
        </div>
      )}

      {/* Statistics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginTop: '20px' }}>
        <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '10px', padding: '15px 20px', borderLeft: '5px solid #007bff' }}>
          <div style={{ fontSize: '13px', color: '#6c757d' }}>จำนวนหนังสือทั้งหมด</div>
          <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#007bff', marginTop: '5px' }}>{books.length} เล่ม</div>
        </div>
        <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '10px', padding: '15px 20px', borderLeft: '5px solid #28a745' }}>
          <div style={{ fontSize: '13px', color: '#6c757d' }}>จำนวนสต็อกคงเหลือรวม</div>
          <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#28a745', marginTop: '5px' }}>{totalStock} ชิ้น</div>
        </div>
        <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '10px', padding: '15px 20px', borderLeft: '5px solid #ffc107' }}>
          <div style={{ fontSize: '13px', color: '#6c757d' }}>มูลค่ารวมในร้าน</div>
          <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#e0a800', marginTop: '5px' }}>฿{totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginTop: '25px', padding: '15px', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', gap: '10px', flex: '1', minWidth: '300px' }}>
          <input type="text" placeholder="🔍 ค้นหาชื่อหนังสือหรือผู้แต่ง..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '14px' }} />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '14px', backgroundColor: 'white' }}>
            <option value="all">📂 ทุกหมวดหมู่</option>
            {categories.map((cat, i) => <option key={i} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={fetchBooks} style={{ backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>🔄 รีเฟรช</button>
          <button
            onClick={handleOpenAddModal}
            disabled={isTokenExpired}
            title={!canCreate ? `บทบาท ${userRole.toUpperCase()} ไม่มีสิทธิ์เพิ่มหนังสือ` : 'เพิ่มหนังสือใหม่'}
            style={{
              backgroundColor: isTokenExpired ? '#6c757d' : !canCreate ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: isTokenExpired ? 'not-allowed' : !canCreate ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              opacity: isTokenExpired || !canCreate ? 0.65 : 1
            }}
          >
            {!canCreate ? '🔒 เพิ่มหนังสือ (จำกัดสิทธิ์)' : '➕ เพิ่มหนังสือ'}
          </button>
        </div>
      </div>

      {/* Books Table */}
      <div style={{ marginTop: '20px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #dee2e6', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>กำลังโหลดข้อมูล...</div>
        ) : filteredBooks.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>
            <p style={{ fontSize: '18px' }}>📭 ไม่พบรายการหนังสือ</p>
            <button
              onClick={handleOpenAddModal}
              disabled={isTokenExpired}
              style={{
                marginTop: '10px',
                backgroundColor: isTokenExpired ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '5px',
                cursor: isTokenExpired ? 'not-allowed' : 'pointer'
              }}
            >
              เพิ่มหนังสือเล่มแรก
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f3f5', borderBottom: '2px solid #dee2e6', color: '#495057' }}>
                <th style={{ padding: '14px 16px', width: '60px' }}>ID</th>
                <th style={{ padding: '14px 16px' }}>ชื่อหนังสือ</th>
                <th style={{ padding: '14px 16px' }}>ผู้แต่ง</th>
                <th style={{ padding: '14px 16px', width: '110px' }}>ราคา</th>
                <th style={{ padding: '14px 16px', width: '90px' }}>คงเหลือ</th>
                <th style={{ padding: '14px 16px', width: '130px' }}>หมวดหมู่</th>
                <th style={{ padding: '14px 16px', width: '210px', textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredBooks.map((book, index) => (
                <tr key={book.id} style={{ borderBottom: '1px solid #e9ecef', backgroundColor: index % 2 === 0 ? '#ffffff' : '#fcfcfc' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 'bold', color: '#6c757d' }}>{book.id}</td>
                  <td style={{ padding: '14px 16px', fontWeight: '600', color: '#212529' }}>{book.title}</td>
                  <td style={{ padding: '14px 16px', color: '#495057' }}>{book.author}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 'bold', color: '#0d6efd' }}>฿{parseFloat(book.price).toFixed(2)}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', backgroundColor: book.stock > 5 ? '#e8f5e9' : book.stock > 0 ? '#fff3e0' : '#ffebee', color: book.stock > 5 ? '#2e7d32' : book.stock > 0 ? '#ef6c00' : '#c62828' }}>
                      {book.stock} เล่ม
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}><span style={{ backgroundColor: '#e9ecef', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>{book.category || 'ทั่วไป'}</span></td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button onClick={() => handleViewBook(book.id)} style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>👁️ ดู</button>
                      <button
                        onClick={() => handleOpenEditModal(book)}
                        disabled={isTokenExpired}
                        title={!canEdit ? `บทบาท ${userRole.toUpperCase()} ไม่มีสิทธิ์แก้ไข` : 'แก้ไขหนังสือ'}
                        style={{
                          backgroundColor: isTokenExpired ? '#e0a800' : !canEdit ? '#adb5bd' : '#ffc107',
                          color: '#212529',
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: '4px',
                          cursor: isTokenExpired ? 'not-allowed' : !canEdit ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          opacity: isTokenExpired || !canEdit ? 0.6 : 1
                        }}
                      >
                        {!canEdit ? '🔒 แก้ไข' : '✏️ แก้ไข'}
                      </button>
                      <button
                        onClick={() => handleDeleteBook(book.id, book.title)}
                        disabled={isTokenExpired}
                        title={!canDelete ? `บทบาท ${userRole.toUpperCase()} ไม่มีสิทธิ์ลบ` : 'ลบหนังสือ'}
                        style={{
                          backgroundColor: isTokenExpired ? '#6c757d' : !canDelete ? '#6c757d' : '#dc3545',
                          color: 'white',
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: '4px',
                          cursor: isTokenExpired ? 'not-allowed' : !canDelete ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          opacity: isTokenExpired || !canDelete ? 0.6 : 1
                        }}
                      >
                        {!canDelete ? '🔒 ลบ' : '🗑️ ลบ'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showFormModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', width: '90%', maxWidth: '500px', borderRadius: '12px', padding: '25px', boxShadow: '0 5px 20px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{isEditing ? `✏️ แก้ไขหนังสือ (ID: ${formData.id})` : '➕ เพิ่มหนังสือใหม่'}</h3>
              <button onClick={() => setShowFormModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleSubmitForm}>
              {[['title', 'ชื่อหนังสือ *', 'text', 'เช่น Machine Learning เบื้องต้น'], ['author', 'ผู้แต่ง *', 'text', 'เช่น ดร. สมชาย ใจดี']].map(([field, label, type, placeholder]) => (
                <div key={field} style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>{label}:</label>
                  <input type={type} required value={formData[field]} onChange={(e) => setFormData({ ...formData, [field]: e.target.value })} placeholder={placeholder} style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '15px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>ราคา (฿) *:</label>
                  <input type="number" step="0.01" min="0" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="250.00" style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>สต็อก:</label>
                  <input type="number" min="0" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="10" style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>หมวดหมู่:</label>
                <input type="text" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="Programming, IoT, Data Science..." list="cat-list" style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
                <datalist id="cat-list">
                  {['Programming', 'IoT', 'Data Science', 'Artificial Intelligence', 'Web Development'].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                <button type="button" onClick={() => setShowFormModal(false)} style={{ backgroundColor: '#6c757d', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '6px', cursor: 'pointer' }}>ยกเลิก</button>
                <button
                  type="submit"
                  disabled={isTokenExpired}
                  style={{
                    backgroundColor: isTokenExpired ? '#6c757d' : '#007bff',
                    color: 'white',
                    border: 'none',
                    padding: '9px 24px',
                    borderRadius: '6px',
                    cursor: isTokenExpired ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: isTokenExpired ? 0.6 : 1
                  }}
                >
                  {isTokenExpired ? '🔒 Token หมดอายุ' : (isEditing ? '💾 บันทึก' : '➕ เพิ่มหนังสือ')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedBook && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', width: '90%', maxWidth: '480px', borderRadius: '12px', padding: '25px', boxShadow: '0 5px 20px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#17a2b8' }}>📖 GET /api/books/{selectedBook.id}</h3>
              <button onClick={() => setShowDetailModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ lineHeight: '1.8', fontSize: '15px' }}>
              {[['ID', selectedBook.id], ['ชื่อหนังสือ', selectedBook.title], ['ผู้แต่ง', selectedBook.author], ['ราคา', `฿${parseFloat(selectedBook.price).toFixed(2)}`], ['จำนวนในคลัง', `${selectedBook.stock} เล่ม`], ['หมวดหมู่', selectedBook.category || 'ทั่วไป']].map(([label, val]) => (
                <p key={label} style={{ margin: '6px 0' }}><b>{label}:</b> {val}</p>
              ))}
            </div>
            <div style={{ textAlign: 'right', marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <button onClick={() => setShowDetailModal(false)} style={{ backgroundColor: '#007bff', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer' }}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 2. Login Component ====================
function Login({ onSwitchToRegister, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [jwtPreview, setJwtPreview] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setJwtPreview('');
    setLoading(true);
    try {
      // POST /api/login → รับ token กลับมา
      const res = await axios.post(`${API_BASE}/login`, { email, password });
      const { token, user } = res.data;

      // Lab 9.4 Step 3: เก็บ JWT ใน localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // เปลี่ยนหน้าทันที เพื่อให้เริ่มนับถอยหลัง 10 วินาทีเต็ม
      onLoginSuccess(user);
    } catch (err) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '460px', margin: '40px auto', padding: '30px', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', fontFamily: "'Segoe UI', sans-serif", backgroundColor: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <h2 style={{ margin: '0 0 6px 0', color: '#1e3c72' }}>🔑 เข้าสู่ระบบ (Login)</h2>
        <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>Lab 9.4: JWT Authentication — หลัง Login จะได้รับ JWT Token</p>
      </div>

      {error && <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '10px 14px', borderRadius: '6px', marginBottom: '15px', fontSize: '14px' }}>⚠️ {error}</div>}
      {success && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '10px 14px', borderRadius: '6px', marginBottom: '15px', fontSize: '14px' }}>
          🎉 {success}
          {jwtPreview && (
            <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #c3e6cb' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#333' }}>JWT Token (Step 3: เก็บใน localStorage):</p>
              <code style={{ fontSize: '10px', color: '#007bff', wordBreak: 'break-all' }}>{jwtPreview.substring(0, 80)}...</code>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Email:</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="เช่น rujirat17052549@gmail.com" required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '14px' }}>Password:</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน" required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: '#28a745', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
          {loading ? 'กำลังเข้าสู่ระบบ...' : '🔑 Login (รับ JWT Token)'}
        </button>
      </form>

      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeeba', fontSize: '12px', color: '#856404' }}>
        <b>💡 Lab 9.4 Flow:</b><br />
        1. กรอก Email + Password<br />
        2. Backend ตรวจสอบด้วย bcrypt → สร้าง JWT<br />
        3. Frontend เก็บ JWT ใน localStorage<br />
        4. ทุก Request ถัดไปจะส่ง <code>Authorization: Bearer &lt;token&gt;</code>
      </div>

      <p style={{ marginTop: '15px', textAlign: 'center', fontSize: '14px' }}>
        ยังไม่มีบัญชี?{' '}
        <button onClick={onSwitchToRegister} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>สมัครสมาชิก</button>
      </p>
    </div>
  );
}

// ==================== 3. Register Component ====================
function Register({ onSwitchToLogin }) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState([]);
  const [successInfo, setSuccessInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors.length > 0) setErrors([]);
  };

  const validateForm = () => {
    const e = [];
    const { name, email, password, confirmPassword } = formData;
    if (!name.trim()) e.push('กรุณากรอกชื่อ-นามสกุล');
    if (!email.trim()) e.push('กรุณากรอกอีเมล');
    if (!password) { e.push('กรุณากรอกรหัสผ่าน'); }
    else {
      if (password.length < 8) e.push('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
      if (!/[A-Z]/.test(password)) e.push('ต้องมีตัวพิมพ์ใหญ่ A-Z');
      if (!/[a-z]/.test(password)) e.push('ต้องมีตัวพิมพ์เล็ก a-z');
      if (!/[0-9]/.test(password)) e.push('ต้องมีตัวเลข 0-9');
    }
    if (password !== confirmPassword) e.push('รหัสผ่านไม่ตรงกัน');
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessInfo(null);
    const ve = validateForm();
    if (ve.length > 0) { setErrors(ve); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/register`, { name: formData.name, email: formData.email, password: formData.password });
      setSuccessInfo(res.data);
      setFormData({ name: '', email: '', password: '', confirmPassword: '' });
    } catch (err) {
      setErrors([err.response?.data?.error || 'เกิดข้อผิดพลาด']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '460px', margin: '40px auto', padding: '30px', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', fontFamily: "'Segoe UI', sans-serif", backgroundColor: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <h2 style={{ margin: '0 0 6px 0', color: '#1e3c72' }}>📝 สมัครสมาชิก (Register)</h2>
        <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>Lab 9.2 Email Verification + Lab 9.3 bcrypt</p>
      </div>

      {errors.length > 0 && (
        <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '12px 18px', borderRadius: '6px', marginBottom: '15px', fontSize: '14px' }}>
          <strong>⚠️ กรุณาแก้ไข:</strong>
          <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {successInfo && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '16px', borderRadius: '8px', marginBottom: '18px' }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>🎉 {successInfo.message}</p>
          {successInfo.verifyLink && (
            <a href={successInfo.verifyLink} target="_blank" rel="noreferrer" style={{ display: 'inline-block', backgroundColor: '#007bff', color: 'white', padding: '6px 14px', borderRadius: '4px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold' }}>
              👉 คลิกยืนยันบัญชีทันที
            </a>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {[['name', 'ชื่อ-นามสกุล', 'text', 'เช่น สมชาย ใจดี'], ['email', 'Email', 'email', 'example@gmail.com'], ['password', 'Password (รหัสผ่าน)', 'password', 'อย่างน้อย 8 ตัว มี A-Z, a-z, 0-9'], ['confirmPassword', 'Confirm Password', 'password', 'กรอกซ้ำ']].map(([name, label, type, placeholder]) => (
          <div key={name} style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>{label}:</label>
            <input type={type} name={name} value={formData[name]} onChange={handleChange} placeholder={placeholder} style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} />
          </div>
        ))}
        <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: '#007bff', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', marginTop: '6px' }}>
          {loading ? 'กำลังลงทะเบียน...' : 'สมัครสมาชิก'}
        </button>
      </form>

      <p style={{ marginTop: '15px', textAlign: 'center', fontSize: '14px' }}>
        มีบัญชีอยู่แล้ว?{' '}
        <button onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>เข้าสู่ระบบ</button>
      </p>
    </div>
  );
}

// ==================== 4. Main App Component ====================
function App() {
  const [currentPage, setCurrentPage] = useState('login');
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Lab 9.4: ตรวจ JWT Token และ user ใน localStorage
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      const payload = decodeJwt(savedToken);
      if (payload && payload.exp && payload.exp * 1000 >= Date.now()) {
        setUser(JSON.parse(savedUser));
        setCurrentPage('home');
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setCurrentPage('login');
      }
    } else {
      const path = window.location.pathname;
      setCurrentPage(path === '/register' ? 'register' : 'login');
    }
  }, []);

  const navigateTo = (page) => {
    setCurrentPage(page);
    window.history.pushState(null, '', `/${page}`);
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    // token ถูกเก็บใน localStorage แล้วในหน้า Login
    navigateTo('home');
  };

  // Lab 9.4 Step 9: Logout — ลบ JWT Token
  const handleLogout = () => {
    localStorage.removeItem('token');  // ลบ JWT
    localStorage.removeItem('user');
    setUser(null);
    navigateTo('login');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9', paddingBottom: '40px' }}>
      {/* Navbar */}
      <nav style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e9ecef', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>📖</span>
          <span style={{ fontWeight: 'bold', fontSize: '17px', color: '#1e3c72' }}>BookStore (Lab 9.6)</span>
          <span style={{ fontSize: '11px', backgroundColor: '#0d6efd', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>.env Config</span>
          <span style={{ fontSize: '11px', backgroundColor: '#6f42c1', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>RBAC Auth</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigateTo('home')} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '500', backgroundColor: currentPage === 'home' ? '#1e3c72' : '#e9ecef', color: currentPage === 'home' ? 'white' : '#495057' }}>📚 CRUD หนังสือ</button>
          {!user ? (
            <>
              <button onClick={() => navigateTo('login')} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: currentPage === 'login' ? '#1e3c72' : '#e9ecef', color: currentPage === 'login' ? 'white' : '#495057' }}>Login</button>
              <button onClick={() => navigateTo('register')} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: currentPage === 'register' ? '#1e3c72' : '#e9ecef', color: currentPage === 'register' ? 'white' : '#495057' }}>Register</button>
            </>
          ) : (
            <button onClick={handleLogout} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '500', backgroundColor: '#dc3545', color: 'white' }}>
              Logout ({user.name})
            </button>
          )}
        </div>
      </nav>

      {/* Pages */}
      {currentPage === 'home' ? (
        <BookManagement user={user} onLogout={handleLogout} />
      ) : currentPage === 'login' ? (
        <Login onSwitchToRegister={() => navigateTo('register')} onLoginSuccess={handleLoginSuccess} />
      ) : (
        <Register onSwitchToLogin={() => navigateTo('login')} />
      )}
    </div>
  );
}

export default App;