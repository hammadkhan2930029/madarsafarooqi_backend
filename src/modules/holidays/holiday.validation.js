'use strict';
const { z } = require('zod');
const empty = z.object({}).passthrough().default({});
const idParams = z.object({ id: z.string().regex(/^[1-9]\d*$/) });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Date must be a valid YYYY-MM-DD date.');
const fields = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  startDate: date,
  endDate: date,
  affectsAttendance: z.boolean(),
};
const queryBoolean = z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean());
const validRange = value => value.startDate === undefined || value.endDate === undefined || value.startDate <= value.endDate;
const listHolidaysSchema = z.object({ body: empty, params: empty, query: z.object({
  search: z.string().trim().max(200).optional().default(''), status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  affectsAttendance: queryBoolean.optional(), dateFrom: date.optional(), dateTo: date.optional(),
  page: z.coerce.number().int().min(1).optional().default(1), limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict().refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, 'Start date cannot be after end date.') });
const createHolidaySchema = z.object({ body: z.object(fields).strict().refine(validRange, 'Start date cannot be after end date.'), params: empty, query: empty });
const updateHolidaySchema = z.object({ body: z.object(Object.fromEntries(Object.entries(fields).map(([key, rule]) => [key, rule.optional()]))).strict()
  .refine(value => Object.keys(value).length > 0, 'At least one field is required.').refine(validRange, 'Start date cannot be after end date.'), params: idParams, query: empty });
const getHolidaySchema = z.object({ body: empty, params: idParams, query: empty });
const updateHolidayStatusSchema = z.object({ body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict(), params: idParams, query: empty });
module.exports = { createHolidaySchema, getHolidaySchema, listHolidaysSchema, updateHolidaySchema, updateHolidayStatusSchema };
