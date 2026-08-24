"use strict";
const { Prisma } = require("@prisma/client");
const { prisma } = require("../../config/database");
const { ApiError } = require("../../utils/ApiError");
const validTimezone = (value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};
const money = (value) => new Prisma.Decimal(value);
const serialize = (value) =>
  value
    ? {
        id: String(value.id),
        absentDeductionType: value.absentDeductionType,
        absentDeductionValue: value.absentDeductionValue.toFixed(2),
        lateDeductionType: value.lateDeductionType,
        lateDeductionValue: value.lateDeductionValue.toFixed(2),
        workingDaysMode: value.workingDaysMode,
        lateCountRule: value.lateCountRule,
        lateGraceMinutes: value.lateGraceMinutes,
        minimumSalaryAllowed: value.minimumSalaryAllowed?.toFixed(2) ?? null,
        timezone: value.timezone,
        allowNegativeSalary: value.allowNegativeSalary,
        calculationVersion: value.calculationVersion,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      }
    : null;
const complete = (value) =>
  value &&
  value.lateCountRule != null &&
  value.minimumSalaryAllowed != null &&
  value.timezone;
const createPayrollService = (database) => ({
  async get() {
    const value = await database.payrollSetting.findFirst({
      orderBy: { id: "asc" },
    });
    if (!complete(value))
      throw new ApiError(
        409,
        "PAYROLL_SETTINGS_MISSING",
        "Complete payroll settings are required."
      );
    return serialize(value);
  },
  async put(input) {
    if (!validTimezone(input.timezone))
      throw new ApiError(
        422,
        "INVALID_TIMEZONE",
        "Timezone must be a valid IANA timezone."
      );
    const data = {
      absentDeductionType: input.absentDeductionType,
      absentDeductionValue: money(input.absentDeductionValue),
      lateDeductionType: input.lateDeductionType,
      lateDeductionValue: money(input.lateDeductionValue),
      workingDaysMode: input.workingDaysMode,
      lateCountRule: input.lateCountRule,
      lateGraceMinutes: input.lateGraceMinutes,
      minimumSalaryAllowed: money(input.minimumSalaryAllowed),
      timezone: input.timezone,
      allowNegativeSalary: input.allowNegativeSalary,
    };
    return database.$transaction(async (tx) => {
      const current = await tx.payrollSetting.findFirst({
        orderBy: { id: "asc" },
        select: { id: true },
      });
      const value = current
        ? await tx.payrollSetting.update({
            where: { id: current.id },
            data: { ...data, calculationVersion: { increment: 1 } },
          })
        : await tx.payrollSetting.create({ data });
      return serialize(value);
    });
  },
});
const payrollService = createPayrollService(prisma);
module.exports = {
  completePayrollSetting: complete,
  createPayrollService,
  payrollService,
  serializePayrollSetting: serialize,
  validTimezone,
};
