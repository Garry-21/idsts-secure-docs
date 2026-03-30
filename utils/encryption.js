const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', 'hex');

/**
 * Encrypt a buffer using AES-256-CBC with a random IV
 * @param {Buffer} buffer - The data to encrypt
 * @returns {{ encrypted: Buffer, iv: string }} - Encrypted data and hex IV
 */
function encrypt(buffer) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return {
    encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a buffer using AES-256-CBC
 * @param {Buffer} encryptedBuffer - The encrypted data
 * @param {string} ivHex - The IV as hex string
 * @returns {Buffer} - Decrypted data
 */
function decrypt(encryptedBuffer, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return decrypted;
}

module.exports = { encrypt, decrypt };
