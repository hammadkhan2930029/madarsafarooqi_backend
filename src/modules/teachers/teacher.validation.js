'use strict';

const { z } = require('zod');

const empty = z.object({}).passthrough().default({});
const positiveId = label => z.string().regex(/^[1-9]\d*$/, `${label} must be a positive integer.`);
const idParams = z.object({ id: positiveId('Teacher ID') });
const teacherIdParams = z.object({ teacherId: positiveId('Teacher ID') });
const name = z.string().trim().min(2).max(150);
const loginId = z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9._-]+$/, 'Login ID contains invalid characters.');
const email = z.string().trim().email().max(191).nullable().optional();
const contact = z.string().trim().min(7).max(30).regex(/^\+?[0-9][0-9 -]{6,18}$/, 'Contact number is invalid.');
const password = z.string().min(8).max(128)
  .regex(/[a-z]/, 'Password requires a lowercase character.')
  .regex(/[A-Z]/, 'Password requires an uppercase character.')
  .regex(/[0-9]/, 'Password requires a number.');
const branchId = positiveId('Branch ID');
const classId = positiveId('Class ID');
const shiftId = positiveId('Shift ID');
const teacherType = z.enum(['TEACHER', 'SUPERVISOR']);
const supervisorBranchIds = z.array(branchId).max(100).optional().default([]);
const timing = z.string().trim().regex(/^(0?[1-9]|1[0-2]):[0-5]\d\s*(AM|PM)\s*-\s*(0?[1-9]|1[0-2]):[0-5]\d\s*(AM|PM)$/i, 'Timing must use 08:00 AM-02:00 PM.')
  .refine(value => {
    const values = [...value.toUpperCase().matchAll(/(\d{1,2}):([0-5]\d)\s*(AM|PM)/g)].map(match => (Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2])); const [start, end] = values;
    return end > start;
  }, 'Timing end must be after start.');
const salary = z.union([z.string().trim(), z.number()]).transform(value => String(value))
  .refine(value => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0 && Number(value) <= 9999999999.99,
    'Base salary must be a non-negative amount with at most two decimal places.');

const listTeachersSchema = z.object({ body: empty, params: empty, query: z.object({
  search: z.string().trim().max(150).optional().default(''),
  branchId: branchId.optional(), classId: classId.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict() });
const createTeacherSchema = z.object({ body: z.object({
  name, loginId, email, password, contact, teacherType, supervisorBranchIds, branchId, classId, shiftId: shiftId.optional(), timing, baseSalary: salary,
}).strict().refine(value => value.teacherType !== 'SUPERVISOR' || value.supervisorBranchIds.length > 0, 'A Supervisor requires at least one assigned branch.'), params: empty, query: empty });
const getTeacherSchema = z.object({ body: empty, params: idParams, query: empty });
const updateTeacherSchema = z.object({ body: z.object({
  name: name.optional(), email, contact: contact.optional(), teacherType: teacherType.optional(), supervisorBranchIds: z.array(branchId).max(100).optional(), branchId: branchId.optional(),
  classId: classId.optional(), shiftId: shiftId.optional(), timing: timing.optional(), baseSalary: salary.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.'), params: idParams, query: empty });
const updateTeacherStatusSchema = z.object({ body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict(), params: idParams, query: empty });
const resetTeacherPasswordSchema = z.object({ body: z.object({
  newPassword: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
}).strict(), params: teacherIdParams, query: empty });

module.exports = { createTeacherSchema, getTeacherSchema, listTeachersSchema, resetTeacherPasswordSchema, updateTeacherSchema, updateTeacherStatusSchema };
