'use strict';

const { z } = require('zod');

const emptyParams = z.object({}).passthrough();
const emptyQuery = z.object({}).passthrough();
const requestSchema = body => z.object({ body, params: emptyParams, query: emptyQuery });

const loginSchema = requestSchema(z.object({
  loginId: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
}).strict());

const refreshSchema = requestSchema(z.object({
  refreshToken: z.string().min(1),
}).strict());

const changePasswordSchema = requestSchema(z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
}).strict());
const acceptIjaraTermsSchema = requestSchema(z.object({ version: z.string().trim().max(50).nullable().optional() }).strict());

module.exports = { acceptIjaraTermsSchema, changePasswordSchema, loginSchema, refreshSchema };
