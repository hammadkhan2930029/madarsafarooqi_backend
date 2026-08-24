'use strict';

const { z } = require('zod');

const empty = z.object({}).passthrough().default({});
const positiveId = message => z.string().regex(/^[1-9]\d*$/, message);
const idParams = z.object({ id: positiveId('Class ID must be a positive integer.') });
const name = z.string().trim().min(2).max(150);
const branchId = positiveId('Branch ID must be a positive integer.');

const listClassesSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    search: z.string().trim().max(150).optional().default(''),
    branchId: branchId.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }).strict(),
});
const createClassSchema = z.object({ body: z.object({ name, branchId }).strict(), params: empty, query: empty });
const getClassSchema = z.object({ body: empty, params: idParams, query: empty });
const updateClassSchema = z.object({
  body: z.object({ name: name.optional(), branchId: branchId.optional() }).strict()
    .refine(value => Object.keys(value).length > 0, 'At least one field is required.'),
  params: idParams, query: empty,
});
const updateClassStatusSchema = z.object({
  body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict(), params: idParams, query: empty,
});

module.exports = { createClassSchema, getClassSchema, listClassesSchema, updateClassSchema, updateClassStatusSchema };
