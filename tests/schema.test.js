'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

test('contains all required Madarsa models and enums', () => {
  for (const name of ['User', 'RefreshToken', 'Branch', 'Class', 'Student',
    'TeacherAttendance', 'TeacherReport', 'LeaveRequest', 'PayrollSetting',
    'Salary', 'AttendanceCorrection', 'AuditLog']) {
    assert.match(schema, new RegExp(`model ${name} \\{`));
  }
  for (const name of ['UserRole', 'RecordStatus', 'AttendanceStatus', 'ReportType', 'LeaveStatus']) {
    assert.match(schema, new RegExp(`enum ${name} \\{`));
  }
});

test('defines required compound uniqueness constraints and decimal money', () => {
  assert.match(schema, /@@unique\(\[branchId, normalizedName\]\)/);
  assert.match(schema, /@@unique\(\[teacherId, attendanceDate\]\)/);
  assert.match(schema, /@@unique\(\[teacherId, month, year\]\)/);
  assert.match(schema, /@db\.Decimal\(12, 2\)/);
});
