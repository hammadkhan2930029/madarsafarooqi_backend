'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/smarthazri_test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const request = require('supertest');
const { createTeacherRouter } = require('../src/modules/teachers/teacher.routes');
const { createTeacherService, normalizeLoginId, serializeTeacher } = require('../src/modules/teachers/teacher.service');
const { errorHandler } = require('../src/middleware/errorHandler');
const { prisma } = require('../src/config/database');

after(() => prisma.$disconnect());
const teacher = { id: 2n, name: 'Teacher One', loginId: 'teacher001', email: null, passwordHash: 'secret-hash', contact: '+92 300 1234567', role: 'TEACHER', branchId: 1n, classId: 1n, timing: '08:00-14:00', baseSalary: '35000.00', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), branch: { id: 1n, name: 'Main', code: 'MAIN', status: 'ACTIVE' }, class: { id: 1n, name: 'One', branchId: 1n, status: 'ACTIVE' } };
const makeApp = (role, service) => { const app = express(); app.use(express.json()); app.use('/api/teachers', createTeacherRouter(service, (req, _res, next) => { req.auth = { userId: '1', role }; next(); })); app.use(errorHandler); return app; };

test('normalizes login IDs and never serializes password hashes', () => {
  assert.equal(normalizeLoginId('  Teacher.001 '), 'teacher.001');
  assert.equal(serializeTeacher(teacher).passwordHash, undefined);
  assert.equal(serializeTeacher(teacher).teacherType, 'TEACHER');
});

test('Super Admin creates a Teacher while client role is rejected', async () => {
  let received;
  const service = { create: async values => { received = values; return serializeTeacher(teacher); } };
  const body = { name: 'Teacher One', loginId: 'Teacher001', email: null, password: 'StrongPass8', contact: '+92 300 1234567', teacherType: 'SUPERVISOR', supervisorBranchIds: ['1'], branchId: '1', classId: '1', timing: '08:00 AM-02:00 PM', baseSalary: '35000', ijaraConditions: ['Follow the agreed schedule.'], ijaraTermsVersion: '1' };
  const response = await request(makeApp('SUPER_ADMIN', service)).post('/api/teachers').send(body);
  assert.equal(response.status, 201, JSON.stringify(response.body)); assert.equal(received.role, undefined); assert.equal(received.teacherType, 'SUPERVISOR'); assert.equal(response.body.data.passwordHash, undefined);
  const invalid = await request(makeApp('SUPER_ADMIN', service)).post('/api/teachers').send({ ...body, role: 'SUPER_ADMIN' });
  assert.equal(invalid.status, 422);
});

test('Teacher cannot access Teacher Management endpoints', async () => {
  const response = await request(makeApp('TEACHER', {})).get('/api/teachers');
  assert.equal(response.status, 403); assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('Teacher cannot reset another Teacher password', async () => {
  const response = await request(makeApp('TEACHER', {})).patch('/api/teachers/2/reset-password').send({ newPassword: 'NewPassword2', confirmPassword: 'NewPassword2' });
  assert.equal(response.status, 403); assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('password reset validates matching strong passwords', async () => {
  const service = createTeacherService({});
  await assert.rejects(() => service.resetPassword('2', { newPassword: 'NewPassword2', confirmPassword: 'DifferentPass2' }, { userId: '1' }, {}), error => error.code === 'PASSWORDS_DO_NOT_MATCH');
  await assert.rejects(() => service.resetPassword('2', { newPassword: 'weakpass', confirmPassword: 'weakpass' }, { userId: '1' }, {}), error => error.code === 'WEAK_PASSWORD');
});

test('password reset hashes password, revokes tokens and writes a safe audit log atomically', async () => {
  let userUpdate; let tokenRevocation; let auditData;
  const database = {
    user: { findFirst: async () => ({ id: 2n }), update: async args => { userUpdate = args.data; } },
    refreshToken: { updateMany: async args => { tokenRevocation = args; } },
    auditLog: { create: async args => { auditData = args.data; } },
  };
  database.$transaction = async callback => callback(database);
  await createTeacherService(database).resetPassword('2', { newPassword: 'NewPassword2', confirmPassword: 'NewPassword2' }, { userId: '1', role: 'SUPER_ADMIN' }, { ip: '127.0.0.1', userAgent: 'test' });
  assert.notEqual(userUpdate.passwordHash, 'NewPassword2');
  assert.deepEqual(userUpdate.tokenVersion, { increment: 1 });
  assert.equal(tokenRevocation.where.userId, 2n);
  assert.equal(auditData.action, 'TEACHER_PASSWORD_RESET');
  assert.equal(auditData.targetUserId, 2n); assert.equal(auditData.performedById, 1n);
  assert.equal(JSON.stringify(auditData.requestMetadata).includes('NewPassword2'), false);
});

test('password reset returns TEACHER_NOT_FOUND for missing or non-Teacher targets', async () => {
  const database = { user: { findFirst: async () => null } };
  await assert.rejects(() => createTeacherService(database).resetPassword('9', { newPassword: 'NewPassword2', confirmPassword: 'NewPassword2' }, { userId: '1' }, {}), error => error.code === 'TEACHER_NOT_FOUND');
});

test('list forwards all filters and pagination', async () => {
  let received; const service = { list: async query => { received = query; return { items: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 1 } }; } };
  const response = await request(makeApp('SUPER_ADMIN', service)).get('/api/teachers?search=one&branchId=1&classId=2&status=ACTIVE&page=2&limit=10');
  assert.equal(response.status, 200); assert.deepEqual(received, { search: 'one', branchId: '1', classId: '2', status: 'ACTIVE', page: 2, limit: 10 });
});

test('active assignment requires class to belong to selected branch', async () => {
  const database = { branch: { findUnique: async () => ({ id: 1n, status: 'ACTIVE' }) }, class: { findUnique: async () => ({ id: 2n, branchId: 9n, status: 'ACTIVE' }) }, $transaction: async callback => callback(database) };
  await assert.rejects(() => createTeacherService(database).create({ name: 'Teacher', loginId: 'teacher1', email: null, password: 'StrongPass8', contact: '+92 300 1234567', teacherType: 'TEACHER', branchId: '1', classId: '2', timing: '08:00-14:00', baseSalary: '0' }), error => error.code === 'CLASS_BRANCH_MISMATCH');
});

test('deactivation revokes sessions and increments token version', async () => {
  let updateData; let revoked = false;
  const database = { user: { findFirst: async () => teacher, update: async args => { updateData = args.data; return { ...teacher, status: args.data.status }; } }, refreshToken: { updateMany: async () => { revoked = true; } } };
  database.$transaction = async callback => callback(database);
  const result = await createTeacherService(database).updateStatus('2', 'INACTIVE');
  assert.equal(result.status, 'INACTIVE'); assert.deepEqual(updateData.tokenVersion, { increment: 1 }); assert.equal(revoked, true);
});

test('invalid timing, salary and identifiers return safe validation errors', async () => {
  const service = { create: async () => serializeTeacher(teacher), get: async () => serializeTeacher(teacher) };
  const bad = { name: 'Teacher', loginId: 'teacher1', password: 'StrongPass8', contact: '+92 300 1234567', teacherType: 'TEACHER', branchId: '1', classId: '1', timing: '18:00-08:00', baseSalary: '-1' };
  assert.equal((await request(makeApp('SUPER_ADMIN', service)).post('/api/teachers').send(bad)).status, 422);
  assert.equal((await request(makeApp('SUPER_ADMIN', service)).get('/api/teachers/0')).status, 422);
});
