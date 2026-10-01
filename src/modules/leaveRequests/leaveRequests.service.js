'use strict';

const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');

const include = { teacher: { select: { id: true, name: true, loginId: true, timing: true } }, branch: { select: { id: true, name: true, code: true } }, class: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true, loginId: true, role: true } } };
const dbDate = value => new Date(`${value}T00:00:00.000Z`);
const dateKey = value => value.toISOString().slice(0, 10);
const serialize = value => value ? { ...value, id: String(value.id), teacherId: String(value.teacherId), branchId: String(value.branchId), classId: String(value.classId), startDate: dateKey(value.startDate), endDate: dateKey(value.endDate), reviewedById: value.reviewedById == null ? null : String(value.reviewedById), teacher: value.teacher ? { ...value.teacher, id: String(value.teacher.id) } : undefined, branch: value.branch ? { ...value.branch, id: String(value.branch.id) } : undefined, class: value.class ? { ...value.class, id: String(value.class.id) } : undefined, reviewedBy: value.reviewedBy ? { ...value.reviewedBy, id: String(value.reviewedBy.id) } : undefined } : null;
const validateDates = (startValue, endValue) => { const startDate = dbDate(startValue), endDate = dbDate(endValue); if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || dateKey(startDate) !== startValue || dateKey(endDate) !== endValue) throw new ApiError(422, 'INVALID_LEAVE_DATE', 'Leave date is invalid.'); if (endDate < startDate) throw new ApiError(422, 'INVALID_LEAVE_RANGE', 'Leave end date cannot be before start date.'); if ((endDate - startDate) / 86400000 > 365) throw new ApiError(422, 'LEAVE_RANGE_TOO_LONG', 'Leave request cannot exceed 366 days.'); return { startDate, endDate }; };
const listWhere = (query, teacherId) => { const where = { ...(teacherId ? { teacherId: BigInt(teacherId) } : {}), ...(query.teacherId ? { teacherId: BigInt(query.teacherId) } : {}), ...(query.branchId ? { branchId: BigInt(query.branchId) } : {}), ...(query.classId ? { classId: BigInt(query.classId) } : {}), ...(query.status ? { status: query.status } : {}) }; if (query.dateFrom) where.endDate = { gte: dbDate(query.dateFrom) }; if (query.dateTo) where.startDate = { lte: dbDate(query.dateTo) }; return where; };
const days = (start, end) => { const result = []; for (let value = new Date(start); value <= end; value = new Date(value.getTime() + 86400000)) result.push(value); return result; };

const createLeaveRequestService = (database, options = {}) => {
  const now = options.now || (() => new Date());
  const list = async (query, teacherId) => { const where = listWhere(query, teacherId), skip = (query.page - 1) * query.limit; const [items, total] = await database.$transaction([database.leaveRequest.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take: query.limit }), database.leaveRequest.count({ where })]); return { items: items.map(serialize), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } }; };
  const find = async (id, teacherId) => { const value = await database.leaveRequest.findFirst({ where: { id: BigInt(id), ...(teacherId ? { teacherId: BigInt(teacherId) } : {}) }, include }); if (!value) throw new ApiError(404, 'LEAVE_REQUEST_NOT_FOUND', 'Leave request was not found.'); return value; };
  return {
    async create(teacherId, input) {
      const range = validateDates(input.startDate, input.endDate);
      return database.$transaction(async tx => {
        const teacher = await tx.user.findFirst({ where: { id: BigInt(teacherId), role: 'TEACHER', status: 'ACTIVE' }, select: { id: true, branchId: true, classId: true } });
        if (!teacher || !teacher.branchId || !teacher.classId) throw new ApiError(409, 'TEACHER_ASSIGNMENT_INCOMPLETE', 'Teacher requires a branch and class assignment.');
        const overlap = await tx.leaveRequest.findFirst({ where: { teacherId: teacher.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: range.endDate }, endDate: { gte: range.startDate } }, select: { id: true } });
        if (overlap) throw new ApiError(409, 'LEAVE_REQUEST_OVERLAP', 'An overlapping leave request already exists.');
        const created = await tx.leaveRequest.create({ data: { teacherId: teacher.id, branchId: teacher.branchId, classId: teacher.classId, ...range, reason: input.reason.trim(), status: 'PENDING' }, include });
        const admins = await tx.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } });
        if (admins.length) await tx.adminNotification.createMany({ data: admins.map(admin => ({ recipientUserId: admin.id, leaveRequestId: created.id })) });
        return serialize(created);
      }, { isolationLevel: 'Serializable' });
    },
    mine: (teacherId, query) => list(query, teacherId), admin: query => list(query),
    async detail(id, teacherId) { return serialize(await find(id, teacherId)); },
    async review(id, targetStatus, reviewerId, metadata = {}) {
      return database.$transaction(async tx => {
        const current = await tx.leaveRequest.findUnique({ where: { id: BigInt(id) }, include });
        if (!current) throw new ApiError(404, 'LEAVE_REQUEST_NOT_FOUND', 'Leave request was not found.');
        if (current.status === targetStatus) return serialize(current);
        if (current.status !== 'PENDING') throw new ApiError(409, 'LEAVE_REQUEST_ALREADY_REVIEWED', 'Leave request has already been reviewed.');
        const reviewedAt = now();
        const claimed = await tx.leaveRequest.updateMany({ where: { id: current.id, status: 'PENDING' }, data: { status: targetStatus, reviewedById: BigInt(reviewerId), reviewedAt } });
        if (claimed.count !== 1) throw new ApiError(409, 'LEAVE_REQUEST_ALREADY_REVIEWED', 'Leave request has already been reviewed.');
        await tx.adminNotification.deleteMany({ where: { leaveRequestId: current.id } });
        let conflicts = 0;
        if (targetStatus === 'APPROVED') for (const attendanceDate of days(current.startDate, current.endDate)) { const existing = await tx.teacherAttendance.findUnique({ where: { teacherId_attendanceDate: { teacherId: current.teacherId, attendanceDate } } }); if (existing && (existing.status === 'PRESENT' || existing.checkOutAt)) { conflicts += 1; continue; } const data = { branchId: current.branchId, classId: current.classId, timingSnapshot: current.teacher?.timing || null, checkInAt: null, checkOutAt: null, isLate: null, status: 'ON_LEAVE', leaveRequestId: current.id }; if (existing) await tx.teacherAttendance.update({ where: { id: existing.id }, data }); else await tx.teacherAttendance.create({ data: { teacherId: current.teacherId, attendanceDate, ...data } }); }
        await tx.auditLog.create({ data: { action: targetStatus === 'APPROVED' ? 'LEAVE_REQUEST_APPROVED' : 'LEAVE_REQUEST_REJECTED', targetUserId: current.teacherId, performedById: BigInt(reviewerId), requestMetadata: { ...metadata, leaveRequestId: String(current.id), startDate: dateKey(current.startDate), endDate: dateKey(current.endDate), attendanceConflicts: conflicts } } });
        return serialize(await tx.leaveRequest.findUnique({ where: { id: current.id }, include }));
      });
    },
  };
};

const leaveRequestService = createLeaveRequestService(prisma);
module.exports = { createLeaveRequestService, leaveRequestService, listWhere, serializeLeaveRequest: serialize, validateDates };
