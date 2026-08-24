'use strict';

const { z } = require('zod');
const empty = z.object({}).passthrough().default({});
const id = z.string().regex(/^[1-9]\d*$/, 'Shift ID must be a positive integer.');
const time = z.string().trim().regex(/^(0?[1-9]|1[0-2]):[0-5]\d\s*(AM|PM)$/i, 'Time must use 02:00 PM format.');
const fields = { name: z.string().trim().min(2).max(150), startTime: time, endTime: time };
const validRange = value => {
  const minutes = input => { const match = input.toUpperCase().match(/(\d{1,2}):([0-5]\d)\s*(AM|PM)/); return (Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]); };
  return minutes(value.endTime) > minutes(value.startTime);
};
const listShiftsSchema = z.object({ body: empty, params: empty, query: z.object({ search: z.string().trim().max(150).optional().default(''), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), page: z.coerce.number().int().min(1).optional().default(1), limit: z.coerce.number().int().min(1).max(100).optional().default(20) }).strict() });
const createShiftSchema = z.object({ body: z.object(fields).strict().refine(validRange, 'End time must be after start time.'), params: empty, query: empty });
const updateShiftSchema = z.object({ body: z.object({ name: fields.name.optional(), startTime: time.optional(), endTime: time.optional() }).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.'), params: z.object({ id }), query: empty });
const getShiftSchema = z.object({ body: empty, params: z.object({ id }), query: empty });
const updateShiftStatusSchema = z.object({ body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict(), params: z.object({ id }), query: empty });
module.exports = { createShiftSchema, getShiftSchema, listShiftsSchema, updateShiftSchema, updateShiftStatusSchema };
