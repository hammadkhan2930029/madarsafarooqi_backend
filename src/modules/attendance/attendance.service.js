'use strict';

const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/database');
const { env } = require('../../config/env');
const { ApiError } = require('../../utils/ApiError');
const { calculateLateMinutes, checkInAvailability, checkOutAvailability, dateKeyInTimeZone, dateKeyToDatabaseDate, parseDateKey, parseTiming } = require('./timezone');

const attendanceInclude = {
  teacher: { select: { id: true, name: true, loginId: true } },
  branch: { select: { id: true, name: true, code: true } },
  class: { select: { id: true, name: true } },
};
const serializeAttendance = record => record ? ({
  id: String(record.id), teacherId: String(record.teacherId), attendanceDate: record.attendanceDate.toISOString().slice(0, 10),
  branchId: record.branchId == null ? null : String(record.branchId), classId: record.classId == null ? null : String(record.classId), legacyFirebaseId: record.legacyFirebaseId || null, timingSnapshot: record.timingSnapshot,
  checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, isLate: record.isLate, lateMinutes: record.lateMinutes || 0, status: record.status,
  leaveRequestId: record.leaveRequestId == null ? null : String(record.leaveRequestId), createdAt: record.createdAt, updatedAt: record.updatedAt,
  teacher: record.teacher ? { ...record.teacher, id: String(record.teacher.id) } : undefined,
  branch: record.branch ? { ...record.branch, id: String(record.branch.id) } : undefined,
  class: record.class ? { ...record.class, id: String(record.class.id) } : undefined,
}) : null;
const isUniqueConflict = error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const requireTeacher = async (database, teacherId) => {
  const teacher = await database.user.findFirst({ where: { id: BigInt(teacherId), role: 'TEACHER', status: 'ACTIVE' }, select: {
    id: true, branchId: true, classId: true, timing: true,
  } });
  if (!teacher) throw new ApiError(404, 'TEACHER_NOT_FOUND', 'Teacher was not found.');
  if (!teacher.branchId || !teacher.classId) throw new ApiError(409, 'TEACHER_ASSIGNMENT_INCOMPLETE', 'Teacher requires a branch and class assignment.');
  return teacher;
};
const validateRange = query => {
  const dateFrom = query.dateFrom ? parseDateKey(query.dateFrom) : undefined;
  const dateTo = query.dateTo ? parseDateKey(query.dateTo) : undefined;
  if (dateFrom && dateTo && dateFrom > dateTo) throw new ApiError(422, 'INVALID_DATE_RANGE', 'Start date cannot be after end date.');
  return { dateFrom, dateTo };
};
const createListWhere = (query, teacherId) => {
  const { dateFrom, dateTo } = validateRange(query);
  const where = { ...(teacherId ? { teacherId: BigInt(teacherId) } : {}) };
  if (dateFrom || dateTo) where.attendanceDate = { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) };
  if (query.teacherId) where.teacherId = BigInt(query.teacherId);
  if (query.branchId) where.branchId = BigInt(query.branchId);
  if (query.classId) where.classId = BigInt(query.classId);
  if (query.status) where.status = query.status;
  if (query.isLate !== undefined) where.isLate = query.isLate;
  return where;
};
const correctionSnapshot = values => ({
  checkInAt: values.checkInAt ? new Date(values.checkInAt).toISOString() : null,
  checkOutAt: values.checkOutAt ? new Date(values.checkOutAt).toISOString() : null,
  status: values.status,
  isLate: values.isLate,
  lateMinutes: values.lateMinutes || 0,
});
const validateCorrection = values => {
  const checkInAt = values.checkInAt ? new Date(values.checkInAt) : null;
  const checkOutAt = values.checkOutAt ? new Date(values.checkOutAt) : null;
  if (!values.reason?.trim()) throw new ApiError(422, 'CORRECTION_REASON_REQUIRED', 'Correction reason is required.');
  if ((checkInAt && Number.isNaN(checkInAt.getTime())) || (checkOutAt && Number.isNaN(checkOutAt.getTime()))) {
    throw new ApiError(422, 'INVALID_TIMESTAMP', 'Correction timestamps are invalid.');
  }
  if (checkInAt && checkOutAt && checkOutAt < checkInAt) throw new ApiError(422, 'CHECK_OUT_BEFORE_CHECK_IN', 'Check-out cannot be before check-in.');
  if (values.status === 'PRESENT' && (!checkInAt || !checkOutAt || typeof values.isLate !== 'boolean')) {
    throw new ApiError(422, 'INVALID_STATUS_COMBINATION', 'Present attendance requires check-in, check-out and late status.');
  }
  if (values.status === 'INCOMPLETE' && (!checkInAt || checkOutAt)) {
    throw new ApiError(422, 'INVALID_STATUS_COMBINATION', 'Incomplete attendance requires check-in without check-out.');
  }
  if (values.status === 'ON_LEAVE' && (checkInAt || checkOutAt || values.isLate !== null)) {
    throw new ApiError(422, 'INVALID_STATUS_COMBINATION', 'On-leave attendance cannot contain times or late status.');
  }
  return { checkInAt, checkOutAt, status: values.status, isLate: values.isLate };
};

