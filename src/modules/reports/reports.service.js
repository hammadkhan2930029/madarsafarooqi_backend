"use strict";
const { Prisma } = require("@prisma/client");
const { prisma } = require("../../config/database");
const { ApiError } = require("../../utils/ApiError");
const include = {
  teacher: {
    select: {
      id: true,
      name: true,
      loginId: true,
      role: true,
      teacherType: true,
    },
  },
  branch: { select: { id: true, name: true, code: true } },
  class: { select: { id: true, name: true } },
  lastEditedBy: { select: { id: true, name: true, loginId: true, role: true } },
  _count: { select: { editHistory: true } },
};
const dbDate = (value) => new Date(`${value}T00:00:00.000Z`);
const dateKey = (value) => value.toISOString().slice(0, 10);
const user = (value) => (value ? { ...value, id: String(value.id) } : null);
const serializeReport = (value) =>
  value
    ? {
        ...value,
        id: String(value.id),
        teacherId: String(value.teacherId),
        branchId: String(value.branchId),
        classId: String(value.classId),
        lastEditedById:
          value.lastEditedById == null ? null : String(value.lastEditedById),
        reportDate: dateKey(value.reportDate),
        originalReportDate: dateKey(value.reportDate),
        periodStart: dateKey(value.periodStart),
        periodEnd: dateKey(value.periodEnd),
        teacher: user(value.teacher),
        originalCreator: user(value.teacher),
        lastEditedBy: user(value.lastEditedBy),
        branch: value.branch
          ? { ...value.branch, id: String(value.branch.id) }
          : undefined,
        class: value.class
          ? { ...value.class, id: String(value.class.id) }
          : undefined,
        editHistoryCount: value._count?.editHistory ?? 0,
      }
    : null;
