import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// MySQL database connection
const db = await mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'securehr_db',
  port: 3306
});

async function testDatabaseConnection() {
  try {
    await db.query('SELECT 1');
    console.log('MySQL database connected successfully.');
  } catch (error) {
    console.error('MySQL database connection failed:', error.message);
  }
}

testDatabaseConnection();

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));


// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads', 'documents');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ============================================================================
// AES-256-GCM Encryption & Decryption Engine
// ============================================================================

const AES_ALGORITHM = 'aes-256-gcm';
const AES_IV_LENGTH = 12; // 96-bit IV recommended by NIST for GCM
const AES_TAG_LENGTH = 16; // 128-bit authentication tag

// Derive a 256-bit (32-byte) key from configured secret
const AES_KEY = crypto
  .createHash('sha256')
  .update(process.env.AES_MASTER_KEY || 'BestlinkCollegeOfThePhilippines_SecureHR_AES256_Key')
  .digest();

/**
 * Encrypts a plaintext Buffer using AES-256-GCM.
 * Output format: [12-byte IV][16-byte AuthTag][Ciphertext]
 */
function encryptBufferAES256(plainBuffer) {
  const iv = crypto.randomBytes(AES_IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, AES_KEY, iv, {
    authTagLength: AES_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts an AES-256-GCM encrypted Buffer and verifies its authentication tag.
 */
function decryptBufferAES256(encryptedPayload) {
  if (!encryptedPayload || encryptedPayload.length < AES_IV_LENGTH + AES_TAG_LENGTH) {
    throw new Error('Invalid or corrupted encrypted payload');
  }
  const iv = encryptedPayload.subarray(0, AES_IV_LENGTH);
  const authTag = encryptedPayload.subarray(AES_IV_LENGTH, AES_IV_LENGTH + AES_TAG_LENGTH);
  const ciphertext = encryptedPayload.subarray(AES_IV_LENGTH + AES_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, AES_KEY, iv, {
    authTagLength: AES_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Minimal valid PDF buffer for seeded documents so preview & download work seamlessly
function createSamplePdfBuffer(title, subtitle) {
  const content = `BT /F1 16 Tf 50 750 Td (${title.replace(/[()\\]/g, '')}) Tj 0 -28 Td /F1 11 Tf (${subtitle.replace(/[()\\]/g, '')}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000340 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
408
%%EOF`;
  return Buffer.from(pdf, 'utf-8');
}

// 1x1 PNG buffer for seeded PNG document
const SAMPLE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// ============================================================================
// Roles, Granular Permissions & Document Categories
// ============================================================================

const ROLE_PERMISSIONS = {
  system_admin: {
    can_view_docs: true,
    can_upload_docs: true,
    can_replace_version: true,
    can_delete_docs: true,
    can_verify_docs: true,
    can_archive_restore: true,
    can_manage_categories: true,
    can_manage_users: true,
    can_view_audit: true,
  },
  hr_admin: {
    can_view_docs: true,
    can_upload_docs: true,
    can_replace_version: true,
    can_delete_docs: true,
    can_verify_docs: true,
    can_archive_restore: true,
    can_manage_categories: true,
    can_manage_users: false,
    can_view_audit: true,
  },
  hr_staff: {
    can_view_docs: true,
    can_upload_docs: true,
    can_replace_version: true,
    can_delete_docs: false,
    can_verify_docs: false,
    can_archive_restore: false,
    can_manage_categories: false,
    can_manage_users: false,
    can_view_audit: false,
  },
};

function normalizeRole(role) {
  if (role === 'admin') return 'system_admin';
  if (role === 'employee') return 'hr_staff';
  return role || 'hr_staff';
}

function getRoleTitle(role) {
  const norm = normalizeRole(role);
  if (norm === 'system_admin') return 'System Administrator';
  if (norm === 'hr_admin') return 'HR Administrator';
  return 'HR Staff';
}

function getUserPermissions(user) {
  const norm = normalizeRole(user?.role);
  const defaults = ROLE_PERMISSIONS[norm] || ROLE_PERMISSIONS.hr_staff;
  const merged = Object.assign({}, defaults, user?.permissions || {});
  if (merged.can_archive_restore !== undefined && merged.can_archive_docs === undefined) {
    merged.can_archive_docs = merged.can_archive_restore;
  }
  if (merged.can_archive_docs !== undefined && merged.can_archive_restore === undefined) {
    merged.can_archive_restore = merged.can_archive_docs;
  }
  return merged;
}

function hasPermission(user, permKey) {
  if (!user) return false;
  const norm = normalizeRole(user.role);
  if (norm === 'system_admin') return true;
  const perms = getUserPermissions(user);
  if (permKey === 'can_archive_restore' || permKey === 'can_archive_docs') {
    return Boolean(perms.can_archive_restore || perms.can_archive_docs);
  }
  return Boolean(perms[permKey]);
}

// ============================================================================
// Standard Research Paper Document Categories (Dynamic Category Management)
// ============================================================================

const categories = new Map([
  [
    'CAT-1',
    {
      id: 'CAT-1',
      name: 'Employee Records',
      description: 'Personal profiles, government IDs, NBI clearances, bio-data, 201 file',
      color: '#2563EB',
      icon: 'user',
      created_at: '2026-01-01',
    },
  ],
  [
    'CAT-2',
    {
      id: 'CAT-2',
      name: 'Application Documents',
      description: 'Curriculum Vitae, cover letters, resumes, application forms, references',
      color: '#7C3AED',
      icon: 'file-text',
      created_at: '2026-01-01',
    },
  ],
  [
    'CAT-3',
    {
      id: 'CAT-3',
      name: 'Employment Records',
      description: 'Employment contracts, appointment letters, job offers, promotion notices',
      color: '#059669',
      icon: 'briefcase',
      created_at: '2026-01-01',
    },
  ],
  [
    'CAT-4',
    {
      id: 'CAT-4',
      name: 'Performance Records',
      description: 'Annual evaluations, IPCR, performance reviews, commendations, KPI ratings',
      color: '#D97706',
      icon: 'award',
      created_at: '2026-01-01',
    },
  ],
  [
    'CAT-5',
    {
      id: 'CAT-5',
      name: 'Training Documents',
      description: 'PRC professional licenses, training certificates, seminar completion slips',
      color: '#0891B2',
      icon: 'book',
      created_at: '2026-01-01',
    },
  ],
  [
    'CAT-6',
    {
      id: 'CAT-6',
      name: 'Other Personnel Files',
      description: 'Medical clearances, fit-to-work slips, miscellaneous compliance papers',
      color: '#6B7280',
      icon: 'folder',
      created_at: '2026-01-01',
    },
  ],
]);

// Map legacy category names to research paper categories
function canonicalizeCategory(cat) {
  if (!cat) return 'Other Personnel Files';
  const trimmed = String(cat).trim();
  // Check exact active match
  for (const c of categories.values()) {
    if (c.name.toLowerCase() === trimmed.toLowerCase()) return c.name;
  }
  const map = {
    contract: 'Employment Records',
    payslip: 'Employment Records',
    certificate: 'Training Documents',
    id: 'Employee Records',
    other: 'Other Personnel Files',
  };
  return map[trimmed.toLowerCase()] || trimmed;
}

// ============================================================================
// In-Memory Data Store (Three-Tier Role Architecture)
// ============================================================================

const employees = new Map([
  [
    'ADM-001',
    {
      id: 'ADM-001',
      first_name: 'Admin',
      last_name: 'Account',
      email: 'admin@bestlink.edu.ph',
      department: 'Administration',
      position: 'Chief Information Officer & System Administrator',
      role: 'system_admin',
      permissions: Object.assign({}, ROLE_PERMISSIONS.system_admin),
      status: 'active',
      password: bcrypt.hashSync('admin123', 10),
      date_added: '2026-01-01',
    },
  ],
  [
    'ADM-002',
    {
      id: 'ADM-002',
      first_name: 'Elena',
      last_name: 'Ramos',
      email: 'hr.admin@bestlink.edu.ph',
      department: 'Human Resources',
      position: 'HR Administrator & Operations Officer',
      role: 'hr_admin',
      permissions: Object.assign({}, ROLE_PERMISSIONS.hr_admin),
      status: 'active',
      password: bcrypt.hashSync('admin123', 10),
      date_added: '2026-01-15',
    },
  ],
  [
    'EMP-001',
    {
      id: 'EMP-001',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      email: 'juan.delacruz@bestlink.edu.ph',
      department: 'Human Resources',
      position: 'HR Staff / Records Specialist',
      role: 'hr_staff',
      permissions: Object.assign({}, ROLE_PERMISSIONS.hr_staff),
      status: 'active',
      password: bcrypt.hashSync('employee123', 10),
      date_added: '2026-08-01',
    },
  ],
  [
    'EMP-002',
    {
      id: 'EMP-002',
      first_name: 'Maria',
      last_name: 'Santos',
      email: 'maria.santos@bestlink.edu.ph',
      department: 'Finance',
      position: 'Senior Accountant / HR Staff',
      role: 'hr_staff',
      permissions: Object.assign({}, ROLE_PERMISSIONS.hr_staff),
      status: 'active',
      password: bcrypt.hashSync('employee123', 10),
      date_added: '2026-08-05',
    },
  ],
  [
    'EMP-003',
    {
      id: 'EMP-003',
      first_name: 'Roberto',
      last_name: 'Reyes',
      email: 'roberto.reyes@bestlink.edu.ph',
      department: 'IT Department',
      position: 'Systems Engineer',
      role: 'hr_staff',
      permissions: Object.assign({}, ROLE_PERMISSIONS.hr_staff),
      status: 'inactive',
      password: bcrypt.hashSync('employee123', 10),
      date_added: '2026-07-20',
    },
  ],
  [
    'ADM-901',
    {
      id: 'ADM-901',
      first_name: 'Richard',
      last_name: 'Dantes',
      email: 'dantesrichard901@gmail.com',
      department: 'Administration',
      position: 'Senior System Administrator & Security Officer',
      role: 'system_admin',
      permissions: Object.assign({}, ROLE_PERMISSIONS.system_admin),
      status: 'active',
      password: bcrypt.hashSync('admin123', 10),
      date_added: '2026-01-01',
    },
  ],
]);

function createSeededEncryptedDoc({
  id,
  employee_id,
  title,
  file_name,
  file_type,
  category,
  uploaded_by,
  uploaded_at,
  display_size,
  note,
  plainBuffer,
  created_at,
  status = 'Verified',
  access_level = 'shared',
  review_note = '',
  reviewed_by = 'Admin Account',
  reviewed_at = '2026-08-01',
  version = 1,
  versions = null,
  archived_at = null,
  archived_by = null,
}) {
  const encryptedBuffer = encryptBufferAES256(plainBuffer);
  const sizeStr = display_size || formatBytes(plainBuffer.length);
  const canonicalCat = canonicalizeCategory(category);
  const versionsList = versions || [
    {
      version,
      file_name,
      file_size: sizeStr,
      uploaded_by,
      uploaded_at,
      version_note: 'Initial document upload',
    },
  ];

  return {
    id,
    employee_id,
    title,
    file_name,
    file_type,
    category: canonicalCat,
    uploaded_by,
    uploaded_at,
    file_size: sizeStr,
    encrypted_size: formatBytes(encryptedBuffer.length),
    original_bytes: plainBuffer.length,
    encrypted_bytes: encryptedBuffer.length,
    note,
    file_path: null,
    encrypted_data: encryptedBuffer,
    encryption_algorithm: 'AES-256-GCM',
    status,
    access_level,
    review_note,
    reviewed_by,
    reviewed_at,
    created_at,
    version,
    versions: versionsList,
    archived_at,
    archived_by,
  };
}

const documents = new Map([
  [
    'DOC-1',
    createSeededEncryptedDoc({
      id: 'DOC-1',
      employee_id: 'EMP-001',
      title: 'Employment Contract 2026',
      file_name: 'Employment_Contract_JuanDelaCruz.pdf',
      file_type: 'application/pdf',
      category: 'Employment Records',
      uploaded_by: 'ADM-001',
      uploaded_at: '2026-08-01',
      display_size: '245 KB',
      note: 'Signed permanent employment contract',
      plainBuffer: createSamplePdfBuffer(
        'Employment Contract 2026',
        'Employee: Juan Dela Cruz (EMP-001) - Signed permanent employment contract'
      ),
      created_at: new Date('2026-08-01T09:15:00Z').getTime(),
      status: 'Verified',
      access_level: 'shared',
      reviewed_by: 'Admin Account',
      reviewed_at: '2026-08-01',
      version: 1,
    }),
  ],
  [
    'DOC-2',
    createSeededEncryptedDoc({
      id: 'DOC-2',
      employee_id: 'EMP-001',
      title: 'PRC Professional License',
      file_name: 'PRC_License_JuanDelaCruz.pdf',
      file_type: 'application/pdf',
      category: 'Training Documents',
      uploaded_by: 'EMP-001',
      uploaded_at: '2026-08-02',
      display_size: '180 KB',
      note: 'Professional Regulation Commission license',
      plainBuffer: createSamplePdfBuffer(
        'PRC Professional License',
        'Employee: Juan Dela Cruz (EMP-001) - Professional Regulation Commission license'
      ),
      created_at: new Date('2026-08-02T11:30:00Z').getTime(),
      status: 'Verified',
      access_level: 'shared',
      reviewed_by: 'Admin Account',
      reviewed_at: '2026-08-03',
      version: 1,
    }),
  ],
  [
    'DOC-3',
    createSeededEncryptedDoc({
      id: 'DOC-3',
      employee_id: 'EMP-002',
      title: 'Official Transcript of Records',
      file_name: 'TOR_MariaSantos.pdf',
      file_type: 'application/pdf',
      category: 'Training Documents',
      uploaded_by: 'EMP-002',
      uploaded_at: '2026-08-06',
      display_size: '520 KB',
      note: 'Undergraduate academic records (Permanent compliance document)',
      plainBuffer: createSamplePdfBuffer(
        'Official Transcript of Records',
        'Employee: Maria Santos (EMP-002) - Undergraduate academic records'
      ),
      created_at: new Date('2026-08-06T14:00:00Z').getTime(),
      status: 'Pending',
      access_level: 'shared',
      version: 1,
    }),
  ],
  [
    'DOC-4',
    createSeededEncryptedDoc({
      id: 'DOC-4',
      employee_id: 'EMP-001',
      title: 'NBI Clearance 2026',
      file_name: 'NBI_Clearance.png',
      file_type: 'image/png',
      category: 'Employee Records',
      uploaded_by: 'EMP-001',
      uploaded_at: '2026-08-10',
      display_size: '410 KB',
      note: 'Security clearance certificate',
      plainBuffer: SAMPLE_PNG_BUFFER,
      created_at: new Date('2026-08-10T16:45:00Z').getTime(),
      status: 'Verified',
      access_level: 'shared',
      reviewed_by: 'Admin Account',
      reviewed_at: '2026-08-11',
      version: 1,
    }),
  ],
  [
    'DOC-5',
    createSeededEncryptedDoc({
      id: 'DOC-5',
      employee_id: 'EMP-001',
      title: 'Internal Performance & Disciplinary Evaluation 2026',
      file_name: 'Performance_Evaluation_Confidential_JuanDelaCruz.pdf',
      file_type: 'application/pdf',
      category: 'Performance Records',
      uploaded_by: 'ADM-001',
      uploaded_at: '2026-08-15',
      display_size: '310 KB',
      note: 'Confidential HR Director assessment and promotional eligibility notes',
      plainBuffer: createSamplePdfBuffer(
        'Confidential Performance Evaluation 2026',
        'Employee: Juan Dela Cruz (EMP-001) - Strictly Confidential HR Administration Eyes Only'
      ),
      created_at: new Date('2026-08-15T14:30:00Z').getTime(),
      status: 'Verified',
      access_level: 'hr_only',
      reviewed_by: 'Admin Account',
      reviewed_at: '2026-08-15',
      version: 1,
    }),
  ],
  [
    'DOC-6',
    createSeededEncryptedDoc({
      id: 'DOC-6',
      employee_id: 'EMP-002',
      title: 'Annual Medical & Fit-To-Work Certificate 2025-2026',
      file_name: 'Medical_FitToWork_Certificate_MariaSantos.pdf',
      file_type: 'application/pdf',
      category: 'Other Personnel Files',
      uploaded_by: 'EMP-002',
      uploaded_at: '2025-09-15',
      display_size: '275 KB',
      note: 'Annual employee health clearance certificate',
      plainBuffer: createSamplePdfBuffer(
        'Annual Medical Clearance',
        'Employee: Maria Santos (EMP-002) - Annual Fit to Work Health Clearance'
      ),
      created_at: new Date('2025-09-15T10:00:00Z').getTime(),
      status: 'Verified',
      access_level: 'shared',
      reviewed_by: 'Admin Account',
      reviewed_at: '2025-09-16',
      version: 1,
    }),
  ],
  [
    'DOC-7',
    createSeededEncryptedDoc({
      id: 'DOC-7',
      employee_id: 'EMP-001',
      title: 'Previous Fixed-Term Employment Contract 2024-2025',
      file_name: 'Archived_Contract_JuanDelaCruz_2024.pdf',
      file_type: 'application/pdf',
      category: 'Employment Records',
      uploaded_by: 'ADM-001',
      uploaded_at: '2024-08-01',
      display_size: '230 KB',
      note: 'Superseded previous fiscal year appointment contract (Archived record)',
      plainBuffer: createSamplePdfBuffer(
        'Archived Employment Contract 2024-2025',
        'Employee: Juan Dela Cruz (EMP-001) - Historical archived record'
      ),
      created_at: new Date('2024-08-01T09:00:00Z').getTime(),
      status: 'Archived',
      access_level: 'shared',
      reviewed_by: 'Admin Account',
      reviewed_at: '2025-08-01',
      version: 1,
      archived_at: '2025-08-01',
      archived_by: 'Admin Account',
    }),
  ],
]);

// Load and encrypt any existing file in uploads/documents
const existingDocx = path.join(uploadsDir, 'DOC-1789805142721_SF-SHIRT-SIZES-TEMPLATE__1_.docx');
if (fs.existsSync(existingDocx)) {
  const rawBuffer = fs.readFileSync(existingDocx);
  documents.set(
    'DOC-1789805142721',
    createSeededEncryptedDoc({
      id: 'DOC-1789805142721',
      employee_id: 'EMP-001',
      title: 'SF-SHIRT-SIZES-TEMPLATE (1).docx',
      file_name: 'SF-SHIRT-SIZES-TEMPLATE (1).docx',
      file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      category: 'Other',
      uploaded_by: 'EMP-001',
      uploaded_at: '2026-08-12',
      display_size: formatBytes(rawBuffer.length),
      note: 'Uploaded template document',
      plainBuffer: rawBuffer,
      created_at: new Date('2026-08-12T10:00:00Z').getTime(),
    })
  );
}

const sessions = new Map();
const passwordResets = [];
let auditIdCounter = 4;

const notifications = [];
let notifIdCounter = 1;
const emailDispatches = [];
let dispatchIdCounter = 1;

function createNotification({ userId = null, role = null, title, message, type = 'info', link = 'section-documents', meta = null, dispatchEmail = false }) {
  const notif = {
    id: notifIdCounter++,
    userId,
    role: role || (userId === 'admin' ? 'admin' : (userId ? 'employee' : 'all')),
    title,
    message,
    type, // 'success' | 'warning' | 'error' | 'info'
    link,
    meta,
    read: false,
    created_at: new Date().toISOString(),
  };
  notifications.unshift(notif);
  if (notifications.length > 200) notifications.pop();

  if (dispatchEmail) {
    let recipientEmail = 'admin@bestlink.edu.ph';
    let recipientName = 'HR Administration';
    if (userId && userId !== 'admin') {
      const emp = employees.get(userId);
      if (emp) {
        recipientEmail = emp.email;
        recipientName = `${emp.first_name} ${emp.last_name}`;
      }
    }
    emailDispatches.unshift({
      id: dispatchIdCounter++,
      recipientEmail,
      recipientName,
      subject: `[SecureHR] ${title}`,
      snippet: message,
      type,
      timestamp: new Date().toISOString(),
      status: 'DISPATCHED_OK',
    });
    if (emailDispatches.length > 100) emailDispatches.pop();
  }

  return notif;
}

// Seed initial system notifications for demonstration
createNotification({
  userId: 'EMP-002',
  role: 'employee',
  title: 'Document Approved',
  message: 'Official Employment Contract 2026 has been verified and certified by HR Administration.',
  type: 'success',
  link: 'section-documents',
  dispatchEmail: true,
});
createNotification({
  userId: 'admin',
  role: 'admin',
  title: 'Pending Document Submission',
  message: 'EMP-002 Maria Santos uploaded NBI_Clearance.png — Awaiting HR verification.',
  type: 'info',
  link: 'section-documents',
  dispatchEmail: false,
});

const auditLog = [
  {
    id: 3,
    actor: 'Admin Account',
    actorId: 'ADM-001',
    action: 'AES_ENCRYPT',
    target: 'Document Repository',
    details: 'Encrypted stored HR documents at rest using AES-256-GCM',
    timestamp: new Date(Date.now() - 1800 * 1000).toISOString(),
  },
  {
    id: 2,
    actor: 'Admin Account',
    actorId: 'ADM-001',
    action: 'LOGIN',
    target: '-',
    details: 'Signed in as HR Admin',
    timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
  {
    id: 1,
    actor: 'Admin Account',
    actorId: 'ADM-001',
    action: 'SYSTEM_INIT',
    target: '-',
    details: 'SecureHR database initialized with standard schema and AES-256-GCM encryption',
    timestamp: new Date(Date.now() - 7200 * 1000).toISOString(),
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function sendSuccess(res, data = null, message = 'Success', code = 200) {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  return res.status(code).json(payload);
}

function sendError(res, message = 'An error occurred', code = 400, data = null) {
  const payload = { success: false, message };
  if (data !== null) payload.data = data;
  return res.status(code).json(payload);
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/Bearer\s+(\S+)/i);
  if (match) return match[1];
  if (req.query.token) return String(req.query.token).trim();
  return '';
}

function verifyEmployeePassword(user, password) {
  const stored = user.password || '';
  if (!stored) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    const normalized = stored.replace(/^\$2y\$/, '$2a$');
    if (bcrypt.compareSync(password, normalized)) return true;
  }
  if (stored === password) {
    user.password = bcrypt.hashSync(password, 10);
    return true;
  }
  return false;
}

function requireAuth(req, res, allowedRoles = null) {
  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 'Authentication required', 401);
    return null;
  }

  const sess = sessions.get(token);
  if (!sess || !sess.is_active || new Date(sess.expires_at).getTime() <= Date.now()) {
    sendError(res, 'Session expired or invalid', 401);
    return null;
  }

  const emp = employees.get(sess.employee_id);
  if (!emp) {
    sendError(res, 'Session expired or invalid', 401);
    return null;
  }

  if (emp.status !== 'active') {
    sendError(res, 'Your account is inactive. Please contact the HR administrator.', 403);
    return null;
  }

  const userRole = emp.role;
  const normRole = normalizeRole(userRole);

  if (allowedRoles !== null) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const isAllowed = roles.some((r) => {
      if (r === userRole || r === normRole) return true;
      if (r === 'admin' && (normRole === 'system_admin' || normRole === 'hr_admin')) return true;
      if (r === 'employee' && normRole === 'hr_staff') return true;
      return false;
    });

    if (!isAllowed) {
      sendError(res, 'You do not have permission to perform this action.', 403);
      return null;
    }
  }

  sess.last_activity = new Date().toISOString();

  return {
    id: emp.id,
    firstName: emp.first_name,
    lastName: emp.last_name,
    email: emp.email,
    department: emp.department,
    position: emp.position || getRoleTitle(emp.role),
    role: emp.role,
    normalizedRole: normRole,
    roleTitle: getRoleTitle(emp.role),
    permissions: getUserPermissions(emp),
    status: emp.status,
    dateAdded: emp.date_added,
    fullName: `${emp.first_name} ${emp.last_name}`.trim(),
    token,
  };
}

function logAudit(actor, actorId, action, target = '-', details = '') {
  auditLog.unshift({
    id: auditIdCounter++,
    actor,
    actorId,
    action,
    target,
    details,
    timestamp: new Date().toISOString(),
  });
}

function mapEmployeeRow(row) {
  const normRole = normalizeRole(row.role);
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    department: row.department,
    position: row.position || getRoleTitle(row.role),
    role: row.role,
    normalizedRole: normRole,
    roleTitle: getRoleTitle(row.role),
    permissions: getUserPermissions(row),
    status: row.status,
    dateAdded: row.date_added,
  };
}

function mapDocumentRow(row) {
  const emp = employees.get(row.employee_id);
  const currentVersion = row.version || 1;
  const versionsList = Array.isArray(row.versions) && row.versions.length > 0
    ? row.versions
    : [
        {
          version: currentVersion,
          file_name: row.file_name,
          file_size: row.file_size || '—',
          uploaded_by: row.uploaded_by,
          uploaded_at: row.uploaded_at,
          version_note: 'Initial document upload',
        },
      ];

  return {
    id: String(row.id),
    employeeId: row.employee_id,
    fileName: row.file_name,
    fileType: row.file_type || 'application/octet-stream',
    category: canonicalizeCategory(row.category),
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    size: row.file_size || '—',
    encryptedSize: row.encrypted_size || row.file_size || '—',
    encryptionAlgorithm: row.encryption_algorithm || 'AES-256-GCM',
    isEncrypted: true,
    note: row.note || '',
    status: row.status || 'Verified',
    accessLevel: row.access_level || 'shared',
    reviewNote: row.review_note || '',
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at || '',
    hasFilePath: Boolean(row.file_path || row.encrypted_data),
    employeeName: emp ? `${emp.first_name} ${emp.last_name}`.trim() : '',
    version: currentVersion,
    versionsCount: versionsList.length,
    versions: versionsList,
    isArchived: row.status === 'Archived',
    archivedAt: row.archived_at || null,
    archivedBy: row.archived_by || null,
  };
}

function nextEmployeeId() {
  let maxNum = 0;
  for (const id of employees.keys()) {
    const m = id.match(/^EMP-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return 'EMP-' + String(maxNum + 1).padStart(3, '0');
}

function safeDownloadFilename(name) {
  let clean = String(name || '').replace(/[\\/]/g, '_');
  clean = path.basename(clean).replace(/[^\w.\- ()]/g, '_').trim();
  return clean || 'download';
}

function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return { buffer: null, mime: 'application/octet-stream' };
  const trimmed = dataUrl.trim();
  if (trimmed.startsWith('data:')) {
    const parts = trimmed.split(',');
    const meta = parts[0] || '';
    const base64Data = parts.slice(1).join(',');
    const mimeMatch = meta.match(/data:([^;]+);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    try {
      return { buffer: Buffer.from(base64Data, 'base64'), mime };
    } catch {
      return { buffer: null, mime };
    }
  }
  return { buffer: Buffer.from(trimmed, 'utf-8'), mime: 'application/octet-stream' };
}

// ============================================================================
// Route: /api/health.php & /api/health
// ============================================================================

app.get(['/api/health.php', '/api/health'], (req, res) => {
  return sendSuccess(res, {
    status: 'healthy',
    uptimeSeconds: Math.round(process.uptime()),
    aesEncryption: 'AES-256-GCM',
    totalEmployees: employees.size,
    totalDocuments: documents.size,
    totalAuditLogs: auditLog.length,
    activeSessions: Array.from(sessions.values()).filter(s => s.is_active).length,
  }, 'SecureHR server is operational');
});

// ============================================================================
// Route: /api/auth.php
// ============================================================================

app.all('/api/auth.php', (req, res) => {
  const action = String(req.query.action || '');
  const input = req.body || {};

  if (action === 'login') {
    const username = String(input.username || '').trim();
    const password = String(input.password || '');
    const role = String(input.role || '').trim();

    if (!username || !password) {
      return sendError(res, 'Username and password are required', 400);
    }

    const uLower = username.toLowerCase();
    let user = null;
    for (const emp of employees.values()) {
      if (
        emp.email.toLowerCase() === uLower ||
        emp.id.toLowerCase() === uLower ||
        emp.first_name.toLowerCase() === uLower ||
        (emp.role === 'admin' && uLower === 'admin')
      ) {
        user = emp;
        break;
      }
    }

    if (!user || !verifyEmployeePassword(user, password)) {
      return sendError(res, 'Invalid username or password. Please try again.', 401);
    }

    if (role) {
      const userNorm = normalizeRole(user.role);
      const reqNorm = normalizeRole(role);
      const matches =
        user.role === role ||
        userNorm === reqNorm ||
        (role === 'admin' && (userNorm === 'system_admin' || userNorm === 'hr_admin')) ||
        (role === 'employee' && userNorm === 'hr_staff') ||
        (user.role === 'admin' && (reqNorm === 'system_admin' || reqNorm === 'hr_admin'));
      if (!matches) {
        return sendError(res, 'This account does not have permission to access that portal.', 403);
      }
    }

    if (user.status !== 'active') {
      return sendError(res, 'Your account is inactive. Please contact the HR administrator.', 403);
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 3600 * 1000).toISOString();

    sessions.set(sessionToken, {
      id: sessionToken,
      employee_id: user.id,
      role: user.role,
      login_time: now.toISOString(),
      last_activity: now.toISOString(),
      expires_at: expiresAt,
      is_active: 1,
    });

    const actorName = `${user.first_name} ${user.last_name}`;
    const roleTitle = getRoleTitle(user.role);
    logAudit(actorName, user.id, 'LOGIN', '-', `Signed in as ${roleTitle}`);

    return sendSuccess(
      res,
      {
        user: mapEmployeeRow(user),
        permissions: getUserPermissions(user),
        token: sessionToken,
      },
      'Login successful!'
    );
  }

  if (action === 'logout') {
    let token = getBearerToken(req);
    if (!token && input.token) token = String(input.token);

    if (token && sessions.has(token)) {
      const sess = sessions.get(token);
      sess.is_active = 0;
      const emp = employees.get(sess.employee_id);
      if (emp) {
        logAudit(`${emp.first_name} ${emp.last_name}`, emp.id, 'LOGOUT', '-', 'User logged out');
      }
    }
    return sendSuccess(res, null, 'Logged out successfully');
  }

  if (action === 'change_password') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const currentPassword = String(input.currentPassword || '');
    const newPassword = String(input.newPassword || '');

    if (!currentPassword || !newPassword) {
      return sendError(res, 'All password fields are required', 400);
    }
    if (newPassword.length < 6) {
      return sendError(res, 'New password must be at least 6 characters', 400);
    }
    if (currentPassword === newPassword) {
      return sendError(res, 'New password must be different from your current password', 400);
    }

    const user = employees.get(auth.id);
    if (!user) return sendError(res, 'Employee record not found', 404);

    if (!verifyEmployeePassword(user, currentPassword)) {
      return sendError(res, 'Current password is incorrect', 401);
    }

    user.password = bcrypt.hashSync(newPassword, 10);
    logAudit(auth.fullName, auth.id, 'CHANGE_PASSWORD', auth.id, 'Changed account password');
    return sendSuccess(res, null, 'Password updated successfully');
  }

  if (action === 'forgot_password') {
    const target = String(input.emailOrId || input.email || input.username || '').trim();
    if (!target) {
      return sendError(res, 'Please enter your registered email address or Employee ID', 400);
    }

    const tLower = target.toLowerCase();
    let emp = null;
    for (const e of employees.values()) {
      if (e.email.toLowerCase() === tLower || e.id.toLowerCase() === tLower) {
        emp = e;
        break;
      }
    }

    if (!emp) {
      return sendError(res, 'No account found with the provided email or Employee ID.', 404);
    }
    if (emp.status !== 'active') {
      return sendError(res, 'This account is inactive. Please contact the HR department.', 403);
    }

    const tempPassword = 'Reset#' + Math.floor(1000 + Math.random() * 9000);
    const resetToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    passwordResets.push({
      email: emp.email,
      token: resetToken,
      temp_password: tempPassword,
      expires_at: expiresAt,
      used: 0,
    });

    emp.password = bcrypt.hashSync(tempPassword, 10);
    const fullName = `${emp.first_name} ${emp.last_name}`;
    logAudit(fullName, emp.id, 'FORGOT_PASSWORD', emp.email, `Self-service password reset requested for ${fullName} (${emp.id})`);

    return sendSuccess(
      res,
      {
        employeeId: emp.id,
        email: emp.email,
        temporaryPassword: tempPassword,
      },
      'A temporary password has been successfully generated!'
    );
  }

  if (action === 'check') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return sendSuccess(res, {
      user: {
        id: auth.id,
        firstName: auth.firstName,
        lastName: auth.lastName,
        email: auth.email,
        department: auth.department,
        role: auth.role,
        status: auth.status,
        dateAdded: auth.dateAdded,
      },
    });
  }

  return sendError(res, 'Invalid action specified', 400);
});

// ============================================================================
// Route: /api/employees.php
// ============================================================================

app.all('/api/employees.php', (req, res) => {
  const method = req.method.toUpperCase();
  const action = String(req.query.action || '');
  const input = req.body || {};

  if (method === 'GET') {
    if (action === 'next_id') {
      const auth = requireAuth(req, res, 'admin');
      if (!auth) return;
      return sendSuccess(res, { nextId: nextEmployeeId() });
    }

    if (req.query.id) {
      const auth = requireAuth(req, res);
      if (!auth) return;
      const targetId = String(req.query.id);
      const isAdmin = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
      if (!isAdmin && auth.id !== targetId) {
        return sendError(res, 'You do not have permission to view this employee.', 403);
      }
      const emp = employees.get(targetId);
      if (!emp) return sendError(res, 'Employee not found', 404);
      return sendSuccess(res, mapEmployeeRow(emp));
    }

    const auth = requireAuth(req, res);
    if (!auth) return;

    const roleFilter = String(req.query.role || 'all');
    const search = String(req.query.search || '').trim().toLowerCase();
    const department = String(req.query.department || '').trim();
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limitParam = String(req.query.limit || '');
    const usePagination = limitParam !== '' && limitParam !== 'all' && parseInt(limitParam, 10) > 0;
    const limit = usePagination ? Math.min(100, Math.max(1, parseInt(limitParam, 10))) : 0;

    let list = Array.from(employees.values());

    const isAdminLister = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
    if (!isAdminLister) {
      list = list.filter((e) => e.id === auth.id);
    } else {
      if (roleFilter === 'staff' || roleFilter === 'employee') {
        list = list.filter((e) => e.role !== 'admin');
      } else if (roleFilter === 'admin') {
        list = list.filter((e) => e.role === 'admin');
      }

      if (department && department !== 'all') {
        list = list.filter((e) => e.department === department);
      }

      if (status && status !== 'all') {
        list = list.filter((e) => e.status === status);
      }

      if (search) {
        list = list.filter(
          (e) =>
            e.first_name.toLowerCase().includes(search) ||
            e.last_name.toLowerCase().includes(search) ||
            e.id.toLowerCase().includes(search) ||
            e.email.toLowerCase().includes(search) ||
            e.department.toLowerCase().includes(search)
        );
      }
    }

    const total = list.length;
    const mapped = list.map(mapEmployeeRow);

    if (usePagination) {
      const offset = (page - 1) * limit;
      const paged = mapped.slice(offset, offset + limit);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return sendSuccess(res, {
        employees: paged,
        pagination: { page, limit, total, totalPages },
      });
    }

    return sendSuccess(res, mapped);
  }

  if (method === 'POST') {
    const auth = requireAuth(req, res, ['system_admin', 'hr_admin', 'admin']);
    if (!auth) return;

    if (!hasPermission(auth, 'can_manage_users') && auth.normalizedRole !== 'system_admin') {
      return sendError(res, 'Access denied: User account provisioning and password resets are restricted to System Administrators.', 403);
    }

    if (action === 'reset_password') {
      const id = String(input.id || '').trim();
      if (!id) return sendError(res, 'Employee ID is required', 400);

      const emp = employees.get(id);
      if (!emp) return sendError(res, 'Employee not found', 404);

      const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
      let tempPassword = 'Temp#';
      for (let i = 0; i < 5; i++) {
        tempPassword += chars[Math.floor(Math.random() * chars.length)];
      }

      emp.password = bcrypt.hashSync(tempPassword, 10);
      const fullName = `${emp.first_name} ${emp.last_name}`;
      logAudit(auth.fullName, auth.id, 'RESET_PASSWORD', `${fullName} (${id})`, `Admin reset password for ${fullName}. Temporary password issued.`);

      return sendSuccess(
        res,
        {
          temporaryPassword: tempPassword,
          employeeId: id,
          employeeName: fullName,
          email: emp.email,
        },
        `Password has been successfully reset for ${fullName}!`
      );
    }

    const firstName = String(input.firstName || input.first_name || '').trim();
    const lastName = String(input.lastName || input.last_name || '').trim();
    const email = String(input.email || '').trim();
    const department = String(input.department || '').trim();
    const position = String(input.position || '').trim();
    const validRoles = ['system_admin', 'hr_admin', 'hr_staff', 'admin', 'employee'];
    const roleInput = String(input.role || 'hr_staff').trim();
    const role = validRoles.includes(roleInput) ? roleInput : 'hr_staff';
    const status = ['active', 'inactive'].includes(input.status) ? input.status : 'active';
    const password = String(input.password || 'emp123');
    const id = String(input.id || '').trim() || nextEmployeeId();
    const permissions = input.permissions && typeof input.permissions === 'object'
      ? Object.assign({}, ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.hr_staff, input.permissions)
      : Object.assign({}, ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.hr_staff);

    if (!firstName || !lastName || !email || !department) {
      return sendError(res, 'First name, last name, email, and department are required', 400);
    }

    if (password.length < 6) {
      return sendError(res, 'Password must be at least 6 characters', 400);
    }

    if (employees.has(id)) {
      return sendError(res, 'That employee ID is already in use.', 400);
    }

    for (const e of employees.values()) {
      if (e.email.toLowerCase() === email.toLowerCase()) {
        return sendError(res, 'That email address is already registered.', 400);
      }
    }

    const dateAdded = new Date().toISOString().split('T')[0];
    const newRow = {
      id,
      first_name: firstName,
      last_name: lastName,
      email,
      department,
      position: position || getRoleTitle(role),
      role,
      permissions,
      status,
      password: bcrypt.hashSync(password, 10),
      date_added: dateAdded,
    };

    employees.set(id, newRow);
    const roleTitle = getRoleTitle(role);
    logAudit(auth.fullName, auth.id, 'CREATE_USER', `${firstName} ${lastName} (${id})`, `Created new ${roleTitle} account in ${department} with status: ${status}`);

    return sendSuccess(res, mapEmployeeRow(newRow), 'Employee account created successfully!', 201);
  }

  if (method === 'PUT' || method === 'PATCH') {
    const auth = requireAuth(req, res, ['system_admin', 'hr_admin', 'admin']);
    if (!auth) return;

    if (!hasPermission(auth, 'can_manage_users') && auth.normalizedRole !== 'system_admin') {
      return sendError(res, 'You do not have permission to manage user accounts.', 403);
    }

    const id = String(input.id || req.query.id || '').trim();
    if (!id) return sendError(res, 'Employee ID is required for update', 400);

    const curr = employees.get(id);
    if (!curr) return sendError(res, 'Employee not found', 404);

    const firstName = input.firstName !== undefined ? String(input.firstName).trim() : (input.first_name !== undefined ? String(input.first_name).trim() : curr.first_name);
    const lastName = input.lastName !== undefined ? String(input.lastName).trim() : (input.last_name !== undefined ? String(input.last_name).trim() : curr.last_name);
    const email = input.email !== undefined ? String(input.email).trim() : curr.email;
    const department = input.department !== undefined ? String(input.department).trim() : curr.department;
    const position = input.position !== undefined ? String(input.position).trim() : (curr.position || '');
    const validRoles = ['system_admin', 'hr_admin', 'hr_staff', 'admin', 'employee'];
    const role = input.role && validRoles.includes(input.role) ? input.role : curr.role;
    const status = ['active', 'inactive'].includes(input.status) ? input.status : curr.status;
    const password = String(input.password || '');

    for (const e of employees.values()) {
      if (e.id !== id && e.email.toLowerCase() === email.toLowerCase()) {
        return sendError(res, 'That email is already in use by another employee.', 400);
      }
    }

    curr.first_name = firstName;
    curr.last_name = lastName;
    curr.email = email;
    curr.department = department;
    if (position) curr.position = position;
    curr.role = role;
    curr.status = status;

    if (input.permissions && typeof input.permissions === 'object') {
      curr.permissions = Object.assign({}, ROLE_PERMISSIONS[normalizeRole(role)] || {}, input.permissions);
    }

    if (password) {
      if (password.length < 6) {
        return sendError(res, 'Password must be at least 6 characters', 400);
      }
      curr.password = bcrypt.hashSync(password, 10);
    }

    logAudit(auth.fullName, auth.id, 'UPDATE_USER', `${firstName} ${lastName} (${id})`, `Updated employee details: ${department}, role: ${getRoleTitle(role)}, status: ${status}`);
    return sendSuccess(res, mapEmployeeRow(curr), 'Employee updated successfully!');
  }

  if (method === 'DELETE') {
    const auth = requireAuth(req, res, ['system_admin', 'hr_admin', 'admin']);
    if (!auth) return;

    if (!hasPermission(auth, 'can_manage_users') && auth.normalizedRole !== 'system_admin') {
      return sendError(res, 'You do not have permission to delete user accounts.', 403);
    }

    const id = String(input.id || req.query.id || '').trim();
    if (!id) return sendError(res, 'Employee ID is required', 400);
    if (id === auth.id) return sendError(res, 'You cannot delete your own account.', 403);

    const emp = employees.get(id);
    if (!emp) return sendError(res, 'Employee not found', 404);
    if (normalizeRole(emp.role) === 'system_admin') return sendError(res, 'Cannot delete a System Administrator account.', 403);

    employees.delete(id);
    for (const [docId, doc] of documents.entries()) {
      if (doc.employee_id === id) documents.delete(docId);
    }

    logAudit(auth.fullName, auth.id, 'DELETE_USER', `${emp.first_name} ${emp.last_name} (${id})`, `Deleted employee account from ${emp.department}`);
    return sendSuccess(res, null, 'Employee deleted successfully!');
  }

  return sendError(res, 'Method not allowed', 405);
});

// ============================================================================
// Route: /api/categories.php (Dynamic Category Management)
// ============================================================================

app.all(['/api/categories.php', '/api/categories'], (req, res) => {
  const method = req.method.toUpperCase();
  const input = req.body || {};

  if (method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    // Tally document counts per category
    const catList = Array.from(categories.values()).map((c) => {
      let count = 0;
      let activeCount = 0;
      let archivedCount = 0;
      for (const doc of documents.values()) {
        if (canonicalizeCategory(doc.category) === c.name) {
          count++;
          if (doc.status === 'Archived') archivedCount++;
          else activeCount++;
        }
      }
      return {
        id: c.id,
        name: c.name,
        description: c.description || '',
        color: c.color || '#2563EB',
        icon: c.icon || 'folder',
        documentCount: count,
        activeCount,
        archivedCount,
        created_at: c.created_at || '2026-01-01',
      };
    });

    return sendSuccess(res, catList);
  }

  if (method === 'POST') {
    const auth = requireAuth(req, res, ['system_admin', 'hr_admin', 'admin']);
    if (!auth) return;

    if (!hasPermission(auth, 'can_manage_categories') && auth.normalizedRole !== 'system_admin' && auth.normalizedRole !== 'hr_admin') {
      return sendError(res, 'You do not have permission to manage document categories.', 403);
    }

    const name = String(input.name || '').trim();
    const description = String(input.description || '').trim();
    const color = String(input.color || '#2563EB').trim();
    const icon = String(input.icon || 'folder').trim();

    if (!name) return sendError(res, 'Category name is required', 400);

    for (const c of categories.values()) {
      if (c.name.toLowerCase() === name.toLowerCase()) {
        return sendError(res, 'A category with this name already exists', 400);
      }
    }

    const id = `CAT-${Date.now()}`;
    const newCategory = {
      id,
      name,
      description,
      color,
      icon,
      created_at: new Date().toISOString().split('T')[0],
    };

    categories.set(id, newCategory);
    logAudit(auth.fullName, auth.id, 'CREATE_CATEGORY', name, `Created new document category: "${name}" (${color})`);

    return sendSuccess(res, newCategory, 'Document category created successfully!', 201);
  }

  if (method === 'PUT' || method === 'PATCH') {
    const auth = requireAuth(req, res, ['system_admin', 'hr_admin', 'admin']);
    if (!auth) return;

    if (!hasPermission(auth, 'can_manage_categories') && auth.normalizedRole !== 'system_admin' && auth.normalizedRole !== 'hr_admin') {
      return sendError(res, 'You do not have permission to manage document categories.', 403);
    }

    const id = String(input.id || req.query.id || '').trim();
    if (!id) return sendError(res, 'Category ID is required', 400);

    const cat = categories.get(id);
    if (!cat) return sendError(res, 'Category not found', 404);

    const oldName = cat.name;
    const newName = input.name !== undefined ? String(input.name).trim() : oldName;
    const description = input.description !== undefined ? String(input.description).trim() : cat.description;
    const color = input.color !== undefined ? String(input.color).trim() : cat.color;
    const icon = input.icon !== undefined ? String(input.icon).trim() : cat.icon;

    if (!newName) return sendError(res, 'Category name cannot be empty', 400);

    for (const [cId, c] of categories.entries()) {
      if (cId !== id && c.name.toLowerCase() === newName.toLowerCase()) {
        return sendError(res, 'Another category with this name already exists', 400);
      }
    }

    cat.name = newName;
    cat.description = description;
    cat.color = color;
    cat.icon = icon;

    // If category was renamed, update all existing documents referencing the old name
    if (oldName !== newName) {
      let docsUpdated = 0;
      for (const doc of documents.values()) {
        if (doc.category === oldName) {
          doc.category = newName;
          docsUpdated++;
        }
      }
      logAudit(auth.fullName, auth.id, 'RENAME_CATEGORY', `${oldName} -> ${newName}`, `Renamed category and updated ${docsUpdated} linked document records`);
    } else {
      logAudit(auth.fullName, auth.id, 'UPDATE_CATEGORY', newName, `Updated metadata for category "${newName}"`);
    }

    return sendSuccess(res, cat, 'Category updated successfully!');
  }

  if (method === 'DELETE') {
    const auth = requireAuth(req, res, ['system_admin', 'hr_admin', 'admin']);
    if (!auth) return;

    if (!hasPermission(auth, 'can_manage_categories') && auth.normalizedRole !== 'system_admin' && auth.normalizedRole !== 'hr_admin') {
      return sendError(res, 'You do not have permission to manage document categories.', 403);
    }

    const id = String(input.id || req.query.id || '').trim();
    if (!id) return sendError(res, 'Category ID is required', 400);

    const cat = categories.get(id);
    if (!cat) return sendError(res, 'Category not found', 404);

    // Count documents referencing this category
    const linkedDocs = [];
    for (const [docId, doc] of documents.entries()) {
      if (doc.category === cat.name || canonicalizeCategory(doc.category) === cat.name) {
        linkedDocs.push(docId);
      }
    }

    const reassignTo = String(input.reassignTo || '').trim();
    if (linkedDocs.length > 0) {
      if (!reassignTo) {
        return sendError(
          res,
          `Cannot delete category "${cat.name}" because it contains ${linkedDocs.length} document(s). Reassign them first or specify 'reassignTo'.`,
          400,
          { linkedCount: linkedDocs.length }
        );
      }
      // Reassign to target
      for (const dId of linkedDocs) {
        const d = documents.get(dId);
        if (d) d.category = reassignTo;
      }
    }

    categories.delete(id);
    logAudit(auth.fullName, auth.id, 'DELETE_CATEGORY', cat.name, `Deleted category "${cat.name}" (reassigned ${linkedDocs.length} documents to "${reassignTo || 'None'}")`);

    return sendSuccess(res, null, `Category "${cat.name}" deleted successfully!`);
  }

  return sendError(res, 'Method not allowed', 405);
});

// ============================================================================
// Route: /api/documents.php
// ============================================================================

app.all('/api/documents.php', (req, res) => {
  const method = req.method.toUpperCase();
  const action = String(req.query.action || '');
  const input = req.body || {};

  if (method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    if (action === 'version_history') {
      const docId = String(req.query.id || '').trim();
      const doc = documents.get(docId);
      if (!doc) return sendError(res, 'Document not found', 404);

      if (auth.normalizedRole === 'hr_staff' && doc.employee_id !== auth.id) {
        return sendError(res, 'You do not have permission to view version history for this document.', 403);
      }

      return sendSuccess(res, {
        id: doc.id,
        fileName: doc.file_name,
        currentVersion: doc.version || 1,
        versions: doc.versions || [],
      });
    }

    if ((action === 'download' || action === 'preview') && req.query.id) {
      const docId = String(req.query.id);
      const doc = documents.get(docId);
      if (!doc) return sendError(res, 'Document not found', 404);

      if (auth.normalizedRole === 'hr_staff') {
        if (auth.id !== doc.employee_id || doc.access_level === 'hr_only') {
          return sendError(res, 'You do not have permission to access this document.', 403);
        }
      }

      const fileName = safeDownloadFilename(doc.file_name);
      const storedType = doc.file_type || 'application/octet-stream';
      let encryptedPayload = doc.encrypted_data || null;

      if ((!encryptedPayload || encryptedPayload.length === 0) && doc.file_path) {
        const diskPath = path.join(__dirname, doc.file_path);
        if (fs.existsSync(diskPath)) {
          encryptedPayload = fs.readFileSync(diskPath);
        }
      }

      if (!encryptedPayload || encryptedPayload.length === 0) {
        return sendError(res, 'No encrypted file data available for this document', 404);
      }

      let decryptedBinary;
      try {
        decryptedBinary = decryptBufferAES256(encryptedPayload);
      } catch (err) {
        return sendError(res, 'AES-256-GCM decryption or integrity verification failed.', 500);
      }

      const originalSizeDisplay = doc.file_size || formatBytes(decryptedBinary.length);
      const encryptedSizeDisplay = doc.encrypted_size || formatBytes(encryptedPayload.length);

      const downloadReason = String(req.query.reason || req.headers['x-download-reason'] || '').trim();
      const auditDetails = downloadReason
        ? `Verified & decrypted ${doc.category} document (v${doc.version || 1}) via AES-256-GCM. Purpose: "${downloadReason}" (${encryptedSizeDisplay} encrypted -> ${originalSizeDisplay})`
        : `Verified & decrypted ${doc.category} document (v${doc.version || 1}) via AES-256-GCM (${encryptedSizeDisplay} encrypted -> ${originalSizeDisplay})`;

      logAudit(
        auth.fullName,
        auth.id,
        'AES_DECRYPT',
        fileName,
        auditDetails
      );

      const disposition = 'attachment'; // Strictly delivered as secure attachment
      res.setHeader('Content-Type', storedType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${fileName.replace(/["\r\n]/g, '')}"`);
      res.setHeader('Content-Length', decryptedBinary.length);
      res.setHeader('X-File-Name', encodeURIComponent(fileName));
      res.setHeader('X-File-Type', storedType);
      res.setHeader('X-Encryption-Algorithm', 'AES-256-GCM');
      res.setHeader('X-Encryption-Status', 'Verified & Decrypted for Authorized Session');
      res.setHeader('X-Original-Size', originalSizeDisplay);
      res.setHeader('X-Encrypted-Size', encryptedSizeDisplay);
      res.setHeader('X-Document-Id', doc.id);
      res.setHeader('X-Document-Status', doc.status || 'Pending');
      res.setHeader('X-Document-Version', String(doc.version || 1));
      res.setHeader('X-Verified-By', encodeURIComponent(doc.reviewed_by || 'HR Administrator'));
      res.setHeader('X-Verified-At', doc.reviewed_at ? new Date(doc.reviewed_at).toISOString() : '');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(decryptedBinary);
    }

    const employeeId = String(req.query.employee_id || '');
    const category = String(req.query.category || '');
    const statusFilter = String(req.query.status || '');
    const accessFilter = String(req.query.access_level || '');
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();
    const isArchivedParam = String(req.query.is_archived || '').trim();
    const sortBy = String(req.query.sort_by || 'date_desc').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limitParam = String(req.query.limit || '');
    const usePagination = limitParam !== '' && limitParam !== 'all' && parseInt(limitParam, 10) > 0;
    const limit = usePagination ? Math.min(100, Math.max(1, parseInt(limitParam, 10))) : 0;

    let list = Array.from(documents.values());

    const isStaff = auth.normalizedRole === 'hr_staff';

    if (isStaff) {
      // Employees can only see their own documents that are NOT marked HR-Only
      list = list.filter((d) => d.employee_id === auth.id && d.access_level !== 'hr_only');
    } else {
      if (employeeId && employeeId !== 'all') {
        list = list.filter((d) => d.employee_id === employeeId);
      }
      if (accessFilter && accessFilter !== 'all') {
        list = list.filter((d) => (d.access_level || 'shared') === accessFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        list = list.filter((d) => (d.status || 'Verified') === statusFilter);
      }
    }

    // Category Filter
    if (category && category !== 'all') {
      const canonicalReq = canonicalizeCategory(category);
      list = list.filter((d) => canonicalizeCategory(d.category) === canonicalReq || d.category === category);
    }

    // Date Range Filter (Search by Date Range / Specific Date)
    if (dateFrom) {
      list = list.filter((d) => d.uploaded_at >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((d) => d.uploaded_at <= dateTo);
    }

    // Dedicated Archive Filter
    if (isArchivedParam === 'true') {
      list = list.filter((d) => d.status === 'Archived');
    } else if (isArchivedParam === 'false') {
      list = list.filter((d) => d.status !== 'Archived');
    } else if (!statusFilter && !isStaff && isArchivedParam !== 'all') {
      // In default view, if neither archive nor status specified, show active (exclude archived unless requested)
      // Note: we can keep both or default to active
    }

    // Keyword Search
    if (search) {
      list = list.filter((d) => {
        const emp = employees.get(d.employee_id);
        const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : '';
        return (
          d.file_name.toLowerCase().includes(search) ||
          d.employee_id.toLowerCase().includes(search) ||
          empName.includes(search) ||
          (d.note || '').toLowerCase().includes(search) ||
          canonicalizeCategory(d.category).toLowerCase().includes(search)
        );
      });
    }

    // Explicit Sort Order Controls
    if (sortBy === 'name_asc') {
      list.sort((a, b) => a.file_name.localeCompare(b.file_name));
    } else if (sortBy === 'name_desc') {
      list.sort((a, b) => b.file_name.localeCompare(a.file_name));
    } else if (sortBy === 'date_asc') {
      list.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    } else if (sortBy === 'date_desc') {
      list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    } else if (sortBy === 'size_asc') {
      list.sort((a, b) => (a.original_bytes || 0) - (b.original_bytes || 0));
    } else if (sortBy === 'size_desc') {
      list.sort((a, b) => (b.original_bytes || 0) - (a.original_bytes || 0));
    } else if (sortBy === 'category_asc') {
      list.sort((a, b) => canonicalizeCategory(a.category).localeCompare(canonicalizeCategory(b.category)));
    } else if (sortBy === 'status_asc') {
      list.sort((a, b) => (a.status || 'Verified').localeCompare(b.status || 'Verified'));
    } else {
      list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    }

    const mapped = list.map(mapDocumentRow);
    const total = mapped.length;

    if (usePagination) {
      const offset = (page - 1) * limit;
      const paged = mapped.slice(offset, offset + limit);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return sendSuccess(res, {
        documents: paged,
        pagination: { page, limit, total, totalPages },
      });
    }

    return sendSuccess(res, { documents: mapped });
  }

  if (method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    // Handle Direct "Replace Document" (File Version Replacement)
    if (action === 'replace' || action === 'replace_version') {
      const docId = String(input.id || req.query.id || '').trim();
      if (!docId) return sendError(res, 'Document ID is required for version replacement', 400);

      const doc = documents.get(docId);
      if (!doc) return sendError(res, 'Document not found', 404);

      const isDocOwner = doc.employee_id === auth.id;
      const canReplace = hasPermission(auth, 'can_replace_version');
      const isAdminTier = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';

      if (!isAdminTier && (!isDocOwner || !canReplace)) {
        return sendError(res, 'You do not have permission to replace this document version.', 403);
      }

      let fileName = String(input.fileName || '').trim();
      let fileType = String(input.fileType || '').trim();
      const fileData = input.fileData || null;
      const versionNote = String(input.versionNote || input.note || 'Updated version replaced').trim();

      if (!fileName) return sendError(res, 'New file name is required', 400);

      const { buffer, mime } = decodeDataUrl(fileData);
      if (!buffer || buffer.length === 0) {
        return sendError(res, 'File content is required for replacement', 400);
      }
      if (buffer.length > 15 * 1024 * 1024) {
        return sendError(res, 'File is too large. Maximum size is 15MB.', 400);
      }
      if (!fileType) fileType = mime;
      fileName = safeDownloadFilename(fileName);

      const oldVersionNumber = doc.version || 1;
      const nextVersionNumber = oldVersionNumber + 1;
      const oldSizeStr = doc.file_size || '—';
      const oldFileName = doc.file_name;

      if (!Array.isArray(doc.versions)) {
        doc.versions = [
          {
            version: oldVersionNumber,
            file_name: oldFileName,
            file_size: oldSizeStr,
            uploaded_by: doc.uploaded_by,
            uploaded_at: doc.uploaded_at,
            version_note: 'Original version',
          },
        ];
      }

      const encryptedBuffer = encryptBufferAES256(buffer);
      const originalSizeStr = String(input.size || formatBytes(buffer.length)).trim();
      const encryptedSizeStr = formatBytes(encryptedBuffer.length);
      const dateUpdated = new Date().toISOString().split('T')[0];

      doc.versions.unshift({
        version: nextVersionNumber,
        file_name: fileName,
        file_size: originalSizeStr,
        uploaded_by: auth.id,
        uploaded_at: dateUpdated,
        version_note: versionNote,
      });

      doc.version = nextVersionNumber;
      doc.file_name = fileName;
      doc.title = fileName;
      doc.file_type = fileType;
      doc.file_size = originalSizeStr;
      doc.encrypted_size = encryptedSizeStr;
      doc.original_bytes = buffer.length;
      doc.encrypted_bytes = encryptedBuffer.length;
      doc.encrypted_data = encryptedBuffer;
      doc.uploaded_by = auth.id;
      doc.uploaded_at = dateUpdated;
      doc.created_at = Date.now();
      if (input.category) doc.category = canonicalizeCategory(input.category);
      if (isAdminTier && input.status) {
        doc.status = input.status;
      } else if (!isAdminTier) {
        doc.status = 'Pending';
      }

      logAudit(
        auth.fullName,
        auth.id,
        'REPLACE_DOCUMENT_VERSION',
        fileName,
        `Replaced document "${doc.id}" with version v${nextVersionNumber} ("${fileName}", ${originalSizeStr}). Reason: ${versionNote}`
      );

      createNotification({
        userId: doc.employee_id,
        role: 'employee',
        title: 'Document Version Replaced',
        message: `Version v${nextVersionNumber} of "${fileName}" was successfully uploaded.${versionNote ? ' Note: ' + versionNote : ''}`,
        type: 'info',
        link: 'section-documents',
        meta: { docId: doc.id, version: nextVersionNumber },
        dispatchEmail: true,
      });

      return sendSuccess(res, mapDocumentRow(doc), `Document successfully replaced with version v${nextVersionNumber}!`);
    }

    // Handle Direct "Archive Document"
    if (action === 'archive') {
      const docId = String(input.id || req.query.id || '').trim();
      if (!docId) return sendError(res, 'Document ID is required for archive', 400);

      const doc = documents.get(docId);
      if (!doc) return sendError(res, 'Document not found', 404);

      if (!hasPermission(auth, 'can_archive_restore') && auth.normalizedRole !== 'system_admin' && auth.normalizedRole !== 'hr_admin') {
        return sendError(res, 'You do not have permission to archive documents.', 403);
      }

      doc.status = 'Archived';
      doc.archived_at = new Date().toISOString().split('T')[0];
      doc.archived_by = auth.fullName;
      if (input.archiveReason) {
        doc.review_note = String(input.archiveReason).trim();
      }

      logAudit(
        auth.fullName,
        auth.id,
        'ARCHIVE_DOCUMENT',
        doc.file_name,
        `Archived document "${doc.file_name}" (${doc.id}): ${input.archiveReason || 'Moved to dedicated Archive module'}`
      );

      return sendSuccess(res, mapDocumentRow(doc), 'Document moved to Archive module!');
    }

    // Handle One-Click "Restore Archived Document"
    if (action === 'restore') {
      const docId = String(input.id || req.query.id || '').trim();
      if (!docId) return sendError(res, 'Document ID is required for restore', 400);

      const doc = documents.get(docId);
      if (!doc) return sendError(res, 'Document not found', 404);

      if (!hasPermission(auth, 'can_archive_restore') && auth.normalizedRole !== 'system_admin' && auth.normalizedRole !== 'hr_admin') {
        return sendError(res, 'You do not have permission to restore archived documents.', 403);
      }

      doc.status = 'Verified';
      doc.archived_at = null;
      doc.archived_by = null;
      doc.reviewed_by = auth.fullName;
      doc.reviewed_at = new Date().toISOString().split('T')[0];

      logAudit(
        auth.fullName,
        auth.id,
        'RESTORE_DOCUMENT',
        doc.file_name,
        `Restored archived document "${doc.file_name}" (${doc.id}) back to Active repository`
      );

      createNotification({
        userId: doc.employee_id,
        role: 'employee',
        title: 'Document Restored',
        message: `Your archived document "${doc.file_name}" has been restored to the Active repository by ${auth.fullName}.`,
        type: 'success',
        link: 'section-documents',
        meta: { docId: doc.id },
        dispatchEmail: true,
      });

      return sendSuccess(res, mapDocumentRow(doc), 'Document restored to Active repository!');
    }

    // Handle Document Review Action (Verify / Reject / Archive) by Admin
    if (action === 'review') {
      if (!hasPermission(auth, 'can_verify_docs') && auth.normalizedRole !== 'system_admin' && auth.normalizedRole !== 'hr_admin') {
        return sendError(res, 'Only authorized HR Administrators can review and verify documents.', 403);
      }

      const id = String(input.id || req.query.id || '').trim();
      if (!id) return sendError(res, 'Document ID is required for review', 400);

      const doc = documents.get(id);
      if (!doc) return sendError(res, 'Document not found', 404);

      const reviewStatus = String(input.status || '').trim();
      if (reviewStatus && !['Verified', 'Rejected', 'Pending', 'Archived'].includes(reviewStatus)) {
        return sendError(res, 'Invalid status. Must be Verified, Rejected, Pending, or Archived.', 400);
      }

      if (reviewStatus) {
        doc.status = reviewStatus;
        if (reviewStatus === 'Archived') {
          doc.archived_at = new Date().toISOString().split('T')[0];
          doc.archived_by = auth.fullName;
        } else {
          doc.archived_at = null;
          doc.archived_by = null;
        }
      }

      if (input.reviewNote !== undefined) {
        doc.review_note = String(input.reviewNote || '').trim();
      }

      let visibilityChanged = false;
      if (input.accessLevel && ['shared', 'hr_only'].includes(input.accessLevel)) {
        if (doc.access_level !== input.accessLevel) {
          doc.access_level = input.accessLevel;
          visibilityChanged = true;
        }
      }

      doc.reviewed_by = auth.fullName;
      doc.reviewed_at = new Date().toISOString().split('T')[0];

      const reviewNote = doc.review_note || '';
      let auditAction = 'UPDATE_DOCUMENT_STATUS';
      if (reviewStatus === 'Verified') auditAction = 'VERIFY_DOCUMENT';
      else if (reviewStatus === 'Rejected') auditAction = 'REJECT_DOCUMENT';
      else if (reviewStatus === 'Archived') auditAction = 'ARCHIVE_DOCUMENT';
      else if (visibilityChanged && !reviewStatus) auditAction = 'UPDATE_DOCUMENT_ACCESS';

      const visibilityText = doc.access_level === 'hr_only' ? 'HR-Only (Confidential)' : 'Shared with Employee';
      logAudit(
        auth.fullName,
        auth.id,
        auditAction,
        doc.file_name,
        `Admin ${auth.fullName} updated document for employee ${doc.employee_id}: Status [${doc.status}], Visibility [${visibilityText}]${reviewNote ? ` (Remarks: ${reviewNote})` : ''}`
      );

      // Automated Notification & Email Dispatch to Employee
      if (reviewStatus === 'Verified') {
        createNotification({
          userId: doc.employee_id,
          role: 'employee',
          title: 'Document Verified',
          message: `Your document "${doc.file_name}" has been verified and approved by HR Administration.${doc.review_note ? ' Remarks: ' + doc.review_note : ''}`,
          type: 'success',
          link: 'section-documents',
          meta: { docId: doc.id, status: doc.status },
          dispatchEmail: true,
        });
      } else if (reviewStatus === 'Rejected') {
        createNotification({
          userId: doc.employee_id,
          role: 'employee',
          title: 'Document Action Required (Rejected)',
          message: `Your document "${doc.file_name}" was rejected by HR. Reason: ${doc.review_note || 'Please review and re-upload compliant documentation.'}`,
          type: 'error',
          link: 'section-documents',
          meta: { docId: doc.id, status: doc.status },
          dispatchEmail: true,
        });
      } else if (reviewStatus === 'Archived') {
        createNotification({
          userId: doc.employee_id,
          role: 'employee',
          title: 'Document Archived',
          message: `Your document "${doc.file_name}" has been marked as Archived in the Dedicated Archive Module.`,
          type: 'info',
          link: 'section-documents',
          meta: { docId: doc.id, status: doc.status },
          dispatchEmail: false,
        });
      }

      return sendSuccess(res, mapDocumentRow(doc), `Document updated: Status [${doc.status}], Visibility [${visibilityText}]`);
    }

    // Document Upload
    if (!hasPermission(auth, 'can_upload_docs')) {
      return sendError(res, 'You do not have permission to upload documents.', 403);
    }

    const id = String(input.id || `DOC-${Date.now()}`).trim();
    const isAdminTier = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
    const employeeId = !isAdminTier ? auth.id : String(input.employeeId || '').trim();
    let fileName = String(input.fileName || '').trim();
    let fileType = String(input.fileType || '').trim();
    const category = canonicalizeCategory(input.category);
    const note = String(input.note || '').trim();
    const fileData = input.fileData || null;

    if (!employeeId) return sendError(res, 'Employee ID is required for document upload', 400);
    if (!fileName) return sendError(res, 'File name is required', 400);

    const { buffer, mime } = decodeDataUrl(fileData);
    if (!buffer || buffer.length === 0) {
      return sendError(res, 'File content is required', 400);
    }
    if (buffer.length > 15 * 1024 * 1024) {
      return sendError(res, 'File is too large. Maximum size is 15MB.', 400);
    }
    if (!fileType) fileType = mime;

    fileName = safeDownloadFilename(fileName);
    const emp = employees.get(employeeId);
    if (!emp) return sendError(res, 'Employee not found.', 404);

    // Visibility / Access Level: Only Admin can designate a document as HR-Only
    const accessLevel = isAdminTier && input.accessLevel === 'hr_only' ? 'hr_only' : 'shared';
    // Status: Admin uploads default to Verified, Employee uploads default to Pending
    const status = isAdminTier ? (input.status || 'Verified') : 'Pending';

    // Encrypt the document payload using AES-256-GCM before saving to disk or memory
    const encryptedBuffer = encryptBufferAES256(buffer);
    const originalSizeStr = String(input.size || formatBytes(buffer.length)).trim();
    const encryptedSizeStr = formatBytes(encryptedBuffer.length);

    const safeDiskName = `${id}_${fileName.replace(/[^\w.\-]/g, '_')}.enc`;
    const diskPath = path.join(uploadsDir, safeDiskName);
    const relativePath = `uploads/documents/${safeDiskName}`;
    try {
      fs.writeFileSync(diskPath, encryptedBuffer);
    } catch {
      // Ignore disk write issues if container filesystem is restricted; in-memory encrypted buffer is kept
    }

    const dateAdded = new Date().toISOString().split('T')[0];
    const newDoc = {
      id,
      employee_id: employeeId,
      title: fileName,
      file_name: fileName,
      file_type: fileType,
      category,
      uploaded_by: auth.id,
      uploaded_at: dateAdded,
      file_size: originalSizeStr,
      encrypted_size: encryptedSizeStr,
      original_bytes: buffer.length,
      encrypted_bytes: encryptedBuffer.length,
      file_path: relativePath,
      note,
      encrypted_data: encryptedBuffer,
      encryption_algorithm: 'AES-256-GCM',
      status,
      access_level: accessLevel,
      review_note: '',
      reviewed_by: isAdminTier ? auth.fullName : '',
      reviewed_at: isAdminTier ? dateAdded : '',
      created_at: Date.now(),
      version: 1,
      versions: [
        {
          version: 1,
          file_name: fileName,
          file_size: originalSizeStr,
          uploaded_by: auth.id,
          uploaded_at: dateAdded,
          version_note: note || 'Initial document upload',
        },
      ],
      archived_at: null,
      archived_by: null,
    };

    documents.set(id, newDoc);

    const empName = `${emp.first_name} ${emp.last_name}`;
    logAudit(
      auth.fullName,
      auth.id,
      'UPLOAD_DOCUMENT',
      fileName,
      `Uploaded ${category} document for ${empName} (${employeeId}) [${originalSizeStr}] ${accessLevel === 'hr_only' ? '[HR Only]' : '[Shared]'}`
    );
    logAudit(
      auth.fullName,
      auth.id,
      'AES_ENCRYPT',
      fileName,
      `Encrypted document at rest with AES-256-GCM (${originalSizeStr} -> ${encryptedSizeStr} cipher payload)`
    );

    // Notification dispatches on document upload
    if (!isAdminTier) {
      createNotification({
        userId: 'admin',
        role: 'admin',
        title: 'New Document Uploaded',
        message: `${empName} (${employeeId}) uploaded "${fileName}" (${category}) awaiting HR verification.`,
        type: 'info',
        link: 'section-documents',
        meta: { docId: id, employeeId },
        dispatchEmail: false,
      });
    } else if (accessLevel === 'shared') {
      createNotification({
        userId: employeeId,
        role: 'employee',
        title: 'Official Document Available',
        message: `HR Administration uploaded an official ${category} record: "${fileName}".`,
        type: 'info',
        link: 'section-documents',
        meta: { docId: id },
        dispatchEmail: true,
      });
    }

    return sendSuccess(res, mapDocumentRow(newDoc), 'Document encrypted with AES-256-GCM and uploaded!', 201);
  }

  if (method === 'DELETE') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const id = String(input.id || req.query.id || '').trim();
    if (!id) return sendError(res, 'Document ID is required', 400);

    const doc = documents.get(id);
    if (!doc) return sendError(res, 'Document not found', 404);

    const isAdminTier = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';

    if (!isAdminTier) {
      if (!hasPermission(auth, 'can_delete_docs')) {
        return sendError(res, 'You do not have permission to delete documents.', 403);
      }
      if (doc.employee_id !== auth.id || doc.access_level === 'hr_only') {
        return sendError(res, 'You do not have permission to delete this document.', 403);
      }
      if (doc.uploaded_by !== auth.id) {
        return sendError(res, 'Official documents uploaded by HR Administration are locked and cannot be deleted.', 403);
      }
      if (doc.status === 'Verified' || doc.status === 'Archived') {
        return sendError(res, 'Verified and Archived documents are locked and cannot be deleted. Contact HR Administration for assistance.', 403);
      }
    } else {
      if (!hasPermission(auth, 'can_delete_docs') && auth.normalizedRole !== 'system_admin') {
        return sendError(res, 'Your user account does not have permission to delete documents.', 403);
      }
    }

    if (doc.file_path) {
      const fullPath = path.join(__dirname, doc.file_path);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore
        }
      }
    }

    documents.delete(id);
    logAudit(auth.fullName, auth.id, 'DELETE_DOCUMENT', doc.file_name, `Deleted ${doc.category} document (v${doc.version || 1}) for employee ${doc.employee_id}`);
    return sendSuccess(res, null, 'Document deleted successfully!');
  }

  return sendError(res, 'Method not allowed', 405);
});

// ============================================================================
// Route: /api/audit.php
// ============================================================================

app.get('/api/audit.php', (req, res) => {
  const auth = requireAuth(req, res, 'admin');
  if (!auth) return;

  let limit = parseInt(String(req.query.limit || '200'), 10);
  if (!limit || limit <= 0 || limit > 1000) limit = 200;
  const action = String(req.query.action || '');

  let logs = auditLog;
  if (action && action !== 'all') {
    logs = logs.filter((entry) => entry.action === action);
  }

  return sendSuccess(res, logs.slice(0, limit));
});

// ============================================================================
// Route: /api/notifications.php & /api/notifications
// ============================================================================

app.all(['/api/notifications.php', '/api/notifications'], (req, res) => {
  const method = req.method.toUpperCase();
  const action = String(req.query.action || '');
  const auth = requireAuth(req, res);
  if (!auth) return;

  if (method === 'GET') {
    if (action === 'dispatches') {
      const isAdmin = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
      if (!isAdmin) {
        return sendError(res, 'Only administrators can inspect dispatch logs', 403);
      }
      return sendSuccess(res, emailDispatches.slice(0, 50));
    }

    // Filter notifications for this user
    const isAdminUser = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
    const userNotifs = notifications.filter((n) => {
      if (isAdminUser) {
        return n.userId === 'admin' || n.userId === auth.id || n.role === 'admin' || n.role === 'all';
      } else {
        return n.userId === auth.id || (n.role === 'employee' && !n.userId) || n.role === 'all';
      }
    });

    const unreadCount = userNotifs.filter((n) => !n.read).length;

    return sendSuccess(res, {
      notifications: userNotifs.slice(0, 30),
      unreadCount,
    });
  }

  if (method === 'POST') {
    if (action === 'mark_read') {
      const id = req.body?.id || req.query.id;
      if (id === 'all' || !id) {
        const isAdminMark = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
        notifications.forEach((n) => {
          if (isAdminMark) {
            if (n.userId === 'admin' || n.userId === auth.id || n.role === 'admin' || n.role === 'all') {
              n.read = true;
            }
          } else {
            if (n.userId === auth.id || (n.role === 'employee' && !n.userId) || n.role === 'all') {
              n.read = true;
            }
          }
        });
      } else {
        const targetId = Number(id);
        const item = notifications.find((n) => n.id === targetId);
        if (item) item.read = true;
      }
      return sendSuccess(res, null, 'Notifications marked as read');
    }

    if (action === 'clear') {
      for (let i = notifications.length - 1; i >= 0; i--) {
        const n = notifications[i];
        const isAdminClear = auth.normalizedRole === 'system_admin' || auth.normalizedRole === 'hr_admin';
        const belongs = isAdminClear
          ? (n.userId === 'admin' || n.userId === auth.id || n.role === 'admin' || n.role === 'all')
          : (n.userId === auth.id || (n.role === 'employee' && !n.userId) || n.role === 'all');
        if (belongs && n.read) {
          notifications.splice(i, 1);
        }
      }
      return sendSuccess(res, null, 'Read notifications cleared');
    }
  }

  return sendError(res, 'Method not allowed', 405);
});

// Serve static frontend files
app.use(express.static(__dirname));

// Global error handler — catches Express body-parser errors (e.g. 413 Payload Too Large)
// Must be registered AFTER all routes for Express to route errors here.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'File is too large. Maximum upload size is 15MB.',
    });
  }
  return res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SecureHR server running on http://0.0.0.0:${PORT}`);
});
