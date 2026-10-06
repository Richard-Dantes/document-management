
// SecureHR — Admin Dashboard JavaScript
// Users management, modal, table, search

document.addEventListener('DOMContentLoaded', () => {

    const currentUser = SecureHRSession.requireAuth('admin');
    if (!currentUser) return; // redirect already triggered

    const esc = SecureHRStorage.escapeHtml;

    // Start inactivity timer
    SecureHRSession.startInactivityTimer();

    const sidebarAvatar = document.querySelector('.sidebar-avatar');
    const sidebarUserName = document.querySelector('.sidebar-user-name');
    const sidebarUserEmail = document.querySelector('.sidebar-user-email');
    if (sidebarAvatar) sidebarAvatar.textContent = (currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase();
    if (sidebarAvatar) sidebarAvatar.title = currentUser.firstName + ' ' + currentUser.lastName;
    if (sidebarUserName) sidebarUserName.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (sidebarUserEmail) sidebarUserEmail.textContent = currentUser.email;

    const isSysAdmin = (currentUser.role === 'system_admin' || currentUser.normalizedRole === 'system_admin');
    const canManageUsers = isSysAdmin || Boolean(currentUser.permissions && currentUser.permissions.can_manage_users);

    const roleBadgeEl = document.getElementById('sidebarRoleBadge');
    if (roleBadgeEl) {
        if (isSysAdmin) {
            roleBadgeEl.className = 'role-badge system-admin';
            roleBadgeEl.textContent = 'System Administrator';
            roleBadgeEl.title = 'Tier 1 · Full IT & Security Control';
        } else {
            roleBadgeEl.className = 'role-badge hr-admin';
            roleBadgeEl.textContent = 'HR Administrator';
            roleBadgeEl.title = 'Tier 2 · Document & Compliance Governance';
        }
    }

    // Role-specific UI enforcement: System Admin vs HR Admin
    if (!canManageUsers) {
        const usersNav = document.getElementById('nav-users');
        if (usersNav) {
            const label = usersNav.querySelector('.nav-label');
            if (label) label.textContent = 'Employee Directory';
            usersNav.title = 'Employee Directory (Read-Only Compliance View)';
        }
        const usersTitle = document.getElementById('usersSectionTitle');
        if (usersTitle) usersTitle.textContent = 'Employee Directory';
        const usersDesc = document.getElementById('usersSectionDesc');
        if (usersDesc) usersDesc.textContent = 'Institutional staff directory and employee records. User account creation, role assignment, and security credentials can only be configured by System Administrators.';
        const restrictionBanner = document.getElementById('hrAdminUserRestrictionBanner');
        if (restrictionBanner) restrictionBanner.style.display = 'flex';
        const cardHeader = document.getElementById('usersCardHeaderTitle');
        if (cardHeader) cardHeader.textContent = 'Institutional Personnel Directory';

        const btnAdd = document.getElementById('btnAddUser');
        if (btnAdd) btnAdd.style.display = 'none';
        const noticeBadge = document.getElementById('hrAdminUserNoticeBadge');
        if (noticeBadge) noticeBadge.style.display = 'inline-flex';
    } else {
        const usersTitle = document.getElementById('usersSectionTitle');
        if (usersTitle) usersTitle.textContent = 'User & Permission Management';
        const usersDesc = document.getElementById('usersSectionDesc');
        if (usersDesc) usersDesc.textContent = 'System Administration: Provision employee accounts, assign roles, and configure granular cryptographic permissions.';
        const restrictionBanner = document.getElementById('hrAdminUserRestrictionBanner');
        if (restrictionBanner) restrictionBanner.style.display = 'none';
        const btnAdd = document.getElementById('btnAddUser');
        if (btnAdd) btnAdd.style.display = 'inline-flex';
    }

    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const el = document.getElementById('liveClock');
        if (el) el.textContent = timeStr;
    }
    updateClock();
    setInterval(updateClock, 1000);

    let editingId = null;

    function getEmployees() {
        return typeof SecureHRStorage.getAllEmployees === 'function' ? SecureHRStorage.getAllEmployees() : SecureHRStorage.getEmployees();
    }

    const tableBody = document.getElementById('employeeTableBody');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const totalUsersEl = document.getElementById('totalUsers');
    const activeUsersEl = document.getElementById('activeUsers');
    const inactiveUsersEl = document.getElementById('inactiveUsers');

    // Modal
    const modalOverlay = document.getElementById('employeeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalForm = document.getElementById('employeeForm');
    const btnAddUser = document.getElementById('btnAddUser');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancelModal = document.getElementById('btnCancelModal');
    const btnSubmitModal = document.getElementById('btnSubmitModal');
    const generatedPasswordDisplay = document.getElementById('generatedPasswordDisplay');
    const generatedPasswordCode = document.getElementById('generatedPasswordCode');

    // Nav items
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const pageSections = document.querySelectorAll('.page-section');

    // Sidebar toggle (mobile)
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.section;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            pageSections.forEach(s => s.classList.toggle('hidden', s.id !== target));
            document.getElementById('topbarTitle').textContent = item.querySelector('.nav-label').textContent.trim();
            closeSidebar();
        });
    });

    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('show');
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
    }
    hamburgerBtn.addEventListener('click', openSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    function goToSection(sectionId) {
        const item = document.querySelector('.nav-item[data-section="' + sectionId + '"]');
        if (item) item.click();
    }
    window.goToSection = goToSection;
    window.showSection = goToSection;

    window.filterDocsByEmployee = function(empId) {
        goToSection('section-documents');
        if (adminDocEmpFilter) {
            adminDocEmpFilter.value = empId;
            adminDocPage = 1;
            renderAdminDocuments();
        }
    };

    window.clearDocEmployeeFilter = function() {
        if (adminDocEmpFilter) {
            adminDocEmpFilter.value = 'all';
            adminDocPage = 1;
            renderAdminDocuments();
        }
    };

    document.querySelectorAll('.stat-card[data-section]').forEach(card => {
        const open = () => goToSection(card.dataset.section);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        SecureHRSession.logout();
    });

    function renderPaginationBar(containerId, currentPage, totalPages, totalItems, onPageChange) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (totalItems === 0 || totalPages <= 1) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'flex';
        container.innerHTML = `
            <div class="pagination-info">
                Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong> (${totalItems} total)
            </div>
            <div class="pagination-controls">
                <button type="button" class="pagination-btn" id="${containerId}_prev" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Previous</button>
                <button type="button" class="pagination-btn" id="${containerId}_next" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
            </div>
        `;
        const prevBtn = document.getElementById(`${containerId}_prev`);
        const nextBtn = document.getElementById(`${containerId}_next`);
        if (prevBtn) prevBtn.onclick = () => onPageChange(currentPage - 1);
        if (nextBtn) nextBtn.onclick = () => onPageChange(currentPage + 1);
    }

    let empPage = 1;
    const empLimit = 8;

    function renderTable(data) {
        tableBody.innerHTML = '';
        updateStats();

        // Update badge count in sidebar
        const userCountBadge = document.getElementById('userCount');
        if (userCountBadge) userCountBadge.textContent = getEmployees().length;

        if (!data || data.length === 0) {
            emptyState.classList.remove('hidden');
            renderPaginationBar('employeePagination', 1, 0, 0, () => {});
            return;
        }
        emptyState.classList.add('hidden');

        const totalPages = Math.ceil(data.length / empLimit);
        if (empPage > totalPages) empPage = totalPages;
        if (empPage < 1) empPage = 1;

        const pageData = data.slice((empPage - 1) * empLimit, empPage * empLimit);

        pageData.forEach(emp => {
            const initials = (emp.firstName[0] + emp.lastName[0]).toUpperCase();
            const row = document.createElement('tr');
            row.dataset.id = emp.id;

            const roleClass = emp.role === 'system_admin' ? 'system-admin' : (emp.role === 'hr_admin' || emp.role === 'admin' ? 'hr-admin' : 'hr-staff');
            const roleTitle = emp.role === 'system_admin' ? 'Sys Admin' : (emp.role === 'hr_admin' || emp.role === 'admin' ? 'HR Admin' : 'HR Staff');
            const activePermCount = emp.permissions ? Object.values(emp.permissions).filter(Boolean).length : (emp.role === 'system_admin' ? 9 : (emp.role === 'hr_admin' || emp.role === 'admin' ? 6 : 3));

            row.innerHTML = `
                <td>
                    <div class="user-cell">
                        <div class="user-avatar-sm">${esc(initials)}</div>
                        <div class="user-info-cell">
                            <div class="name">${esc(emp.firstName)} ${esc(emp.lastName)}</div>
                            <div class="email">${esc(emp.email)}</div>
                            ${emp.position ? `<div style="font-size:0.72rem;color:var(--gray-500);margin-top:1px;">${esc(emp.position)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td><code style="font-size:0.82rem;color:var(--primary);cursor:pointer;font-weight:600;" title="Click to view documents for this employee" onclick="filterDocsByEmployee('${esc(emp.id)}')">${esc(emp.id)}</code></td>
                <td>${esc(emp.department)}</td>
                <td>
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
                        <span class="role-badge ${roleClass}">${roleTitle}</span>
                        <span class="user-permissions-pill" title="Active Permissions: ${activePermCount} granted">${activePermCount}/9 perms</span>
                    </div>
                </td>
                <td><span class="status-badge ${esc(emp.status)}">${esc(emp.status.charAt(0).toUpperCase() + emp.status.slice(1))}</span></td>
                <td>${esc(formatDate(emp.dateAdded))}</td>
                    ${canManageUsers ? `
                    <div class="table-actions">
                        <button class="action-btn" title="View Documents for ${esc(emp.firstName)}" style="color:var(--primary);background:rgba(37,99,235,0.08);" onclick="filterDocsByEmployee('${esc(emp.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        </button>
                        <button class="action-btn edit" title="Edit & Manage Permissions" onclick="editEmployee('${esc(emp.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        <button class="action-btn edit" title="Reset Temporary Password" onclick="adminResetEmployeePassword('${esc(emp.id)}', '${esc(emp.firstName)} ${esc(emp.lastName)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                        </button>
                        <button class="action-btn delete" title="Delete" onclick="deleteEmployee('${esc(emp.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                    ` : `
                    <div class="table-actions">
                        <button class="btn-secondary btn-sm" style="font-size:0.75rem;padding:4px 10px;display:inline-flex;align-items:center;gap:6px;" title="View Documents for ${esc(emp.firstName)}" onclick="filterDocsByEmployee('${esc(emp.id)}')">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                            View Files
                        </button>
                        <span style="font-size:0.72rem;color:var(--gray-500);padding:3px 8px;background:var(--gray-100);border-radius:4px;border:1px solid var(--gray-200);white-space:nowrap;" title="User accounts and credentials are administered by System Administrators">SysAdmin Only</span>
                    </div>
                    `}
                </td>
            `;
            tableBody.appendChild(row);
        });

        renderPaginationBar('employeePagination', empPage, totalPages, data.length, (newPage) => {
            empPage = newPage;
            filterEmployees();
        });
    }

    function filterEmployees() {
        const q = (searchInput ? searchInput.value : '').trim().toLowerCase();
        const employees = getEmployees();
        const filtered = employees.filter(e =>
            e.firstName.toLowerCase().includes(q) ||
            e.lastName.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.department.toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q)
        );
        renderTable(filtered);
    }

    function updateStats() {
        const employees = getEmployees();
        if (totalUsersEl) totalUsersEl.textContent = employees.length;
        if (activeUsersEl) activeUsersEl.textContent = employees.filter(e => e.status === 'active').length;
        if (inactiveUsersEl) inactiveUsersEl.textContent = employees.filter(e => e.status === 'inactive').length;

        // Document count (Active vs Archived)
        const allDocs = SecureHRStorage.getDocuments();
        const activeDocs = allDocs.filter(d => !d.isArchived && d.status !== 'Archived');
        const archivedDocs = allDocs.filter(d => d.isArchived || d.status === 'Archived');
        const categories = typeof SecureHRStorage.getCategories === 'function' ? SecureHRStorage.getCategories() : [];

        const totalDocsEl = document.getElementById('totalDocs');
        if (totalDocsEl) totalDocsEl.textContent = activeDocs.length;
        const docCountBadge = document.getElementById('docCount');
        if (docCountBadge) docCountBadge.textContent = activeDocs.length;

        const totalArchivedDocsEl = document.getElementById('totalArchivedDocs');
        if (totalArchivedDocsEl) totalArchivedDocsEl.textContent = archivedDocs.length;
        const archiveDocCountBadge = document.getElementById('archiveDocCount');
        if (archiveDocCountBadge) archiveDocCountBadge.textContent = archivedDocs.length;

        const totalCategoriesCountEl = document.getElementById('totalCategoriesCount');
        if (totalCategoriesCountEl) totalCategoriesCountEl.textContent = categories.length;
        const catCountBadge = document.getElementById('catCount');
        if (catCountBadge) catCountBadge.textContent = categories.length;

        // Render Overview Analytics Widgets
        renderOverviewAnalytics();
    }

    function formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    searchInput.addEventListener('input', () => {
        empPage = 1;
        filterEmployees();
    });

    function generatePassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
        let pass = '';
        for (let i = 0; i < 10; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    }

    const PERM_KEYS = [
        'can_view_docs',
        'can_upload_docs',
        'can_verify_docs',
        'can_replace_version',
        'can_archive_docs',
        'can_manage_categories',
        'can_delete_docs',
        'can_manage_users',
        'can_view_audit',
    ];

    function applyRolePermissionsToForm(role) {
        const norm = role === 'admin' ? 'hr_admin' : (role === 'employee' ? 'hr_staff' : role);
        PERM_KEYS.forEach(key => {
            const chk = document.getElementById(`perm_${key}`);
            if (!chk) return;
            if (norm === 'system_admin') {
                chk.checked = true;
            } else if (norm === 'hr_admin') {
                chk.checked = ['can_view_docs', 'can_upload_docs', 'can_verify_docs', 'can_replace_version', 'can_archive_docs', 'can_manage_categories'].includes(key);
            } else {
                chk.checked = ['can_view_docs', 'can_upload_docs', 'can_replace_version'].includes(key);
            }
        });
    }

    function getPermissionsFromForm() {
        const perms = {};
        PERM_KEYS.forEach(key => {
            const chk = document.getElementById(`perm_${key}`);
            perms[key] = chk ? chk.checked : false;
        });
        return perms;
    }

    function setPermissionsToForm(perms, fallbackRole) {
        if (!perms || Object.keys(perms).length === 0) {
            applyRolePermissionsToForm(fallbackRole);
            return;
        }
        PERM_KEYS.forEach(key => {
            const chk = document.getElementById(`perm_${key}`);
            if (chk) chk.checked = !!perms[key];
        });
    }

    document.getElementById('empRole')?.addEventListener('change', (e) => {
        applyRolePermissionsToForm(e.target.value);
    });

    document.getElementById('btnPermSelectAll')?.addEventListener('click', () => {
        PERM_KEYS.forEach(key => {
            const chk = document.getElementById(`perm_${key}`);
            if (chk) chk.checked = true;
        });
    });

    document.getElementById('btnPermResetRole')?.addEventListener('click', () => {
        const role = document.getElementById('empRole')?.value || 'hr_staff';
        applyRolePermissionsToForm(role);
    });

    btnAddUser.addEventListener('click', () => {
        if (!canManageUsers) {
            showToast('Access restricted: Only System Administrators can create new accounts.', 'error');
            return;
        }
        editingId = null;
        modalTitle.textContent = 'Create New Employee Account';
        modalForm.reset();
        const newId = SecureHRStorage.generateEmployeeId();
        document.getElementById('empId').value = newId;
        const pass = generatePassword();
        document.getElementById('empPassword').value = pass;
        generatedPasswordCode.textContent = pass;
        generatedPasswordDisplay.classList.remove('hidden');
        document.getElementById('empRole').value = 'hr_staff';
        document.getElementById('empPosition').value = '';
        applyRolePermissionsToForm('hr_staff');
        btnSubmitModal.textContent = 'Create Account';
        openModal();
    });

    window.editEmployee = function(id) {
        if (!canManageUsers) {
            showToast('Access restricted: Only System Administrators can edit user accounts and permissions.', 'error');
            return;
        }
        const emp = SecureHRStorage.getEmployeeById(id);
        if (!emp) return;
        editingId = id;
        modalTitle.textContent = 'Edit Employee Account & Permissions';
        document.getElementById('empId').value = emp.id;
        document.getElementById('empFirstName').value = emp.firstName;
        document.getElementById('empLastName').value = emp.lastName;
        document.getElementById('empEmail').value = emp.email;
        document.getElementById('empDepartment').value = emp.department;
        document.getElementById('empPosition').value = emp.position || '';
        document.getElementById('empRole').value = emp.role || 'hr_staff';
        document.getElementById('empStatus').value = emp.status || 'active';
        document.getElementById('empPassword').value = '';
        setPermissionsToForm(emp.permissions, emp.role || 'hr_staff');
        generatedPasswordDisplay.classList.add('hidden');
        btnSubmitModal.textContent = 'Save Changes';
        openModal();
    };

    window.deleteEmployee = async function(id) {
        if (!canManageUsers) {
            showToast('Access restricted: Only System Administrators can delete user accounts.', 'error');
            return;
        }
        const emp = SecureHRStorage.getEmployeeById(id);
        if (!emp) return;

        await SecureHRStorage.deleteEmployee(id);

        // Audit log
        await SecureHRStorage.appendAuditLog({
            actor: currentUser.firstName + ' ' + currentUser.lastName,
            actorId: currentUser.id,
            action: 'DELETE_USER',
            target: emp.firstName + ' ' + emp.lastName + ' (' + id + ')',
            details: `Deleted employee account from ${emp.department}`,
        });

        renderTable(getEmployees());
        populateEmployeeDropdowns();
        showToast(`Employee account "${emp.firstName} ${emp.lastName}" deleted.`, 'info');
    };

    btnSubmitModal.addEventListener('click', async () => {
        const firstName = document.getElementById('empFirstName').value.trim();
        const lastName = document.getElementById('empLastName').value.trim();
        const email = document.getElementById('empEmail').value.trim();
        const department = document.getElementById('empDepartment').value.trim();
        const position = document.getElementById('empPosition') ? document.getElementById('empPosition').value.trim() : '';
        const role = document.getElementById('empRole').value;
        const status = document.getElementById('empStatus').value;
        const password = document.getElementById('empPassword').value.trim();
        const permissions = getPermissionsFromForm();

        if (!firstName || !lastName || !email || !department) {
            showToast('Please fill in all required fields.', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Please enter a valid email address.', 'error');
            return;
        }

        // Check email uniqueness
        const allUsers = SecureHRStorage.getEmployees();
        const emailTaken = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== (editingId || ''));
        if (emailTaken) {
            showToast('This email address is already in use.', 'error');
            return;
        }

        if (editingId) {
            // Update existing employee
            const updates = { firstName, lastName, email, department, position, role, status, permissions };
            if (password) updates.password = password; // only update password if provided
            await SecureHRStorage.updateEmployee(editingId, updates);

            // Audit log
            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'EDIT_USER',
                target: firstName + ' ' + lastName + ' (' + editingId + ')',
                details: `Updated employee profile, position [${position}], role [${role}], and granular permissions`,
            });

            showToast('Employee account and permissions updated successfully.', 'success');
        } else {
            // Create new employee
            const newEmp = {
                id: document.getElementById('empId').value,
                firstName, lastName, email, department, position, role, status, permissions,
                password: password || generatePassword(),
                dateAdded: new Date().toISOString().split('T')[0],
            };
            await SecureHRStorage.addEmployee(newEmp);

            // Audit log
            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'CREATE_USER',
                target: firstName + ' ' + lastName + ' (' + newEmp.id + ')',
                details: `Created new ${role} account [${position}] with custom permissions in ${department}`,
            });

            showToast('New employee account created successfully!', 'success');
        }

        closeModal();
        renderTable(getEmployees());
        populateEmployeeDropdowns();
    });

    document.getElementById('btnRegenPass').addEventListener('click', () => {
        const pass = generatePassword();
        document.getElementById('empPassword').value = pass;
        generatedPasswordCode.textContent = pass;
        generatedPasswordDisplay.classList.remove('hidden');
    });

    document.getElementById('btnCopyPass').addEventListener('click', () => {
        const pass = generatedPasswordCode.textContent;
        navigator.clipboard.writeText(pass).then(() => {
            showToast('Password copied to clipboard!', 'success');
        });
    });

    function openModal() {
        modalOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function closeModal() {
        modalOverlay.classList.remove('show');
        document.body.style.overflow = '';
        editingId = null;
    }
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const icons = {
            success: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fill="#059669"/>',
            error: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="#E53E3E"/>',
            info: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2a1 1 0 002 0V7zm0 6a1 1 0 10-2 0 1 1 0 002 0z" fill="#3B82F6"/>',
        };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20">${icons[type] || icons.info}</svg><span></span>`;
        toast.querySelector('span').textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 4000);
    }

    //  DOCUMENT MANAGEMENT

    const adminDocTableBody = document.getElementById('adminDocTableBody');
    const adminDocEmptyState = document.getElementById('adminDocEmptyState');
    const adminDocEmpFilter = document.getElementById('adminDocEmpFilter');
    const adminDocCatFilter = document.getElementById('adminDocCatFilter');

    // Admin upload modal elements
    const adminUploadModal = document.getElementById('adminUploadModal');
    const adminUploadForm = document.getElementById('adminUploadForm');
    const adminFileDropZone = document.getElementById('adminFileDropZone');
    const adminFileInput = document.getElementById('adminFileInput');
    const adminSelectedFileInfo = document.getElementById('adminSelectedFileInfo');
    const adminSelectedFileName = document.getElementById('adminSelectedFileName');
    const btnAdminRemoveFile = document.getElementById('btnAdminRemoveFile');
    const btnAdminUploadDoc = document.getElementById('btnAdminUploadDoc');
    const btnCloseAdminUploadModal = document.getElementById('btnCloseAdminUploadModal');
    const btnCancelAdminUpload = document.getElementById('btnCancelAdminUpload');
    const btnSubmitAdminUpload = document.getElementById('btnSubmitAdminUpload');
    const adminDocEmployee = document.getElementById('adminDocEmployee');

    let adminSelectedFile = null;

    function populateEmployeeDropdowns() {
        const employees = getEmployees();

        // Filter dropdown
        adminDocEmpFilter.innerHTML = '<option value="all">All Employees</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.firstName} ${emp.lastName} (${emp.id})`;
            adminDocEmpFilter.appendChild(opt);
        });

        // Upload modal employee selector
        adminDocEmployee.innerHTML = '<option value="">Select an employee...</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.firstName} ${emp.lastName} (${emp.id})`;
            adminDocEmployee.appendChild(opt);
        });
    }

    let adminDocPage = 1;
    const adminDocLimit = 8;
    let currentDocSort = 'date_desc';

    function parseDocSizeToBytes(sizeStr) {
        if (!sizeStr) return 0;
        const parts = sizeStr.trim().split(' ');
        const num = parseFloat(parts[0]) || 0;
        const unit = (parts[1] || 'KB').toUpperCase();
        if (unit.startsWith('M')) return num * 1024 * 1024;
        if (unit.startsWith('K')) return num * 1024;
        if (unit.startsWith('B')) return num;
        return num;
    }

    window.setDocDateFilterPreset = function(preset) {
        const fromEl = document.getElementById('adminDocDateFrom');
        const toEl = document.getElementById('adminDocDateTo');
        const now = new Date();
        const toStr = now.toISOString().split('T')[0];

        document.querySelectorAll('.date-quick-btn').forEach(btn => btn.classList.remove('active'));

        if (preset === 'all') {
            if (fromEl) fromEl.value = '';
            if (toEl) toEl.value = '';
            document.getElementById('btnDateQuickAll')?.classList.add('active');
        } else if (preset === 'today') {
            if (fromEl) fromEl.value = toStr;
            if (toEl) toEl.value = toStr;
        } else if (preset === '7d') {
            const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (fromEl) fromEl.value = past.toISOString().split('T')[0];
            if (toEl) toEl.value = toStr;
            document.getElementById('btnDateQuick7d')?.classList.add('active');
        } else if (preset === '30d') {
            const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            if (fromEl) fromEl.value = past.toISOString().split('T')[0];
            if (toEl) toEl.value = toStr;
            document.getElementById('btnDateQuick30d')?.classList.add('active');
        }

        adminDocPage = 1;
        renderAdminDocuments();
    };

    function renderAdminDocuments() {
        const empFilter = adminDocEmpFilter.value;
        const catFilter = adminDocCatFilter.value;
        const statusFilter = document.getElementById('adminDocStatusFilter')?.value || 'all';
        const accessFilter = document.getElementById('adminDocAccessFilter')?.value || 'all';
        const dateFrom = document.getElementById('adminDocDateFrom')?.value || '';
        const dateTo = document.getElementById('adminDocDateTo')?.value || '';
        const sortSelect = document.getElementById('adminDocSortSelect');
        if (sortSelect) currentDocSort = sortSelect.value;

        let docs = SecureHRStorage.getDocuments();

        // Active table excludes archived records unless explicitly requested
        if (statusFilter !== 'Archived') {
            docs = docs.filter(d => !d.isArchived && d.status !== 'Archived');
        }

        const filterChipBar = document.getElementById('activeDocFilterChipBar');
        const filterBadgeText = document.getElementById('activeDocFilterText');
        if (filterChipBar && filterBadgeText) {
            if (empFilter !== 'all') {
                const targetEmp = SecureHRStorage.getEmployeeById(empFilter);
                filterBadgeText.textContent = targetEmp ? `${targetEmp.firstName} ${targetEmp.lastName} (${empFilter})` : empFilter;
                filterChipBar.style.display = 'flex';
            } else {
                filterChipBar.style.display = 'none';
            }
        }

        if (empFilter !== 'all') {
            docs = docs.filter(d => d.employeeId === empFilter);
        }
        if (catFilter !== 'all') {
            docs = docs.filter(d => d.category === catFilter);
        }
        if (statusFilter !== 'all') {
            docs = docs.filter(d => (d.status || 'Verified') === statusFilter);
        }
        if (accessFilter !== 'all') {
            docs = docs.filter(d => (d.accessLevel || 'shared') === accessFilter);
        }

        // Date range filtering
        if (dateFrom) {
            docs = docs.filter(d => (d.uploadedAt || d.createdAt || '').slice(0, 10) >= dateFrom);
        }
        if (dateTo) {
            docs = docs.filter(d => (d.uploadedAt || d.createdAt || '').slice(0, 10) <= dateTo);
        }

        const docSearch = (document.getElementById('adminDocSearch')?.value || '').trim().toLowerCase();
        if (docSearch) {
            docs = docs.filter(d => {
                const emp = SecureHRStorage.getEmployeeById(d.employeeId);
                const empName = emp ? `${emp.firstName} ${emp.lastName}` : (d.employeeName || '');
                return (d.fileName || '').toLowerCase().includes(docSearch)
                    || (d.note || '').toLowerCase().includes(docSearch)
                    || (d.reviewNote || '').toLowerCase().includes(docSearch)
                    || empName.toLowerCase().includes(docSearch)
                    || (d.employeeId || '').toLowerCase().includes(docSearch);
            });
        }

        // Explicit Sort Order Controls
        docs.sort((a, b) => {
            if (currentDocSort === 'date_desc') {
                return (b.uploadedAt || '').localeCompare(a.uploadedAt || '');
            } else if (currentDocSort === 'date_asc') {
                return (a.uploadedAt || '').localeCompare(b.uploadedAt || '');
            } else if (currentDocSort === 'name_asc') {
                return (a.fileName || '').localeCompare(b.fileName || '');
            } else if (currentDocSort === 'name_desc') {
                return (b.fileName || '').localeCompare(a.fileName || '');
            } else if (currentDocSort === 'size_desc') {
                return parseDocSizeToBytes(b.size) - parseDocSizeToBytes(a.size);
            } else if (currentDocSort === 'size_asc') {
                return parseDocSizeToBytes(a.size) - parseDocSizeToBytes(b.size);
            } else if (currentDocSort === 'category_asc') {
                return (a.category || '').localeCompare(b.category || '');
            }
            return 0;
        });

        // Update sort table header visual arrows
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = '↕';
            const sortField = th.dataset.sort;
            if (currentDocSort.startsWith(sortField)) {
                if (currentDocSort.endsWith('_asc')) {
                    th.classList.add('sorted-asc');
                    if (arrow) arrow.textContent = '▲';
                } else {
                    th.classList.add('sorted-desc');
                    if (arrow) arrow.textContent = '▼';
                }
            }
        });

        adminDocTableBody.innerHTML = '';
        updateStats();

        if (!docs || docs.length === 0) {
            adminDocEmptyState.classList.remove('hidden');
            renderPaginationBar('adminDocPagination', 1, 0, 0, () => {});
            return;
        }
        adminDocEmptyState.classList.add('hidden');

        const totalPages = Math.ceil(docs.length / adminDocLimit);
        if (adminDocPage > totalPages) adminDocPage = totalPages;
        if (adminDocPage < 1) adminDocPage = 1;

        const pageDocs = docs.slice((adminDocPage - 1) * adminDocLimit, adminDocPage * adminDocLimit);

        pageDocs.forEach(doc => {
            const ext = getFileExtension(doc.fileName);
            const badgeClass = getBadgeClass(ext);
            const emp = SecureHRStorage.getEmployeeById(doc.employeeId);
            const empName = emp ? `${emp.firstName} ${emp.lastName}` : (doc.employeeName || doc.employeeId);
            const verNum = doc.version || 1;

            const status = doc.status || 'Verified';
            const statusSelectHtml = `
                <select class="table-status-select ${esc(status.toLowerCase())}"
                        aria-label="Status for ${esc(doc.fileName)}"
                        title="Click to quickly change file status"
                        onchange="adminQuickChangeStatus('${esc(doc.id)}', this.value)">
                    <option value="Verified" ${status === 'Verified' ? 'selected' : ''}>Verified</option>
                    <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                    <option value="Archived" ${status === 'Archived' ? 'selected' : ''}>Archived</option>
                </select>
            `;

            const access = doc.accessLevel || 'shared';
            const accessBadgeHtml = access === 'hr_only'
                ? `<span class="access-badge hr_only" title="Confidential: Restricted to HR Administration only"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align:-1px;"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg> HR-Only</span>`
                : `<span class="access-badge shared" title="Shared: Visible to employee in their portal"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align:-1px;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> Shared</span>`;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="doc-icon">
                        <div class="doc-icon-badge ${esc(badgeClass)}">${esc(ext)}</div>
                        <div>
                            <div class="doc-name">
                                ${esc(doc.fileName)}
                                <span class="version-badge" title="Document Revision Version ${verNum} &bull; Click to view version history" style="cursor:pointer;" onclick="openVersionHistoryModal('${esc(doc.id)}')">v${verNum}</span>
                                <span class="aes-badge" title="Encrypted at rest using AES-256-GCM">AES-256</span>
                            </div>
                            ${doc.note ? `<div class="doc-note">${esc(doc.note)}</div>` : ''}
                            ${doc.reviewNote ? `<div class="doc-note" style="color:var(--accent);"><em>Remark: ${esc(doc.reviewNote)}</em></div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div class="user-avatar-sm" style="width:28px;height:28px;font-size:0.65rem;">${esc(emp ? (emp.firstName[0] + emp.lastName[0]).toUpperCase() : '??')}</div>
                        <span style="font-size:0.85rem;font-weight:500;color:var(--gray-700);">${esc(empName)}</span>
                    </div>
                </td>
                <td><span class="category-badge ${esc(doc.category)}">${esc(doc.category)}</span></td>
                <td>${statusSelectHtml}</td>
                <td>${accessBadgeHtml}</td>
                <td style="font-size:0.85rem;color:var(--gray-500)">${esc(doc.size || '—')}</td>
                <td style="font-size:0.85rem;color:var(--gray-500)">${esc(formatDate(doc.uploadedAt))}</td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="action-btn edit" data-action="download" data-id="${esc(doc.id)}" title="Download Document" onclick="adminDownloadDocument('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
                        </button>
                        <button type="button" class="action-btn edit btn-replace-version" data-action="replace" data-id="${esc(doc.id)}" title="Replace File / New Version" onclick="openReplaceVersionModal('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
                        </button>
                        <button type="button" class="action-btn review" data-action="review" data-id="${esc(doc.id)}" title="Review & Set Access" onclick="openAdminReviewModal('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                        </button>
                        <button type="button" class="action-btn" data-action="archive" data-id="${esc(doc.id)}" title="Archive Document" style="color:#D97706;background:rgba(245,158,11,0.08);" onclick="adminArchiveDocument('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>
                        </button>
                        <button type="button" class="action-btn delete" data-action="delete" data-id="${esc(doc.id)}" title="Delete Document" onclick="adminDeleteDocument('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                </td>
            `;
            adminDocTableBody.appendChild(row);
        });

        renderPaginationBar('adminDocPagination', adminDocPage, totalPages, docs.length, (p) => {
            adminDocPage = p;
            renderAdminDocuments();
        });
    }

    function getFileExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '?';
    }

    function getBadgeClass(ext) {
        if (ext === 'pdf') return 'pdf';
        if (['doc', 'docx'].includes(ext)) return 'doc';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'img';
        return 'other';
    }

    // Filters
    adminDocEmpFilter.addEventListener('change', () => {
        adminDocPage = 1;
        renderAdminDocuments();
    });
    adminDocCatFilter.addEventListener('change', () => {
        adminDocPage = 1;
        renderAdminDocuments();
    });
    document.getElementById('adminDocStatusFilter')?.addEventListener('change', () => {
        adminDocPage = 1;
        renderAdminDocuments();
    });
    document.getElementById('adminDocAccessFilter')?.addEventListener('change', () => {
        adminDocPage = 1;
        renderAdminDocuments();
    });
    // Event delegation on adminDocTableBody for reliable action buttons
    adminDocTableBody?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const docId = btn.dataset.id;
        if (action === 'download') {
            window.adminDownloadDocument(docId);
        } else if (action === 'replace') {
            window.openReplaceVersionModal(docId);
        } else if (action === 'review') {
            window.openAdminReviewModal(docId);
        } else if (action === 'archive') {
            window.adminArchiveDocument(docId);
        } else if (action === 'delete') {
            window.adminDeleteDocument(docId);
        }
    });
    const adminDocSearch = document.getElementById('adminDocSearch');
    if (adminDocSearch) {
        adminDocSearch.addEventListener('input', () => {
            adminDocPage = 1;
            renderAdminDocuments();
        });
    }

    document.getElementById('adminDocDateFrom')?.addEventListener('change', () => {
        adminDocPage = 1;
        renderAdminDocuments();
    });
    document.getElementById('adminDocDateTo')?.addEventListener('change', () => {
        adminDocPage = 1;
        renderAdminDocuments();
    });
    document.getElementById('adminDocSortSelect')?.addEventListener('change', (e) => {
        currentDocSort = e.target.value;
        adminDocPage = 1;
        renderAdminDocuments();
    });

    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (!field) return;
            if (currentDocSort === `${field}_asc`) {
                currentDocSort = `${field}_desc`;
            } else {
                currentDocSort = `${field}_asc`;
            }
            const sortSelect = document.getElementById('adminDocSortSelect');
            if (sortSelect) sortSelect.value = currentDocSort;
            adminDocPage = 1;
            renderAdminDocuments();
        });
    });

    // =========================================================================
    // DYNAMIC CATEGORY MANAGEMENT
    // =========================================================================

    function populateCategoryDropdowns() {
        const categories = typeof SecureHRStorage.getCategories === 'function' ? SecureHRStorage.getCategories() : [];

        // 1. Documents active filter
        if (adminDocCatFilter) {
            const curVal = adminDocCatFilter.value;
            adminDocCatFilter.innerHTML = '<option value="all">All Categories</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                adminDocCatFilter.appendChild(opt);
            });
            if (categories.some(c => c.name === curVal)) adminDocCatFilter.value = curVal;
        }

        // 2. Archive category filter
        const archiveCatFilter = document.getElementById('archiveDocCatFilter');
        if (archiveCatFilter) {
            const curVal = archiveCatFilter.value;
            archiveCatFilter.innerHTML = '<option value="all">All Categories</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                archiveCatFilter.appendChild(opt);
            });
            if (categories.some(c => c.name === curVal)) archiveCatFilter.value = curVal;
        }

        // 3. Upload modal category select
        const adminDocCategory = document.getElementById('adminDocCategory');
        if (adminDocCategory) {
            const curVal = adminDocCategory.value;
            adminDocCategory.innerHTML = '<option value="">Select a category...</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                adminDocCategory.appendChild(opt);
            });
            if (categories.some(c => c.name === curVal)) adminDocCategory.value = curVal;
        }
    }

    function renderCategoriesGrid() {
        const container = document.getElementById('categoriesGrid');
        if (!container) return;

        const categories = typeof SecureHRStorage.getCategories === 'function' ? SecureHRStorage.getCategories() : [];
        const allDocs = SecureHRStorage.getDocuments();

        const catCountBadge = document.getElementById('catCount');
        if (catCountBadge) catCountBadge.textContent = categories.length;
        const totalCatEl = document.getElementById('totalCategoriesCount');
        if (totalCatEl) totalCatEl.textContent = categories.length;

        container.innerHTML = '';

        if (categories.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:32px;background:var(--gray-50);border-radius:var(--radius-md);">
                    <p style="color:var(--gray-500);font-size:0.9rem;">No document categories configured yet.</p>
                    <button class="btn-primary" onclick="document.getElementById('btnAddCategory').click()" style="margin-top:10px;">
                        Add First Category
                    </button>
                </div>`;
            return;
        }

        categories.forEach(cat => {
            const activeDocs = allDocs.filter(d => d.category === cat.name && !d.isArchived && d.status !== 'Archived').length;
            const archivedDocs = allDocs.filter(d => d.category === cat.name && (d.isArchived || d.status === 'Archived')).length;

            const card = document.createElement('div');
            card.className = 'category-card';
            card.innerHTML = `
                <div class="category-card-stripe" style="background:${esc(cat.color || '#3B82F6')};"></div>
                <div class="category-card-header">
                    <div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${esc(cat.color || '#3B82F6')};"></span>
                            <h4 class="category-card-title">${esc(cat.name)}</h4>
                        </div>
                        <p class="category-card-desc">${esc(cat.description || 'Institutional personnel document classification')}</p>
                    </div>
                </div>

                <div class="category-card-metrics">
                    <div>
                        <div class="category-metric-val">${activeDocs}</div>
                        <div class="category-metric-lbl">Active Documents</div>
                    </div>
                    <div style="border-left:1px solid var(--gray-200);padding-left:14px;">
                        <div class="category-metric-val" style="color:var(--gray-600);">${archivedDocs}</div>
                        <div class="category-metric-lbl">Archived</div>
                    </div>
                </div>

                <div class="category-card-footer">
                    <button type="button" class="btn-secondary btn-sm" onclick="filterDocsByCategory('${esc(cat.name)}')">
                        View Records (${activeDocs})
                    </button>
                    <div style="display:flex;gap:6px;">
                        <button type="button" class="action-btn edit" title="Edit Category" onclick="openCategoryModal('${esc(cat.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        ${cat.isSystem ? '' : `
                        <button type="button" class="action-btn delete" title="Delete Category" onclick="deleteCategory('${esc(cat.id)}')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>`}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    window.filterDocsByCategory = function(catName) {
        goToSection('section-documents');
        if (adminDocCatFilter) {
            adminDocCatFilter.value = catName;
            adminDocPage = 1;
            renderAdminDocuments();
        }
    };

    // Category Modal
    const categoryModal = document.getElementById('categoryModal');
    const categoryForm = document.getElementById('categoryForm');
    const categoryModalTitle = document.getElementById('categoryModalTitle');
    const categoryEditId = document.getElementById('categoryEditId');
    const categoryNameInput = document.getElementById('categoryNameInput');
    const categoryDescInput = document.getElementById('categoryDescInput');
    const categoryColorInput = document.getElementById('categoryColorInput');
    const categoryColorHex = document.getElementById('categoryColorHex');
    const categoryIconSelect = document.getElementById('categoryIconSelect');
    const btnCloseCategoryModal = document.getElementById('btnCloseCategoryModal');
    const btnCancelCategoryModal = document.getElementById('btnCancelCategoryModal');
    const btnSaveCategoryModal = document.getElementById('btnSaveCategoryModal');

    categoryColorInput?.addEventListener('input', (e) => {
        if (categoryColorHex) categoryColorHex.value = e.target.value;
    });
    categoryColorHex?.addEventListener('input', (e) => {
        if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value) && categoryColorInput) {
            categoryColorInput.value = e.target.value;
        }
    });

    document.getElementById('btnAddCategory')?.addEventListener('click', () => {
        openCategoryModal();
    });

    window.openCategoryModal = function(catId = null) {
        if (!categoryModal) return;
        if (catId) {
            const categories = SecureHRStorage.getCategories();
            const cat = categories.find(c => c.id === catId);
            if (!cat) return;
            if (categoryModalTitle) categoryModalTitle.textContent = 'Edit Document Category';
            if (categoryEditId) categoryEditId.value = cat.id;
            if (categoryNameInput) categoryNameInput.value = cat.name;
            if (categoryDescInput) categoryDescInput.value = cat.description || '';
            if (categoryColorInput) categoryColorInput.value = cat.color || '#3B82F6';
            if (categoryColorHex) categoryColorHex.value = cat.color || '#3B82F6';
            if (categoryIconSelect) categoryIconSelect.value = cat.icon || 'folder';
        } else {
            if (categoryModalTitle) categoryModalTitle.textContent = 'Add Document Category';
            if (categoryEditId) categoryEditId.value = '';
            if (categoryNameInput) categoryNameInput.value = '';
            if (categoryDescInput) categoryDescInput.value = '';
            if (categoryColorInput) categoryColorInput.value = '#3B82F6';
            if (categoryColorHex) categoryColorHex.value = '#3B82F6';
            if (categoryIconSelect) categoryIconSelect.value = 'folder';
        }
        categoryModal.classList.remove('hidden');
        categoryModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    function closeCategoryModal() {
        if (!categoryModal) return;
        categoryModal.classList.remove('show');
        categoryModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    btnCloseCategoryModal?.addEventListener('click', closeCategoryModal);
    btnCancelCategoryModal?.addEventListener('click', closeCategoryModal);
    categoryModal?.addEventListener('click', (e) => {
        if (e.target === categoryModal) closeCategoryModal();
    });

    btnSaveCategoryModal?.addEventListener('click', async () => {
        const name = (categoryNameInput?.value || '').trim();
        const description = (categoryDescInput?.value || '').trim();
        const color = categoryColorHex?.value || categoryColorInput?.value || '#3B82F6';
        const icon = categoryIconSelect?.value || 'folder';
        const editId = categoryEditId?.value;

        if (!name) {
            showToast('Please enter a category name.', 'error');
            return;
        }

        try {
            if (editId) {
                await SecureHRStorage.updateCategory(editId, { name, description, color, icon });
                await SecureHRStorage.appendAuditLog({
                    actor: currentUser.firstName + ' ' + currentUser.lastName,
                    actorId: currentUser.id,
                    action: 'UPDATE_DOCUMENT_STATUS',
                    target: name,
                    details: `Updated category settings for [${name}]`,
                });
                showToast(`Category "${name}" updated successfully.`, 'success');
            } else {
                await SecureHRStorage.addCategory({ name, description, color, icon });
                await SecureHRStorage.appendAuditLog({
                    actor: currentUser.firstName + ' ' + currentUser.lastName,
                    actorId: currentUser.id,
                    action: 'UPLOAD_DOCUMENT',
                    target: name,
                    details: `Created new document category [${name}]`,
                });
                showToast(`Category "${name}" created successfully.`, 'success');
            }

            closeCategoryModal();
            populateCategoryDropdowns();
            renderCategoriesGrid();
            renderAdminDocuments();
            renderOverviewAnalytics();
        } catch (err) {
            showToast(err.message || 'Failed to save category.', 'error');
        }
    });

    window.deleteCategory = async function(catId) {
        const categories = SecureHRStorage.getCategories();
        const cat = categories.find(c => c.id === catId);
        if (!cat) return;

        const allDocs = SecureHRStorage.getDocuments();
        const linkedDocs = allDocs.filter(d => d.category === cat.name);

        if (cat.isSystem) {
            showToast('Standard research categories cannot be deleted.', 'error');
            return;
        }

        await SecureHRStorage.deleteCategory(catId, 'Other Personnel Files');
        await SecureHRStorage.appendAuditLog({
            actor: currentUser.firstName + ' ' + currentUser.lastName,
            actorId: currentUser.id,
            action: 'DELETE_DOCUMENT',
            target: cat.name,
            details: `Deleted category [${cat.name}]. Linked documents reassigned.`,
        });
        showToast(`Category "${cat.name}" deleted.`, 'info');
        populateCategoryDropdowns();
        renderCategoriesGrid();
        renderAdminDocuments();
        renderOverviewAnalytics();
    };

    // =========================================================================
    // DIRECT "REPLACE DOCUMENT" (FILE VERSION REPLACEMENT)
    // =========================================================================

    const replaceVersionModal = document.getElementById('replaceVersionModal');
    const replaceDocIdInput = document.getElementById('replaceDocId');
    const replaceDocNameEl = document.getElementById('replaceDocName');
    const replaceDocCurrentVerEl = document.getElementById('replaceDocCurrentVer');
    const replaceDocMetaEl = document.getElementById('replaceDocMeta');
    const replaceFileDropZone = document.getElementById('replaceFileDropZone');
    const replaceFileInput = document.getElementById('replaceFileInput');
    const replaceSelectedFileInfo = document.getElementById('replaceSelectedFileInfo');
    const replaceSelectedFileName = document.getElementById('replaceSelectedFileName');
    const btnRemoveReplaceFile = document.getElementById('btnRemoveReplaceFile');
    const replaceVersionNotes = document.getElementById('replaceVersionNotes');
    const btnCloseReplaceVersionModal = document.getElementById('btnCloseReplaceVersionModal');
    const btnCancelReplaceVersion = document.getElementById('btnCancelReplaceVersion');
    const btnConfirmReplaceVersion = document.getElementById('btnConfirmReplaceVersion');

    let replaceSelectedFile = null;

    window.openReplaceVersionModal = function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) {
            showToast('Document not found.', 'error');
            return;
        }

        const emp = SecureHRStorage.getEmployeeById(doc.employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (doc.employeeName || doc.employeeId);
        const curVer = doc.version || 1;

        if (replaceDocIdInput) replaceDocIdInput.value = doc.id;
        if (replaceDocNameEl) replaceDocNameEl.textContent = doc.fileName;
        if (replaceDocCurrentVerEl) replaceDocCurrentVerEl.textContent = `v${curVer}`;
        if (replaceDocMetaEl) replaceDocMetaEl.textContent = `${empName} (${doc.employeeId}) · ${doc.category}`;
        if (replaceVersionNotes) replaceVersionNotes.value = '';

        // Reset file selection
        replaceSelectedFile = null;
        if (replaceFileInput) replaceFileInput.value = '';
        if (replaceSelectedFileInfo) replaceSelectedFileInfo.classList.add('hidden');
        if (replaceFileDropZone) replaceFileDropZone.style.display = '';

        if (replaceVersionModal) {
            replaceVersionModal.style.display = 'flex';
            replaceVersionModal.classList.remove('hidden');
            replaceVersionModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    };

    function closeReplaceVersionModal() {
        if (!replaceVersionModal) return;
        replaceVersionModal.classList.remove('show');
        replaceVersionModal.classList.add('hidden');
        replaceVersionModal.style.display = '';
        document.body.style.overflow = '';
        replaceSelectedFile = null;
    }

    btnCloseReplaceVersionModal?.addEventListener('click', closeReplaceVersionModal);
    btnCancelReplaceVersion?.addEventListener('click', closeReplaceVersionModal);
    replaceVersionModal?.addEventListener('click', (e) => {
        if (e.target === replaceVersionModal) closeReplaceVersionModal();
    });

    replaceFileDropZone?.addEventListener('click', () => replaceFileInput?.click());
    replaceFileDropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        replaceFileDropZone.classList.add('drag-over');
    });
    replaceFileDropZone?.addEventListener('dragleave', () => {
        replaceFileDropZone.classList.remove('drag-over');
    });
    replaceFileDropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        replaceFileDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleReplaceFileSelect(e.dataTransfer.files[0]);
    });
    replaceFileInput?.addEventListener('change', () => {
        if (replaceFileInput.files.length > 0) handleReplaceFileSelect(replaceFileInput.files[0]);
    });

    function handleReplaceFileSelect(file) {
        if (file.size > 5 * 1024 * 1024) {
            showToast('Replacement file is too large. Max size is 5MB.', 'error');
            return;
        }
        replaceSelectedFile = file;
        if (replaceSelectedFileName) replaceSelectedFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        if (replaceSelectedFileInfo) replaceSelectedFileInfo.classList.remove('hidden');
        if (replaceFileDropZone) replaceFileDropZone.style.display = 'none';
    }

    btnRemoveReplaceFile?.addEventListener('click', () => {
        replaceSelectedFile = null;
        if (replaceFileInput) replaceFileInput.value = '';
        if (replaceSelectedFileInfo) replaceSelectedFileInfo.classList.add('hidden');
        if (replaceFileDropZone) replaceFileDropZone.style.display = '';
    });

    btnConfirmReplaceVersion?.addEventListener('click', async () => {
        const docId = replaceDocIdInput?.value;
        if (!docId) return;
        if (!replaceSelectedFile) {
            showToast('Please select a replacement document file.', 'error');
            return;
        }

        const notes = (replaceVersionNotes?.value || '').trim();
        btnConfirmReplaceVersion.disabled = true;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const res = await SecureHRStorage.replaceDocumentVersion(docId, {
                    fileName: replaceSelectedFile.name,
                    fileType: replaceSelectedFile.type,
                    fileData: e.target.result,
                    size: formatFileSize(replaceSelectedFile.size),
                    notes: notes,
                });

                if (res.success) {
                    showToast(`Document updated! New Version ${res.newVersion || ''} active with preserved history.`, 'success');
                    closeReplaceVersionModal();
                    renderAdminDocuments();
                    renderAuditLog();
                    renderOverviewAnalytics();
                    refreshNotifications();
                } else {
                    showToast(res.message || 'Failed to replace version.', 'error');
                }
            } catch (err) {
                showToast(err.message || 'Error uploading version replacement.', 'error');
            } finally {
                btnConfirmReplaceVersion.disabled = false;
            }
        };
        reader.readAsDataURL(replaceSelectedFile);
    });

    // Version History Modal
    const versionHistoryModal = document.getElementById('versionHistoryModal');
    const versionHistoryList = document.getElementById('versionHistoryList');
    const btnCloseVersionHistoryModal = document.getElementById('btnCloseVersionHistoryModal');
    const btnCloseVersionHistoryBtn = document.getElementById('btnCloseVersionHistoryBtn');

    window.openVersionHistoryModal = async function(docId) {
        if (!versionHistoryModal || !versionHistoryList) return;
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) return;

        const history = doc.versionHistory || [];
        const curVer = doc.version || 1;

        versionHistoryList.innerHTML = `
            <div style="margin-bottom:14px;padding:12px;background:var(--gray-50);border-radius:var(--radius-md);border:1px solid var(--gray-200);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong style="color:var(--gray-900);font-size:0.92rem;">${esc(doc.fileName)}</strong>
                    <span class="version-badge" style="background:#4338CA;color:#fff;">Active Version ${curVer}</span>
                </div>
                <div style="font-size:0.78rem;color:var(--gray-500);margin-top:4px;">
                    Doc ID: <code>${esc(doc.id)}</code> · Category: ${esc(doc.category)} · Current Size: ${esc(doc.size || '—')}
                </div>
            </div>
            <h4 style="font-size:0.85rem;color:var(--gray-700);margin-bottom:8px;">Historical Versions &amp; Revisions</h4>
        `;

        if (history.length === 0) {
            versionHistoryList.innerHTML += `
                <div style="padding:14px;background:#fff;border:1px dashed var(--gray-300);border-radius:var(--radius-md);text-align:center;font-size:0.82rem;color:var(--gray-500);">
                    This is the initial version (v1). No previous file replacements recorded.
                </div>`;
        } else {
            const listEl = document.createElement('div');
            listEl.className = 'version-history-box';
            history.forEach(ver => {
                const item = document.createElement('div');
                item.className = 'version-history-item';
                item.innerHTML = `
                    <div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span class="version-badge">v${esc(ver.version)}</span>
                            <strong>${esc(ver.fileName)}</strong>
                            <span style="font-size:0.75rem;color:var(--gray-400);">(${esc(ver.size || '—')})</span>
                        </div>
                        <div style="font-size:0.75rem;color:var(--gray-500);margin-top:3px;">
                            Archived on: ${ver.archivedAt ? new Date(ver.archivedAt).toLocaleString() : '—'}
                            ${ver.notes ? ` · <em>"${esc(ver.notes)}"</em>` : ''}
                        </div>
                    </div>
                `;
                listEl.appendChild(item);
            });
            versionHistoryList.appendChild(listEl);
        }

        if (versionHistoryModal) {
            versionHistoryModal.style.display = 'flex';
            versionHistoryModal.classList.remove('hidden');
            versionHistoryModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    };

    function closeVersionHistoryModal() {
        if (!versionHistoryModal) return;
        versionHistoryModal.classList.remove('show');
        versionHistoryModal.classList.add('hidden');
        versionHistoryModal.style.display = '';
        document.body.style.overflow = '';
    }

    btnCloseVersionHistoryModal?.addEventListener('click', closeVersionHistoryModal);
    btnCloseVersionHistoryBtn?.addEventListener('click', closeVersionHistoryModal);
    versionHistoryModal?.addEventListener('click', (e) => {
        if (e.target === versionHistoryModal) closeVersionHistoryModal();
    });

    // =========================================================================
    // DEDICATED ARCHIVE MODULE & ONE-CLICK RESTORATION
    // =========================================================================

    window.adminArchiveDocument = async function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) return;

        const res = await SecureHRStorage.reviewDocument(docId, {
            status: 'Archived',
        });

        if (res.success) {
            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'ARCHIVE_DOCUMENT',
                target: doc.fileName,
                details: `Moved document [${doc.id}] to Archive Vault`,
            });
            showToast(`Document "${doc.fileName}" moved to Archive Vault.`, 'info');
            renderAdminDocuments();
            renderArchiveTable();
            updateStats();
            refreshNotifications();
        } else {
            showToast(res.message || 'Failed to archive document.', 'error');
        }
    };

    window.adminRestoreDocument = async function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) return;

        const res = await SecureHRStorage.restoreDocument(docId);
        if (res.success) {
            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'UPDATE_DOCUMENT_STATUS',
                target: doc.fileName,
                details: `Restored document [${doc.id}] from Archive to Active circulation`,
            });
            showToast(`Document "${doc.fileName}" restored to active records!`, 'success');
            renderAdminDocuments();
            renderArchiveTable();
            updateStats();
            refreshNotifications();
        } else {
            showToast(res.message || 'Failed to restore document.', 'error');
        }
    };

    function renderArchiveTable() {
        const tableBody = document.getElementById('archiveDocTableBody');
        const emptyState = document.getElementById('archiveEmptyState');
        if (!tableBody) return;

        const allDocs = SecureHRStorage.getDocuments();
        let archived = allDocs.filter(d => d.isArchived || d.status === 'Archived');

        const search = (document.getElementById('archiveDocSearch')?.value || '').trim().toLowerCase();
        const catFilter = document.getElementById('archiveDocCatFilter')?.value || 'all';

        if (catFilter !== 'all') {
            archived = archived.filter(d => d.category === catFilter);
        }
        if (search) {
            archived = archived.filter(d =>
                (d.fileName || '').toLowerCase().includes(search) ||
                (d.employeeId || '').toLowerCase().includes(search) ||
                (d.employeeName || '').toLowerCase().includes(search) ||
                (d.note || '').toLowerCase().includes(search)
            );
        }

        tableBody.innerHTML = '';

        if (archived.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }
        if (emptyState) emptyState.classList.add('hidden');

        archived.forEach(doc => {
            const emp = SecureHRStorage.getEmployeeById(doc.employeeId);
            const empName = emp ? `${emp.firstName} ${emp.lastName}` : (doc.employeeName || doc.employeeId);
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>
                    <div class="doc-icon">
                        <div class="doc-icon-badge pdf">ARC</div>
                        <div>
                            <div class="doc-name">
                                ${esc(doc.fileName)}
                                <span class="version-badge">v${doc.version || 1}</span>
                            </div>
                            <div class="doc-note" style="color:var(--gray-500);">Archived record · Read-only</div>
                        </div>
                    </div>
                </td>
                <td>${esc(empName)} (<code>${esc(doc.employeeId)}</code>)</td>
                <td><span class="category-badge ${esc(doc.category)}">${esc(doc.category)}</span></td>
                <td>${esc(formatDate(doc.archivedAt || doc.uploadedAt))}</td>
                <td>${esc(doc.size || '—')}</td>
                <td><span class="status-badge" style="background:#FEE2E2;color:#991B1B;">Archived</span></td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="action-btn btn-restore-doc" title="Restore Document to Active" onclick="adminRestoreDocument('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                        </button>
                        <button type="button" class="action-btn edit" title="Download Decrypted File" onclick="adminDownloadDocument('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    document.getElementById('archiveDocSearch')?.addEventListener('input', renderArchiveTable);
    document.getElementById('archiveDocCatFilter')?.addEventListener('change', renderArchiveTable);
    document.getElementById('btnRefreshArchive')?.addEventListener('click', () => {
        SecureHRStorage.syncFromDatabase().then(() => {
            renderArchiveTable();
            showToast('Archive vault synchronized.', 'info');
        });
    });

    // =========================================================================
    // DASHBOARD CATEGORY BREAKDOWN & VISUAL ANALYTICS
    // =========================================================================

    function renderOverviewAnalytics() {
        const breakdownContainer = document.getElementById('overviewCategoryBreakdown');
        const recentUploadsContainer = document.getElementById('overviewRecentUploads');
        const recentAccessContainer = document.getElementById('overviewRecentAccess');

        const allDocs = SecureHRStorage.getDocuments();
        const activeDocs = allDocs.filter(d => !d.isArchived && d.status !== 'Archived');
        const categories = typeof SecureHRStorage.getCategories === 'function' ? SecureHRStorage.getCategories() : [];

        // 1. Category Breakdown Progress Bars
        if (breakdownContainer) {
            const total = activeDocs.length;
            if (categories.length === 0) {
                breakdownContainer.innerHTML = '<p style="color:var(--gray-500);font-size:0.85rem;">No categories defined.</p>';
            } else {
                breakdownContainer.innerHTML = '';
                categories.forEach(cat => {
                    const count = activeDocs.filter(d => d.category === cat.name).length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const item = document.createElement('div');
                    item.className = 'cat-progress-item';
                    item.title = `Click to filter documents by ${cat.name}`;
                    item.onclick = () => filterDocsByCategory(cat.name);
                    item.innerHTML = `
                        <div class="cat-progress-info">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(cat.color || '#3B82F6')};"></span>
                                <strong>${esc(cat.name)}</strong>
                            </div>
                            <span>${count} record${count === 1 ? '' : 's'} (${pct}%)</span>
                        </div>
                        <div class="cat-progress-bar">
                            <div class="cat-progress-fill" style="width:${pct}%;background:${esc(cat.color || '#3B82F6')};"></div>
                        </div>
                    `;
                    breakdownContainer.appendChild(item);
                });
            }
        }

        // 2. Recently Uploaded Documents
        if (recentUploadsContainer) {
            recentUploadsContainer.innerHTML = '';
            const recentDocs = [...activeDocs]
                .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))
                .slice(0, 5);

            if (recentDocs.length === 0) {
                recentUploadsContainer.innerHTML = '<p style="font-size:0.8rem;color:var(--gray-500);margin:0;">No documents uploaded yet.</p>';
            } else {
                recentDocs.forEach(d => {
                    const emp = SecureHRStorage.getEmployeeById(d.employeeId);
                    const empName = emp ? `${emp.firstName} ${emp.lastName}` : (d.employeeName || d.employeeId);
                    const row = document.createElement('div');
                    row.className = 'recent-widget-row';
                    row.innerHTML = `
                        <div class="recent-widget-meta">
                            <div class="recent-widget-title">${esc(d.fileName)} <span class="version-badge">v${d.version || 1}</span></div>
                            <div class="recent-widget-sub">${esc(empName)} · ${esc(d.category)} · ${esc(formatDate(d.uploadedAt))}</div>
                        </div>
                        <button type="button" class="btn-secondary btn-sm" style="font-size:0.75rem;padding:4px 8px;" onclick="adminDownloadDocument('${esc(d.id)}')">
                            Download
                        </button>
                    `;
                    recentUploadsContainer.appendChild(row);
                });
            }
        }

        // 3. Recently Accessed Records (from Audit Log)
        if (recentAccessContainer) {
            recentAccessContainer.innerHTML = '';
            const logs = SecureHRStorage.getAuditLog() || [];
            const accessLogs = logs
                .filter(l => ['AES_DECRYPT', 'UPLOAD_DOCUMENT', 'VERIFY_DOCUMENT', 'EDIT_USER'].includes(l.action))
                .slice(0, 5);

            if (accessLogs.length === 0) {
                recentAccessContainer.innerHTML = '<p style="font-size:0.8rem;color:var(--gray-500);margin:0;">No recent access events recorded.</p>';
            } else {
                accessLogs.forEach(l => {
                    const row = document.createElement('div');
                    row.className = 'recent-widget-row';
                    const timeAgo = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
                    row.innerHTML = `
                        <div class="recent-widget-meta">
                            <div class="recent-widget-title">${esc(l.target || l.action)}</div>
                            <div class="recent-widget-sub">${esc(l.actor || 'System')} · <span class="action-badge ${esc(l.action)}" style="font-size:0.68rem;padding:1px 6px;">${esc(l.action)}</span> · ${timeAgo}</div>
                        </div>
                    `;
                    recentAccessContainer.appendChild(row);
                });
            }
        }
    }

    // ADMIN RESET PASSWORD MODAL LOGIC
    const adminResetModal = document.getElementById('adminResetModal');
    const adminResetMessage = document.getElementById('adminResetMessage');
    const adminResetPasswordCode = document.getElementById('adminResetPasswordCode');
    const btnAdminCopyResetPass = document.getElementById('btnAdminCopyResetPass');
    const btnCloseAdminResetModal = document.getElementById('btnCloseAdminResetModal');
    const btnDoneAdminResetModal = document.getElementById('btnDoneAdminResetModal');

    function openAdminResetModal(name, id, tempPass) {
        if (adminResetMessage) adminResetMessage.innerHTML = `A new temporary password has been generated for <strong>${esc(name)}</strong> (<code>${esc(id)}</code>):`;
        if (adminResetPasswordCode) adminResetPasswordCode.textContent = tempPass;
        if (adminResetModal) adminResetModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeAdminResetModal() {
        if (adminResetModal) adminResetModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    if (btnCloseAdminResetModal) btnCloseAdminResetModal.addEventListener('click', closeAdminResetModal);
    if (btnDoneAdminResetModal) btnDoneAdminResetModal.addEventListener('click', closeAdminResetModal);
    if (adminResetModal) {
        adminResetModal.addEventListener('click', (e) => {
            if (e.target === adminResetModal) closeAdminResetModal();
        });
    }

    if (btnAdminCopyResetPass) {
        btnAdminCopyResetPass.addEventListener('click', async () => {
            const pass = adminResetPasswordCode ? adminResetPasswordCode.textContent : '';
            if (!pass) return;
            try {
                await navigator.clipboard.writeText(pass);
                btnAdminCopyResetPass.querySelector('span').textContent = 'Copied!';
                setTimeout(() => {
                    if (btnAdminCopyResetPass.querySelector('span')) btnAdminCopyResetPass.querySelector('span').textContent = 'Copy';
                }, 2000);
            } catch (err) {
                showToast('Copied to clipboard: ' + pass, 'info');
            }
        });
    }

    window.adminResetEmployeePassword = async function(id, name) {
        try {
            if (SecureHRStorage.isHttpServer()) {
                const { ok, json } = await SecureHRStorage.apiFetch('employees.php?action=reset_password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                });

                if (ok && json && json.success && json.data) {
                    openAdminResetModal(name, id, json.data.temporaryPassword);
                    showToast('Temporary password generated successfully!', 'success');
                    return;
                } else {
                    showToast((json && json.message) || 'Failed to reset password.', 'error');
                    return;
                }
            }

            // Fallback for non-server mode
            const tempPass = generatePassword();
            const emp = SecureHRStorage.getEmployeeById(id);
            if (emp) {
                emp.password = tempPass;
                emp.mustChangePassword = true;
                await SecureHRStorage.updateEmployee(id, emp);
                openAdminResetModal(name, id, tempPass);
                showToast('Temporary password generated (local)!', 'success');
            }
        } catch (err) {
            console.error('adminResetEmployeePassword error:', err);
            showToast('Unable to reset password.', 'error');
        }
    };

    window.adminViewDocument = async function(docId) {
        // In-browser preview disabled; trigger secure AES-256 decrypted download
        return adminDownloadDocument(docId);
    };

    window.adminDownloadDocument = async function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        const fileName = doc ? doc.fileName : 'Document';
        showToast(`Decrypting and preparing "${fileName}"...`, 'info');

        const result = await SecureHRStorage.downloadDocument(docId);
        if (!result.success) {
            showToast(result.message || 'Unable to download this file.', 'error');
        } else {
            await SecureHRStorage.syncFromDatabase();
            renderAuditLog();
            refreshNotifications();
            showToast(`Document "${result.fileName || fileName}" decrypted and downloaded.`, 'success');
        }
    };

    window.adminDeleteDocument = async function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) return;

        await SecureHRStorage.deleteDocument(docId);

        await SecureHRStorage.appendAuditLog({
            actor: currentUser.firstName + ' ' + currentUser.lastName,
            actorId: currentUser.id,
            action: 'DELETE_DOCUMENT',
            target: doc.fileName,
            details: `Admin deleted ${doc.category} document for employee ${doc.employeeId}`,
        });

        renderAdminDocuments();
        renderArchiveTable();
        updateStats();
        showToast(`Document "${doc.fileName}" permanently removed.`, 'info');
    };

    btnAdminUploadDoc.addEventListener('click', () => {
        adminSelectedFile = null;
        adminUploadForm.reset();
        adminSelectedFileInfo.classList.add('hidden');
        adminFileDropZone.style.display = '';
        populateEmployeeDropdowns(); // refresh list
        openAdminUploadModal();
    });

    // File drop zone
    adminFileDropZone.addEventListener('click', () => adminFileInput.click());
    adminFileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        adminFileDropZone.classList.add('drag-over');
    });
    adminFileDropZone.addEventListener('dragleave', () => {
        adminFileDropZone.classList.remove('drag-over');
    });
    adminFileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        adminFileDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleAdminFileSelect(e.dataTransfer.files[0]);
    });
    adminFileInput.addEventListener('change', () => {
        if (adminFileInput.files.length > 0) handleAdminFileSelect(adminFileInput.files[0]);
    });

    function handleAdminFileSelect(file) {
        if (file.size > 5 * 1024 * 1024) {
            showToast('File is too large. Maximum size is 5MB.', 'error');
            return;
        }
        adminSelectedFile = file;
        adminSelectedFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        adminSelectedFileInfo.classList.remove('hidden');
        adminFileDropZone.style.display = 'none';
    }

    btnAdminRemoveFile.addEventListener('click', () => {
        adminSelectedFile = null;
        adminFileInput.value = '';
        adminSelectedFileInfo.classList.add('hidden');
        adminFileDropZone.style.display = '';
    });

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Submit upload
    btnSubmitAdminUpload.addEventListener('click', () => {
        const employeeId = adminDocEmployee.value;
        const category = document.getElementById('adminDocCategory').value;
        const note = document.getElementById('adminDocNote').value.trim();
        const accessLevel = document.getElementById('adminDocAccessLevel')?.value || 'shared';
        const initialStatus = document.getElementById('adminDocInitialStatus')?.value || 'Verified';

        if (!employeeId) {
            showToast('Please select an employee.', 'error');
            return;
        }
        if (!adminSelectedFile) {
            showToast('Please select a file to upload.', 'error');
            return;
        }
        if (!category) {
            showToast('Please select a document category.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            const emp = SecureHRStorage.getEmployeeById(employeeId);
            const docId = 'DOC-' + Date.now();
            const newDoc = {
                id: docId,
                employeeId: employeeId,
                fileName: adminSelectedFile.name,
                fileType: adminSelectedFile.type,
                category: category,
                uploadedBy: currentUser.id,
                uploadedAt: new Date().toISOString().split('T')[0],
                size: formatFileSize(adminSelectedFile.size),
                note: note,
                fileData: e.target.result,
                accessLevel: accessLevel,
                status: initialStatus,
            };

            await SecureHRStorage.addDocument(newDoc);

            const visibilityText = accessLevel === 'hr_only' ? 'HR-Only Confidential' : 'Shared with Employee';
            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'UPLOAD_DOCUMENT',
                target: adminSelectedFile.name,
                details: `Admin uploaded ${category} document for ${emp ? emp.firstName + ' ' + emp.lastName : employeeId} [${visibilityText}, Status: ${initialStatus}] (${formatFileSize(adminSelectedFile.size)})`,
            });

            closeAdminUploadModal();
            renderAdminDocuments();
            renderAuditLog();
            refreshNotifications();
            showToast(`Document encrypted with AES-256-GCM and saved [${visibilityText}]!`, 'success');
        };
        reader.readAsDataURL(adminSelectedFile);
    });

    // Modal helpers
    function openAdminUploadModal() {
        adminUploadModal.style.display = 'flex';
        adminUploadModal.classList.remove('hidden');
        adminUploadModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function closeAdminUploadModal() {
        adminUploadModal.classList.remove('show');
        adminUploadModal.classList.add('hidden');
        adminUploadModal.style.display = '';
        document.body.style.overflow = '';
        adminSelectedFile = null;
    }
    btnCloseAdminUploadModal.addEventListener('click', closeAdminUploadModal);
    btnCancelAdminUpload.addEventListener('click', closeAdminUploadModal);
    adminUploadModal.addEventListener('click', e => { if (e.target === adminUploadModal) closeAdminUploadModal(); });

    // ADMIN REVIEW & VERIFICATION MODAL LOGIC
    const adminReviewModal = document.getElementById('adminReviewModal');
    const reviewDocIdInput = document.getElementById('reviewDocId');
    const reviewDocSummary = document.getElementById('reviewDocSummary');
    const reviewStatusSelect = document.getElementById('reviewStatusSelect');
    const reviewAccessLevelSelect = document.getElementById('reviewAccessLevelSelect');
    const reviewNotesInput = document.getElementById('reviewNotesInput');
    const reviewStatusHint = document.getElementById('reviewStatusHint');
    const btnCloseAdminReviewModal = document.getElementById('btnCloseAdminReviewModal');
    const btnCancelAdminReview = document.getElementById('btnCancelAdminReview');
    const btnSubmitAdminReview = document.getElementById('btnSubmitAdminReview');

    // Download Reason Modal listeners
    const downloadReasonModal = document.getElementById('downloadReasonModal');
    const btnCloseDownloadReasonModal = document.getElementById('btnCloseDownloadReasonModal');
    const btnCancelDownloadReason = document.getElementById('btnCancelDownloadReason');
    const btnConfirmSecureDownload = document.getElementById('btnConfirmSecureDownload');

    function closeDownloadReasonModal() {
        if (downloadReasonModal) {
            downloadReasonModal.classList.add('hidden');
            downloadReasonModal.style.display = 'none';
        }
    }
    if (btnCloseDownloadReasonModal) btnCloseDownloadReasonModal.addEventListener('click', closeDownloadReasonModal);
    if (btnCancelDownloadReason) btnCancelDownloadReason.addEventListener('click', closeDownloadReasonModal);
    if (btnConfirmSecureDownload) {
        btnConfirmSecureDownload.addEventListener('click', async () => {
            const docId = document.getElementById('downloadReasonDocId')?.value;
            closeDownloadReasonModal();
            if (docId) {
                await SecureHRStorage.downloadDocument(docId);
            }
        });
    }

    function updateReviewStatusHint(status) {
        if (!reviewStatusHint) return;
        if (status === 'Verified') {
            reviewStatusHint.innerHTML = '🔒 <strong>Verified:</strong> Confirms authenticity and locks the document from employee deletion.';
            reviewStatusHint.style.color = '#047857';
        } else if (status === 'Rejected') {
            reviewStatusHint.innerHTML = '⚠️ <strong>Rejected:</strong> Flags document for correction. The employee will see remarks and can re-upload.';
            reviewStatusHint.style.color = '#B91C1C';
        } else if (status === 'Archived') {
            reviewStatusHint.innerHTML = '📁 <strong>Archived:</strong> Marks as a retired historical record. Locked from employee deletion.';
            reviewStatusHint.style.color = '#475569';
        } else {
            reviewStatusHint.innerHTML = '⏳ <strong>Pending:</strong> Remains in review queue. Document is unlocked.';
            reviewStatusHint.style.color = '#B45309';
        }
    }

    window.openAdminReviewModal = function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) {
            showToast('Document not found.', 'error');
            return;
        }
        const emp = SecureHRStorage.getEmployeeById(doc.employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : (doc.employeeName || doc.employeeId);

        if (reviewDocIdInput) reviewDocIdInput.value = doc.id;
        if (reviewStatusSelect) {
            reviewStatusSelect.value = doc.status || 'Verified';
            updateReviewStatusHint(reviewStatusSelect.value);
        }
        if (reviewAccessLevelSelect) reviewAccessLevelSelect.value = doc.accessLevel || 'shared';
        if (reviewNotesInput) reviewNotesInput.value = doc.reviewNote || '';

        if (reviewDocSummary) {
            const uploadDate = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
            const uploaderDesc = doc.uploadedBy === doc.employeeId ? `Employee (${doc.employeeId})` : `HR Admin (${doc.uploadedBy})`;
            const currentStatus = doc.status || 'Verified';
            const currentAccess = doc.accessLevel || 'shared';

            reviewDocSummary.innerHTML = `
                <div class="review-doc-summary-row">
                    <span class="review-doc-summary-label">Employee:</span>
                    <span class="review-doc-summary-val">${esc(empName)} (<code>${esc(doc.employeeId)}</code>)</span>
                </div>
                <div class="review-doc-summary-row">
                    <span class="review-doc-summary-label">File:</span>
                    <span class="review-doc-summary-val" style="word-break:break-all;">${esc(doc.fileName)} <span class="aes-badge">AES-256</span></span>
                </div>
                <div class="review-doc-summary-row">
                    <span class="review-doc-summary-label">Category &bull; Size:</span>
                    <span class="review-doc-summary-val">${esc(doc.category)} &bull; ${esc(doc.size || '—')}</span>
                </div>
                <div class="review-doc-summary-row">
                    <span class="review-doc-summary-label">Uploaded By:</span>
                    <span class="review-doc-summary-val">${esc(uploaderDesc)} on ${esc(uploadDate)}</span>
                </div>
                <div class="review-doc-summary-row">
                    <span class="review-doc-summary-label">Current State:</span>
                    <span class="review-doc-summary-val">
                        <span class="status-badge ${esc(currentStatus.toLowerCase())}">${esc(currentStatus)}</span>
                        <span class="access-badge ${esc(currentAccess)}">${currentAccess === 'hr_only' ? 'HR-Only' : 'Shared'}</span>
                    </span>
                </div>
                ${doc.reviewedBy ? `
                <div class="review-doc-summary-row">
                    <span class="review-doc-summary-label">Last Reviewed By:</span>
                    <span class="review-doc-summary-val">${esc(doc.reviewedBy)} (${esc(doc.reviewedAt || '—')})</span>
                </div>` : ''}
            `;
        }

        if (adminReviewModal) {
            adminReviewModal.style.display = 'flex';
            adminReviewModal.classList.remove('hidden');
            adminReviewModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    };

    function closeAdminReviewModal() {
        if (!adminReviewModal) return;
        adminReviewModal.classList.remove('show');
        adminReviewModal.classList.add('hidden');
        adminReviewModal.style.display = '';
        document.body.style.overflow = '';
    }

    reviewStatusSelect?.addEventListener('change', () => {
        updateReviewStatusHint(reviewStatusSelect.value);
    });

    btnCloseAdminReviewModal?.addEventListener('click', closeAdminReviewModal);
    btnCancelAdminReview?.addEventListener('click', closeAdminReviewModal);
    adminReviewModal?.addEventListener('click', (e) => {
        if (e.target === adminReviewModal) closeAdminReviewModal();
    });

    btnSubmitAdminReview?.addEventListener('click', async () => {
        const docId = reviewDocIdInput?.value;
        if (!docId) return;

        const status = reviewStatusSelect.value;
        const accessLevel = reviewAccessLevelSelect.value;
        const reviewNote = reviewNotesInput.value.trim();

        const res = await SecureHRStorage.reviewDocument(docId, {
            status,
            accessLevel,
            reviewNote,
        });

        if (res.success) {
            closeAdminReviewModal();
            renderAdminDocuments();
            renderAuditLog();
            refreshNotifications();
            showToast(`Document updated: Status [${status}], Access [${accessLevel === 'hr_only' ? 'HR-Only' : 'Shared'}]!`, 'success');
        } else {
            showToast(res.message || 'Failed to update review status.', 'error');
        }
    });

    window.adminQuickChangeStatus = async function(docId, newStatus) {
        if (newStatus === 'Rejected') {
            openAdminReviewModal(docId);
            if (reviewStatusSelect) {
                reviewStatusSelect.value = 'Rejected';
                updateReviewStatusHint('Rejected');
            }
            if (reviewNotesInput) reviewNotesInput.focus();
            showToast('Please specify the rejection remark for the employee.', 'info');
            return;
        }

        const res = await SecureHRStorage.reviewDocument(docId, {
            status: newStatus,
        });

        if (res.success) {
            renderAdminDocuments();
            renderAuditLog();
            refreshNotifications();
            showToast(`Document status changed to ${newStatus}!`, 'success');
        } else {
            showToast(res.message || 'Failed to update document status.', 'error');
            renderAdminDocuments();
        }
    };

    //  AUDIT LOG

    const auditTableBody = document.getElementById('auditTableBody');
    const auditEmptyState = document.getElementById('auditEmptyState');
    const auditActionFilter = document.getElementById('auditActionFilter');

    // Human-readable action labels
    const ACTION_LABELS = {
        LOGIN: 'Login',
        LOGOUT: 'Logout',
        CREATE_USER: 'Create User',
        EDIT_USER: 'Edit User',
        UPDATE_USER: 'Update User',
        DELETE_USER: 'Delete User',
        UPLOAD_DOCUMENT: 'Upload Doc',
        VERIFY_DOCUMENT: 'Verify Doc',
        REJECT_DOCUMENT: 'Reject Doc',
        ARCHIVE_DOCUMENT: 'Archive Doc',
        UPDATE_DOCUMENT_STATUS: 'Status Update',
        UPDATE_DOCUMENT_ACCESS: 'Access Update',
        AES_ENCRYPT: 'AES Encrypt',
        AES_DECRYPT: 'AES Decrypt',
        DELETE_DOCUMENT: 'Delete Doc',
        CHANGE_PASSWORD: 'Password Change',
    };

    function renderAuditLog() {
        const filter = auditActionFilter.value;
        let log = SecureHRStorage.getAuditLog();

        if (filter !== 'all') {
            log = log.filter(entry => entry.action === filter);
        }

        auditTableBody.innerHTML = '';

        if (log.length === 0) {
            auditEmptyState.classList.remove('hidden');
            return;
        }
        auditEmptyState.classList.add('hidden');

        log.forEach(entry => {
            const row = document.createElement('tr');
            const ts = new Date(entry.timestamp);
            const timeStr = ts.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                + ' ' + ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

            row.innerHTML = `
                <td style="font-size:0.82rem;color:var(--gray-500);white-space:nowrap;">${esc(timeStr)}</td>
                <td style="font-size:0.85rem;font-weight:500;color:var(--gray-700);">${esc(entry.actor || '—')}</td>
                <td><span class="action-badge ${esc(entry.action)}">${esc(ACTION_LABELS[entry.action] || entry.action)}</span></td>
                <td style="font-size:0.85rem;color:var(--gray-700);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(entry.target || '')}">${esc(entry.target || '—')}</td>
                <td style="font-size:0.82rem;color:var(--gray-500);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(entry.details || '')}">${esc(entry.details || '—')}</td>
            `;
            auditTableBody.appendChild(row);
        });
    }

    auditActionFilter.addEventListener('change', renderAuditLog);

    const notifPanel = document.getElementById('notifPanel');
    const searchPanel = document.getElementById('searchPanel');
    const notifDot = document.getElementById('notifDot');
    const notifList = document.getElementById('notifList');
    const NOTIF_SEEN_KEY = 'securehr_admin_notif_seen';

    function closeTopbarPanels() {
        if (notifPanel) notifPanel.hidden = true;
        if (searchPanel) searchPanel.hidden = true;
        const btnN = document.getElementById('btnNotifications');
        const btnS = document.getElementById('btnTopSearch');
        if (btnN) btnN.setAttribute('aria-expanded', 'false');
        if (btnS) btnS.setAttribute('aria-expanded', 'false');
    }

    async function refreshNotifications() {
        if (!notifList) return;
        const data = await SecureHRStorage.getNotifications();
        const notifs = data.notifications || [];
        const unreadCount = data.unreadCount || 0;

        const unreadBadge = document.getElementById('adminNotifUnreadCount');
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount;
            unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
        if (notifDot) notifDot.classList.toggle('hidden', unreadCount === 0);

        notifList.innerHTML = '';
        if (notifs.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'dropdown-empty';
            empty.textContent = 'No notifications yet.';
            notifList.appendChild(empty);
            return;
        }

        notifs.forEach(notif => {
            const card = document.createElement('div');
            card.className = `notif-card ${!notif.read ? 'unread' : ''}`;

            let iconSvg = '';
            if (notif.type === 'success') {
                iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
            } else if (notif.type === 'warning') {
                iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
            } else if (notif.type === 'error') {
                iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';
            } else {
                iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>';
            }

            card.innerHTML = `
                <div class="notif-icon-badge ${esc(notif.type || 'info')}">
                    ${iconSvg}
                </div>
                <div class="notif-content">
                    <div class="notif-card-title">
                        <span>${esc(notif.title)}</span>
                    </div>
                    <div class="notif-card-msg">${esc(notif.message)}</div>
                    <span class="notif-card-time">${esc(formatDate(notif.created_at || notif.createdAt))}</span>
                </div>
            `;

            card.addEventListener('click', async () => {
                await SecureHRStorage.markNotificationsAsRead(notif.id);
                closeTopbarPanels();
                if (notif.link) {
                    goToSection(notif.link);
                }
                refreshNotifications();
            });

            notifList.appendChild(card);
        });
    }

    document.getElementById('btnMarkAllNotifsReadAdmin')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await SecureHRStorage.markNotificationsAsRead('all');
        refreshNotifications();
        showToast('All notifications marked as read.', 'success');
    });

    function renderGlobalSearch(query) {
        const resultsEl = document.getElementById('globalSearchResults');
        if (!resultsEl) return;
        resultsEl.innerHTML = '';
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            const empty = document.createElement('p');
            empty.className = 'dropdown-empty';
            empty.textContent = 'Type a name, email, ID, or file name.';
            resultsEl.appendChild(empty);
            return;
        }

        const employees = getEmployees().filter(e =>
            (e.firstName + ' ' + e.lastName).toLowerCase().includes(q)
            || (e.email || '').toLowerCase().includes(q)
            || (e.id || '').toLowerCase().includes(q)
            || (e.department || '').toLowerCase().includes(q)
        ).slice(0, 5);

        const docs = SecureHRStorage.getDocuments().filter(d =>
            (d.fileName || '').toLowerCase().includes(q)
            || (d.note || '').toLowerCase().includes(q)
        ).slice(0, 5);

        if (employees.length === 0 && docs.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'dropdown-empty';
            empty.textContent = 'No matching employees or documents.';
            resultsEl.appendChild(empty);
            return;
        }

        employees.forEach(emp => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dropdown-item';
            const title = document.createElement('span');
            title.className = 'dropdown-item-title';
            title.textContent = emp.firstName + ' ' + emp.lastName;
            const meta = document.createElement('span');
            meta.className = 'dropdown-item-meta';
            meta.textContent = emp.id + ' · ' + emp.department;
            btn.appendChild(title);
            btn.appendChild(meta);
            btn.addEventListener('click', () => {
                closeTopbarPanels();
                goToSection('section-users');
                searchInput.value = emp.firstName;
                searchInput.dispatchEvent(new Event('input'));
            });
            resultsEl.appendChild(btn);
        });

        docs.forEach(doc => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dropdown-item';
            const title = document.createElement('span');
            title.className = 'dropdown-item-title';
            title.textContent = doc.fileName;
            const meta = document.createElement('span');
            meta.className = 'dropdown-item-meta';
            meta.textContent = (doc.category || 'Document') + ' · ' + (doc.employeeId || '');
            btn.appendChild(title);
            btn.appendChild(meta);
            btn.addEventListener('click', () => {
                closeTopbarPanels();
                goToSection('section-documents');
                const docSearch = document.getElementById('adminDocSearch');
                if (docSearch) {
                    docSearch.value = doc.fileName;
                    renderAdminDocuments();
                }
            });
            resultsEl.appendChild(btn);
        });
    }

    document.getElementById('btnNotifications')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = notifPanel.hidden;
        closeTopbarPanels();
        if (willOpen) {
            refreshNotifications();
            notifPanel.hidden = false;
            document.getElementById('btnNotifications').setAttribute('aria-expanded', 'true');
            sessionStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
            if (notifDot) notifDot.classList.add('hidden');
        }
    });

    document.getElementById('btnTopSearch')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = searchPanel.hidden;
        closeTopbarPanels();
        if (willOpen) {
            searchPanel.hidden = false;
            document.getElementById('btnTopSearch').setAttribute('aria-expanded', 'true');
            const input = document.getElementById('globalSearchInput');
            renderGlobalSearch(input.value);
            setTimeout(() => input.focus(), 0);
        }
    });

    document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
        renderGlobalSearch(e.target.value);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.topbar-menu')) closeTopbarPanels();
    });

    const btnRefreshAudit = document.getElementById('btnRefreshAudit');
    if (btnRefreshAudit) {
        btnRefreshAudit.addEventListener('click', async () => {
            await SecureHRStorage.syncFromDatabase();
            renderAuditLog();
            refreshNotifications();
            showToast('Audit log refreshed.', 'success');
        });
    }

    // ─── Export Suite ─────────────────────────────────────────────────────────

    // ─── Print & Reporting Suite ──────────────────────────────────────────────

    function printReport(title, headers, rowsHtml, metaText) {
        const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} — BCP SecureHR</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
        .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
        .header h1 { font-size: 17px; font-weight: 700; color: #0f172a; }
        .header p  { font-size: 11px; color: #64748b; margin-top: 2px; }
        .report-title { font-size: 14px; font-weight: 700; color: #1d4ed8; margin-bottom: 4px; }
        .report-meta  { font-size: 11px; color: #64748b; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #f8fafc; color: #334155; text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; border: 1px solid #cbd5e1; }
        td { padding: 7px 10px; border: 1px solid #cbd5e1; font-size: 11px; vertical-align: middle; }
        tr:nth-child(even) td { background: #f8fafc; }
        .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #94a3b8; text-align: center; }
        @media print {
            body { padding: 12px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Bestlink College of the Philippines</h1>
            <p>SecureHR — Institutional Human Resource Management System</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b;">
            Date: ${today}
        </div>
    </div>
    <div class="report-title">${title}</div>
    <div class="report-meta">${metaText}</div>
    <table>
        <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
    </table>
    <div class="footer">
        SecureHR &copy; ${new Date().getFullYear()} Bestlink College of the Philippines — Confidential. Internal institutional report.
    </div>
</body>
</html>`;

        let frame = document.getElementById('securePrintFrame');
        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = 'securePrintFrame';
            frame.style.position = 'fixed';
            frame.style.right = '0';
            frame.style.bottom = '0';
            frame.style.width = '0';
            frame.style.height = '0';
            frame.style.border = '0';
            document.body.appendChild(frame);
        }

        try {
            const frameDoc = frame.contentWindow.document;
            frameDoc.open();
            frameDoc.write(printHtml);
            frameDoc.close();
            setTimeout(() => {
                frame.contentWindow.focus();
                frame.contentWindow.print();
            }, 300);
        } catch (e) {
            window.print();
        }
    }

    // --- Print Employees ---
    document.getElementById('btnPrintEmployees')?.addEventListener('click', () => {
        const employees = getEmployees();
        if (!employees || employees.length === 0) {
            showToast('No employee records available to print.', 'info');
            return;
        }

        const headers = ['Employee ID', 'Full Name', 'Email', 'Department', 'Role', 'Status', 'Date Added'];
        const rowsHtml = employees.map(e => `
            <tr>
                <td>${SecureHRStorage.escapeHtml(e.id || '')}</td>
                <td><strong>${SecureHRStorage.escapeHtml((e.firstName || '') + ' ' + (e.lastName || ''))}</strong></td>
                <td>${SecureHRStorage.escapeHtml(e.email || '')}</td>
                <td>${SecureHRStorage.escapeHtml(e.department || '')}</td>
                <td>${SecureHRStorage.escapeHtml(e.role === 'admin' ? 'HR Admin' : 'HR Staff')}</td>
                <td>${SecureHRStorage.escapeHtml(e.status ? e.status.toUpperCase() : 'ACTIVE')}</td>
                <td>${e.dateAdded ? formatDate(e.dateAdded) : '—'}</td>
            </tr>`).join('');

        printReport(
            'Official Employee Registry',
            headers,
            rowsHtml,
            `Total Employee Records: ${employees.length}`
        );
    });

    // --- Print Documents ---
    document.getElementById('btnPrintDocs')?.addEventListener('click', () => {
        const documents = SecureHRStorage.getDocuments();
        if (!documents || documents.length === 0) {
            showToast('No documents available to print.', 'info');
            return;
        }

        const headers = ['#', 'File Name', 'Employee', 'Category', 'Status', 'Size', 'Date Uploaded'];
        const rowsHtml = documents.map(d => `
            <tr>
                <td>${SecureHRStorage.escapeHtml(d.id || '')}</td>
                <td><strong>${SecureHRStorage.escapeHtml(d.fileName || '')}</strong></td>
                <td>${SecureHRStorage.escapeHtml(d.employeeName || d.employeeId || '')}</td>
                <td>${SecureHRStorage.escapeHtml(d.category || '')}</td>
                <td>${SecureHRStorage.escapeHtml(d.status || 'Pending')}</td>
                <td>${SecureHRStorage.escapeHtml(d.size || '—')}</td>
                <td>${d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : '—'}</td>
            </tr>`).join('');

        printReport(
            'Official Document Registry',
            headers,
            rowsHtml,
            `Total Document Records: ${documents.length}`
        );
    });

    // --- Print Audit Log ---
    document.getElementById('btnPrintAudit')?.addEventListener('click', () => {
        const logs = SecureHRStorage.getAuditLog();
        if (!logs || logs.length === 0) {
            showToast('No audit log entries available to print.', 'info');
            return;
        }

        const headers = ['Timestamp', 'Actor', 'Action', 'Target File', 'Details'];
        const rowsHtml = logs.map(l => `
            <tr>
                <td>${l.timestamp ? new Date(l.timestamp).toLocaleString() : ''}</td>
                <td>${SecureHRStorage.escapeHtml(l.actor || '')}</td>
                <td><strong>${SecureHRStorage.escapeHtml(l.action || '')}</strong></td>
                <td>${SecureHRStorage.escapeHtml(l.target || '—')}</td>
                <td>${SecureHRStorage.escapeHtml(l.details || '')}</td>
            </tr>`).join('');

        printReport(
            'System Security & Activity Audit Log',
            headers,
            rowsHtml,
            `Total Audit Log Entries: ${logs.length}`
        );
    });

    // ─── End Export Suite ──────────────────────────────────────────────────────

    function refreshAllViews() {
        renderTable(getEmployees());
        populateEmployeeDropdowns();
        populateCategoryDropdowns();
        renderCategoriesGrid();
        renderAdminDocuments();
        renderArchiveTable();
        renderAuditLog();
        renderOverviewAnalytics();
        refreshNotifications();
    }

    refreshAllViews();

    // Fetch live data from server database
    SecureHRStorage.syncFromDatabase().then(() => {
        refreshAllViews();
    });
});
