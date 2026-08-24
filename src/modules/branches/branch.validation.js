'use strict';

const { z } = require('zod');

const empty = z.object({}).passthrough().default({});
const idParams = z.object({ id: z.string().regex(/^[1-9]\d*$/, 'Branch ID must be a positive integer.') });
const contact = z.string().trim().max(30).regex(/^\+?[0-9][0-9 -]{6,18}$/, 'Contact number is invalid.').nullable().optional();
const className = z.string().trim().min(2).max(150);
const branchFields = {
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Branch code contains invalid characters.'),
  address: z.string().trim().min(5).max(500),
  contact,
};

const listBranchesSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    search: z.string().trim().max(150).optional().default(''),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }).strict(),
});
const createBranchSchema = z.object({
  body: z.object({ ...branchFields, classes: z.array(className).min(1).max(50) }).strict()
    .superRefine((value, context) => {
      const names = new Set();
      value.classes.forEach((name, index) => {
        const normalized = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
        if (names.has(normalized)) context.addIssue({ code: 'custom', path: ['classes', index], message: 'Class names must be unique within the branch.' });
        names.add(normalized);
      });
    }),
  params: empty,
  query: empty,
});
const getBranchSchema = z.object({ body: empty, params: idParams, query: empty });
const updateBranchSchema = z.object({
  body: z.object({ name: branchFields.name.optional(), address: branchFields.address.optional(), contact }).strict()
    .refine(value => Object.keys(value).length > 0, 'At least one field is required.'),
  params: idParams, query: empty,
});
const updateBranchStatusSchema = z.object({
  body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict(), params: idParams, query: empty,
});

module.exports = { createBranchSchema, getBranchSchema, listBranchesSchema, updateBranchSchema, updateBranchStatusSchema };
