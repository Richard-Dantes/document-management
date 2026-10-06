// Comprehensive test suite for SecureHR System features
import http from 'http';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          // not json
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: json
        });
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 STARTING SECUREHR AUTOMATED TEST RUN');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Health check
  console.log('--- 1. Server Health & Encryption Status ---');
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health.php',
      method: 'GET'
    });
    assert(res.statusCode === 200, 'Health endpoint responds with 200');
    assert(res.json && res.json.success === true, 'Health check returns success');
    assert(res.json?.data?.aesEncryption === 'AES-256-GCM', 'AES-256-GCM encryption verified');
  } catch (err) {
    assert(false, `Health check exception: ${err.message}`);
  }

  // 2. Three-Tier Authentication
  console.log('\n--- 2. Three-Tier Role Architecture Login & Permissions ---');
  let sysAdminToken = null;
  let hrAdminToken = null;
  let hrStaffToken = null;

  try {
    // 2a. System Admin
    const sysRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth.php?action=login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: 'admin@bestlink.edu.ph',
      password: 'admin123',
      role: 'system_admin'
    });
    assert(sysRes.statusCode === 200, 'System Administrator login status 200');
    assert(sysRes.json?.data?.user?.role === 'system_admin', 'System Administrator role confirmed');
    assert(sysRes.json?.data?.permissions?.can_manage_users === true, 'SysAdmin has can_manage_users permission');
    assert(sysRes.json?.data?.permissions?.can_manage_categories === true, 'SysAdmin has can_manage_categories permission');
    sysAdminToken = sysRes.json?.data?.token;

    // 2b. HR Admin
    const hrRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth.php?action=login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: 'hr.admin@bestlink.edu.ph',
      password: 'admin123',
      role: 'hr_admin'
    });
    assert(hrRes.statusCode === 200, 'HR Administrator login status 200');
    assert(hrRes.json?.data?.user?.role === 'hr_admin', 'HR Administrator role confirmed');
    assert(hrRes.json?.data?.permissions?.can_verify_docs === true, 'HR Admin has can_verify_docs permission');
    assert(hrRes.json?.data?.permissions?.can_archive_restore === true, 'HR Admin has can_archive_restore permission');
    hrAdminToken = hrRes.json?.data?.token;

    // 2c. HR Staff
    const staffRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth.php?action=login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: 'juan.delacruz@bestlink.edu.ph',
      password: 'employee123',
      role: 'hr_staff'
    });
    assert(staffRes.statusCode === 200, 'HR Staff login status 200');
    assert(staffRes.json?.data?.user?.role === 'hr_staff', 'HR Staff role confirmed');
    assert(staffRes.json?.data?.permissions?.can_upload_docs === true, 'HR Staff can upload docs');
    assert(staffRes.json?.data?.permissions?.can_verify_docs === false, 'HR Staff cannot verify docs (Role separation)');
    hrStaffToken = staffRes.json?.data?.token;
  } catch (err) {
    assert(false, `Authentication exception: ${err.message}`);
  }

  // 3. Document Categories (Standard Research Paper Categories)
  console.log('\n--- 3. Standard Research Paper Document Categories ---');
  let testCatId = null;
  try {
    const catRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/categories.php',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sysAdminToken}` }
    });
    assert(catRes.statusCode === 200, 'Get categories status 200');
    const catList = catRes.json?.data || [];
    const catNames = catList.map(c => c.name);

    const requiredPaperCategories = [
      'Employee Records',
      'Application Documents',
      'Employment Records',
      'Performance Records',
      'Training Documents',
      'Other Personnel Files'
    ];

    for (const reqCat of requiredPaperCategories) {
      assert(catNames.includes(reqCat), `Standard Research Category present: "${reqCat}"`);
    }

    // 4. Dynamic Category Management (Add / Edit / Delete)
    console.log('\n--- 4. Dynamic Category Management (Add / Edit / Delete) ---');
    // Add Category
    const addCatRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/categories.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      name: 'Faculty Accreditations',
      description: 'CHED and PACUCOA institutional accreditation files',
      color: '#0D9488',
      icon: 'award'
    });
    assert(addCatRes.statusCode === 200 || addCatRes.statusCode === 201, 'Dynamic Add Category status success');
    testCatId = addCatRes.json?.data?.id;
    assert(testCatId && addCatRes.json?.data?.name === 'Faculty Accreditations', 'New category created with ID and name');

    // Edit Category
    const editCatRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/categories.php?id=${encodeURIComponent(testCatId)}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      name: 'Faculty & Program Accreditations',
      description: 'Updated CHED & PACUCOA records',
      color: '#0F766E',
      icon: 'award'
    });
    assert(editCatRes.statusCode === 200, 'Dynamic Edit Category status 200');
    assert(editCatRes.json?.data?.name === 'Faculty & Program Accreditations', 'Category name successfully updated');

    // Delete Category
    const delCatRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/categories.php?id=${encodeURIComponent(testCatId)}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sysAdminToken}`
      }
    });
    assert(delCatRes.statusCode === 200, 'Dynamic Delete Category status 200');
  } catch (err) {
    assert(false, `Category management exception: ${err.message}`);
  }

  // 5. Document Management, Versioning, Archive & Restore
  console.log('\n--- 5. Document Upload, Version Replacement, Archive & Restore ---');
  let testDocId = null;
  try {
    // 5a. Upload Document
    const uploadRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      employeeId: 'EMP-001',
      fileName: 'Faculty_Appointment_Notice_2026.pdf',
      fileType: 'application/pdf',
      category: 'Employment Records',
      size: '180 KB',
      note: 'Initial official appointment contract',
      fileData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxNzYKJSVFT0Y='
    });
    assert(uploadRes.statusCode === 200 || uploadRes.statusCode === 201, 'Upload Document status success');
    testDocId = uploadRes.json?.data?.id;
    assert(testDocId !== null, `Document created with ID: ${testDocId}`);
    assert((uploadRes.json?.data?.version || 1) === 1, 'Initial document version is v1');

    // 5b. Direct File Version Replacement (keeping same record ID)
    const replaceRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents.php?action=replace_version',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      id: testDocId,
      fileName: 'Faculty_Appointment_Notice_2026_Signed_v2.pdf',
      fileType: 'application/pdf',
      size: '195 KB',
      versionNotes: 'Countersigned by Department Dean',
      fileData: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxNzYKJSVFT0Y='
    });
    assert(replaceRes.statusCode === 200, 'Direct Replace Version status 200');
    assert(replaceRes.json?.data?.version === 2, 'Document version automatically bumped to v2');
    assert(replaceRes.json?.data?.id === testDocId, 'Document ID maintained across version replacement');

    // 5c. Fetch Version History
    const historyRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents.php?action=version_history&id=${encodeURIComponent(testDocId)}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sysAdminToken}` }
    });
    assert(historyRes.statusCode === 200, 'Version history status 200');
    const versions = historyRes.json?.data?.versions || (Array.isArray(historyRes.json?.data) ? historyRes.json.data : []);
    assert(Array.isArray(versions) && versions.length >= 2, 'Version history contains both v1 and v2');

    // 5d. Archive Document
    const archiveRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents.php?action=archive',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      id: testDocId,
      archiveReason: 'Archived for semester-end compliance audit'
    });
    assert(archiveRes.statusCode === 200, 'Archive Document status 200');
    assert(archiveRes.json?.data?.isArchived === true || archiveRes.json?.data?.status === 'Archived', 'Document marked as archived');

    // 5e. One-Click Restore Archived Document
    const restoreRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents.php?action=restore',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      id: testDocId
    });
    assert(restoreRes.statusCode === 200, 'One-Click Restore Archived Document status 200');
    assert(restoreRes.json?.data?.isArchived === false && restoreRes.json?.data?.status !== 'Archived', 'Document successfully restored to active');

    // 5f. AES-256 Download & Decryption Verification
    const downloadRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents.php?action=download&id=${encodeURIComponent(testDocId)}&reason=Verification%20Audit`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sysAdminToken}` }
    });
    assert(downloadRes.statusCode === 200, 'Secure Download status 200');
    assert(downloadRes.headers['x-encryption-algorithm'] === 'AES-256-GCM', 'Response header confirms AES-256-GCM encryption');
    assert(downloadRes.body.length > 50, 'Decrypted file payload delivered successfully');

  } catch (err) {
    assert(false, `Document lifecycle exception: ${err.message}`);
  }

  // 6. Granular User Permission Management
  console.log('\n--- 6. Granular User Permission Management ---');
  let newEmpId = null;
  try {
    const createEmpRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/employees.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      first_name: 'Mateo',
      last_name: 'Valdez',
      email: 'mateo.valdez@bestlink.edu.ph',
      department: 'Human Resources',
      position: 'HR Compliance Assistant',
      role: 'hr_staff',
      password: 'employee123',
      permissions: {
        can_view_docs: true,
        can_upload_docs: true,
        can_replace_version: true,
        can_verify_docs: false,
        can_archive_restore: false,
        can_manage_categories: false,
        can_delete_docs: false,
        can_manage_users: false,
        can_view_audit: false
      }
    });
    assert(createEmpRes.statusCode === 200 || createEmpRes.statusCode === 201, 'Create Employee status success');
    newEmpId = createEmpRes.json?.data?.id;
    assert(newEmpId !== null, `Employee created with ID: ${newEmpId}`);
    assert(createEmpRes.json?.data?.permissions?.can_upload_docs === true, 'Custom permission saved: can_upload_docs');
    assert(createEmpRes.json?.data?.permissions?.can_manage_users === false, 'Custom permission restricted: can_manage_users');

    // Update permissions to grant can_archive_restore
    const updateEmpRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/employees.php?id=${encodeURIComponent(newEmpId)}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sysAdminToken}`
      }
    }, {
      first_name: 'Mateo',
      last_name: 'Valdez',
      email: 'mateo.valdez@bestlink.edu.ph',
      department: 'Human Resources',
      position: 'HR Senior Compliance Specialist',
      role: 'hr_staff',
      permissions: {
        can_view_docs: true,
        can_upload_docs: true,
        can_replace_version: true,
        can_verify_docs: true,
        can_archive_restore: true,
        can_manage_categories: false,
        can_delete_docs: false,
        can_manage_users: false,
        can_view_audit: false
      }
    });
    assert(updateEmpRes.statusCode === 200, 'Update Employee permissions status 200');
    assert(updateEmpRes.json?.data?.permissions?.can_archive_restore === true, 'Granular permission checklist dynamically updated: can_archive_restore = true');

    // Cleanup Mateo
    await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/employees.php?id=${encodeURIComponent(newEmpId)}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${sysAdminToken}` }
    });
  } catch (err) {
    assert(false, `Granular permission management exception: ${err.message}`);
  }

  // 7. Audit Log Inspection
  console.log('\n--- 7. Security Audit Log Verification ---');
  try {
    const auditRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/audit.php',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sysAdminToken}` }
    });
    assert(auditRes.statusCode === 200, 'Audit log status 200');
    const logs = auditRes.json?.data || [];
    assert(logs.length > 0, `Audit log entries captured: ${logs.length}`);
    const actions = logs.map(l => l.action);
    assert(actions.some(a => a.includes('VERSION') || a.includes('DOCUMENT') || a.includes('LOGIN')), 'Audit trail captures actions (e.g. LOGIN, DOCUMENT, VERSION)');
  } catch (err) {
    assert(false, `Audit log exception: ${err.message}`);
  }

  // 8. Notifications
  console.log('\n--- 8. Notifications System ---');
  try {
    const notifRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/notifications.php',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sysAdminToken}` }
    });
    assert(notifRes.statusCode === 200, 'Notifications endpoint status 200');
  } catch (err) {
    assert(false, `Notifications exception: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`📊 TEST RUN SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
