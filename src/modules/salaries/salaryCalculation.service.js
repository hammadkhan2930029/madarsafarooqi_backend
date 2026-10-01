"use strict";
const { Prisma } = require("@prisma/client");
const { prisma } = require("../../config/database");
const { ApiError } = require("../../utils/ApiError");
const { completePayrollSetting } = require("../payroll/payroll.service");
const Decimal = Prisma.Decimal;
const POLICY_VERSION = 2;
const round = (value) =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const dateKey = (value) => value.toISOString().slice(0, 10);
const monthRange = (month, year) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 0)),
});
const workingDates = (month, year, mode) => {
  const { start, end } = monthRange(month, year),
    dates = [];
  for (
    let date = new Date(start);
    date <= end;
    date = new Date(date.getTime() + 86400000)
  ) {
    if (
      mode === "CALENDAR_DAYS" ||
      (mode === "WEEKDAYS" && date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
    )
      dates.push(date);
  }
  return dates;
};
const excludeHolidayDates = (dates, holidays = []) => {
  const excluded = new Set();
  for (const holiday of holidays) {
    for (let date = new Date(holiday.startDate); date <= holiday.endDate; date = new Date(date.getTime() + 86400000)) excluded.add(dateKey(date));
  }
  return dates.filter(date => !excluded.has(dateKey(date)));
};
const deduction = (type, value, count, dailyRate) => {
  if (type === "FIXED") return round(new Decimal(value).mul(count));
  if (type === "PERCENTAGE_OF_DAILY_RATE")
    return round(dailyRate.mul(value).div(100).mul(count));
  throw new ApiError(
    409,
    "PAYROLL_POLICY_UNSUPPORTED",
    "Payroll deduction policy is unsupported."
  );
};
const validatePolicy = (settings) => {
  if (
    !["CALENDAR_DAYS", "WEEKDAYS"].includes(settings.workingDaysMode) ||
    !["FIXED", "PERCENTAGE_OF_DAILY_RATE"].includes(
      settings.absentDeductionType
    ) ||
    !["FIXED", "PERCENTAGE_OF_DAILY_RATE"].includes(settings.lateDeductionType)
  )
    throw new ApiError(
      409,
      "PAYROLL_POLICY_UNSUPPORTED",
      "Payroll settings contain an unsupported policy."
    );
};
const calculateCounts = (dates, attendance, leaves) => {
  const attendanceByDate = new Map(
    attendance.map((item) => [dateKey(item.attendanceDate), item])
  );
  const leaveDates = new Set();
  for (const leave of leaves)
    for (
      let date = new Date(leave.startDate);
      date <= leave.endDate;
      date = new Date(date.getTime() + 86400000)
    )
      leaveDates.add(dateKey(date));
  let presentDays = 0,
    absentDays = 0,
    leaveDays = 0,
    lateDays = 0,
    lateMinutes = 0;
  for (const date of dates) {
    const key = dateKey(date),
      record = attendanceByDate.get(key);
    if (leaveDates.has(key)) {
      leaveDays += 1;
      continue;
    }
    if (record?.status === "PRESENT") {
      presentDays += 1;
      if (record.isLate === true) lateDays += 1;
      lateMinutes += record.lateMinutes || 0;
    } else absentDays += 1;
  }
  return { presentDays, absentDays, leaveDays, lateDays, lateMinutes };
};
const createSalaryCalculationService = (database, options = {}) => {
  const now = options.now || (() => new Date()),
    batchSize = options.batchSize || 100;
  return {
    async calculate({ month, year }, actorId) {
      const settings = await database.payrollSetting.findFirst({
        orderBy: { id: "asc" },
      });
      if (!completePayrollSetting(settings))
        throw new ApiError(
          409,
          "PAYROLL_SETTINGS_MISSING",
          "Complete payroll settings are required before salary calculation."
        );
      validatePolicy(settings);
      const range = monthRange(month, year);
      const holidays = database.holiday ? await database.holiday.findMany({ where: {
        status: 'ACTIVE', affectsAttendance: true, startDate: { lte: range.end }, endDate: { gte: range.start },
      }, select: { startDate: true, endDate: true } }) : [];
      const baseDates = workingDates(month, year, settings.workingDaysMode);
      const dates = excludeHolidayDates(baseDates, holidays);
      let cursor = null,
        processed = 0,
        created = 0,
        recalculated = 0,
        skipped = 0;
      do {
        const teachers = await database.user.findMany({
          where: {
            role: "TEACHER",
            status: "ACTIVE",
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: { id: true, branchId: true, classId: true, baseSalary: true, ijaraFrequency: true, weeklyIjaraAmount: true, monthlyAllowance: true, attendanceAllowance: true, attendanceAllowanceEnabled: true, conveyanceAllowance: true, medicalAllowance: true, workingDays: true, timing: true },
          orderBy: { id: "asc" },
          take: batchSize,
        });
        if (!teachers.length) break;
        for (const teacher of teachers) {
          const outcome = await database.$transaction(
            async (tx) => {
              if (
                !teacher.branchId ||
                (teacher.ijaraFrequency === 'WEEKLY'
                  ? teacher.weeklyIjaraAmount == null || !Array.isArray(teacher.workingDays) || !teacher.workingDays.length
                  : teacher.baseSalary == null)
              ) {
                await tx.auditLog.create({
                  data: {
                    action: "SALARY_CALCULATION_SKIPPED",
                    targetUserId: teacher.id,
                    performedById: BigInt(actorId),
                    requestMetadata: {
                      month,
                      year,
                      reason: "MISSING_ASSIGNMENT_OR_BASE_SALARY",
                    },
                  },
                });
                return "skipped";
              }
              const [attendance, leaves, existing] = await Promise.all([
                tx.teacherAttendance.findMany({
                  where: {
                    teacherId: teacher.id,
                    attendanceDate: { gte: range.start, lte: range.end },
                  },
                    select: { attendanceDate: true, status: true, isLate: true, lateMinutes: true },
                }),
                tx.leaveRequest.findMany({
                  where: {
                    teacherId: teacher.id,
                    status: "APPROVED",
                    startDate: { lte: range.end },
                    endDate: { gte: range.start },
                  },
                  select: { startDate: true, endDate: true },
                }),
                tx.salary.findUnique({
                  where: {
                    teacherId_month_year: {
                      teacherId: teacher.id,
                      month,
                      year,
                    },
                  },
                }),
              ]);
              const dayNames = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
              const staffDates = Array.isArray(teacher.workingDays) && teacher.workingDays.length ? dates.filter(date => teacher.workingDays.includes(dayNames[date.getUTCDay()])) : dates;
              const frequency = teacher.ijaraFrequency || 'MONTHLY',
                agreedAmount = new Decimal(frequency === 'WEEKLY' ? teacher.weeklyIjaraAmount : teacher.baseSalary),
                scheduledDaysPerWeek = Array.isArray(teacher.workingDays) ? teacher.workingDays.length : 0,
                base = frequency === 'WEEKLY' ? agreedAmount.div(scheduledDaysPerWeek).mul(staffDates.length) : agreedAmount,
                counts = calculateCounts(staffDates, attendance, leaves),
                allowance = new Decimal(teacher.monthlyAllowance || 0),
                attendanceAllowance = teacher.attendanceAllowanceEnabled ? new Decimal(teacher.attendanceAllowance || 0) : new Decimal(0),
                conveyanceAllowance = new Decimal(teacher.conveyanceAllowance || 0),
                medicalAllowance = new Decimal(teacher.medicalAllowance || 0),
                grossAmount = round(base.add(allowance).add(attendanceAllowance).add(conveyanceAllowance).add(medicalAllowance)),
                dailyRate = staffDates.length
                  ? base.div(staffDates.length)
                  : new Decimal(0),
                lateUnits = Math.ceil(counts.lateMinutes / settings.lateCountRule),
                absentDeduction = deduction(
                  settings.absentDeductionType,
                  settings.absentDeductionValue,
                  counts.absentDays,
                  dailyRate
                ),
                lateDeduction = deduction(
                  settings.lateDeductionType,
                  settings.lateDeductionValue,
                  lateUnits,
                  dailyRate
                ),
                otherAdjustment = existing?.otherAdjustment || new Decimal(0),
                raw = round(
                  grossAmount
                    .sub(absentDeduction)
                    .sub(lateDeduction)
                    .add(otherAdjustment)
                ),
                configuredFloor = new Decimal(settings.minimumSalaryAllowed),
                floor = settings.allowNegativeSalary
                  ? configuredFloor
                  : Decimal.max(configuredFloor, new Decimal(0)),
                finalSalary = Decimal.max(raw, floor),
                version = (existing?.calculationVersion || 0) + 1,
                breakdown = {
                  policyVersion: POLICY_VERSION,
                  settingsCalculationVersion: settings.calculationVersion,
                  workingDaysMode: settings.workingDaysMode,
                  ijaraFrequency: frequency,
                  agreedIjaraAmount: agreedAmount.toFixed(2),
                  attendanceAllowanceEnabled: Boolean(teacher.attendanceAllowanceEnabled),
                  attendanceAllowanceConfigured: new Decimal(teacher.attendanceAllowance || 0).toFixed(2),
                  staffWorkingDays: teacher.workingDays || null,
                  staffOffDays: dayNames.filter(day => !(teacher.workingDays || []).includes(day)),
                  timingSnapshot: teacher.timing || null,
                  missingAttendancePolicy: "ABSENT",
                  incompleteAttendancePolicy: "ABSENT",
                  approvedLeavePolicy: "NO_DEDUCTION",
                  holidayPolicy: "EXCLUDED_FROM_WORKING_DAYS",
                  holidayDaysExcluded: baseDates.length - dates.length,
                  absentDeductionType: settings.absentDeductionType,
                  absentDeductionValue:
                    settings.absentDeductionValue.toFixed(2),
                  lateDeductionType: settings.lateDeductionType,
                  lateDeductionValue: settings.lateDeductionValue.toFixed(2),
                  lateCountRule: settings.lateCountRule,
                  lateGraceMinutes: settings.lateGraceMinutes,
                  lateMinutes: counts.lateMinutes,
                  lateDeductionUnits: lateUnits,
                  dailyRate: round(dailyRate).toFixed(2),
                  rawSalary: raw.toFixed(2),
                  minimumSalaryAllowed: configuredFloor.toFixed(2),
                  allowNegativeSalary: settings.allowNegativeSalary,
                };
              const data = {
                branchId: teacher.branchId,
                classId: teacher.classId,
                baseSalary: base,
                ijaraFrequency: frequency,
                agreedIjaraAmount: agreedAmount,
                allowance,
                attendanceAllowance,
                conveyanceAllowance,
                medicalAllowance,
                grossAmount,
                workingDays: staffDates.length,
                ...counts,
                absentDeduction,
                lateDeduction,
                otherAdjustment,
                finalSalary,
                calculationVersion: version,
                calculationBreakdown: breakdown,
                calculatedAt: now(),
              };
              const salary = await tx.salary.upsert({
                where: {
                  teacherId_month_year: { teacherId: teacher.id, month, year },
                },
                create: { teacherId: teacher.id, month, year, ...data },
                update: data,
              });
              await tx.auditLog.create({
                data: {
                  action: existing
                    ? "SALARY_RECALCULATED"
                    : "SALARY_CALCULATED",
                  targetUserId: teacher.id,
                  performedById: BigInt(actorId),
                  requestMetadata: {
                    salaryId: String(salary.id),
                    month,
                    year,
                    calculationVersion: version,
                    finalSalary: finalSalary.toFixed(2),
                  },
                },
              });
              return existing ? "recalculated" : "created";
            },
            { isolationLevel: "Serializable" }
          );
          processed += 1;
          if (outcome === "created") created += 1;
          else if (outcome === "recalculated") recalculated += 1;
          else skipped += 1;
        }
        cursor = teachers[teachers.length - 1].id;
        if (teachers.length < batchSize) break;
      } while (true);
      return {
        month,
        year,
        processed,
        created,
        recalculated,
        skipped,
        policyVersion: POLICY_VERSION,
      };
    },
  };
};
const salaryCalculationService = createSalaryCalculationService(prisma);
module.exports = {
  POLICY_VERSION,
  calculateCounts,
  createSalaryCalculationService,
  deduction,
  excludeHolidayDates,
  monthRange,
  salaryCalculationService,
  workingDates,
};
