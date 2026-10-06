
// SecureHR — Persistent Storage & MySQL API Bridge
// Local metadata cache + authenticated PHP/MySQL backend

const SecureHRStorage = (() => {

    const KEYS = {
        EMPLOYEES: 'securehr_employees',
        DOCUMENTS: 'securehr_documents',
        CATEGORIES: 'securehr_categories',
        AUDIT_LOG: 'securehr_audit_log',
        INITIALIZED: 'securehr_initialized',
        API_TOKEN:   'securehr_token',
    };

    const API_BASE = 'api';

    const DEFAULT_CATEGORIES = [
        { id: 'CAT-1', name: 'Employee Records', description: 'Personal profiles, government IDs, NBI clearances, bio-data', color: '#2563EB', icon: 'user' },
        { id: 'CAT-2', name: 'Application Documents', description: 'Curriculum Vitae, cover letters, resumes, application forms', color: '#7C3AED', icon: 'file-text' },
        { id: 'CAT-3', name: 'Employment Records', description: 'Employment contracts, appointment letters, job offers, promotion notices', color: '#059669', icon: 'briefcase' },
        { id: 'CAT-4', name: 'Performance Records', description: 'Annual evaluations, IPCR, performance reviews, commendations', color: '#D97706', icon: 'award' },
        { id: 'CAT-5', name: 'Training Documents', description: 'PRC professional licenses, training certificates, seminar completion slips', color: '#0891B2', icon: 'book' },
        { id: 'CAT-6', name: 'Other Personnel Files', description: 'Medical clearances, fit-to-work slips, miscellaneous compliance papers', color: '#6B7280', icon: 'folder' },
    ];

    const SEED_EMPLOYEES = [
        {
            id: 'EMP-001',
            firstName: 'Juan',
            lastName: 'Dela Cruz',
            email: 'juan.delacruz@bestlink.edu.ph',
            department: 'Human Resources',
            position: 'HR Staff / Records Specialist',
            role: 'hr_staff',
            status: 'active',
            dateAdded: '2026-08-01',
        },
        {
            id: 'EMP-002',
            firstName: 'Maria',
            lastName: 'Santos',
            email: 'maria.santos@bestlink.edu.ph',
            department: 'Finance',
            position: 'Senior Accountant / HR Staff',
            role: 'hr_staff',
            status: 'active',
            dateAdded: '2026-08-05',
        },
        {
            id: 'EMP-003',
            firstName: 'Roberto',
            lastName: 'Reyes',
            email: 'roberto.reyes@bestlink.edu.ph',
            department: 'IT Department',
            position: 'Systems Engineer',
            role: 'hr_staff',
            status: 'inactive',
            dateAdded: '2026-07-20',
        },
    ];

    const SEED_ADMIN = {
        id: 'ADM-001',
        firstName: 'Admin',
        lastName: 'Account',
        email: 'admin@bestlink.edu.ph',
        department: 'Administration',
        position: 'System Administrator & CIO',
        role: 'system_admin',
        status: 'active',
        dateAdded: '2026-01-01',
    };

    const SEED_HR_ADMIN = {
        id: 'ADM-002',
        firstName: 'Elena',
        lastName: 'Ramos',
        email: 'hr.admin@bestlink.edu.ph',
        department: 'Human Resources',
        position: 'HR Administrator & Operations Officer',
        role: 'hr_admin',
        status: 'active',
        dateAdded: '2026-01-15',
    };

    const SEED_RICHARD_ADMIN = {
        id: 'ADM-901',
        firstName: 'Richard',
        lastName: 'Dantes',
        email: 'dantesrichard901@gmail.com',
        department: 'Administration',
        position: 'Senior System Administrator & Security Officer',
        role: 'system_admin',
        status: 'active',
        dateAdded: '2026-01-01',
    };

    function _read(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error(`SecureHRStorage: Error reading key "${key}"`, e);
            return null;
        }
    }

    function _write(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error(`SecureHRStorage: Error writing key "${key}"`, e);
        }
    }

    function isHttpServer() {
        return window.location.protocol === 'http:' || window.location.protocol === 'https:';
    }

    function getToken() {
        return sessionStorage.getItem(KEYS.API_TOKEN) || '';
    }

    function authHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        const token = getToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }
        return headers;
    }

    function stripSecrets(record) {
        if (!record || typeof record !== 'object') return record;
        const copy = Object.assign({}, record);
        delete copy.password;
        delete copy.fileData;
        return copy;
    }

    function sanitizeEmployees(list) {
        return (list || []).map(stripSecrets);
    }

    function sanitizeDocuments(list) {
        return (list || []).map(stripSecrets);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function init() {
        const cached = sanitizeEmployees(_read(KEYS.EMPLOYEES) || []);
        if (!_read(KEYS.INITIALIZED)) {
            _write(KEYS.EMPLOYEES, [SEED_ADMIN, SEED_HR_ADMIN, SEED_RICHARD_ADMIN, ...SEED_EMPLOYEES]);
            _write(KEYS.DOCUMENTS, []);
            _write(KEYS.CATEGORIES, DEFAULT_CATEGORIES);
            _write(KEYS.AUDIT_LOG, []);
            _write(KEYS.INITIALIZED, true);
        } else {
            _write(KEYS.EMPLOYEES, cached.length ? cached : [SEED_ADMIN, SEED_HR_ADMIN, SEED_RICHARD_ADMIN, ...SEED_EMPLOYEES]);
            _write(KEYS.DOCUMENTS, sanitizeDocuments(_read(KEYS.DOCUMENTS) || []));
            if (!_read(KEYS.CATEGORIES)) {
                _write(KEYS.CATEGORIES, DEFAULT_CATEGORIES);
            }
        }
    }

    async function apiFetch(path, options) {
        const opts = options || {};
        const headers = authHeaders(opts.headers || {});
        const res = await fetch(`${API_BASE}/${path}`, Object.assign({}, opts, { headers }));
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const json = await res.json();
            return { ok: res.ok, status: res.status, json, res };
        }
        return { ok: res.ok, status: res.status, json: null, res };
    }

    async function syncFromDatabase() {
        if (!isHttpServer() || !getToken()) return false;

        try {
            const empRes = await apiFetch('employees.php?role=all');
            if (empRes.json && empRes.json.success) {
                const empList = Array.isArray(empRes.json.data) ? empRes.json.data : (empRes.json.data && empRes.json.data.employees);
                if (Array.isArray(empList)) _write(KEYS.EMPLOYEES, sanitizeEmployees(empList));
            }

            const docRes = await apiFetch('documents.php?limit=500');
            if (docRes.json && docRes.json.success) {
                const docList = Array.isArray(docRes.json.data) ? docRes.json.data : (docRes.json.data && docRes.json.data.documents);
                if (Array.isArray(docList)) _write(KEYS.DOCUMENTS, sanitizeDocuments(docList));
            }

            const catRes = await apiFetch('categories.php');
            if (catRes.json && catRes.json.success && Array.isArray(catRes.json.data)) {
                _write(KEYS.CATEGORIES, catRes.json.data);
            }

            const role = sessionStorage.getItem('securehr_role');
            if (role === 'system_admin' || role === 'hr_admin' || role === 'admin') {
                const auditRes = await apiFetch('audit.php?limit=200');
                if (auditRes.json && auditRes.json.success && Array.isArray(auditRes.json.data)) {
                    _write(KEYS.AUDIT_LOG, auditRes.json.data);
                }
            }

            return true;
        } catch (error) {
            console.warn('SecureHRStorage: Sync error:', error);
            return false;
        }
    }

    async function apiAuthenticate(username, password, role) {
        if (!isHttpServer()) {
            return {
                success: false,
                message: 'Open SecureHR through XAMPP (http://localhost/...) to sign in. File login is disabled.',
            };
        }

        try {
            const response = await fetch(`${API_BASE}/auth.php?action=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role }),
            });
            const result = await response.json();

            if (result.success && result.data && result.data.user) {
                setCurrentUser(result.data.user);
                if (result.data.token) {
                    sessionStorage.setItem(KEYS.API_TOKEN, result.data.token);
                }
                syncFromDatabase().catch(() => {});
                return { success: true, user: result.data.user };
            }

            return {
                success: false,
                message: result.message || 'Invalid credentials',
                isInactive: result.message && result.message.toLowerCase().includes('inactive'),
            };
        } catch (err) {
            console.warn('SecureHRStorage: API auth error:', err);
            return { success: false, message: 'Unable to connect to the server.' };
        }
    }

    async function apiChangePassword(currentPassword, newPassword) {
        if (!isHttpServer()) {
            return { success: false, message: 'Password changes require the PHP backend.' };
        }

        try {
            const { json } = await apiFetch('auth.php?action=change_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            return json || { success: false, message: 'Unable to change password.' };
        } catch (err) {
            console.warn('SecureHRStorage: apiChangePassword error:', err);
            return { success: false, message: 'Unable to change password.' };
        }
    }

    function getEmployees() {
        return sanitizeEmployees(_read(KEYS.EMPLOYEES) || []);
    }

    function saveEmployees(data) {
        _write(KEYS.EMPLOYEES, sanitizeEmployees(data));
    }

    function getEmployeeById(id) {
        return getEmployees().find(e => e.id === id) || null;
    }

    function getStaffEmployees() {
        return getEmployees().filter(e => e.role === 'hr_staff' || e.role === 'employee');
    }

    function getAllEmployees() {
        return getEmployees();
    }

    function getAdminEmployees() {
        return getEmployees().filter(e => e.role === 'system_admin' || e.role === 'hr_admin' || e.role === 'admin');
    }

    function hasPermission(permKey) {
        const user = getCurrentUser();
        if (!user) return false;
        if (user.role === 'system_admin' || user.role === 'admin') return true;
        if (user.permissions && typeof user.permissions[permKey] === 'boolean') {
            return user.permissions[permKey];
        }
        return false;
    }

    //  CATEGORY MANAGEMENT METHODS

    function getCategories() {
        return _read(KEYS.CATEGORIES) || DEFAULT_CATEGORIES;
    }

    async function fetchCategories() {
        if (!isHttpServer()) return getCategories();
        try {
            const { ok, json } = await apiFetch('categories.php');
            if (ok && json && json.success && Array.isArray(json.data)) {
                _write(KEYS.CATEGORIES, json.data);
                return json.data;
            }
        } catch (e) {
            console.warn('Error fetching categories:', e);
        }
        return getCategories();
    }

    async function addCategory(cat) {
        if (isHttpServer()) {
            const { ok, json } = await apiFetch('categories.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cat),
            });
            await fetchCategories();
            return json || { success: ok };
        }
        const list = getCategories();
        const newCat = Object.assign({ id: 'CAT-' + Date.now(), created_at: new Date().toISOString().split('T')[0] }, cat);
        list.push(newCat);
        _write(KEYS.CATEGORIES, list);
        return { success: true, data: newCat };
    }

    async function updateCategory(id, updates) {
        if (isHttpServer()) {
            const { ok, json } = await apiFetch('categories.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ id }, updates)),
            });
            await fetchCategories();
            await syncFromDatabase();
            return json || { success: ok };
        }
        const list = getCategories();
        const idx = list.findIndex(c => c.id === id);
        if (idx !== -1) {
            list[idx] = Object.assign({}, list[idx], updates);
            _write(KEYS.CATEGORIES, list);
        }
        return { success: true };
    }

    async function deleteCategory(id, reassignTo = '') {
        if (isHttpServer()) {
            const { ok, json } = await apiFetch('categories.php', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, reassignTo }),
            });
            await fetchCategories();
            await syncFromDatabase();
            return json || { success: ok };
        }
        const list = getCategories().filter(c => c.id !== id);
        _write(KEYS.CATEGORIES, list);
        return { success: true };
    }

    //  VERSION REPLACEMENT & RESTORE METHODS

    async function replaceDocumentVersion(docId, replaceData) {
        if (isHttpServer()) {
            try {
                const { ok, json } = await apiFetch('documents.php?action=replace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({ id: docId }, replaceData)),
                });
                await syncFromDatabase();
                return json || { success: ok };
            } catch (err) {
                console.warn('replaceDocumentVersion error:', err);
                return { success: false, message: 'Server communication error while replacing document version.' };
            }
        }
        return { success: true, message: 'Version replaced' };
    }

    async function restoreDocument(docId) {
        if (isHttpServer()) {
            try {
                const { ok, json } = await apiFetch('documents.php?action=restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: docId }),
                });
                await syncFromDatabase();
                return json || { success: ok };
            } catch (err) {
                console.warn('restoreDocument error:', err);
                return { success: false, message: 'Server communication error while restoring document.' };
            }
        }
        const all = getDocuments();
        const doc = all.find(d => String(d.id) === String(docId));
        if (doc) {
            doc.status = 'Verified';
            saveDocuments(all);
        }
        return { success: true, message: 'Document restored to Active repository.' };
    }

    async function fetchDocumentVersionHistory(docId) {
        if (isHttpServer()) {
            try {
                const { ok, json } = await apiFetch(`documents.php?action=version_history&id=${encodeURIComponent(docId)}`);
                if (ok && json && json.success) {
                    return json.data;
                }
            } catch (err) {
                console.warn('fetchDocumentVersionHistory error:', err);
            }
        }
        const doc = getDocuments().find(d => String(d.id) === String(docId));
        return {
            id: docId,
            fileName: doc?.fileName || 'document',
            currentVersion: doc?.version || 1,
            versions: doc?.versions || [],
        };
    }

    async function addEmployee(emp) {
        const safe = stripSecrets(emp);
        const all = getEmployees();
        all.push(safe);
        saveEmployees(all);

        if (isHttpServer()) {
            try {
                await apiFetch('employees.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(emp),
                });
                await syncFromDatabase();
            } catch (err) {
                console.warn('SecureHRStorage: Error adding employee to MySQL:', err);
            }
        }
    }

    async function updateEmployee(id, updates) {
        const all = getEmployees();
        const idx = all.findIndex(e => e.id === id);
        if (idx !== -1) {
            all[idx] = stripSecrets(Object.assign({}, all[idx], updates));
            saveEmployees(all);
        }

        if (isHttpServer()) {
            try {
                await apiFetch('employees.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({ id }, updates)),
                });
                await syncFromDatabase();
            } catch (err) {
                console.warn('SecureHRStorage: Error updating employee in MySQL:', err);
            }
        }
        return true;
    }

    async function deleteEmployee(id) {
        const all = getEmployees();
        const filtered = all.filter(e => e.id !== id);
        saveEmployees(filtered);

        if (isHttpServer()) {
            try {
                await apiFetch('employees.php', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                });
                await syncFromDatabase();
            } catch (err) {
                console.warn('SecureHRStorage: Error deleting employee from MySQL:', err);
            }
        }
        return filtered.length < all.length;
    }

    function generateEmployeeId() {
        const all = getEmployees();
        let maxNum = 0;
        all.forEach(e => {
            const match = e.id.match(/^EMP-(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return 'EMP-' + String(maxNum + 1).padStart(3, '0');
    }

    function getDocuments() {
        return sanitizeDocuments(_read(KEYS.DOCUMENTS) || []);
    }

    function saveDocuments(data) {
        _write(KEYS.DOCUMENTS, sanitizeDocuments(data));
    }

    function getDocumentsByEmployee(employeeId) {
        const user = getCurrentUser();
        const isAdmin = user && user.role === 'admin';
        return getDocuments().filter(d => d.employeeId === employeeId && (isAdmin || d.accessLevel !== 'hr_only'));
    }

    async function addDocument(doc) {
        const all = getDocuments();
        all.unshift(stripSecrets(doc));
        saveDocuments(all);

        if (isHttpServer()) {
            try {
                await apiFetch('documents.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(doc),
                });
                await syncFromDatabase();
            } catch (err) {
                console.warn('SecureHRStorage: Error adding document to MySQL:', err);
            }
        }
    }

    async function deleteDocument(docId) {
        if (isHttpServer()) {
            try {
                const { ok, json } = await apiFetch('documents.php', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: docId }),
                });
                await syncFromDatabase();
                if (!ok) {
                    return { success: false, message: (json && json.message) || 'Unable to delete document.' };
                }
                return { success: true, message: (json && json.message) || 'Document deleted successfully.' };
            } catch (err) {
                console.warn('SecureHRStorage: Error deleting document:', err);
                return { success: false, message: 'Server communication error while deleting document.' };
            }
        }

        const all = getDocuments();
        const filtered = all.filter(d => d.id !== docId);
        saveDocuments(filtered);
        return { success: true, message: 'Document deleted.' };
    }

    async function reviewDocument(docId, { status, reviewNote, accessLevel }) {
        if (!isHttpServer()) {
            return { success: false, message: 'Server connection required for document review.' };
        }
        try {
            const { ok, json } = await apiFetch('documents.php?action=review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: docId, status, reviewNote, accessLevel }),
            });
            await syncFromDatabase();
            if (!ok) {
                return { success: false, message: (json && json.message) || 'Failed to update document.' };
            }
            return { success: true, message: (json && json.message) || 'Document updated successfully.', data: json.data };
        } catch (err) {
            console.warn('SecureHRStorage: Error reviewing document:', err);
            return { success: false, message: 'Server error while reviewing document.' };
        }
    }

    async function fetchDocument(docId, reason = '') {
        if (!isHttpServer() || !getToken()) {
            return { success: false, message: 'Open SecureHR through XAMPP to view files.' };
        }

        try {
            let endpoint = 'documents.php?action=download&id=' + encodeURIComponent(docId);
            if (reason && reason.trim()) {
                endpoint += '&reason=' + encodeURIComponent(reason.trim());
            }
            const { ok, res, json } = await apiFetch(endpoint);
            if (!ok) {
                return { success: false, message: (json && json.message) || 'Unable to open document.' };
            }
            const blob = await res.blob();
            if (!blob || blob.size === 0) {
                return { success: false, message: 'This file is empty. Upload it again.' };
            }
            const headerName = res.headers.get('X-File-Name');
            const fileName = headerName ? decodeURIComponent(headerName) : (docId + '.bin');
            const fileType = res.headers.get('X-File-Type') || blob.type || 'application/octet-stream';
            const typedBlob = blob.type ? blob : new Blob([blob], { type: fileType });

            const docRecord = getDocuments().find(d => String(d.id) === String(docId));
            const encryption = {
                algorithm: res.headers.get('X-Encryption-Algorithm') || (docRecord && docRecord.encryptionAlgorithm) || 'AES-256-GCM',
                status: res.headers.get('X-Encryption-Status') || 'Verified & Decrypted for Authorized Session',
                originalSize: res.headers.get('X-Original-Size') || (docRecord && docRecord.size) || '—',
                encryptedSize: res.headers.get('X-Encrypted-Size') || (docRecord && docRecord.encryptedSize) || '—',
            };

            const verifiedByHeader = res.headers.get('X-Verified-By');
            const verification = {
                status: res.headers.get('X-Document-Status') || (docRecord && docRecord.status) || 'Pending',
                verifiedBy: verifiedByHeader ? decodeURIComponent(verifiedByHeader) : (docRecord && docRecord.reviewedBy) || 'HR Administrator',
                verifiedAt: res.headers.get('X-Verified-At') || (docRecord && docRecord.reviewedAt) || '',
                documentId: res.headers.get('X-Document-Id') || docId,
            };

            syncFromDatabase().catch(() => {});

            return { success: true, blob: typedBlob, fileName, fileType, encryption, verification, doc: docRecord };
        } catch (err) {
            console.warn('SecureHRStorage: fetchDocument error:', err);
            return { success: false, message: 'Unable to open document.' };
        }
    }

    function triggerBrowserDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'document';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    async function openDocument(docId, reason = '') {
        return downloadDocument(docId, reason);
    }

    async function downloadDocument(docId, reason = '') {
        const result = await fetchDocument(docId, reason);
        if (!result.success) return result;
        triggerBrowserDownload(result.blob, result.fileName);
        return { success: true, fileName: result.fileName, verification: result.verification, doc: result.doc };
    }

    async function getNotifications() {
        if (!isHttpServer()) return { notifications: [], unreadCount: 0 };
        try {
            const res = await apiFetch('/api/notifications.php');
            if (res.ok && res.json && res.json.success) {
                return res.json.data;
            }
        } catch (e) {
            console.warn('Failed to fetch notifications:', e);
        }
        return { notifications: [], unreadCount: 0 };
    }

    async function markNotificationsAsRead(id = 'all') {
        if (!isHttpServer()) return { success: true };
        try {
            const res = await apiFetch('/api/notifications.php?action=mark_read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            return res.json;
        } catch (e) {
            console.warn('Failed to mark notifications as read:', e);
            return { success: false };
        }
    }

    async function getEmailDispatches() {
        if (!isHttpServer()) return [];
        try {
            const res = await apiFetch('/api/notifications.php?action=dispatches');
            if (res.ok && res.json && res.json.success) {
                return res.json.data;
            }
        } catch (e) {
            console.warn('Failed to fetch email dispatches:', e);
        }
        return [];
    }

    function getAuditLog() {
        return _read(KEYS.AUDIT_LOG) || [];
    }

    async function appendAuditLog(entry) {
        if (isHttpServer()) {
            return;
        }
        const log = getAuditLog();
        const newEntry = Object.assign({}, entry, {
            timestamp: new Date().toISOString(),
        });
        log.unshift(newEntry);
        if (log.length > 500) log.length = 500;
        _write(KEYS.AUDIT_LOG, log);
    }

    function setCurrentUser(user) {
        const safeUser = stripSecrets(user);
        sessionStorage.setItem('securehr_user', JSON.stringify(safeUser));
        sessionStorage.setItem('securehr_loggedIn', 'true');
        sessionStorage.setItem('securehr_role', user.role);
        sessionStorage.setItem('securehr_loginTime', new Date().toISOString());
    }

    function getCurrentUser() {
        try {
            const raw = sessionStorage.getItem('securehr_user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function clearSession() {
        sessionStorage.removeItem('securehr_user');
        sessionStorage.removeItem('securehr_loggedIn');
        sessionStorage.removeItem('securehr_role');
        sessionStorage.removeItem('securehr_loginTime');
        sessionStorage.removeItem(KEYS.API_TOKEN);
    }

    function isLoggedIn() {
        return sessionStorage.getItem('securehr_loggedIn') === 'true' && getCurrentUser() !== null;
    }

    function getSessionRole() {
        return sessionStorage.getItem('securehr_role');
    }

    function resetAll() {
        Object.values(KEYS).forEach(k => localStorage.removeItem(k));
        clearSession();
        console.log('SecureHRStorage: All local data cleared.');
    }

    init();

    return {
        syncFromDatabase,
        isHttpServer,
        escapeHtml,
        openDocument,
        downloadDocument,
        apiFetch,

        apiAuthenticate,
        apiChangePassword,

        getEmployees,
        saveEmployees,
        getEmployeeById,
        getStaffEmployees,
        getAllEmployees,
        getAdminEmployees,
        hasPermission,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        generateEmployeeId,

        getCategories,
        fetchCategories,
        addCategory,
        updateCategory,
        deleteCategory,

        getDocuments,
        saveDocuments,
        getDocumentsByEmployee,
        addDocument,
        deleteDocument,
        reviewDocument,
        replaceDocumentVersion,
        restoreDocument,
        fetchDocumentVersionHistory,

        getAuditLog,
        appendAuditLog,

        getNotifications,
        markNotificationsAsRead,
        getEmailDispatches,

        setCurrentUser,
        getCurrentUser,
        clearSession,
        isLoggedIn,
        getSessionRole,

        resetAll,
    };
})();