const createAttendanceService = (database, options = {}) => {
  const now = options.now || (() => new Date());
  const timeZone = options.timeZone || env.APP_TIMEZONE;
  const list = async (query, teacherId) => {
    const where = createListWhere(query, teacherId); const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.teacherAttendance.findMany({ where, include: attendanceInclude, orderBy: [{ attendanceDate: 'desc' }, { checkInAt: 'desc' }], skip, take: query.limit }),
      database.teacherAttendance.count({ where }),
    ]);
    return { items: items.map(serializeAttendance), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } };
  };
  const ensureLeaveRecord = async (transaction, teacher, attendanceDate) => {
    const leave = await transaction.leaveRequest.findFirst({ where: {
      teacherId: teacher.id, status: 'APPROVED', startDate: { lte: attendanceDate }, endDate: { gte: attendanceDate },
    }, select: { id: true, branchId: true, classId: true } });
    if (!leave) return null;
    return transaction.teacherAttendance.create({ data: {
      teacherId: teacher.id, attendanceDate, branchId: leave.branchId, classId: leave.classId,
      timingSnapshot: parseTiming(teacher.timing)?.normalized || null, checkInAt: null, checkOutAt: null,
      isLate: null, status: 'ON_LEAVE', leaveRequestId: leave.id,
    }, include: attendanceInclude });
  };
  return {
    async availability(teacherId) {
      const clock = now(); const teacher = await requireTeacher(database, teacherId);
      const settings = database.payrollSetting ? await database.payrollSetting.findFirst({ orderBy: { id: 'asc' }, select: { lateGraceMinutes: true } }) : null;
      return { ...checkInAvailability(clock, timeZone, teacher.timing, settings?.lateGraceMinutes || 0), ...checkOutAvailability(clock, timeZone, teacher.timing), serverTime: clock, graceMinutes: settings?.lateGraceMinutes || 0, openBeforeMinutes: 20, checkOutCloseAfterMinutes: 30 };
    },
    async checkIn(teacherId) {
      const clock = now(); const attendanceDate = dateKeyToDatabaseDate(dateKeyInTimeZone(clock, timeZone));
      try {
        const result = await database.$transaction(async transaction => {
          const teacher = await requireTeacher(transaction, teacherId);
          const existing = await transaction.teacherAttendance.findUnique({ where: { teacherId_attendanceDate: { teacherId: teacher.id, attendanceDate } }, include: attendanceInclude });
          if (existing) return { existing };
          const leaveRecord = await ensureLeaveRecord(transaction, teacher, attendanceDate);
          if (leaveRecord) return { leaveRecord };
          const timing = parseTiming(teacher.timing);
          if (!timing) throw new ApiError(409, 'MISSING_TIMING', 'Teacher attendance timing is not configured.');
          const settings = transaction.payrollSetting ? await transaction.payrollSetting.findFirst({ orderBy: { id: 'asc' }, select: { lateGraceMinutes: true } }) : null;
          const availability = checkInAvailability(clock, timeZone, teacher.timing, settings?.lateGraceMinutes || 0);
          if (!availability.canCheckIn) throw new ApiError(409, availability.reason, availability.reason === 'CHECK_IN_CLOSED' ? 'Check-in is closed after shift end time.' : 'Check-in opens 20 minutes before arrival time.', { opensInMinutes: availability.opensInMinutes, timing: availability.timing });
          const lateMinutes = calculateLateMinutes(clock, timeZone, teacher.timing, settings?.lateGraceMinutes || 0);
          return { created: await transaction.teacherAttendance.create({ data: {
            teacherId: teacher.id, attendanceDate, branchId: teacher.branchId, classId: teacher.classId,
            timingSnapshot: timing?.normalized || null, checkInAt: clock, checkOutAt: null,
            isLate: lateMinutes > 0, lateMinutes, status: 'INCOMPLETE', leaveRequestId: null,
          }, include: attendanceInclude }) };
        });
        if (result.leaveRecord || result.existing?.status === 'ON_LEAVE') throw new ApiError(409, 'TEACHER_ON_LEAVE', 'Teacher is on approved leave.');
        if (result.existing) throw new ApiError(409, 'ALREADY_CHECKED_IN', 'Teacher has already checked in today.');
        return serializeAttendance(result.created);
      } catch (error) {
        if (isUniqueConflict(error)) throw new ApiError(409, 'ALREADY_CHECKED_IN', 'Teacher has already checked in today.');
        throw error;
      }
    },
    async checkOut(teacherId) {
      const clock = now(); const attendanceDate = dateKeyToDatabaseDate(dateKeyInTimeZone(clock, timeZone));
      return database.$transaction(async transaction => {
        const teacher = await requireTeacher(transaction, teacherId);
        const existing = await transaction.teacherAttendance.findUnique({ where: { teacherId_attendanceDate: { teacherId: teacher.id, attendanceDate } } });
        if (!existing || !existing.checkInAt) throw new ApiError(409, 'CHECK_IN_REQUIRED', 'Check-in is required before check-out.');
        if (existing.checkOutAt) throw new ApiError(409, 'ALREADY_CHECKED_OUT', 'Teacher has already checked out today.');
        const checkOutWindow = checkOutAvailability(clock, timeZone, existing.timingSnapshot || teacher.timing);
        if (!checkOutWindow.canCheckOut) throw new ApiError(409, checkOutWindow.checkOutReason, 'Check-out closes 30 minutes after shift end time.');
        const updated = await transaction.teacherAttendance.updateMany({
          where: { id: existing.id, checkInAt: { not: null }, checkOutAt: null },
          data: { checkOutAt: clock, status: 'PRESENT' },
        });
        if (updated.count !== 1) throw new ApiError(409, 'ALREADY_CHECKED_OUT', 'Teacher has already checked out today.');
        return serializeAttendance(await transaction.teacherAttendance.findUnique({ where: { id: existing.id }, include: attendanceInclude }));
      });
    },
    async today(teacherId) {
      const clock = now(); const attendanceDate = dateKeyToDatabaseDate(dateKeyInTimeZone(clock, timeZone));
      const teacher = await requireTeacher(database, teacherId);
      let record = await database.teacherAttendance.findUnique({ where: { teacherId_attendanceDate: { teacherId: teacher.id, attendanceDate } }, include: attendanceInclude });
      if (!record) {
        try { record = await database.$transaction(transaction => ensureLeaveRecord(transaction, teacher, attendanceDate)); }
        catch (error) {
          if (!isUniqueConflict(error)) throw error;
          record = await database.teacherAttendance.findUnique({ where: { teacherId_attendanceDate: { teacherId: teacher.id, attendanceDate } }, include: attendanceInclude });
        }
      }
      return serializeAttendance(record);
    },
    async mine(teacherId, query) { return list(query, teacherId); },
    async admin(query) { return list(query); },
    async correct(attendanceId, values, auth, requestMetadata) {
      const corrected = validateCorrection(values);
      return database.$transaction(async transaction => {
        const current = await transaction.teacherAttendance.findUnique({ where: { id: BigInt(attendanceId) } });
        if (!current) throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Attendance record was not found.');
        const settings = transaction.payrollSetting ? await transaction.payrollSetting.findFirst({ orderBy: { id: 'asc' }, select: { lateGraceMinutes: true } }) : null;
        const lateMinutes = corrected.checkInAt && corrected.status !== 'ON_LEAVE'
          ? calculateLateMinutes(corrected.checkInAt, timeZone, current.timingSnapshot, settings?.lateGraceMinutes || 0) || 0
          : 0;
        corrected.lateMinutes = lateMinutes;
        corrected.isLate = corrected.status === 'ON_LEAVE' ? null : lateMinutes > 0;
        const before = correctionSnapshot(current);
        const after = correctionSnapshot(corrected);
        const changed = await transaction.teacherAttendance.updateMany({
          where: { id: current.id, updatedAt: current.updatedAt }, data: corrected,
        });
        if (changed.count !== 1) throw new ApiError(409, 'ATTENDANCE_CHANGED_RETRY', 'Attendance changed while editing. Reload and try again.');
        const correction = await transaction.attendanceCorrection.create({ data: {
          attendanceId: current.id, teacherId: current.teacherId, before, after,
          reason: values.reason.trim(), correctedById: BigInt(auth.userId),
        } });
        await transaction.auditLog.create({ data: {
          action: 'ATTENDANCE_CORRECTED', targetUserId: current.teacherId, performedById: BigInt(auth.userId),
          requestMetadata: { ...requestMetadata, attendanceId: String(current.id), correctionId: String(correction.id) },
        } });
        return serializeAttendance(await transaction.teacherAttendance.findUnique({ where: { id: current.id }, include: attendanceInclude }));
      });
    },
  };
};

const attendanceService = createAttendanceService(prisma);
module.exports = { attendanceService, correctionSnapshot, createAttendanceService, createListWhere, serializeAttendance, validateCorrection };
