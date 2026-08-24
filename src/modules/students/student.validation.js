'use strict';

const { z } = require('zod');
const empty = z.object({}).passthrough().default({});
const positiveId = label => z.string().regex(/^[1-9]\d*$/, `${label} must be a positive integer.`);
const idParams = z.object({ id: positiveId('Student ID') });
const admissionNo = z.string().trim().min(2).max(60).refine(value => /^[A-Za-z0-9/_\s-]+$/.test(value), 'Admission number contains invalid characters.');
const name = z.string().trim().min(2).max(150);
const fatherName = z.string().trim().min(2).max(150);
const contact = z.string().trim().max(30).nullable().optional().refine(value => !value || /^\+?[0-9][0-9 -]{6,18}$/.test(value), 'Contact number is invalid.');
const branchId = positiveId('Branch ID');
const classId = positiveId('Class ID');

const listStudentsSchema = z.object({ body: empty, params: empty, query: z.object({
  search: z.string().trim().max(150).optional().default(''),
  branchId: branchId.optional(), classId: classId.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict() });
const myStudentsSchema = z.object({ body: empty, params: empty, query: z.object({
  search: z.string().trim().max(150).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict() });
const createStudentSchema = z.object({ body: z.object({ admissionNo, name, fatherName, contact, branchId, classId }).strict(), params: empty, query: empty });
const getStudentSchema = z.object({ body: empty, params: idParams, query: empty });
const updateStudentSchema = z.object({ body: z.object({ name: name.optional(), fatherName: fatherName.optional(), contact, branchId: branchId.optional(), classId: classId.optional() }).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.'), params: idParams, query: empty });
const updateStudentStatusSchema = z.object({ body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict(), params: idParams, query: empty });
const deleteStudentSchema = z.object({ body: empty, params: idParams, query: empty });

module.exports = { createStudentSchema, deleteStudentSchema, getStudentSchema, listStudentsSchema, myStudentsSchema, updateStudentSchema, updateStudentStatusSchema };
