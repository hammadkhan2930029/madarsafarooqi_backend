'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'mysql://user:password@localhost:3306/smarthazri_test';
process.env.JWT_ACCESS_SECRET ||= 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET ||= 'b'.repeat(32);
process.env.APP_TIMEZONE ||= 'Asia/Karachi';

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const request = require('supertest');
const { createAttendanceRouter, createAdminAttendanceRouter } = require('../src/modules/attendance/attendance.routes');
const { createAttendanceService, createListWhere, validateCorrection } = require('../src/modules/attendance/attendance.service');
const { calculateIsLate, calculateLateMinutes, checkInAvailability, checkOutAvailability, dateKeyInTimeZone, parseDateKey, parseTiming } = require('../src/modules/attendance/timezone');
const { errorHandler } = require('../src/middleware/errorHandler');
const { prisma } = require('../src/config/database');

after(() => prisma.$disconnect());
const now = new Date('2026-08-10T03:01:15.000Z'); // 08:01:15 Asia/Karachi
const teacher = { id: 2n, branchId: 3n, classId: 4n, timing: '08:00-14:00' };
const baseRecord = { id: 1n, teacherId: 2n, attendanceDate: new Date('2026-08-10T00:00:00.000Z'), branchId: 3n, classId: 4n, timingSnapshot: '08:00-14:00', checkInAt: now, checkOutAt: null, isLate: true, status: 'INCOMPLETE', leaveRequestId: null, createdAt: now, updatedAt: now };
const makeApp = (role, service, admin = false) => { const app = express(); app.use(express.json()); const auth = (req, _res, next) => { req.auth = { userId: role === 'TEACHER' ? '2' : '1', role }; next(); }; app.use(admin ? '/api/admin/attendance' : '/api/attendance', admin ? createAdminAttendanceRouter(service, auth) : createAttendanceRouter(service, auth)); app.use(errorHandler); return app; };

test('timezone day and lateness use institution timezone', () => {
  assert.equal(dateKeyInTimeZone(new Date('2026-08-09T20:30:00Z'), 'Asia/Karachi'), '2026-08-10');
  assert.equal(calculateIsLate(now, 'Asia/Karachi', '08:00-14:00'), true);
  assert.equal(calculateIsLate(new Date('2026-08-10T03:00:00Z'), 'Asia/Karachi', '08:00-14:00'), false);
});

test('check-in opens 20 minutes early and grace is excluded from late minutes', () => {
  assert.equal(checkInAvailability(new Date('2026-08-10T08:39:00Z'), 'Asia/Karachi', '02:00 PM-08:00 PM', 5).canCheckIn, false);
  assert.equal(checkInAvailability(new Date('2026-08-10T08:40:00Z'), 'Asia/Karachi', '02:00 PM-08:00 PM', 5).canCheckIn, true);
  assert.equal(calculateLateMinutes(new Date('2026-08-10T09:05:00Z'), 'Asia/Karachi', '02:00 PM-08:00 PM', 5), 0);
  assert.equal(calculateLateMinutes(new Date('2026-08-10T09:06:00Z'), 'Asia/Karachi', '02:00 PM-08:00 PM', 5), 1);
});

test('check-in closes at shift end and check-out closes 30 minutes later', () => {
  assert.equal(checkInAvailability(new Date('2026-08-10T11:00:00Z'), 'Asia/Karachi', '02:00 PM-04:00 PM').canCheckIn, true);
  assert.equal(checkInAvailability(new Date('2026-08-10T11:01:00Z'), 'Asia/Karachi', '02:00 PM-04:00 PM').reason, 'CHECK_IN_CLOSED');
  assert.equal(checkOutAvailability(new Date('2026-08-10T11:30:00Z'), 'Asia/Karachi', '02:00 PM-04:00 PM').canCheckOut, true);
  assert.equal(checkOutAvailability(new Date('2026-08-10T11:31:00Z'), 'Asia/Karachi', '02:00 PM-04:00 PM').checkOutReason, 'CHECK_OUT_CLOSED');
});

test('timing format is strict and missing/invalid timing is safe', () => {
  assert.deepEqual(parseTiming('08:00-14:00'), { normalized: '08:00 AM-02:00 PM', startMinutes: 480, endMinutes: 840 });
  assert.equal(parseTiming('14:00-08:00'), null); assert.equal(parseTiming(null), null);
  assert.equal(calculateIsLate(now, 'Asia/Karachi', 'invalid'), null);
});

test('Teacher check-in route uses JWT identity and rejects client teacher ID', async () => {
  let received; const service = { checkIn: async id => { received = id; return { ...baseRecord, id: '1', teacherId: '2', branchId: '3', classId: '4' }; } };
  const success = await request(makeApp('TEACHER', service)).post('/api/attendance/check-in').send({});
  assert.equal(success.status, 201); assert.equal(received, '2');
  const spoofed = await request(makeApp('TEACHER', service)).post('/api/attendance/check-in').send({ teacherId: '99' });
  assert.equal(spoofed.status, 422); assert.equal(spoofed.body.error.code, 'VALIDATION_ERROR');
});

