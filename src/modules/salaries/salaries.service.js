"use strict";
const { prisma } = require("../../config/database");
const { ApiError } = require("../../utils/ApiError");
const include = {
  teacher: { select: { id: true, name: true, loginId: true } },
  branch: { select: { id: true, name: true, code: true } },
  class: { select: { id: true, name: true } },
};
const decimal = (value) => value.toFixed(2);
const serialize = (value) =>
  value
    ? {
        id: String(value.id),
        teacherId: String(value.teacherId),
        branchId: String(value.branchId),
        classId: value.classId == null ? null : String(value.classId),
        month: value.month,
        year: value.year,
        baseSalary: decimal(value.baseSalary),
        ijaraFrequency: value.ijaraFrequency || 'MONTHLY',
        agreedIjaraAmount: value.agreedIjaraAmount == null ? decimal(value.baseSalary) : decimal(value.agreedIjaraAmount),
        allowance: value.allowance == null ? '0.00' : decimal(value.allowance),
        attendanceAllowance: value.attendanceAllowance == null ? '0.00' : decimal(value.attendanceAllowance),
        conveyanceAllowance: value.conveyanceAllowance == null ? '0.00' : decimal(value.conveyanceAllowance),
        medicalAllowance: value.medicalAllowance == null ? '0.00' : decimal(value.medicalAllowance),
        grossAmount: value.grossAmount == null ? decimal(value.baseSalary) : decimal(value.grossAmount),
        workingDays: value.workingDays,
        presentDays: value.presentDays,
        absentDays: value.absentDays,
        leaveDays: value.leaveDays,
        lateDays: value.lateDays,
        lateMinutes: value.lateMinutes,
        absentDeduction: decimal(value.absentDeduction),
        lateDeduction: decimal(value.lateDeduction),
        otherAdjustment: decimal(value.otherAdjustment),
        finalSalary: decimal(value.finalSalary),
        calculationVersion: value.calculationVersion,
        calculationBreakdown: value.calculationBreakdown,
        calculatedAt: value.calculatedAt,
        teacher: value.teacher
          ? { ...value.teacher, id: String(value.teacher.id) }
          : undefined,
        branch: value.branch
          ? { ...value.branch, id: String(value.branch.id) }
          : undefined,
        class: value.class
          ? { ...value.class, id: String(value.class.id) }
          : undefined,
      }
    : null;
const where = (query) => ({
  ...(query.month ? { month: query.month } : {}),
  ...(query.year ? { year: query.year } : {}),
  ...(query.teacherId ? { teacherId: BigInt(query.teacherId) } : {}),
  ...(query.branchId ? { branchId: BigInt(query.branchId) } : {}),
  ...(query.classId ? { classId: BigInt(query.classId) } : {}),
});
const createSalaryService = (database) => ({
  async list(query) {
    const filter = where(query);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.salary.findMany({
        where: filter,
        include,
        orderBy: [{ year: "desc" }, { month: "desc" }, { teacherId: "asc" }],
        skip,
        take: query.limit,
      }),
      database.salary.count({ where: filter }),
    ]);
    return {
      items: items.map(serialize),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  },
  async mine(userId, query) {
    const filter = { ...where(query), teacherId: BigInt(userId) };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.salary.findMany({
        where: filter,
        include,
        orderBy: [{ year: "desc" }, { month: "desc" }],
        skip,
        take: query.limit,
      }),
      database.salary.count({ where: filter }),
    ]);
    return {
      items: items.map(serialize),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  },
  async detail(id) {
    const value = await database.salary.findUnique({
      where: { id: BigInt(id) },
      include,
    });
    if (!value)
      throw new ApiError(
        404,
        "SALARY_NOT_FOUND",
        "Salary record was not found."
      );
    return serialize(value);
  },
});
const salaryService = createSalaryService(prisma);
module.exports = {
  createSalaryService,
  salaryService,
  serializeSalary: serialize,
};
