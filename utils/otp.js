const { authenticator } = require('otplib');

/**
 * Generate a new OTP secret for a user
 * @param {string} username - Username for label
 * @returns {{ secret: string, otpauthUrl: string }}
 */
function generateOTPSecret(username) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(username, 'IDSTS', secret);
  return { secret, otpauthUrl };
}

/**
 * Verify an OTP token against a secret
 * @param {string} token - The OTP token to verify (6 digits)
 * @param {string} secret - The user's OTP secret
 * @returns {boolean}
 */
function verifyOTP(token, secret) {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generate current OTP for a secret (for testing purposes)
 * @param {string} secret - The OTP secret
 * @returns {string} - Current OTP token
 */
function generateCurrentOTP(secret) {
  return authenticator.generate(secret);
}

module.exports = { generateOTPSecret, verifyOTP, generateCurrentOTP };