test('Super Admin cannot use Teacher attendance actions and Teacher cannot use Admin attendance', async () => {
  assert.equal((await request(makeApp('SUPER_ADMIN', {})).post('/api/attendance/check-in').send({})).status, 403);
  assert.equal((await request(makeApp('TEACHER', {}, true)).get('/api/admin/attendance')).status, 403);
  assert.equal((await request(makeApp('TEACHER', {}, true)).patch('/api/admin/attendance/1').send({ checkInAt: now.toISOString(), checkOutAt: now.toISOString(), status: 'PRESENT', isLate: false, reason: 'Correction' })).status, 403);
});

test('check-in stores server time and assignment/timing snapshots as INCOMPLETE', async () => {
  let createData;
  const database = { user: { findFirst: async () => teacher }, teacherAttendance: {
    findUnique: async () => null,
    create: async args => { createData = args.data; return { ...baseRecord, ...args.data }; },
  }, leaveRequest: { findFirst: async () => null } };
  database.$transaction = async callback => callback(database);
  const result = await createAttendanceService(database, { now: () => now, timeZone: 'Asia/Karachi' }).checkIn('2');
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.isLate, true);
  assert.equal(createData.teacherId, 2n); assert.equal(createData.branchId, 3n); assert.equal(createData.classId, 4n);
  assert.equal(createData.timingSnapshot, '08:00 AM-02:00 PM'); assert.equal(createData.checkInAt, now); assert.equal(createData.lateMinutes, 1);
});

test('duplicate check-in and approved leave are rejected safely', async () => {
  const duplicateDb = { user: { findFirst: async () => teacher }, teacherAttendance: { findUnique: async () => baseRecord } };
  duplicateDb.$transaction = async callback => callback(duplicateDb);
  await assert.rejects(() => createAttendanceService(duplicateDb, { now: () => now }).checkIn('2'), error => error.code === 'ALREADY_CHECKED_IN');

  let leaveCreated = false;
  const leaveDb = { user: { findFirst: async () => teacher }, teacherAttendance: { findUnique: async () => null, create: async args => { leaveCreated = true; return { ...baseRecord, ...args.data, id: 9n }; } }, leaveRequest: { findFirst: async () => ({ id: 8n, branchId: 3n, classId: 4n }) } };
  leaveDb.$transaction = async callback => callback(leaveDb);
  await assert.rejects(() => createAttendanceService(leaveDb, { now: () => now }).checkIn('2'), error => error.code === 'TEACHER_ON_LEAVE');
  assert.equal(leaveCreated, true);
});

test('check-out requires check-in, prevents duplicates and completes attendance', async () => {
  const makeDb = existing => { let current = existing; const database = { user: { findFirst: async () => teacher }, teacherAttendance: {
    findUnique: async args => args.where.id ? current : existing,
    updateMany: async args => { if (!current || current.checkOutAt) return { count: 0 }; current = { ...current, ...args.data }; return { count: 1 }; },
  } }; database.$transaction = async callback => callback(database); return database; };
  await assert.rejects(() => createAttendanceService(makeDb(null), { now: () => now }).checkOut('2'), error => error.code === 'CHECK_IN_REQUIRED');
  await assert.rejects(() => createAttendanceService(makeDb({ ...baseRecord, checkOutAt: now }), { now: () => now }).checkOut('2'), error => error.code === 'ALREADY_CHECKED_OUT');
  const completed = await createAttendanceService(makeDb(baseRecord), { now: () => now }).checkOut('2');
  assert.equal(completed.status, 'PRESENT'); assert.equal(completed.checkOutAt, now);
});

test('atomic check-out rejects a lost concurrent update', async () => {
  const database = { user: { findFirst: async () => teacher }, teacherAttendance: {
    findUnique: async args => args.where.id ? baseRecord : baseRecord,
    updateMany: async () => ({ count: 0 }),
  } };
  database.$transaction = async callback => callback(database);
  await assert.rejects(() => createAttendanceService(database, { now: () => now }).checkOut('2'), error => error.code === 'ALREADY_CHECKED_OUT');
});

