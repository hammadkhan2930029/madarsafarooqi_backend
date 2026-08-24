"use strict";
const { z } = require("zod");
const empty = z.object({}).strict().default({});
const deductionType = z.enum(["FIXED", "PERCENTAGE_OF_DAILY_RATE"]);
const workingDaysMode = z.enum(["CALENDAR_DAYS", "WEEKDAYS"]);
const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (value) =>
      /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value) <= 9999999999.99,
    "Enter a non-negative amount with at most two decimal places."
  );
const settingsBody = z
  .object({
    absentDeductionType: deductionType,
    absentDeductionValue: money,
    lateDeductionType: deductionType,
    lateDeductionValue: money,
    workingDaysMode,
    lateCountRule: z.coerce.number().int().min(1).max(365),
    lateGraceMinutes: z.coerce.number().int().min(0).max(180),
    minimumSalaryAllowed: money,
    timezone: z.string().trim().min(1).max(100),
    allowNegativeSalary: z.boolean().optional().default(false),
  })
  .strict();
const getSettingsSchema = z.object({
  body: empty,
  params: empty,
  query: empty,
});
const putSettingsSchema = z.object({
  body: settingsBody,
  params: empty,
  query: empty,
});
module.exports = { getSettingsSchema, putSettingsSchema };
