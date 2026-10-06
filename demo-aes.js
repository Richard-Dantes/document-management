import crypto from 'crypto';
import fs from 'fs';

// Configuration matching SecureHR
const AES_ALGORITHM = 'aes-256-gcm';
const AES_IV_LENGTH = 12; // 96 bits IV
const AES_TAG_LENGTH = 16; // 128 bits Auth Tag
const MASTER_KEY_RAW = process.env.AES_MASTER_KEY || 'BestlinkCollegeOfThePhilippines_SecureHR_AES256_Key';
const AES_KEY = crypto.createHash('sha256').update(MASTER_KEY_RAW).digest();

console.log('='.repeat(70));
console.log(' SecureHR AES-256-GCM Cryptographic Demonstration');
console.log('='.repeat(70));
console.log(`[1] Master Key Derivation: SHA-256("${MASTER_KEY_RAW.slice(0, 15)}...")`);
console.log(`    -> Derived Key (${AES_KEY.length * 8}-bit): ${AES_KEY.toString('hex')}\n`);

// 1. Create a sample HR document file
const sampleFileName = 'Sample_Faculty_Appointment_Contract.txt';
const sampleContent = `BESTLINK COLLEGE OF THE PHILIPPINES
HUMAN RESOURCES & TALENT MANAGEMENT DEPARTMENT
CONFIDENTIAL PERSONNEL RECORD

Employee ID: EMP-2026-0042
Employee Name: Prof. Juan Dela Cruz
Department: College of Computer Studies
Position: Senior Lecturer & Cybersecurity Specialist
Monthly Basic Salary: PHP 65,000.00
Employment Status: Regular Full-Time
Appointment Date: October 2026

Terms: This record contains legally binding and confidential institutional HR data.
Access is strictly governed by institutional RBAC and encrypted at rest with AES-256-GCM.`;

fs.writeFileSync(sampleFileName, sampleContent, 'utf8');
console.log(`[2] Created Sample Document: "${sampleFileName}"`);
console.log(`    Plaintext Size: ${Buffer.byteLength(sampleContent)} bytes`);
console.log(`    File Contents Preview:`);
console.log('    ' + sampleContent.split('\n').slice(0, 5).join('\n    ') + '\n    ...\n');

// 2. Encrypt using AES-256-GCM
const plaintextBuffer = fs.readFileSync(sampleFileName);
const iv = crypto.randomBytes(AES_IV_LENGTH);
const cipher = crypto.createCipheriv(AES_ALGORITHM, AES_KEY, iv, { authTagLength: AES_TAG_LENGTH });
const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
const authTag = cipher.getAuthTag();

// Combined at-rest storage payload: [IV (12 B)][AuthTag (16 B)][Ciphertext]
const encryptedPayload = Buffer.concat([iv, authTag, ciphertext]);
const encryptedFileName = `${sampleFileName}.enc`;
fs.writeFileSync(encryptedFileName, encryptedPayload);

console.log(`[3] AES-256-GCM Encryption Complete:`);
console.log(`    Random IV (12 bytes / 96 bits hex):      ${iv.toString('hex')}`);
console.log(`    GCM Auth Tag (16 bytes / 128 bits hex):  ${authTag.toString('hex')}`);
console.log(`    Ciphertext Length:                       ${ciphertext.length} bytes`);
console.log(`    Ciphertext Preview (Hex):                ${ciphertext.slice(0, 32).toString('hex')}...`);
console.log(`    Total Encrypted Stored File:             ${encryptedPayload.length} bytes (IV + Tag + Ciphertext)`);
console.log(`    Encrypted File Path:                     "${encryptedFileName}"\n`);

// 3. Decrypt and verify integrity
console.log(`[4] AES-256-GCM Decryption & Authenticated Verification:`);
const readEncryptedPayload = fs.readFileSync(encryptedFileName);

// Extract components from payload
const extractedIV = readEncryptedPayload.subarray(0, AES_IV_LENGTH);
const extractedAuthTag = readEncryptedPayload.subarray(AES_IV_LENGTH, AES_IV_LENGTH + AES_TAG_LENGTH);
const extractedCiphertext = readEncryptedPayload.subarray(AES_IV_LENGTH + AES_TAG_LENGTH);

const decipher = crypto.createDecipheriv(AES_ALGORITHM, AES_KEY, extractedIV, { authTagLength: AES_TAG_LENGTH });
decipher.setAuthTag(extractedAuthTag);

const decryptedBuffer = Buffer.concat([decipher.update(extractedCiphertext), decipher.final()]);
const decryptedText = decryptedBuffer.toString('utf8');

console.log(`    Extracted IV:        ${extractedIV.toString('hex')} (matches original: ${extractedIV.equals(iv)})`);
console.log(`    Extracted Auth Tag:  ${extractedAuthTag.toString('hex')} (matches original: ${extractedAuthTag.equals(authTag)})`);
console.log(`    GCM Integrity Check: PASSED (No tampering detected)`);
console.log(`    Decrypted Size:      ${decryptedBuffer.length} bytes`);
console.log(`    Exact Match:         ${decryptedText === sampleContent ? 'PERFECT 100% MATCH' : 'MISMATCH'}\n`);

// 4. Tamper Resistance Test (demonstrating why GCM mode is secure)
console.log(`[5] Tamper Resistance Test (Integrity Verification):`);
const tamperedPayload = Buffer.from(encryptedPayload);
// Flip a single bit in the ciphertext
tamperedPayload[tamperedPayload.length - 1] ^= 0x01;

try {
  const badDecipher = crypto.createDecipheriv(AES_ALGORITHM, AES_KEY, tamperedPayload.subarray(0, AES_IV_LENGTH), { authTagLength: AES_TAG_LENGTH });
  badDecipher.setAuthTag(tamperedPayload.subarray(AES_IV_LENGTH, AES_IV_LENGTH + AES_TAG_LENGTH));
  Buffer.concat([badDecipher.update(tamperedPayload.subarray(AES_IV_LENGTH + AES_TAG_LENGTH)), badDecipher.final()]);
  console.log('    Tamper test FAILED (should not allow altered ciphertext)');
} catch (err) {
  console.log(`    ✓ Tamper Detection SUCCESS: Cipher rejected by GCM with error: "${err.message}"`);
  console.log(`    Even 1 bit altered prevents unauthorized viewing or tampering!`);
}

console.log('\n' + '='.repeat(70));
