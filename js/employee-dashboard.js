
// SecureHR — Employee Dashboard JavaScript
// My Documents, Profile, Change Password

document.addEventListener('DOMContentLoaded', () => {

    const currentUser = SecureHRSession.requireAuth('employee');
    if (!currentUser) return;

    const esc = SecureHRStorage.escapeHtml;

    SecureHRSession.startInactivityTimer();

    const initials = (currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase();
    document.getElementById('empAvatar').textContent = initials;
    document.getElementById('empAvatar').title = currentUser.firstName + ' ' + currentUser.lastName;
    document.getElementById('empName').textContent = currentUser.firstName + ' ' + currentUser.lastName;
    document.getElementById('empEmail').textContent = currentUser.email;

    const roleTitles = {
        system_admin: 'System Administrator',
        hr_admin: 'HR Administrator',
        hr_staff: 'HR Staff',
        admin: 'HR Administrator',
        employee: 'Employee',
    };
    const roleTitle = roleTitles[currentUser.role] || (currentUser.normalizedRole === 'system_admin' || currentUser.role === 'admin' ? 'HR Administrator' : 'HR Staff');
    const sidebarRoleTag = document.getElementById('sidebarRoleTag');
    if (sidebarRoleTag) sidebarRoleTag.textContent = roleTitle;

    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const el = document.getElementById('liveClock');
        if (el) el.textContent = timeStr;
    }
    updateClock();
    setInterval(updateClock, 1000);

    const navItems = document.querySelectorAll('.nav-item[data-section]');
    const pageSections = document.querySelectorAll('.page-section');

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

    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');

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

    document.querySelectorAll('.stat-card[data-section], .quick-link[data-section]').forEach(el => {
        const open = () => goToSection(el.dataset.section);
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        SecureHRSession.logout();
    });

    //  OVERVIEW SECTION

    function updateOverview() {
        const docs = SecureHRStorage.getDocumentsByEmployee(currentUser.id);
        document.getElementById('welcomeHeading').textContent = `Welcome back, ${currentUser.firstName}!`;
        document.getElementById('statTotalDocs').textContent = docs.length;
        document.getElementById('statStatus').textContent = currentUser.status.charAt(0).toUpperCase() + currentUser.status.slice(1);
        document.getElementById('statDepartment').textContent = currentUser.department;
        document.getElementById('statEmpId').textContent = currentUser.id;

        // Update doc count badge in sidebar
        document.getElementById('docCount').textContent = docs.length;
    }

    //  PROFILE SECTION

    function renderProfile() {
        document.getElementById('profileAvatar').textContent = initials;
        document.getElementById('profileName').textContent = currentUser.firstName + ' ' + currentUser.lastName;
        document.getElementById('profileId').textContent = currentUser.id;
        document.getElementById('profileEmail').textContent = currentUser.email;
        document.getElementById('profileDept').textContent = currentUser.department;
        document.getElementById('profileRole').textContent = roleTitle;

        const statusEl = document.getElementById('profileStatus');
        statusEl.textContent = '';
        const badge = document.createElement('span');
        badge.className = 'status-badge ' + currentUser.status;
        badge.textContent = currentUser.status.charAt(0).toUpperCase() + currentUser.status.slice(1);
        statusEl.appendChild(badge);

        document.getElementById('profileDate').textContent = new Date(currentUser.dateAdded).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    //  DOCUMENTS SECTION

    const docTableBody = document.getElementById('docTableBody');
    const docEmptyState = document.getElementById('docEmptyState');
    const docCategoryFilter = document.getElementById('docCategoryFilter');

    function getMyDocuments() {
        return SecureHRStorage.getDocumentsByEmployee(currentUser.id);
    }

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

    let empDocPage = 1;
    let empDocLimit = 6;
    let empDocSortBy = 'date';
    let empDocSortOrder = 'desc';

    /**
     * Master List 2 Implementation for Employee Portal
     * Handles document queries, multi-field sorting, pagination, and details.
     */
    function list2(options = {}) {
        if (options.sortBy) empDocSortBy = options.sortBy;
        if (options.sortOrder) empDocSortOrder = options.sortOrder;
        if (options.page) empDocPage = options.page;
        if (options.limit !== undefined) {
            empDocLimit = options.limit === 'all' ? 999999 : parseInt(options.limit, 10) || 6;
        }

        let docs = getMyDocuments();
        const filterCategory = docCategoryFilter ? docCategoryFilter.value : 'all';
        if (filterCategory && filterCategory !== 'all') {
            docs = docs.filter(d => d.category === filterCategory);
        }
        const filterStatus = document.getElementById('empDocStatusFilter')?.value || 'all';
        if (filterStatus && filterStatus !== 'all') {
            docs = docs.filter(d => (d.status || 'Verified') === filterStatus);
        }
        // Date Range Filtering
        const dateFrom = document.getElementById('empDocDateFrom')?.value;
        const dateTo = document.getElementById('empDocDateTo')?.value;
        if (dateFrom) {
            docs = docs.filter(d => (d.uploadedAt || '').slice(0, 10) >= dateFrom);
        }
        if (dateTo) {
            docs = docs.filter(d => (d.uploadedAt || '').slice(0, 10) <= dateTo);
        }

        const q = (document.getElementById('empDocSearch')?.value || '').trim().toLowerCase();
        if (q) {
            docs = docs.filter(d =>
                (d.fileName || '').toLowerCase().includes(q)
                || (d.note || '').toLowerCase().includes(q)
                || (d.reviewNote || '').toLowerCase().includes(q)
                || (d.category || '').toLowerCase().includes(q)
            );
        }

        // Multi-column sorting
        docs.sort((a, b) => {
            let valA, valB;
            switch (empDocSortBy) {
                case 'name':
                    valA = (a.fileName || '').toLowerCase();
                    valB = (b.fileName || '').toLowerCase();
                    break;
                case 'category':
                    valA = (a.category || '').toLowerCase();
                    valB = (b.category || '').toLowerCase();
                    break;
                case 'status':
                    valA = (a.status || 'Verified').toLowerCase();
                    valB = (b.status || 'Verified').toLowerCase();
                    break;
                case 'size':
                    valA = a.rawBytes || 0;
                    valB = b.rawBytes || 0;
                    break;
                case 'date':
                default:
                    valA = a.createdAt || new Date(a.uploadedAt || 0).getTime();
                    valB = b.createdAt || new Date(b.uploadedAt || 0).getTime();
                    break;
            }

            if (valA < valB) return empDocSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return empDocSortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // Update sortable header icons
        document.querySelectorAll('#empDocumentsTable .sortable-th').forEach(th => {
            const field = th.dataset.sort;
            const icon = th.querySelector('.sort-icon');
            if (field === empDocSortBy) {
                th.classList.add('active-sort');
                if (icon) icon.textContent = empDocSortOrder === 'asc' ? '▲' : '▼';
            } else {
                th.classList.remove('active-sort');
                if (icon) icon.textContent = '↕';
            }
        });

        docTableBody.innerHTML = '';
        updateOverview();

        if (!docs || docs.length === 0) {
            docEmptyState.classList.remove('hidden');
            renderPaginationBar('empDocPagination', 1, 0, 0, () => {});
            return;
        }
        docEmptyState.classList.add('hidden');

        const totalPages = Math.ceil(docs.length / empDocLimit);
        if (empDocPage > totalPages) empDocPage = totalPages;
        if (empDocPage < 1) empDocPage = 1;

        const pageDocs = docs.slice((empDocPage - 1) * empDocLimit, empDocPage * empDocLimit);

        pageDocs.forEach(doc => {
            const ext = getFileExtension(doc.fileName);
            const badgeClass = getBadgeClass(ext);

            const status = doc.status || 'Verified';
            let statusBadgeHtml = '';
            if (status === 'Verified') {
                statusBadgeHtml = `<span class="status-badge verified" title="Officially Verified & Approved">Verified</span>`;
            } else if (status === 'Rejected') {
                statusBadgeHtml = `<span class="status-badge rejected" title="Rejected: ${esc(doc.reviewNote || 'Action required')}">Rejected</span>`;
            } else if (status === 'Archived') {
                statusBadgeHtml = `<span class="status-badge archived" title="Archived Historical Record">Archived</span>`;
            } else {
                statusBadgeHtml = `<span class="status-badge pending" title="Pending HR Review">Pending Review</span>`;
            }

            const versionNum = doc.version || 1;
            const versionBadgeHtml = `<span class="version-badge" title="Version ${versionNum} (Click for version history)" style="cursor:pointer;margin-left:6px;" onclick="openEmpVersionHistoryModal('${esc(doc.id)}')">v${versionNum}</span>`;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="doc-icon">
                        <div class="doc-icon-badge ${esc(badgeClass)}">${esc(ext)}</div>
                        <div>
                            <div class="doc-name" style="cursor:pointer;" onclick="openEmpDocDetailModal('${esc(doc.id)}')" title="Click to view document details">
                                ${esc(doc.fileName)} ${versionBadgeHtml} <span class="aes-badge" title="Encrypted at rest using AES-256-GCM">AES-256</span>
                            </div>
                            ${doc.note ? `<div class="doc-note">${esc(doc.note)}</div>` : ''}
                            ${doc.status === 'Rejected' ? `
                                <div class="rejection-callout">
                                    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" style="flex-shrink:0;margin-top:1px;"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                                    <span><strong>HR Remarks:</strong> ${esc(doc.reviewNote || 'Correction required. Please re-upload a compliant file.')}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </td>
                <td><span class="category-badge ${esc(doc.category)}">${esc(doc.category)}</span></td>
                <td>${statusBadgeHtml}</td>
                <td style="font-size:0.85rem;color:var(--gray-500)">${esc(doc.size || '—')}</td>
                <td style="font-size:0.85rem;color:var(--gray-500)">${esc(formatDate(doc.uploadedAt))}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn" title="View Document" onclick="empRequestAccess('${esc(doc.id)}', 'view')">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                        </button>
                        <button class="action-btn" title="Replace File / New Version" onclick="openEmpReplaceModal('${esc(doc.id)}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4 7.58 4 4 7.58 4 12H1l4 4 4-4H6z"/></svg>
                        </button>
                    </div>
                </td>
            `;
            docTableBody.appendChild(row);
        });

        renderPaginationBar('empDocPagination', empDocPage, totalPages, docs.length, (p) => {
            empDocPage = p;
            list2();
        });
    }

    // Overwrite / alias renderDocuments to point directly to list2
    function renderDocuments(options) {
        return list2(options);
    }

    let currentEmpDetailDocId = null;

    function openEmpDocDetailModal(docId) {
        const doc = getMyDocuments().find(d => String(d.id) === String(docId));
        if (!doc) return;
        currentEmpDetailDocId = docId;

        const fn = document.getElementById('empDetailFileName');
        if (fn) fn.textContent = doc.fileName;
        const cat = document.getElementById('empDetailCategory');
        if (cat) cat.textContent = doc.category;
        const st = document.getElementById('empDetailStatus');
        if (st) st.textContent = doc.status || 'Verified';
        const dt = document.getElementById('empDetailDateUploaded');
        if (dt) dt.textContent = formatDate(doc.uploadedAt);

        const remarks = [];
        if (doc.note) remarks.push(`Note: ${doc.note}`);
        if (doc.reviewNote) remarks.push(`Remarks: ${doc.reviewNote}`);
        if (doc.reviewedBy) remarks.push(`Verified By: ${doc.reviewedBy} on ${doc.reviewedAt || 'N/A'}`);
        const rem = document.getElementById('empDetailRemarksContent');
        if (rem) rem.textContent = remarks.length ? remarks.join(' | ') : 'No special remarks recorded.';

        const modal = document.getElementById('empDocDetailModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.remove('hidden');
            modal.classList.add('show');
        }
    }

    function closeEmpDocDetailModal() {
        const modal = document.getElementById('empDocDetailModal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        currentEmpDetailDocId = null;
    }

    document.getElementById('btnCloseEmpDocDetailModal')?.addEventListener('click', closeEmpDocDetailModal);
    document.getElementById('btnCloseEmpDocDetailBtn')?.addEventListener('click', closeEmpDocDetailModal);
    document.getElementById('btnEmpViewFromDetail')?.addEventListener('click', () => {
        if (currentEmpDetailDocId) {
            const id = currentEmpDetailDocId;
            closeEmpDocDetailModal();
            empRequestAccess(id, 'view');
        }
    });

    // Multi-column Sort Headers Listener for Employee
    document.querySelectorAll('.data-table th.sortable[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (empDocSortBy === field) {
                empDocSortOrder = empDocSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                empDocSortBy = field;
                empDocSortOrder = (field === 'date') ? 'desc' : 'asc';
            }
            empDocPage = 1;
            list2();
        });
    });

    // Date Range Picker Listeners
    document.getElementById('empDocDateFrom')?.addEventListener('change', () => {
        empDocPage = 1;
        list2();
    });
    document.getElementById('empDocDateTo')?.addEventListener('change', () => {
        empDocPage = 1;
        list2();
    });

    // Sort Dropdown Listener
    document.getElementById('empDocSortSelect')?.addEventListener('change', (e) => {
        const parts = e.target.value.split('_');
        empDocSortBy = parts[0];
        empDocSortOrder = parts[1] || 'desc';
        empDocPage = 1;
        list2();
    });

    // Dynamic Category Dropdown Population
    function populateCategoryDropdowns() {
        const cats = SecureHRStorage.getCategories();
        if (!cats || cats.length === 0) return;

        if (docCategoryFilter) {
            const curVal = docCategoryFilter.value;
            docCategoryFilter.innerHTML = '<option value="all">All Categories</option>' +
                cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
            if (curVal) docCategoryFilter.value = curVal;
        }

        const uploadCatSelect = document.getElementById('docCategory');
        if (uploadCatSelect) {
            const curVal = uploadCatSelect.value;
            uploadCatSelect.innerHTML = '<option value="">Select a category...</option>' +
                cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
            if (curVal) uploadCatSelect.value = curVal;
        }
    }

    // Export CSV Listener for Employee
    document.getElementById('btnEmpExportDocsCsv')?.addEventListener('click', () => {
        SecureHRStorage.exportDocumentsCSV({
            employeeId: currentUser.id,
            category: docCategoryFilter?.value,
            status: document.getElementById('empDocStatusFilter')?.value,
            search: document.getElementById('empDocSearch')?.value,
            sortBy: empDocSortBy,
            sortOrder: empDocSortOrder,
        });
    });

    // Page Size Selector Listener
    document.getElementById('empDocPageSize')?.addEventListener('change', (e) => {
        empDocPage = 1;
        list2({ limit: e.target.value });
    });

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

    function formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Filters
    docCategoryFilter.addEventListener('change', () => {
        empDocPage = 1;
        list2();
    });
    document.getElementById('empDocStatusFilter')?.addEventListener('change', () => {
        empDocPage = 1;
        list2();
    });
    const empDocSearch = document.getElementById('empDocSearch');
    if (empDocSearch) {
        empDocSearch.addEventListener('input', () => {
            empDocPage = 1;
            list2();
        });
    }

    // Expose List 2 globally
    window.list2 = list2;
    window.list2Function = list2;
    window.renderDocuments = renderDocuments;
    window.openEmpDocDetailModal = openEmpDocDetailModal;

    // =========================================================================
    // SECURITY PIN VERIFICATION & DOCUMENT PREVIEW ENGINE
    // =========================================================================

    let pendingPinDocId = null;
    let pendingPinAction = 'download'; // 'view' or 'download'
    let activePreviewBlobUrl = null;
    let currentPreviewDocResult = null;

    const empPinModal = document.getElementById('empPinModal');
    const pinDigitBoxes = document.querySelectorAll('#pinDigitBoxes .pin-digit-input');
    const empPinErrorAlert = document.getElementById('empPinErrorAlert');
    const empPinErrorMessage = document.getElementById('empPinErrorMessage');
    const btnSubmitEmpPin = document.getElementById('btnSubmitEmpPin');
    const btnSubmitEmpPinText = document.getElementById('btnSubmitEmpPinText');
    const btnTogglePinVisibility = document.getElementById('btnTogglePinVisibility');

    function openEmpPinModal(docId, action = 'download') {
        const doc = getMyDocuments().find(d => String(d.id) === String(docId));
        if (!doc) return;

        pendingPinDocId = docId;
        pendingPinAction = action;

        const ext = getFileExtension(doc.fileName).toUpperCase();
        document.getElementById('empPinTargetDocId').value = docId;
        document.getElementById('empPinTargetAction').value = action;
        document.getElementById('empPinDocName').textContent = doc.fileName;
        document.getElementById('empPinDocMeta').textContent = `${doc.category} · ${doc.size || '—'} · AES-256-GCM Encrypted`;
        document.getElementById('empPinDocBadge').textContent = ext || 'FILE';

        document.getElementById('empPinModalTitle').textContent = action === 'view' ? 'Security PIN Required to View' : 'Security PIN Required to Download';
        if (btnSubmitEmpPinText) {
            btnSubmitEmpPinText.textContent = action === 'view' ? 'Authorize & View Document' : 'Authorize & Decrypt Download';
        }

        // Reset pin inputs
        pinDigitBoxes.forEach(box => {
            box.value = '';
            box.classList.remove('filled', 'error');
            box.type = 'password';
        });

        if (btnTogglePinVisibility) {
            btnTogglePinVisibility.querySelector('.eye-open').style.display = 'block';
            btnTogglePinVisibility.querySelector('.eye-closed').style.display = 'none';
        }

        if (empPinErrorAlert) empPinErrorAlert.classList.add('hidden');

        if (empPinModal) {
            empPinModal.style.display = 'flex';
            empPinModal.classList.remove('hidden');
            empPinModal.classList.add('show');
        }

        setTimeout(() => {
            const firstBox = document.querySelector('#pinDigitBoxes .pin-digit-input[data-index="0"]');
            if (firstBox) firstBox.focus();
        }, 80);
    }

    function closeEmpPinModal() {
        if (empPinModal) {
            empPinModal.classList.remove('show');
            empPinModal.classList.add('hidden');
            empPinModal.style.display = 'none';
        }
        pendingPinDocId = null;
    }

    // PIN Boxes behavior: auto-advance, backspace, paste
    pinDigitBoxes.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val ? val[0] : '';
            if (e.target.value) {
                e.target.classList.add('filled');
                e.target.classList.remove('error');
                if (idx < pinDigitBoxes.length - 1) {
                    pinDigitBoxes[idx + 1].focus();
                }
            } else {
                e.target.classList.remove('filled');
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
                pinDigitBoxes[idx - 1].focus();
                pinDigitBoxes[idx - 1].value = '';
                pinDigitBoxes[idx - 1].classList.remove('filled');
            } else if (e.key === 'ArrowLeft' && idx > 0) {
                pinDigitBoxes[idx - 1].focus();
            } else if (e.key === 'ArrowRight' && idx < pinDigitBoxes.length - 1) {
                pinDigitBoxes[idx + 1].focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                submitEmpPin();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            if (!text) return;
            pinDigitBoxes.forEach((box, bIdx) => {
                if (text[bIdx]) {
                    box.value = text[bIdx];
                    box.classList.add('filled');
                    box.classList.remove('error');
                }
            });
            const lastFilledIdx = Math.min(text.length - 1, pinDigitBoxes.length - 1);
            if (lastFilledIdx >= 0) pinDigitBoxes[lastFilledIdx].focus();
        });
    });

    btnTogglePinVisibility?.addEventListener('click', () => {
        const first = pinDigitBoxes[0];
        const isPassword = first && first.type === 'password';
        const newType = isPassword ? 'text' : 'password';
        pinDigitBoxes.forEach(b => b.type = newType);

        const eyeOpen = btnTogglePinVisibility.querySelector('.eye-open');
        const eyeClosed = btnTogglePinVisibility.querySelector('.eye-closed');
        if (eyeOpen && eyeClosed) {
            eyeOpen.style.display = isPassword ? 'none' : 'block';
            eyeClosed.style.display = isPassword ? 'block' : 'none';
        }
    });

    async function submitEmpPin() {
        const pin = Array.from(pinDigitBoxes).map(b => b.value).join('');
        if (pin.length < 4) {
            if (empPinErrorMessage) empPinErrorMessage.textContent = 'Please enter your 4-digit Security PIN.';
            if (empPinErrorAlert) empPinErrorAlert.classList.remove('hidden');
            pinDigitBoxes.forEach(b => { if (!b.value) b.classList.add('error'); });
            return;
        }

        if (!pendingPinDocId) return;

        btnSubmitEmpPin.disabled = true;
        const originalText = btnSubmitEmpPinText.textContent;
        btnSubmitEmpPinText.textContent = 'Verifying & Decrypting...';

        try {
            if (pendingPinAction === 'view') {
                const res = await SecureHRStorage.viewDocument(pendingPinDocId, 'Employee Document In-Browser View', pin);
                if (res.success) {
                    closeEmpPinModal();
                    isCurrentDocPinUnlocked = true;
                    currentPreviewDocResult = res;
                    if (activePreviewBlobUrl) URL.revokeObjectURL(activePreviewBlobUrl);
                    activePreviewBlobUrl = URL.createObjectURL(res.blob);
                    
                    // Unblur the split preview if it is open
                    updatePreviewUnlockedUI();
                    showToast('PIN verified! Full document unlocked.', 'success');
                } else {
                    showPinError(res.message || 'Incorrect Security PIN. Please try again.');
                }
            } else {
                const res = await SecureHRStorage.downloadDocument(pendingPinDocId, 'Employee Document Download', pin);
                if (res.success) {
                    closeEmpPinModal();
                    showToast(`PIN verified! Decrypted "${res.fileName || 'document'}" successfully.`, 'success');
                } else {
                    showPinError(res.message || 'Incorrect Security PIN. Please try again.');
                }
            }
        } catch (err) {
            showPinError('Connection error while verifying PIN.');
        } finally {
            btnSubmitEmpPin.disabled = false;
            btnSubmitEmpPinText.textContent = originalText;
        }
    }

    function showPinError(msg) {
        if (empPinErrorMessage) empPinErrorMessage.textContent = msg;
        if (empPinErrorAlert) empPinErrorAlert.classList.remove('hidden');
        pinDigitBoxes.forEach(b => b.classList.add('error'));
        const first = pinDigitBoxes[0];
        if (first) {
            first.focus();
            first.select();
        }
    }

    document.getElementById('btnSubmitEmpPin')?.addEventListener('click', submitEmpPin);
    document.getElementById('btnCloseEmpPinModal')?.addEventListener('click', closeEmpPinModal);
    document.getElementById('btnCancelEmpPinModal')?.addEventListener('click', closeEmpPinModal);

    // =========================================================================
    // IN-BROWSER DOCUMENT PREVIEW MODAL (SPLIT-VIEW & AUTOMATIC PIN UNLOCK)
    // =========================================================================

    const empDocPreviewModal = document.getElementById('empDocPreviewModal');
    const empPreviewContent = document.getElementById('empPreviewContent');
    const empPreviewTitle = document.getElementById('empPreviewTitle');
    const empPreviewDetails = document.getElementById('empPreviewDetails');

    let currentPreviewDocId = null;
    let isCurrentDocPinUnlocked = false;

    function updatePreviewUnlockedUI() {
        const dividerBar = document.getElementById('splitDividerBar');
        const lowerSection = document.getElementById('splitLowerSection');
        const unlockCard = document.getElementById('splitUnlockCard');

        if (dividerBar) {
            dividerBar.style.display = 'none';
        }

        if (lowerSection) {
            lowerSection.classList.remove('is-blurred');
            lowerSection.classList.add('is-unlocked');
        }

        if (unlockCard) {
            unlockCard.style.display = 'none';
        }
    }

    function focusInlinePinBox() {
        const first = document.querySelector('#splitInlinePinBoxes .inline-pin[data-inline-idx="0"]');
        if (first) {
            first.focus();
            first.select();
        }
    }

    function setupInlinePinListeners() {
        const inlineBoxes = document.querySelectorAll('#splitInlinePinBoxes .inline-pin');
        const btnSubmitInline = document.getElementById('btnSubmitInlinePin');

        inlineBoxes.forEach((input, idx) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/\D/g, '');
                e.target.value = val ? val[0] : '';
                if (e.target.value) {
                    e.target.classList.add('filled');
                    e.target.classList.remove('error');
                    if (idx < inlineBoxes.length - 1) {
                        inlineBoxes[idx + 1].focus();
                    } else if (idx === inlineBoxes.length - 1) {
                        const allFilled = Array.from(inlineBoxes).every(b => b.value.length === 1);
                        if (allFilled) {
                            submitInlinePinVerification();
                        }
                    }
                } else {
                    e.target.classList.remove('filled');
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    inlineBoxes[idx - 1].focus();
                    inlineBoxes[idx - 1].value = '';
                    inlineBoxes[idx - 1].classList.remove('filled');
                } else if (e.key === 'ArrowLeft' && idx > 0) {
                    inlineBoxes[idx - 1].focus();
                } else if (e.key === 'ArrowRight' && idx < inlineBoxes.length - 1) {
                    inlineBoxes[idx + 1].focus();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    submitInlinePinVerification();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                if (!text) return;
                inlineBoxes.forEach((box, bIdx) => {
                    if (text[bIdx]) {
                        box.value = text[bIdx];
                        box.classList.add('filled');
                        box.classList.remove('error');
                    }
                });
                const lastFilledIdx = Math.min(text.length - 1, inlineBoxes.length - 1);
                if (lastFilledIdx >= 0) inlineBoxes[lastFilledIdx].focus();
                if (text.length >= 4) {
                    submitInlinePinVerification();
                }
            });
        });

        btnSubmitInline?.addEventListener('click', submitInlinePinVerification);
    }

    async function submitInlinePinVerification() {
        const inlineBoxes = document.querySelectorAll('#splitInlinePinBoxes .inline-pin');
        const inlineError = document.getElementById('splitInlinePinError');
        const btnSubmitInline = document.getElementById('btnSubmitInlinePin');

        const pin = Array.from(inlineBoxes).map(b => b.value).join('');
        if (pin.length < 4) {
            if (inlineError) {
                inlineError.textContent = 'Please enter your 4-digit Security PIN.';
                inlineError.style.display = 'block';
            }
            inlineBoxes.forEach(b => { if (!b.value) b.classList.add('error'); });
            return;
        }

        if (btnSubmitInline) {
            btnSubmitInline.disabled = true;
            btnSubmitInline.textContent = 'Verifying PIN & Unlocking...';
        }

        try {
            const verifyRes = await SecureHRStorage.apiVerifyPin(pin);
            if (!verifyRes.success) {
                if (inlineError) {
                    inlineError.textContent = verifyRes.message || 'Incorrect Security PIN. Please try again.';
                    inlineError.style.display = 'block';
                }
                inlineBoxes.forEach(b => b.classList.add('error'));
                const first = inlineBoxes[0];
                if (first) { first.focus(); first.select(); }
                return;
            }

            // PIN verified successfully! Fetch decrypted document in background
            isCurrentDocPinUnlocked = true;
            const res = await SecureHRStorage.viewDocument(currentPreviewDocId, 'Employee Document Full In-Browser View', pin);
            if (res.success) {
                currentPreviewDocResult = res;
                if (activePreviewBlobUrl) URL.revokeObjectURL(activePreviewBlobUrl);
                activePreviewBlobUrl = URL.createObjectURL(res.blob);
            }

            // Unblur lower half immediately & reveal full document
            updatePreviewUnlockedUI();
            showToast('Security PIN verified! Document fully unlocked.', 'success');
        } catch (err) {
            if (inlineError) {
                inlineError.textContent = 'Connection error while verifying PIN.';
                inlineError.style.display = 'block';
            }
        } finally {
            if (btnSubmitInline) {
                btnSubmitInline.disabled = false;
                btnSubmitInline.textContent = 'Verify PIN & Unlock Full Document';
            }
        }
    }

    // Direct entry point for employee clicking "View" on any document
    async function openEmpSplitPreview(docId) {
        const doc = getMyDocuments().find(d => String(d.id) === String(docId));
        if (!doc) return;

        currentPreviewDocId = docId;
        isCurrentDocPinUnlocked = false; // Reset unlocked state on each new view

        if (empPreviewTitle) empPreviewTitle.textContent = doc.fileName;

        const ext = getFileExtension(doc.fileName).toLowerCase();

        if (empPreviewDetails) {
            empPreviewDetails.innerHTML = `
                <span>Type: <strong>${esc(ext.toUpperCase())}</strong></span>
                <span>Size: <strong>${esc(doc.size || '—')}</strong></span>
            `;
        }

        renderStandardSplitPaper(doc.fileName);
        setupInlinePinListeners();

        const dividerBar = document.getElementById('splitDividerBar');
        if (dividerBar) {
            dividerBar.style.display = 'block';
        }

        if (empDocPreviewModal) {
            empDocPreviewModal.style.display = 'flex';
            empDocPreviewModal.classList.remove('hidden');
            empDocPreviewModal.classList.add('show');
        }

        setTimeout(() => focusInlinePinBox(), 120);
    }

    function renderStandardSplitPaper(fileName) {
        empPreviewContent.innerHTML = `
            <div class="split-preview-container">
                <div class="split-preview-paper">
                    <!-- Upper Half: 100% Crisp & Clear (Readable in Split Preview) -->
                    <div class="split-upper-half">
                        <div class="split-doc-header">Dantes, Richard Angelo D.</div>
                        <div class="split-doc-sub">BSIT 31012 - IS · Institutional Record</div>
                        
                        <div class="split-qa-block">
                            <h4 style="font-weight:700;margin:14px 0 6px;color:#FFFFFF;font-size:0.96rem;line-height:1.4;">
                                1. What key information should be included in a project charter, and why is each element important?
                            </h4>
                            <p style="color:#E4E4E7;font-size:0.9rem;line-height:1.65;margin:0 0 12px 0;">
                                The project charter should include the project title, purpose, objectives, scope, deliverables, stakeholders, project manager, assumptions, constraints, risks, timeline, budget, and approval requirements. This is because it establishes the general description, defines responsibility, determines project requirements, and gives formal approval to begin.
                            </p>
                        </div>
                    </div>

                    <!-- Clean Red Dividing Line -->
                    <div class="split-red-divider" id="splitDividerBar">
                        <div class="split-red-line"></div>
                    </div>

                    <!-- Lower Half Container -->
                    <div class="split-lower-half" id="splitLowerWrapper">
                        <!-- Lower Text Content (Blurred until PIN is verified) -->
                        <div class="split-lower-content is-blurred" id="splitLowerSection">
                            <div class="split-qa-block">
                                <h4 style="font-weight:700;margin:16px 0 6px;color:#FFFFFF;font-size:0.96rem;line-height:1.4;">
                                    2. How can a project manager determine whether a proposed project aligns with an organization's strategic objectives?
                                </h4>
                                <p style="color:#E4E4E7;font-size:0.9rem;line-height:1.65;margin:0 0 18px 0;">
                                    Comparing the project's objective, benefits, and outcomes to the organization's mission, vision, and strategic goals can help determine if a project is strategically viable and capable of contributing to strategic objectives. In addition, a project manager can consult with organizational leaders and analyze existing strategic plans to understand if the initiative will achieve strategic goals.
                                </p>
                            </div>

                            <div class="split-qa-block">
                                <h4 style="font-weight:700;margin:16px 0 6px;color:#FFFFFF;font-size:0.96rem;line-height:1.4;">
                                    3. What methods can be used to evaluate the feasibility of a project during the initiation phase?
                                </h4>
                                <p style="color:#E4E4E7;font-size:0.9rem;line-height:1.65;margin:0 0 18px 0;">
                                    There are several methods that can be used, including technical, financial, operational, legal, and schedule feasibility studies. Technical feasibility analyzes if a given organization has the necessary equipment, technical skills, and technologies to pursue the project successfully. Financial feasibility ensures that adequate funding is available to complete the project. Operational feasibility ensures that the processes are functional and will deliver the desired outcome, while legal feasibility determines whether the project is legally allowable within the jurisdiction. Finally, schedule feasibility evaluates whether there is enough time to complete the project.
                                </p>
                            </div>
                        </div>

                        <!-- Interactive Inline Security PIN Unlock Card -->
                        <div class="split-unlock-card-overlay" id="splitUnlockCard">
                            <h4>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                                Enter Security PIN to Reveal Full Document
                            </h4>
                            <p>Upper half preview is visible. Enter your 4-digit PIN to decrypt and reveal the full document.</p>
                            <div class="pin-boxes" id="splitInlinePinBoxes" style="margin:12px 0;">
                                <input type="password" class="pin-digit-input inline-pin" inputmode="numeric" maxlength="1" data-inline-idx="0" style="width:48px;height:52px;font-size:1.5rem;background:#1E293B;color:#FFFFFF;border:2px solid #64748B;" autocomplete="off" aria-label="PIN digit 1">
                                <input type="password" class="pin-digit-input inline-pin" inputmode="numeric" maxlength="1" data-inline-idx="1" style="width:48px;height:52px;font-size:1.5rem;background:#1E293B;color:#FFFFFF;border:2px solid #64748B;" autocomplete="off" aria-label="PIN digit 2">
                                <input type="password" class="pin-digit-input inline-pin" inputmode="numeric" maxlength="1" data-inline-idx="2" style="width:48px;height:52px;font-size:1.5rem;background:#1E293B;color:#FFFFFF;border:2px solid #64748B;" autocomplete="off" aria-label="PIN digit 3">
                                <input type="password" class="pin-digit-input inline-pin" inputmode="numeric" maxlength="1" data-inline-idx="3" style="width:48px;height:52px;font-size:1.5rem;background:#1E293B;color:#FFFFFF;border:2px solid #64748B;" autocomplete="off" aria-label="PIN digit 4">
                            </div>
                            <div id="splitInlinePinError" style="display:none;color:#F87171;font-size:0.78rem;margin-bottom:10px;font-weight:600;">Incorrect PIN. Please try again.</div>
                            <button type="button" class="btn-primary" id="btnSubmitInlinePin" style="padding:10px 18px;font-size:0.85rem;font-weight:600;width:100%;">
                                Verify PIN &amp; Reveal Full Document
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function closeDocPreviewModal() {
        if (empDocPreviewModal) {
            empDocPreviewModal.classList.remove('show');
            empDocPreviewModal.classList.add('hidden');
            empDocPreviewModal.style.display = 'none';
        }
        if (activePreviewBlobUrl) {
            URL.revokeObjectURL(activePreviewBlobUrl);
            activePreviewBlobUrl = null;
        }
        currentPreviewDocResult = null;
        currentPreviewDocId = null;
        isCurrentDocPinUnlocked = false;
    }

    function downloadCurrentPreviewDoc() {
        if (isCurrentDocPinUnlocked && currentPreviewDocResult && currentPreviewDocResult.blob) {
            const url = URL.createObjectURL(currentPreviewDocResult.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentPreviewDocResult.fileName || 'document';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            showToast(`Downloaded "${currentPreviewDocResult.fileName}"`, 'success');
        } else {
            showToast('Please enter your 4-digit Security PIN first before downloading.', 'warning');
            focusInlinePinBox();
            const inlineBoxes = document.querySelectorAll('#splitInlinePinBoxes .inline-pin');
            inlineBoxes.forEach(b => {
                b.classList.add('error');
                setTimeout(() => b.classList.remove('error'), 1200);
            });
            const unlockCard = document.getElementById('splitUnlockCard');
            if (unlockCard) {
                unlockCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    window.downloadCurrentPreviewDoc = downloadCurrentPreviewDoc;
    document.getElementById('btnCloseEmpPreviewModal')?.addEventListener('click', closeDocPreviewModal);
    document.getElementById('btnCloseEmpPreviewBtn')?.addEventListener('click', closeDocPreviewModal);
    document.getElementById('btnEmpPreviewDownload')?.addEventListener('click', downloadCurrentPreviewDoc);

    // Employee access dispatch: 'view' opens split preview directly, 'download' opens PIN authorization
    window.empRequestAccess = function(docId, action = 'view') {
        if (action === 'view') {
            openEmpSplitPreview(docId);
        } else {
            openEmpPinModal(docId, 'download');
        }
    };
    window.viewDocument = (docId) => openEmpSplitPreview(docId);
    window.downloadDocument = (docId) => openEmpPinModal(docId, 'download');

    window.showLockedDocumentNotice = function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) return;

        const isOfficialAdminUpload = (doc.uploadedBy && doc.uploadedBy !== currentUser.id);
        const isVerified = (doc.status === 'Verified');
        const isArchived = (doc.status === 'Archived');

        if (isVerified) {
            showToast(`"${doc.fileName}" has been verified by HR Administration and locked to maintain compliance records. Deletion by employees is restricted.`, 'warning');
        } else if (isArchived) {
            showToast(`"${doc.fileName}" has been archived by HR Administration and is preserved for institutional records. Deletion is restricted.`, 'warning');
        } else if (isOfficialAdminUpload) {
            showToast(`"${doc.fileName}" is an official document issued by HR Administration. Only HR Administrators can manage official records.`, 'warning');
        } else {
            showToast('This document is locked from deletion under HR policy.', 'warning');
        }
    };

    window.deleteDocument = async function(docId) {
        const docs = SecureHRStorage.getDocuments();
        const doc = docs.find(d => String(d.id) === String(docId));
        if (!doc) return;

        const isOfficialAdminUpload = (doc.uploadedBy && doc.uploadedBy !== currentUser.id);
        const isVerified = (doc.status === 'Verified');
        const isArchived = (doc.status === 'Archived');
        if (isOfficialAdminUpload || isVerified || isArchived) {
            showLockedDocumentNotice(docId);
            return;
        }

        if (confirm(`Delete "${doc.fileName}"? This action cannot be undone.`)) {
            const res = await SecureHRStorage.deleteDocument(docId);
            if (!res.success) {
                showToast(res.message || 'Unable to delete document.', 'error');
                return;
            }

            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'DELETE_DOCUMENT',
                target: doc.fileName,
                details: `Deleted ${doc.category} document`,
            });

            renderDocuments();
            showToast('Document deleted.', 'info');
        }
    };

    //  UPLOAD DOCUMENT MODAL

    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');
    const fileDropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('fileInput');
    const selectedFileInfo = document.getElementById('selectedFileInfo');
    const selectedFileName = document.getElementById('selectedFileName');
    const btnRemoveFile = document.getElementById('btnRemoveFile');
    const btnUploadDoc = document.getElementById('btnUploadDoc');
    const btnCloseUploadModal = document.getElementById('btnCloseUploadModal');
    const btnCancelUpload = document.getElementById('btnCancelUpload');
    const btnSubmitUpload = document.getElementById('btnSubmitUpload');

    let selectedFile = null;

    btnUploadDoc.addEventListener('click', () => {
        selectedFile = null;
        uploadForm.reset();
        selectedFileInfo.classList.add('hidden');
        fileDropZone.style.display = '';
        openUploadModal();
    });

    // File drop zone click
    fileDropZone.addEventListener('click', () => fileInput.click());

    // Drag and drop
    fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.classList.add('drag-over');
    });
    fileDropZone.addEventListener('dragleave', () => {
        fileDropZone.classList.remove('drag-over');
    });
    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    function handleFileSelect(file) {
        // Validate size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            showToast('File is too large. Maximum size is 5MB.', 'error');
            return;
        }
        selectedFile = file;
        selectedFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        selectedFileInfo.classList.remove('hidden');
        fileDropZone.style.display = 'none';
    }

    // Remove file
    btnRemoveFile.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        selectedFileInfo.classList.add('hidden');
        fileDropZone.style.display = '';
    });

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Submit upload
    btnSubmitUpload.addEventListener('click', () => {
        const category = document.getElementById('docCategory').value;
        const note = document.getElementById('docNote').value.trim();

        if (!selectedFile) {
            showToast('Please select a file to upload.', 'error');
            return;
        }
        if (!category) {
            showToast('Please select a document category.', 'error');
            return;
        }

        // Read file as base64
        const reader = new FileReader();
        reader.onload = async function(e) {
            const docId = 'DOC-' + Date.now();
            const newDoc = {
                id: docId,
                employeeId: currentUser.id,
                fileName: selectedFile.name,
                fileType: selectedFile.type,
                category: category,
                uploadedBy: currentUser.id,
                uploadedAt: new Date().toISOString().split('T')[0],
                size: formatFileSize(selectedFile.size),
                note: note,
                fileData: e.target.result, // base64 data URL
            };

            await SecureHRStorage.addDocument(newDoc);

            await SecureHRStorage.appendAuditLog({
                actor: currentUser.firstName + ' ' + currentUser.lastName,
                actorId: currentUser.id,
                action: 'UPLOAD_DOCUMENT',
                target: selectedFile.name,
                details: `Uploaded ${category} document (${formatFileSize(selectedFile.size)})`,
            });

            closeUploadModal();
            renderDocuments();
            showToast('Document uploaded successfully!', 'success');
        };
        reader.readAsDataURL(selectedFile);
    });

    // Modal helpers
    function openUploadModal() {
        uploadModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function closeUploadModal() {
        uploadModal.classList.remove('show');
        document.body.style.overflow = '';
        selectedFile = null;
    }
    btnCloseUploadModal.addEventListener('click', closeUploadModal);
    btnCancelUpload.addEventListener('click', closeUploadModal);
    uploadModal.addEventListener('click', e => { if (e.target === uploadModal) closeUploadModal(); });

    //  TOAST

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const icons = {
            success: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fill="#059669"/>',
            error: '<path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="#E53E3E"/>',
            warning: '<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" fill="#D97706"/>',
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

    const notifPanel = document.getElementById('notifPanel');
    const searchPanel = document.getElementById('searchPanel');
    const notifDot = document.getElementById('notifDot');
    const notifList = document.getElementById('notifList');
    const NOTIF_SEEN_KEY = 'securehr_emp_notif_seen';

    function closeTopbarPanels() {
        if (notifPanel) notifPanel.hidden = true;
        if (searchPanel) searchPanel.hidden = true;
        document.getElementById('btnNotifications')?.setAttribute('aria-expanded', 'false');
        document.getElementById('btnTopSearch')?.setAttribute('aria-expanded', 'false');
    }

    async function refreshNotifications() {
        if (!notifList) return;
        const data = await SecureHRStorage.getNotifications();
        const notifs = data.notifications || [];
        const unreadCount = data.unreadCount || 0;

        const unreadBadge = document.getElementById('empNotifUnreadCount');
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount;
            unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
        if (notifDot) notifDot.classList.toggle('hidden', unreadCount === 0);

        notifList.innerHTML = '';
        if (notifs.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'dropdown-empty';
            empty.textContent = 'No document notifications yet.';
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

    document.getElementById('btnMarkAllNotifsReadEmp')?.addEventListener('click', async (e) => {
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
            empty.textContent = 'Type a file name or category.';
            resultsEl.appendChild(empty);
            return;
        }
        const docs = getMyDocuments().filter(d =>
            (d.fileName || '').toLowerCase().includes(q)
            || (d.note || '').toLowerCase().includes(q)
            || (d.category || '').toLowerCase().includes(q)
        ).slice(0, 8);
        if (docs.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'dropdown-empty';
            empty.textContent = 'No matching documents.';
            resultsEl.appendChild(empty);
            return;
        }
        docs.forEach(doc => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dropdown-item';
            const title = document.createElement('span');
            title.className = 'dropdown-item-title';
            title.textContent = doc.fileName;
            const meta = document.createElement('span');
            meta.className = 'dropdown-item-meta';
            meta.textContent = doc.category || 'Document';
            btn.appendChild(title);
            btn.appendChild(meta);
            btn.addEventListener('click', () => {
                closeTopbarPanels();
                goToSection('section-documents');
                const searchBox = document.getElementById('empDocSearch');
                if (searchBox) {
                    searchBox.value = doc.fileName;
                    renderDocuments();
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

    //  REPLACE DOCUMENT / NEW VERSION (Employee)
    let empReplaceSelectedFile = null;
    const empReplaceModal = document.getElementById('empReplaceVersionModal');
    const empReplaceFileInput = document.getElementById('empReplaceFileInput');
    const empReplaceDropZone = document.getElementById('empReplaceDropZone');
    const empReplaceFileInfo = document.getElementById('empReplaceFileInfo');
    const empReplaceFileName = document.getElementById('empReplaceFileName');

    window.openEmpReplaceModal = function(docId) {
        const doc = getMyDocuments().find(d => String(d.id) === String(docId));
        if (!doc) return;
        document.getElementById('empReplaceDocId').value = docId;
        document.getElementById('empReplaceDocTargetName').textContent = `Target: ${doc.fileName} (v${doc.version || 1} • ${doc.category})`;
        document.getElementById('empReplaceVersionNotes').value = '';
        empReplaceSelectedFile = null;
        if (empReplaceFileInput) empReplaceFileInput.value = '';
        if (empReplaceFileInfo) empReplaceFileInfo.classList.add('hidden');
        if (empReplaceDropZone) empReplaceDropZone.style.display = '';
        if (empReplaceModal) empReplaceModal.style.display = 'flex';
    };

    function closeEmpReplaceModal() {
        if (empReplaceModal) empReplaceModal.style.display = 'none';
        empReplaceSelectedFile = null;
    }

    document.getElementById('btnCloseEmpReplaceModal')?.addEventListener('click', closeEmpReplaceModal);
    document.getElementById('btnCancelEmpReplaceModal')?.addEventListener('click', closeEmpReplaceModal);
    empReplaceDropZone?.addEventListener('click', () => empReplaceFileInput?.click());

    empReplaceFileInput?.addEventListener('change', () => {
        if (empReplaceFileInput.files.length > 0) {
            handleEmpReplaceFileSelect(empReplaceFileInput.files[0]);
        }
    });

    empReplaceDropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        empReplaceDropZone.classList.add('drag-over');
    });
    empReplaceDropZone?.addEventListener('dragleave', () => {
        empReplaceDropZone.classList.remove('drag-over');
    });
    empReplaceDropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        empReplaceDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleEmpReplaceFileSelect(e.dataTransfer.files[0]);
        }
    });

    function handleEmpReplaceFileSelect(file) {
        if (file.size > 5 * 1024 * 1024) {
            showToast('File is too large. Maximum size is 5MB.', 'error');
            return;
        }
        empReplaceSelectedFile = file;
        empReplaceFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        empReplaceFileInfo.classList.remove('hidden');
        empReplaceDropZone.style.display = 'none';
    }

    document.getElementById('btnEmpRemoveReplaceFile')?.addEventListener('click', () => {
        empReplaceSelectedFile = null;
        if (empReplaceFileInput) empReplaceFileInput.value = '';
        empReplaceFileInfo.classList.add('hidden');
        empReplaceDropZone.style.display = '';
    });

    document.getElementById('btnConfirmEmpReplaceVersion')?.addEventListener('click', () => {
        const docId = document.getElementById('empReplaceDocId')?.value;
        const versionNotes = document.getElementById('empReplaceVersionNotes')?.value.trim();
        if (!docId) return;
        if (!empReplaceSelectedFile) {
            showToast('Please select a replacement file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            const res = await SecureHRStorage.replaceDocumentVersion(docId, {
                fileName: empReplaceSelectedFile.name,
                fileType: empReplaceSelectedFile.type,
                size: formatFileSize(empReplaceSelectedFile.size),
                rawBytes: empReplaceSelectedFile.size,
                fileData: e.target.result,
                versionNotes: versionNotes || 'Updated document file version',
            });

            if (!res.success) {
                showToast(res.message || 'Unable to replace document version.', 'error');
                return;
            }

            closeEmpReplaceModal();
            list2();
            showToast(`Document updated to version ${res.document?.version || ''}!`, 'success');
        };
        reader.readAsDataURL(empReplaceSelectedFile);
    });

    //  VERSION HISTORY MODAL (Employee)
    const empVersionHistoryModal = document.getElementById('empVersionHistoryModal');

    window.openEmpVersionHistoryModal = async function(docId) {
        const doc = getMyDocuments().find(d => String(d.id) === String(docId));
        if (!doc) return;

        const headerEl = document.getElementById('empVersionHistoryDocHeader');
        if (headerEl) {
            headerEl.innerHTML = `
                <div style="font-weight:700;font-size:0.95rem;color:var(--gray-800);">${esc(doc.fileName)}</div>
                <div style="font-size:0.8rem;color:var(--gray-500);margin-top:2px;">Category: <strong>${esc(doc.category)}</strong> • Current Version: <strong>v${doc.version || 1}</strong></div>
            `;
        }

        const tbody = document.getElementById('empVersionHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;">Loading version history...</td></tr>';
        }

        if (empVersionHistoryModal) empVersionHistoryModal.style.display = 'flex';

        const history = await SecureHRStorage.fetchDocumentVersionHistory(docId);
        if (!tbody) return;

        if (!history || history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td><span class="version-badge">v${doc.version || 1}</span> <em>(Current)</em></td>
                    <td>${esc(doc.fileName)}</td>
                    <td>${esc(doc.size || '—')}</td>
                    <td>${formatDate(doc.uploadedAt)}</td>
                    <td>${esc(doc.note || 'Initial version')}</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = history.map(v => `
            <tr>
                <td><span class="version-badge">v${v.version}</span></td>
                <td><strong>${esc(v.fileName)}</strong></td>
                <td>${esc(v.size || '—')}</td>
                <td>${v.uploadedAt ? formatDate(v.uploadedAt) : '—'}</td>
                <td>${esc(v.versionNotes || v.note || 'Version updated')}</td>
            </tr>
        `).join('');
    };

    function closeEmpVersionHistoryModal() {
        if (empVersionHistoryModal) empVersionHistoryModal.style.display = 'none';
    }

    document.getElementById('btnCloseEmpVersionModal')?.addEventListener('click', closeEmpVersionHistoryModal);
    document.getElementById('btnCloseEmpVersionHistoryBtn')?.addEventListener('click', closeEmpVersionHistoryModal);

    //  INITIAL RENDER

    populateCategoryDropdowns();
    updateOverview();
    renderProfile();
    renderDocuments();
    refreshNotifications();

    // Fetch live data from MySQL database
    SecureHRStorage.syncFromDatabase().then(() => {
        populateCategoryDropdowns();
        updateOverview();
        renderProfile();
        renderDocuments();
        refreshNotifications();
    });
});
