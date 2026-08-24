'use strict';

const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;
const hashPassword = password => bcrypt.hash(password, BCRYPT_ROUNDS);
const verifyPassword = (password, passwordHash) => bcrypt.compare(password, passwordHash);
const validatePasswordStrength = password => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase, and numeric characters.';
  }
  return '';
};

module.exports = { BCRYPT_ROUNDS, hashPassword, validatePasswordStrength, verifyPassword };