test('Admin filters and pagination are validated and mapped to database fields', async () => {
  const where = createListWhere({ dateFrom: '2026-08-01', dateTo: '2026-08-10', teacherId: '2', branchId: '3', classId: '4', status: 'PRESENT', isLate: false });
  assert.equal(where.teacherId, 2n); assert.equal(where.branchId, 3n); assert.equal(where.classId, 4n); assert.equal(where.status, 'PRESENT'); assert.equal(where.isLate, false);
  assert.equal(where.attendanceDate.gte.toISOString().slice(0, 10), '2026-08-01');
  assert.throws(() => parseDateKey('2026-02-30'), error => error.code === 'INVALID_DATE');
  assert.throws(() => createListWhere({ dateFrom: '2026-08-10', dateTo: '2026-08-01' }), error => error.code === 'INVALID_DATE_RANGE');

  let received; const service = { admin: async query => { received = query; return { items: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 1 } }; } };
  const response = await request(makeApp('SUPER_ADMIN', service, true)).get('/api/admin/attendance?dateFrom=2026-08-01&dateTo=2026-08-10&teacherId=2&branchId=3&classId=4&isLate=false&status=PRESENT&page=2&limit=10');
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(received.isLate, false); assert.equal(received.page, 2);
});

test('attendance correction validates timestamps, reason and status combinations', () => {
  assert.throws(() => validateCorrection({ checkInAt: now.toISOString(), checkOutAt: new Date(now.getTime() - 1000).toISOString(), status: 'PRESENT', isLate: false, reason: 'Fix' }), error => error.code === 'CHECK_OUT_BEFORE_CHECK_IN');
  assert.throws(() => validateCorrection({ checkInAt: now.toISOString(), checkOutAt: null, status: 'PRESENT', isLate: false, reason: 'Fix' }), error => error.code === 'INVALID_STATUS_COMBINATION');
  assert.throws(() => validateCorrection({ checkInAt: null, checkOutAt: null, status: 'ON_LEAVE', isLate: null, reason: ' ' }), error => error.code === 'CORRECTION_REASON_REQUIRED');
  assert.deepEqual(validateCorrection({ checkInAt: null, checkOutAt: null, status: 'ON_LEAVE', isLate: null, reason: 'Approved leave correction' }), { checkInAt: null, checkOutAt: null, status: 'ON_LEAVE', isLate: null });
});

test('correction atomically stores before/after history, audit and updated attendance', async () => {
  const original = { ...baseRecord, updatedAt: new Date('2026-08-10T03:02:00Z') };
  let current = original; let updateWhere; let correctionData; let auditData;
  const database = { teacherAttendance: {
    findUnique: async args => args.include ? { ...current, teacher: { id: 2n, name: 'Teacher' } } : current,
    updateMany: async args => { updateWhere = args.where; current = { ...current, ...args.data, updatedAt: new Date('2026-08-10T04:00:00Z') }; return { count: 1 }; },
  }, attendanceCorrection: { create: async args => { correctionData = args.data; return { id: 10n }; } }, auditLog: { create: async args => { auditData = args.data; } } };
  database.$transaction = async callback => callback(database);
  const values = { checkInAt: '2026-08-10T03:00:00.000Z', checkOutAt: '2026-08-10T09:00:00.000Z', status: 'PRESENT', isLate: false, reason: 'Correct register times' };
  const result = await createAttendanceService(database).correct('1', values, { userId: '1', role: 'SUPER_ADMIN' }, { ip: '127.0.0.1' });
  assert.equal(updateWhere.updatedAt, original.updatedAt); assert.equal(result.status, 'PRESENT');
  assert.deepEqual(correctionData.before, { checkInAt: now.toISOString(), checkOutAt: null, status: 'INCOMPLETE', isLate: true, lateMinutes: 0 });
  assert.deepEqual(correctionData.after, { checkInAt: values.checkInAt, checkOutAt: values.checkOutAt, status: 'PRESENT', isLate: false, lateMinutes: 0 });
  assert.equal(correctionData.reason, values.reason); assert.equal(correctionData.correctedById, 1n);
  assert.equal(auditData.action, 'ATTENDANCE_CORRECTED'); assert.equal(auditData.targetUserId, 2n);
  assert.equal(auditData.requestMetadata.attendanceId, '1'); assert.equal(auditData.requestMetadata.correctionId, '10');
});

test('correction preserves history on missing and concurrent-change failures', async () => {
  const missing = { teacherAttendance: { findUnique: async () => null } }; missing.$transaction = async callback => callback(missing);
  const values = { checkInAt: now.toISOString(), checkOutAt: new Date(now.getTime() + 1000).toISOString(), status: 'PRESENT', isLate: false, reason: 'Fix times' };
  await assert.rejects(() => createAttendanceService(missing).correct('99', values, { userId: '1' }, {}), error => error.code === 'ATTENDANCE_NOT_FOUND');
  const stale = { teacherAttendance: { findUnique: async () => baseRecord, updateMany: async () => ({ count: 0 }) } }; stale.$transaction = async callback => callback(stale);
  await assert.rejects(() => createAttendanceService(stale).correct('1', values, { userId: '1' }, {}), error => error.code === 'ATTENDANCE_CHANGED_RETRY');
});
