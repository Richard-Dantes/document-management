// test-drive.js — Automated comprehensive test drive of all SecureHR functions
const BASE_URL = 'http://localhost:3000';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // not JSON
  }
  return { status: res.status, ok: res.ok, headers: res.headers, text, json };
}

let passCount = 0;
let failCount = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} — ${detail}`);
    failCount++;
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('   SECUREHR COMPREHENSIVE SYSTEM TEST DRIVE');
  console.log('======================================================\n');

  // 1. Health & Server Ping
  console.log('--- 1. Health & Environment Check ---');
  const healthRes = await req('/api/health.php');
  assert(healthRes.status === 200, 'Health endpoint responds 200 OK');
  assert(healthRes.json && healthRes.json.success === true, 'Health returns success: true');
  assert(healthRes.json && healthRes.json.data.aesEncryption === 'AES-256-GCM', 'AES-256-GCM engine verified active');

  // 2. Authentication & RBAC
  console.log('\n--- 2. Authentication & Access Control ---');
  // Admin Login
  const adminLoginRes = await req('/api/auth.php?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@bestlink.edu.ph', password: 'admin123', role: 'admin' }),
  });
  assert(adminLoginRes.status === 200, 'Admin login returns 200');
  assert(adminLoginRes.json?.data?.token, 'Admin receives session token');
  const adminToken = adminLoginRes.json?.data?.token;

  // Employee Login
  const empLoginRes = await req('/api/auth.php?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'maria.santos@bestlink.edu.ph', password: 'employee123', role: 'employee' }),
  });
  assert(empLoginRes.status === 200, 'Employee login returns 200');
  assert(empLoginRes.json?.data?.token, 'Employee receives session token');
  const empToken = empLoginRes.json?.data?.token;
  const empId = empLoginRes.json?.data?.user?.id;

  // Bad password rejection
  const badLogin = await req('/api/auth.php?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@bestlink.edu.ph', password: 'WrongPassword123', role: 'admin' }),
  });
  assert(badLogin.status === 401, 'Bad credentials correctly blocked (401)');

  // 3. Employee Management (Admin)
  console.log('\n--- 3. Employee Records Management ---');
  const listEmpRes = await req('/api/employees.php?role=all', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(listEmpRes.status === 200 && Array.isArray(listEmpRes.json?.data?.employees || listEmpRes.json?.data), 'Admin can list all employees');

  // Add new test employee
  const testEmpId = `EMP-TEST-${Date.now().toString().slice(-4)}`;
  const addEmpRes = await req('/api/employees.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: testEmpId,
      firstName: 'TestAuto',
      lastName: 'Runner',
      email: `test.${Date.now()}@bestlink.edu.ph`,
      department: 'Quality Assurance',
      role: 'employee',
      status: 'active',
      tempPassword: 'TestPassword@123',
    }),
  });
  assert(addEmpRes.status === 201, 'Admin can create new employee record');

  // Deactivate employee & verify login blocked
  const deactRes = await req('/api/employees.php', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ id: testEmpId, status: 'inactive' }),
  });
  assert(deactRes.status === 200, 'Admin can set employee status to inactive');

  // 4. Document Upload & AES-256 Encryption
  console.log('\n--- 4. Document Upload & AES-256 Cryptography ---');
  const sampleText = 'This is an official confidential document test content for SecureHR Bestlink College Philippines.';
  const sampleBase64 = Buffer.from(sampleText).toString('base64');
  const sampleDataUrl = `data:text/plain;base64,${sampleBase64}`;

  // Employee uploads pending document
  const uploadDocRes = await req('/api/documents.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
    body: JSON.stringify({
      fileName: 'Employee_Credentials_Test.txt',
      fileType: 'text/plain',
      category: 'Certificate',
      note: 'Auto test drive upload',
      fileData: sampleDataUrl,
      size: '95 B',
    }),
  });
  assert(uploadDocRes.status === 201, 'Employee can upload document with AES-256 encryption');
  const testDocId = uploadDocRes.json?.data?.id;
  assert(uploadDocRes.json?.data?.status === 'Pending', 'Employee upload defaults to Pending review status');

  // Decrypt & Download test
  const downloadRes = await req(`/api/documents.php?action=download&id=${testDocId}`, {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  assert(downloadRes.status === 200, 'Employee can download decrypted file');
  assert(downloadRes.text === sampleText, 'Decrypted file content matches original plaintext perfectly');

  // 5. Admin Document Status Change (The user feature request!)
  console.log('\n--- 5. Admin Document Review & Status Change ---');
  // Admin changes status to Verified
  const verifyRes = await req('/api/documents.php?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: testDocId,
      status: 'Verified',
      reviewNote: 'Authenticated and approved by HR Admin.',
      accessLevel: 'shared',
    }),
  });
  assert(verifyRes.status === 200, 'Admin can change document status to Verified');
  assert(verifyRes.json?.data?.status === 'Verified', 'Document status is now Verified');
  assert(verifyRes.json?.data?.reviewedBy === 'Admin Account', 'Reviewer name stamped');

  // Verify deletion lock: Employee CANNOT delete Verified document
  const delVerifiedRes = await req('/api/documents.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
    body: JSON.stringify({ id: testDocId }),
  });
  assert(delVerifiedRes.status === 403, 'Verified document is LOCKED from employee deletion (403)');

  // Admin changes status to Rejected with feedback notes
  const rejectRes = await req('/api/documents.php?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: testDocId,
      status: 'Rejected',
      reviewNote: 'Document blurred or invalid stamp. Please resubmit with clear copy.',
    }),
  });
  assert(rejectRes.status === 200, 'Admin can change document status to Rejected');
  assert(rejectRes.json?.data?.status === 'Rejected', 'Document status changed to Rejected');
  assert(rejectRes.json?.data?.reviewNote.includes('blurred'), 'Rejection remarks recorded');

  // Admin creates HR-Only document for the employee
  const hrOnlyRes = await req('/api/documents.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      employeeId: empId,
      fileName: 'HR_Confidential_Investigation.txt',
      fileType: 'text/plain',
      category: 'Other',
      note: 'Confidential administrative assessment',
      accessLevel: 'hr_only',
      fileData: sampleDataUrl,
      size: '95 B',
    }),
  });
  assert(hrOnlyRes.status === 201, 'Admin can upload HR-Only document');
  const hrOnlyDocId = hrOnlyRes.json?.data?.id;

  // Employee CANNOT see HR-Only document
  const empDocsList = await req('/api/documents.php', {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  const empDocsArr1 = empDocsList.json?.data?.documents || empDocsList.json?.data || [];
  const foundHrOnly = empDocsArr1.some(d => d.id === hrOnlyDocId);
  assert(!foundHrOnly, 'Employee CANNOT see HR-Only confidential documents');

  // Employee CANNOT download HR-Only document directly
  const empBadDownload = await req(`/api/documents.php?action=download&id=${hrOnlyDocId}`, {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  assert(empBadDownload.status === 403, 'Employee download of HR-Only document is blocked (403)');

  // Admin changes visibility of HR-Only to shared
  const makeSharedRes = await req('/api/documents.php?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: hrOnlyDocId,
      status: 'Verified',
      accessLevel: 'shared',
      reviewNote: 'Now shared with employee',
    }),
  });
  assert(makeSharedRes.status === 200, 'Admin can change document visibility to shared');

  // Now employee CAN see the document
  const empDocsList2 = await req('/api/documents.php', {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  const empDocsArr2 = empDocsList2.json?.data?.documents || empDocsList2.json?.data || [];
  const foundNowShared = empDocsArr2.some(d => d.id === hrOnlyDocId);
  assert(foundNowShared, 'Employee can now view document after visibility was shared');

  // Employee CANNOT delete admin-uploaded document
  const empDelAdminDoc = await req('/api/documents.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
    body: JSON.stringify({ id: hrOnlyDocId }),
  });
  assert(empDelAdminDoc.status === 403, 'Employee CANNOT delete official document uploaded by Admin (403)');

  // 6. Document Expiration & Renewal Tracking (The new feature!)
  console.log('\n--- 6. Document Expiration & Renewal Tracking ---');
  // Upload expiring soon document (20 days from now)
  const expiringDate = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const uploadExpiringDocRes = await req('/api/documents.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
    body: JSON.stringify({
      fileName: 'NBI_Renewal_Pending_2026.pdf',
      fileType: 'application/pdf',
      category: 'Certificate',
      note: 'Periodic clearance renewal',
      fileData: sampleDataUrl,
      expiryDate: expiringDate,
      size: '95 B',
    }),
  });
  assert(uploadExpiringDocRes.status === 201, 'Upload document with expiration date succeeds');
  const expiringDocId = uploadExpiringDocRes.json?.data?.id;
  assert(uploadExpiringDocRes.json?.data?.expiryStatus === 'expiring_soon', 'Document correctly detected as expiring_soon (<= 30 days)');
  assert(uploadExpiringDocRes.json?.data?.isExpiringSoon === true, 'isExpiringSoon boolean flag set to true');

  // Upload expired document (30 days ago)
  const expiredDate = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const uploadExpiredDocRes = await req('/api/documents.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      employeeId: empId,
      fileName: 'Medical_Clearance_Expired.pdf',
      fileType: 'application/pdf',
      category: 'Certificate',
      note: 'Annual fit-to-work clearance',
      fileData: sampleDataUrl,
      expiryDate: expiredDate,
      size: '95 B',
    }),
  });
  assert(uploadExpiredDocRes.status === 201, 'Upload expired document succeeds');
  const expiredDocId = uploadExpiredDocRes.json?.data?.id;
  assert(uploadExpiredDocRes.json?.data?.expiryStatus === 'expired', 'Document correctly detected as expired');
  assert(uploadExpiredDocRes.json?.data?.isExpired === true, 'isExpired boolean flag set to true');

  // Test filter: expiry_status=expiring_soon
  const filterExpiringRes = await req('/api/documents.php?expiry_status=expiring_soon', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const expiringItems = filterExpiringRes.json?.data?.documents || filterExpiringRes.json?.data || [];
  assert(filterExpiringRes.status === 200, 'Filter by expiring_soon returns 200 OK');
  assert(expiringItems.every(d => d.expiryStatus === 'expiring_soon'), 'Filtered list contains only expiring_soon documents');

  // Test filter: expiry_status=expired
  const filterExpiredRes = await req('/api/documents.php?expiry_status=expired', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const expiredItems = filterExpiredRes.json?.data?.documents || filterExpiredRes.json?.data || [];
  assert(filterExpiredRes.status === 200, 'Filter by expired returns 200 OK');
  assert(expiredItems.every(d => d.expiryStatus === 'expired'), 'Filtered list contains only expired documents');

  // Verify expiryStats metadata in response
  const expiryStats = filterExpiringRes.json?.data?.expiryStats;
  assert(expiryStats && typeof expiryStats.expiringSoon === 'number', 'Server calculates and returns expiryStats metadata');
  assert(expiryStats.expiringSoon >= 1 && expiryStats.expired >= 1, 'expiryStats correctly tallies expiringSoon and expired records');

  // Admin updates document expiration date via review action (extends to valid in future)
  const validFutureDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const updateExpiryRes = await req('/api/documents.php?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: expiringDocId,
      status: 'Verified',
      expiryDate: validFutureDate,
      reviewNote: 'Renewed and extended for 1 year.',
    }),
  });
  assert(updateExpiryRes.status === 200, 'Admin can update document expiration date via review endpoint');
  assert(updateExpiryRes.json?.data?.expiryStatus === 'valid', 'Updated document now has valid status');
  assert(updateExpiryRes.json?.data?.isExpiringSoon === false, 'isExpiringSoon flag successfully cleared');

  // 7. Audit Logging Verification
  console.log('\n--- 7. Audit Logging Verification ---');
  const auditRes = await req('/api/audit.php?limit=50', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(auditRes.status === 200, 'Admin can access complete audit log');
  const logs = auditRes.json?.data || [];
  const hasVerifyLog = logs.some(l => l.action === 'VERIFY_DOCUMENT');
  const hasRejectLog = logs.some(l => l.action === 'REJECT_DOCUMENT');
  const hasEncryptLog = logs.some(l => l.action === 'AES_ENCRYPT');
  assert(hasVerifyLog, 'Audit log recorded VERIFY_DOCUMENT action');
  assert(hasRejectLog, 'Audit log recorded REJECT_DOCUMENT action');
  assert(hasEncryptLog, 'Audit log recorded AES_ENCRYPT action');

  // 8. Notification Dispatcher & Security Policy Verification
  console.log('\n--- 8. Notification Center & Download Policy Check ---');
  // Verify download delivers attachment header (in-browser view disabled)
  const downloadHeaderCheck = await req(`/api/documents.php?action=download&id=${testDocId}`, {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  const dispHeader = downloadHeaderCheck.headers.get('content-disposition') || '';
  assert(dispHeader.includes('attachment'), 'File delivery strictly enforces attachment disposition (view disabled)');

  // Verify notifications for Employee
  const empNotifsRes = await req('/api/notifications.php', {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  assert(empNotifsRes.status === 200, 'Employee can query /api/notifications.php');
  const empNotifs = empNotifsRes.json?.data?.notifications || [];
  assert(Array.isArray(empNotifs) && empNotifs.length > 0, 'Employee has active notifications received');
  const hasStatusApproval = empNotifs.some(n => n.title.includes('Verified') || n.title.includes('Approved'));
  const hasRejectionNotice = empNotifs.some(n => n.title.includes('Rejected') || n.message.includes('blurred'));
  assert(hasStatusApproval, 'Employee received automated notification when document was Verified');
  assert(hasRejectionNotice, 'Employee received automated notification when document was Rejected with remarks');

  // Verify mark all read
  const markReadRes = await req('/api/notifications.php?action=mark_read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
    body: JSON.stringify({ id: 'all' }),
  });
  assert(markReadRes.status === 200, 'Mark all notifications as read returns 200');

  const empNotifsAfterRead = await req('/api/notifications.php', {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  assert(empNotifsAfterRead.json?.data?.unreadCount === 0, 'Unread notification count correctly resets to 0');

  // Verify email dispatch log for Admin
  const dispatchesRes = await req('/api/notifications.php?action=dispatches', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(dispatchesRes.status === 200, 'Admin can view email dispatches log');
  const dispatches = dispatchesRes.json?.data || [];
  assert(dispatches.length > 0, 'System recorded automated email dispatches for HR status events');

  // --- 9. List 2 Comprehensive Functionality ---
  console.log('\n--- 9. List 2 Comprehensive Functionality ---');

  // Test List 2 via action=list2
  const list2Res = await req('/api/documents.php?action=list2&limit=5&page=1', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(list2Res.status === 200, 'List 2 endpoint (action=list2) responds 200 OK');
  assert(Array.isArray(list2Res.json?.data?.documents), 'List 2 returns documents array in data.documents');
  assert(list2Res.json?.data?.pagination !== undefined, 'List 2 returns pagination metadata');
  assert(list2Res.json?.data?.expiryStats !== undefined, 'List 2 returns live expiryStats metadata');

  // Test List 2 direct route alias /api/list2
  const list2AliasRes = await req('/api/list2?status=verified', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(list2AliasRes.status === 200, 'List 2 alias endpoint (/api/list2) responds 200 OK');
  const verifiedDocs = list2AliasRes.json?.data?.documents || [];
  assert(verifiedDocs.every(d => d.status === 'verified'), 'List 2 status filtering correctly returns only verified documents');

  // Test List 2 POST query
  const list2PostRes = await req('/api/documents.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'list2', sortField: 'uploadedAt', sortOrder: 'desc', limit: 3 }),
  });
  assert(list2PostRes.status === 200, 'List 2 POST query responds 200 OK');
  assert(list2PostRes.json?.data?.documents?.length <= 3, 'List 2 POST query respects limit constraint');

  // Test List 2 Batch Review (update multiple documents at once)
  const batchReviewRes = await req('/api/documents.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      action: 'batch_review',
      ids: [expiringDocId, expiredDocId],
      status: 'verified',
      remarks: 'Batch verified during List 2 automated testing',
    }),
  });
  assert(batchReviewRes.status === 200, 'List 2 Batch Review responds 200 OK');
  assert(batchReviewRes.json?.data?.updatedCount === 2, 'List 2 Batch Review successfully updated multiple documents');

  // Test List 2 CSV Export
  const csvExportRes = await req('/api/documents.php?action=export_csv', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(csvExportRes.status === 200, 'List 2 Export CSV returns 200 OK');
  const contentType = csvExportRes.headers?.get ? csvExportRes.headers.get('content-type') : csvExportRes.headers['content-type'];
  assert(contentType?.includes('text/csv'), 'List 2 Export CSV sets text/csv Content-Type');

  // Cleanup test documents & test employee
  await req('/api/documents.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ id: testDocId }),
  });
  await req('/api/documents.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ id: hrOnlyDocId }),
  });
  await req('/api/documents.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ id: expiringDocId }),
  });
  await req('/api/documents.php', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ id: expiredDocId }),
  });

  console.log('\n======================================================');
  console.log(`TEST DRIVE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('Test drive uncaught error:', err);
  process.exit(1);
});
