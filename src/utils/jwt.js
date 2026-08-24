'use strict';

const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { env } = require('../config/env');

const signAccessToken = ({ userId, role, tokenVersion }) => jwt.sign({ userId, role, tokenVersion, type: 'access' }, env.JWT_ACCESS_SECRET, {
  subject: String(userId),
  expiresIn: env.JWT_ACCESS_EXPIRES_IN,
});
const signRefreshToken = ({ userId, role, tokenVersion }) => jwt.sign({ userId, role, tokenVersion, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
  subject: String(userId),
  jwtid: randomUUID(),
  expiresIn: env.JWT_REFRESH_EXPIRES_IN,
});
const verifyAccessToken = token => jwt.verify(token, env.JWT_ACCESS_SECRET);
const verifyRefreshToken = token => jwt.verify(token, env.JWT_REFRESH_SECRET);

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
