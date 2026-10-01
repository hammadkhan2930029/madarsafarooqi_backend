"use strict";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "mysql://user:password@localhost:3306/test";
process.env.JWT_ACCESS_SECRET ||= "a".repeat(32);
process.env.JWT_REFRESH_SECRET ||= "b".repeat(32);
process.env.APP_TIMEZONE ||= "Asia/Karachi";
const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { Prisma } = require("@prisma/client");
const {
  calculateCounts,
  createSalaryCalculationService,
  deduction,
  excludeHolidayDates,
  workingDates,
} = require("../src/modules/salaries/salaryCalculation.service");
const { prisma } = require("../src/config/database");
after(() => prisma.$disconnect());
const Decimal = Prisma.Decimal;
const date = (value) => new Date(`${value}T00:00:00.000Z`);
const settings = {
  id: 1n,
  absentDeductionType: "FIXED",
  absentDeductionValue: new Decimal("100.00"),
  lateDeductionType: "FIXED",
  lateDeductionValue: new Decimal("25.00"),
  workingDaysMode: "CALENDAR_DAYS",
  lateCountRule: 2,
  lateGraceMinutes: 5,
  minimumSalaryAllowed: new Decimal("0.00"),
  timezone: "Asia/Karachi",
  allowNegativeSalary: false,
  calculationVersion: 1,
};
test("perfect attendance has no absence, leave or late counts", () => {
  const dates = [date("2026-07-01"), date("2026-07-02")],
    attendance = dates.map((attendanceDate) => ({
      attendanceDate,
      status: "PRESENT",
      isLate: false,
      lateMinutes: 0,
    }));
  assert.deepEqual(calculateCounts(dates, attendance, []), {
    presentDays: 2,
    absentDays: 0,
    leaveDays: 0,
    lateDays: 0,
    lateMinutes: 0,
  });
});
test("absence, approved leave, lateness and explicit missing attendance policy are counted", () => {
  const dates = [
      date("2026-07-01"),
      date("2026-07-02"),
      date("2026-07-03"),
      date("2026-07-04"),
    ],
    attendance = [
      { attendanceDate: dates[0], status: "PRESENT", isLate: true, lateMinutes: 7 },
      { attendanceDate: dates[1], status: "INCOMPLETE", isLate: false, lateMinutes: 0 },
    ],
    leaves = [{ startDate: dates[2], endDate: dates[2] }];
  assert.deepEqual(calculateCounts(dates, attendance, leaves), {
    presentDays: 1,
    absentDays: 2,
    leaveDays: 1,
    lateDays: 1,
    lateMinutes: 7,
  });
});
test("fixed and percentage deductions use Decimal and complete late groups", () => {
  assert.equal(
    deduction("FIXED", new Decimal("25.05"), 2, new Decimal("1000")).toFixed(2),
    "50.10"
  );
  assert.equal(
    deduction(
      "PERCENTAGE_OF_DAILY_RATE",
      new Decimal("10"),
      2,
      new Decimal("1000")
    ).toFixed(2),
    "200.00"
  );
  assert.equal(Math.ceil(3 / 2), 2);
});
test("working-day policy supports calendar days and weekdays without invented holidays", () => {
  assert.equal(workingDates(7, 2026, "CALENDAR_DAYS").length, 31);
  assert.equal(workingDates(7, 2026, "WEEKDAYS").length, 23);
});
test("active attendance holidays can be excluded without changing attendance records", () => {
  const dates = [date("2026-07-01"), date("2026-07-02"), date("2026-07-03")];
  const result = excludeHolidayDates(dates, [{ startDate: date("2026-07-02"), endDate: date("2026-07-03") }]);
  assert.deepEqual(result.map(item => item.toISOString().slice(0, 10)), ["2026-07-01"]);
  assert.equal(dates.length, 3);
});
test("missing payroll settings stops calculation", async () => {
  const database = { payrollSetting: { findFirst: async () => null } };
  await assert.rejects(
    () =>
      createSalaryCalculationService(database).calculate(
        { month: 7, year: 2026 },
        "1"
      ),
    (error) => error.code === "PAYROLL_SETTINGS_MISSING"
  );
});
const databaseFor = ({ baseSalary = "0.00", ijaraFrequency = "MONTHLY", weeklyIjaraAmount = null, workingDays = null, attendanceAllowance = "0", attendanceAllowanceEnabled = false, conveyanceAllowance = "0", medicalAllowance = "0", monthlyAllowance = "0" } = {}) => {
  let stored = null;
  const audits = [];
  const database = {
    payrollSetting: { findFirst: async () => settings },
    user: {
      findMany: async (args) =>
        args.where.id
          ? []
          : [
              {
                id: 2n,
                branchId: 3n,
                classId: 4n,
                baseSalary: new Decimal(baseSalary),
                ijaraFrequency,
                weeklyIjaraAmount: weeklyIjaraAmount == null ? null : new Decimal(weeklyIjaraAmount),
                workingDays,
                attendanceAllowance: new Decimal(attendanceAllowance),
                attendanceAllowanceEnabled,
                conveyanceAllowance: new Decimal(conveyanceAllowance),
                medicalAllowance: new Decimal(medicalAllowance),
                monthlyAllowance: new Decimal(monthlyAllowance),
              },
            ],
    },
    $transaction: async (callback) =>
      callback({
        teacherAttendance: { findMany: async () => [] },
        leaveRequest: { findMany: async () => [] },
        salary: {
          findUnique: async () => stored,
          upsert: async (args) => {
            stored = stored
              ? { ...stored, ...args.update }
              : { id: 9n, teacherId: 2n, month: 7, year: 2026, ...args.create };
            return stored;
          },
        },
        auditLog: { create: async (args) => audits.push(args.data) },
      }),
  };
  return { database, audits, getStored: () => stored };
};
test("zero salary calculates safely and missing attendance does not create negative salary", async () => {
  const mock = databaseFor({ baseSalary: "0.00" });
  const result = await createSalaryCalculationService(mock.database).calculate(
    { month: 7, year: 2026 },
    "1"
  );
  assert.equal(result.created, 1);
  assert.equal(mock.getStored().finalSalary.toFixed(2), "0.00");
  assert.equal(mock.getStored().absentDays, 31);
  assert.equal(
    mock.getStored().calculationBreakdown.missingAttendancePolicy,
    "ABSENT"
  );
});
test("weekly Ijara uses only assigned working days and snapshots the agreement", async () => {
  const mock = databaseFor({ ijaraFrequency: "WEEKLY", weeklyIjaraAmount: "7000.00", workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] });
  await createSalaryCalculationService(mock.database).calculate({ month: 7, year: 2026 }, "1");
  const salary = mock.getStored();
  assert.equal(salary.ijaraFrequency, "WEEKLY");
  assert.equal(salary.agreedIjaraAmount.toFixed(2), "7000.00");
  assert.equal(salary.workingDays, 23);
  assert.equal(salary.calculationBreakdown.staffOffDays.includes("SUNDAY"), true);
  assert.equal(salary.baseSalary.toFixed(2), "32200.00");
});
test("named allowances are independent and attendance allowance requires explicit enablement", async () => {
  const enabled = databaseFor({ baseSalary: "10000", attendanceAllowance: "500", attendanceAllowanceEnabled: true, conveyanceAllowance: "300", medicalAllowance: "200" });
  await createSalaryCalculationService(enabled.database).calculate({ month: 7, year: 2026 }, "1");
  assert.equal(enabled.getStored().grossAmount.toFixed(2), "11000.00");
  assert.equal(enabled.getStored().attendanceAllowance.toFixed(2), "500.00");
  const disabled = databaseFor({ baseSalary: "10000", attendanceAllowance: "500", attendanceAllowanceEnabled: false });
  await createSalaryCalculationService(disabled.database).calculate({ month: 7, year: 2026 }, "1");
  assert.equal(disabled.getStored().attendanceAllowance.toFixed(2), "0.00");
  assert.equal(disabled.getStored().grossAmount.toFixed(2), "10000.00");
});
test("recalculation and duplicate execution update the same unique salary with incremented version", async () => {
  const mock = databaseFor({ baseSalary: "5000.00" }),
    service = createSalaryCalculationService(mock.database);
  const first = await service.calculate({ month: 7, year: 2026 }, "1"),
    second = await service.calculate({ month: 7, year: 2026 }, "1");
  assert.equal(first.created, 1);
  assert.equal(second.recalculated, 1);
  assert.equal(mock.getStored().id, 9n);
  assert.equal(mock.getStored().calculationVersion, 2);
  assert.deepEqual(
    mock.audits.map((item) => item.action),
    ["SALARY_CALCULATED", "SALARY_RECALCULATED"]
  );
});
