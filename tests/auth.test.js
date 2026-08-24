'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://user:password@localhost:3306/smart_hazri_test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createAuthService } = require('../src/modules/auth/auth.service');
const { hashPassword, verifyPassword } = require('../src/utils/password');
const { app } = require('../src/app');

const makeDatabase = async ({ status = 'ACTIVE' } = {}) => {
  const user = {
    id: 1n, name: 'Teacher One', loginId: 'teacher001', email: null,
    passwordHash: await hashPassword('Password1'), contact: null, role: 'TEACHER',
    branchId: 2n, classId: 3n, timing: '08:00-14:00', baseSalary: '35000.00', status, tokenVersion: 0,
  };
  const tokens = [];
  let tokenId = 1n;
  const matches = (record, where) => Object.entries(where).every(([key, value]) => {
    if (value === null) return record[key] == null;
    return String(record[key]) === String(value);
  });
  const database = {
    user: {
      findUnique: async ({ where }) => where.loginId !== undefined
        ? (where.loginId === user.loginId ? user : null)
        : (String(where.id) === String(user.id) ? user : null),
      update: async ({ data }) => {
        if (data.tokenVersion?.increment) user.tokenVersion += data.tokenVersion.increment;
        Object.assign(user, { ...data, tokenVersion: user.tokenVersion });
        return user;
      },
    },
    refreshToken: {
      create: async ({ data }) => {
        const record = { id: tokenId++, revokedAt: null, createdAt: new Date(), ...data };
        tokens.push(record); return record;
      },
      findUnique: async ({ where }) => {
        const record = tokens.find(item => item.tokenHash === where.tokenHash);
        return record ? { ...record, user } : null;
      },
      updateMany: async ({ where, data }) => {
        const found = tokens.filter(item => matches(item, where));
        found.forEach(item => Object.assign(item, data));
        return { count: found.length };
      },
    },
  };
  database.$transaction = callback => callback(database);
  return { database, tokens, user };
};

const expectCode = async (promise, code) => {
  await assert.rejects(promise, error => error.code === code);
};

test('login succeeds with normalized login ID and safe profile', async () => {
  const fixture = await makeDatabase();
  const result = await createAuthService(fixture.database).login({ loginId: ' Teacher001 ', password: 'Password1' });
  assert.equal(result.user.loginId, 'teacher001');
  assert.equal(result.user.passwordHash, undefined);
  assert.equal(result.user.baseSalary, '35000.00');
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(fixture.tokens.length, 1);
  assert.notEqual(fixture.tokens[0].tokenHash, result.refreshToken);
});

test('login rejects invalid password and unknown login ID safely', async () => {
  const fixture = await makeDatabase();
  const service = createAuthService(fixture.database);
  await expectCode(service.login({ loginId: 'teacher001', password: 'wrong' }), 'INVALID_CREDENTIALS');
  await expectCode(service.login({ loginId: 'missing', password: 'Password1' }), 'INVALID_CREDENTIALS');
});

test('login rejects an inactive account', async () => {
  const fixture = await makeDatabase({ status: 'INACTIVE' });
  await expectCode(createAuthService(fixture.database).login({ loginId: 'teacher001', password: 'Password1' }), 'ACCOUNT_INACTIVE');
});

test('refresh rotates and revokes the previous refresh token', async () => {
  const fixture = await makeDatabase();
  const service = createAuthService(fixture.database);
  const login = await service.login({ loginId: 'teacher001', password: 'Password1' });
  const refreshed = await service.refresh(login.refreshToken);
  assert.notEqual(refreshed.refreshToken, login.refreshToken);
  assert.ok(fixture.tokens[0].revokedAt instanceof Date);
  await expectCode(service.refresh(login.refreshToken), 'INVALID_REFRESH_TOKEN');
});

test('logout revokes the supplied refresh token', async () => {
  const fixture = await makeDatabase();
  const service = createAuthService(fixture.database);
  const login = await service.login({ loginId: 'teacher001', password: 'Password1' });
  await service.logout(login.refreshToken);
  assert.ok(fixture.tokens[0].revokedAt instanceof Date);
  await expectCode(service.logout(login.refreshToken), 'INVALID_REFRESH_TOKEN');
});

test('password change validates current password and revokes all sessions', async () => {
  const fixture = await makeDatabase();
  const service = createAuthService(fixture.database);
  await service.login({ loginId: 'teacher001', password: 'Password1' });
  await expectCode(service.changePassword('1', {
    currentPassword: 'wrong', newPassword: 'NewPassword2', confirmPassword: 'NewPassword2',
  }), 'CURRENT_PASSWORD_INCORRECT');
  await expectCode(service.changePassword('1', {
    currentPassword: 'Password1', newPassword: 'NewPassword2', confirmPassword: 'different',
  }), 'PASSWORDS_DO_NOT_MATCH');
  await service.changePassword('1', {
    currentPassword: 'Password1', newPassword: 'NewPassword2', confirmPassword: 'NewPassword2',
  });
  assert.equal(await verifyPassword('NewPassword2', fixture.user.passwordHash), true);
  assert.ok(fixture.tokens[0].revokedAt instanceof Date);
  assert.equal(fixture.user.tokenVersion, 1);
});

test('protected endpoint rejects an unauthenticated request', async () => {
  const response = await request(app).get('/api/auth/me').expect(401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('oversized JSON bodies are rejected with a safe error', async () => {
  const response = await request(app).post('/api/auth/login').send({
    loginId: 'teacher001', password: 'x'.repeat(300 * 1024),
  }).expect(413);
  assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(JSON.stringify(response.body).includes('PayloadTooLargeError'), false);
});
