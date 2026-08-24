'use strict';

const { z } = require('zod');
const empty = z.object({}).strict().default({});
const positiveId = label => z.string().regex(/^[1-9]\d*$/, `${label} must be a positive integer.`);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');
const status = z.enum(['PRESENT', 'INCOMPLETE', 'ON_LEAVE']);
const late = z.enum(['true', 'false']).transform(value => value === 'true');
const pagination = {
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
};
const actionSchema = z.object({ body: empty, params: empty, query: empty });
const todaySchema = actionSchema;
const myAttendanceSchema = z.object({ body: empty, params: empty, query: z.object({
  dateFrom: dateKey.optional(), dateTo: dateKey.optional(), status: status.optional(), isLate: late.optional(), ...pagination,
}).strict() });
const adminAttendanceSchema = z.object({ body: empty, params: empty, query: z.object({
  dateFrom: dateKey.optional(), dateTo: dateKey.optional(), teacherId: positiveId('Teacher ID').optional(),
  branchId: positiveId('Branch ID').optional(), classId: positiveId('Class ID').optional(),
  status: status.optional(), isLate: late.optional(), ...pagination,
}).strict() });
const attendanceIdParams = z.object({ attendanceId: positiveId('Attendance ID') });
const isoTimestamp = z.string().datetime({ offset: true }).nullable();
const correctAttendanceSchema = z.object({ body: z.object({
  checkInAt: isoTimestamp,
  checkOutAt: isoTimestamp,
  status: status,
  isLate: z.boolean().nullable(),
  reason: z.string().trim().min(1).max(500),
}).strict(), params: attendanceIdParams, query: empty });

module.exports = { actionSchema, adminAttendanceSchema, correctAttendanceSchema, myAttendanceSchema, todaySchema };
