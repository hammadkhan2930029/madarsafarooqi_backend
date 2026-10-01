'use strict';
const { z } = require('zod');
const empty = z.object({}).passthrough().default({}); const request = body => z.object({ body, params: empty, query: empty });
const statusSchema = request(z.object({}).strict().default({}));
const uploadSchema = request(z.object({ fileName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(100), data: z.string().min(4).max(3000000) }).strict());
const completeSchema = request(z.object({ termsVersion: z.string().trim().min(1).max(50), answers: z.array(z.object({ conditionId: z.string().trim().min(1).max(100), answer: z.boolean() }).strict()).min(1).max(100) }).strict());
module.exports = { completeSchema, statusSchema, uploadSchema };