const validatePeriod = (input) => {
  const reportDate = dbDate(input.reportDate),
    start = dbDate(input.periodStart),
    end = dbDate(input.periodEnd);
  if (
    [reportDate, start, end].some((value) => Number.isNaN(value.getTime())) ||
    start > end ||
    reportDate < start ||
    reportDate > end
  )
    throw new ApiError(
      422,
      "INVALID_REPORT_PERIOD",
      "Report period is invalid.",
    );
  if (
    input.reportType === "DAILY" &&
    (start.getTime() !== reportDate.getTime() ||
      end.getTime() !== reportDate.getTime())
  )
    throw new ApiError(
      422,
      "INVALID_REPORT_PERIOD",
      "Daily report must cover one day.",
    );
  if (
    input.reportType === "WEEKLY" &&
    (start.getUTCDay() !== 1 ||
      end.getUTCDay() !== 0 ||
      (end - start) / 86400000 !== 6)
  )
    throw new ApiError(
      422,
      "INVALID_REPORT_PERIOD",
      "Weekly report must cover Monday through Sunday.",
    );
  if (
    input.reportType === "MONTHLY" &&
    (start.getUTCDate() !== 1 ||
      end.getUTCMonth() !== start.getUTCMonth() ||
      end.getUTCFullYear() !== start.getUTCFullYear() ||
      new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
      ).getUTCDate() !== end.getUTCDate())
  )
    throw new ApiError(
      422,
      "INVALID_REPORT_PERIOD",
      "Monthly report must cover a calendar month.",
    );
  return { reportDate, periodStart: start, periodEnd: end };
};
const isoWeekRange = (value) => {
  const match = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]),
    week = Number(match[2]),
    jan4 = new Date(Date.UTC(year, 0, 4)),
    start = new Date(jan4);
  start.setUTCDate(
    jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (week - 1) * 7,
  );
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
};
const listWhere = (query, teacherId) => {
  const week = query.week ? isoWeekRange(query.week) : null,
    dateFrom = week?.start || (query.dateFrom ? dbDate(query.dateFrom) : null),
    dateTo = week?.end || (query.dateTo ? dbDate(query.dateTo) : null),
    search = query.search?.trim();
  return {
    ...(teacherId ? { teacherId: BigInt(teacherId) } : {}),
    ...(query.teacherId ? { teacherId: BigInt(query.teacherId) } : {}),
    ...(query.branchId ? { branchId: BigInt(query.branchId) } : {}),
    ...(query.classId ? { classId: BigInt(query.classId) } : {}),
    ...(query.reportType ? { reportType: query.reportType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { teacher: { teacherType: query.role } } : {}),
    ...(search
      ? {
          OR: [
            { teacher: { is: { name: { contains: search } } } },
            { teacher: { is: { loginId: { contains: search } } } },
            { branch: { is: { name: { contains: search } } } },
            { class: { is: { name: { contains: search } } } },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          reportDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };
};
const createReportService = (database, options = {}) => {
  const now = options.now || (() => new Date());
  const list = async (query, teacherId) => {
    const where = listWhere(query, teacherId),
      skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.teacherReport.findMany({
        where,
        include,
        orderBy: [{ reportDate: "desc" }, { submittedAt: "desc" }],
        skip,
        take: query.limit,
      }),
      database.teacherReport.count({ where }),
    ]);
    return {
      items: items.map(serializeReport),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  };
  const find = async (db, id, teacherId) => {
    const value = await db.teacherReport.findFirst({
      where: {
        id: BigInt(id),
        ...(teacherId ? { teacherId: BigInt(teacherId) } : {}),
      },
      include,
    });
    if (!value)
      throw new ApiError(404, "REPORT_NOT_FOUND", "Report was not found.");
    return value;
  };
  return {
    async create(teacherId, input) {
      const period = validatePeriod(input),
        teacher = await database.user.findFirst({
          where: { id: BigInt(teacherId), role: "TEACHER", status: "ACTIVE" },
          select: {
            id: true,
            branchId: true,
            classId: true,
            teacherType: true,
          },
        });
      if (!teacher)
        throw new ApiError(
          404,
          "TEACHER_NOT_FOUND",
          "Staff member was not found.",
        );
      if (teacher.teacherType === "SUPERVISOR" && input.reportType !== "WEEKLY")
        throw new ApiError(
          403,
          "SUPERVISOR_WEEKLY_REPORT_ONLY",
          "Supervisors may submit Weekly Reports only.",
        );
      if (!["TEACHER", "SUPERVISOR"].includes(teacher.teacherType))
        throw new ApiError(
          403,
          "REPORT_CREATION_NOT_ALLOWED",
          "This staff designation cannot submit reports.",
        );
      if (!teacher.branchId || !teacher.classId)
        throw new ApiError(
          409,
          "TEACHER_ASSIGNMENT_INCOMPLETE",
          "Staff member requires a branch and class assignment.",
        );
      const submittedAt = now();
      try {
        return serializeReport(
          await database.teacherReport.create({
            data: {
              teacherId: teacher.id,
              branchId: teacher.branchId,
              classId: teacher.classId,
              reportType: input.reportType,
              ...period,
              contentJson: input.contentJson,
              status: "SUBMITTED",
              submittedAt,
              editableUntil: new Date(submittedAt.getTime() + 3600000),
            },
            include,
          }),
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ApiError(
            409,
            "REPORT_ALREADY_EXISTS",
            "A report already exists for this period.",
          );
        throw error;
      }
    },
    mine: (teacherId, query) => list(query, teacherId),
    admin: (query) => list(query),
    async detail(id, teacherId) {
      return serializeReport(await find(database, id, teacherId));
    },
    async update(id, input, actor, requestMetadata = {}) {
      return database.$transaction(async (tx) => {
        const current = await find(
          tx,
          id,
          actor.role === "TEACHER" ? actor.userId : null,
        );
        if (!["TEACHER", "SUPER_ADMIN"].includes(actor.role))
          throw new ApiError(
            403,
            "FORBIDDEN",
            "You do not have permission to edit this report.",
          );
        if (actor.role === "TEACHER") {
          const designation = current.teacher?.teacherType;
          if (
            !["TEACHER", "SUPERVISOR"].includes(designation) ||
            (designation === "SUPERVISOR" && current.reportType !== "WEEKLY")
          )
            throw new ApiError(
              403,
              "REPORT_EDIT_NOT_ALLOWED",
              "Your staff designation cannot edit this report.",
            );
          if (now() >= current.editableUntil)
            throw new ApiError(
              409,
              "REPORT_EDIT_EXPIRED",
              "The report edit window has expired.",
            );
        }
        const editedAt = now(),
          editedById = BigInt(actor.userId);
        await tx.reportEditHistory.create({
          data: {
            reportId: current.id,
            originalContentJson: current.contentJson,
            updatedContentJson: input.contentJson,
            editedById,
            editedAt,
          },
        });
        const updated = await tx.teacherReport.update({
          where: { id: current.id },
          data: {
            contentJson: input.contentJson,
            lastEditedById: editedById,
            lastEditedAt: editedAt,
          },
          include,
        });
        if (actor.role === "SUPER_ADMIN")
          await tx.auditLog.create({
            data: {
              action: "REPORT_EDITED_BY_SUPER_ADMIN",
              targetUserId: current.teacherId,
              performedById: editedById,
              requestMetadata: {
                ...requestMetadata,
                reportId: String(current.id),
                originalCreatorId: String(current.teacherId),
                originalReportDate: dateKey(current.reportDate),
                reportType: current.reportType,
              },
            },
          });
        return serializeReport(updated);
      });
    },
    async history(id) {
      const report = await find(database, id);
      const items = await database.reportEditHistory.findMany({
        where: { reportId: BigInt(id) },
        include: {
          editedBy: {
            select: { id: true, name: true, loginId: true, role: true },
          },
        },
        orderBy: { editedAt: "desc" },
      });
      return items.map((item) => ({
        id: String(item.id),
        reportId: String(item.reportId),
        originalContentJson: item.originalContentJson,
        updatedContentJson: item.updatedContentJson,
        editedById: String(item.editedById),
        editedBy: user(item.editedBy),
        editedAt: item.editedAt,
        originalCreator: user(report.teacher),
        originalReportDate: dateKey(report.reportDate),
      }));
    },
    async export(query) {
      return (
        await database.teacherReport.findMany({
          where: listWhere(query),
          include,
          orderBy: { submittedAt: "desc" },
          take: 10000,
        })
      ).map(serializeReport);
    },
  };
};
const reportService = createReportService(prisma);
module.exports = {
  createReportService,
  isoWeekRange,
  listWhere,
  reportService,
  serializeReport,
  validatePeriod,
};
