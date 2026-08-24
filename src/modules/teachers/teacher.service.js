'use strict';

const { Prisma } = require('@prisma/client');

const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const { hashPassword, validatePasswordStrength } = require('../../utils/password');

const normalizeLoginId = value => String(value || '').trim().toLowerCase();
const teacherInclude = {
  branch: { select: { id: true, name: true, code: true, status: true } },
  class: { select: { id: true, name: true, status: true, branchId: true } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true, status: true } },
  supervisorBranches: { include: { branch: { select: { id: true, name: true, code: true, status: true } } } },
};
const serializeTeacher = teacher => ({
  id: String(teacher.id), name: teacher.name, loginId: teacher.loginId, email: teacher.email,
  contact: teacher.contact, role: teacher.role, teacherType: teacher.teacherType || 'TEACHER', branchId: String(teacher.branchId), classId: String(teacher.classId),
  shiftId: teacher.shiftId == null ? null : String(teacher.shiftId), timing: teacher.timing, baseSalary: teacher.baseSalary == null ? null : String(teacher.baseSalary),
  status: teacher.status, createdAt: teacher.createdAt, updatedAt: teacher.updatedAt,
  branch: teacher.branch ? { ...teacher.branch, id: String(teacher.branch.id) } : undefined,
  class: teacher.class ? { ...teacher.class, id: String(teacher.class.id), branchId: String(teacher.class.branchId) } : undefined,
  shift: teacher.shift ? { ...teacher.shift, id: String(teacher.shift.id), timing: `${teacher.shift.startTime}-${teacher.shift.endTime}` } : null,
  supervisorBranchIds: (teacher.supervisorBranches || []).map(item => String(item.branchId)),
  supervisorBranches: (teacher.supervisorBranches || []).map(item => ({ ...item.branch, id: String(item.branch.id) })),
});
const syncSupervisorBranches = async (database, teacher, branchIds, assignedById) => {
  const ids = [...new Set((branchIds || []).map(String))];
  if (teacher.teacherType === 'SUPERVISOR' && ids.length) {
    const count = await database.branch.count({ where: { id: { in: ids.map(BigInt) }, status: 'ACTIVE' } });
    if (count !== ids.length) throw new ApiError(422, 'INVALID_SUPERVISOR_BRANCH', 'Every Supervisor branch must exist and be active.');
  }
  await database.supervisorBranch.deleteMany({ where: { supervisorId: teacher.id } });
  if (teacher.teacherType === 'SUPERVISOR' && ids.length) await database.supervisorBranch.createMany({ data: ids.map(id => ({ supervisorId: teacher.id, branchId: BigInt(id), assignedById: BigInt(assignedById) })) });
};
const getTeacher = async (database, id) => {
  const teacher = await database.user.findFirst({ where: { id: BigInt(id), role: 'TEACHER' }, include: teacherInclude });
  if (!teacher) throw new ApiError(404, 'TEACHER_NOT_FOUND', 'Teacher was not found.');
  return teacher;
};
const requireActiveAssignment = async (database, branchId, classId) => {
  const [branch, classItem] = await Promise.all([
    database.branch.findUnique({ where: { id: BigInt(branchId) }, select: { id: true, status: true } }),
    database.class.findUnique({ where: { id: BigInt(classId) }, select: { id: true, branchId: true, status: true } }),
  ]);
  if (!branch) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Branch was not found.');
  if (!classItem) throw new ApiError(404, 'CLASS_NOT_FOUND', 'Class was not found.');
  if (branch.status !== 'ACTIVE') throw new ApiError(409, 'BRANCH_INACTIVE', 'An active branch is required.');
  if (classItem.status !== 'ACTIVE') throw new ApiError(409, 'CLASS_INACTIVE', 'An active class is required.');
  if (String(classItem.branchId) !== String(branch.id)) throw new ApiError(422, 'CLASS_BRANCH_MISMATCH', 'Class does not belong to the selected branch.');
};
const getActiveShift = async (database, shiftId) => {
  if (!shiftId) return null;
  const shift = await database.shift.findUnique({ where: { id: BigInt(shiftId) }, select: { id: true, startTime: true, endTime: true, status: true } });
  if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift was not found.');
  if (shift.status !== 'ACTIVE') throw new ApiError(409, 'SHIFT_INACTIVE', 'An active shift is required.');
  return shift;
};
const uniqueErrorCode = error => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = String(error.meta?.target || '').toLowerCase();
  return target.includes('email') ? 'TEACHER_EMAIL_EXISTS' : 'TEACHER_LOGIN_ID_EXISTS';
};

const createTeacherService = database => ({
  async list(query) {
    const where = { role: 'TEACHER' };
    if (query.branchId) where.branchId = BigInt(query.branchId);
    if (query.classId) where.classId = BigInt(query.classId);
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [
      { name: { contains: query.search } }, { loginId: { contains: normalizeLoginId(query.search) } },
      { email: { contains: query.search } }, { contact: { contains: query.search } },
    ];
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.user.findMany({ where, include: teacherInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      database.user.count({ where }),
    ]);
    return { items: items.map(serializeTeacher), pagination: {
      page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)),
    } };
  },
  async create(values, auth) {
    const passwordHash = await hashPassword(values.password);
    try {
      return await database.$transaction(async transaction => {
        await requireActiveAssignment(transaction, values.branchId, values.classId);
        const shift = await getActiveShift(transaction, values.shiftId);
        const teacher = await transaction.user.create({ data: {
          name: values.name.trim(), loginId: normalizeLoginId(values.loginId), email: values.email?.trim().toLowerCase() || null,
          contact: values.contact.trim(), passwordHash, role: 'TEACHER', teacherType: values.teacherType, branchId: BigInt(values.branchId),
          classId: BigInt(values.classId), shiftId: shift?.id || null, timing: shift ? `${shift.startTime}-${shift.endTime}` : values.timing.trim(), baseSalary: values.baseSalary,
        }, include: teacherInclude });
        if (teacher.teacherType === 'SUPERVISOR') await syncSupervisorBranches(transaction, teacher, values.supervisorBranchIds, auth.userId);
        return serializeTeacher(await getTeacher(transaction, teacher.id));
      });
    } catch (error) {
      const code = uniqueErrorCode(error);
      if (code) throw new ApiError(409, code, code === 'TEACHER_EMAIL_EXISTS' ? 'Email already exists.' : 'Login ID already exists.');
      throw error;
    }
  },
  async get(id) { return serializeTeacher(await getTeacher(database, id)); },
  async update(id, values, auth) {
    try {
      return await database.$transaction(async transaction => {
        const current = await getTeacher(transaction, id);
        const nextBranchId = values.branchId || String(current.branchId);
        const nextClassId = values.classId || String(current.classId);
        if (String(current.branchId) !== String(nextBranchId) || String(current.classId) !== String(nextClassId)) {
          await requireActiveAssignment(transaction, nextBranchId, nextClassId);
        }
        const shift = values.shiftId !== undefined ? await getActiveShift(transaction, values.shiftId) : null;
        const teacher = await transaction.user.update({ where: { id: BigInt(id) }, data: {
          ...(values.name !== undefined ? { name: values.name.trim() } : {}),
          ...(values.email !== undefined ? { email: values.email?.trim().toLowerCase() || null } : {}),
          ...(values.contact !== undefined ? { contact: values.contact.trim() } : {}),
          ...(values.teacherType !== undefined ? { teacherType: values.teacherType } : {}),
          ...(values.branchId !== undefined ? { branchId: BigInt(values.branchId) } : {}),
          ...(values.classId !== undefined ? { classId: BigInt(values.classId) } : {}),
          ...(values.shiftId !== undefined ? { shiftId: shift.id, timing: `${shift.startTime}-${shift.endTime}` } : values.timing !== undefined ? { timing: values.timing.trim() } : {}),
          ...(values.baseSalary !== undefined ? { baseSalary: values.baseSalary } : {}),
        }, include: teacherInclude });
        if (values.teacherType !== undefined || values.supervisorBranchIds !== undefined) await syncSupervisorBranches(transaction, teacher, values.supervisorBranchIds ?? (current.supervisorBranches || []).map(item => String(item.branchId)), auth.userId);
        return serializeTeacher(await getTeacher(transaction, id));
      });
    } catch (error) {
      const code = uniqueErrorCode(error);
      if (code) throw new ApiError(409, code, code === 'TEACHER_EMAIL_EXISTS' ? 'Email already exists.' : 'Login ID already exists.');
      throw error;
    }
  },
  async updateStatus(id, status) {
    return database.$transaction(async transaction => {
      await getTeacher(transaction, id);
      const teacher = await transaction.user.update({ where: { id: BigInt(id) }, data: {
        status, ...(status === 'INACTIVE' ? { tokenVersion: { increment: 1 } } : {}),
      }, include: teacherInclude });
      if (status === 'INACTIVE') await transaction.refreshToken.updateMany({ where: { userId: BigInt(id), revokedAt: null }, data: { revokedAt: new Date() } });
      return serializeTeacher(teacher);
    });
  },
  async resetPassword(id, values, auth, requestMetadata) {
    if (values.newPassword !== values.confirmPassword) {
      throw new ApiError(422, 'PASSWORDS_DO_NOT_MATCH', 'New password and confirmation do not match.');
    }
    const strengthError = validatePasswordStrength(values.newPassword);
    if (strengthError) throw new ApiError(422, 'WEAK_PASSWORD', strengthError);
    const teacher = await database.user.findFirst({
      where: { id: BigInt(id), role: 'TEACHER' }, select: { id: true },
    });
    if (!teacher) throw new ApiError(404, 'TEACHER_NOT_FOUND', 'Teacher was not found.');
    const passwordHash = await hashPassword(values.newPassword);
    await database.$transaction(async transaction => {
      await transaction.user.update({
        where: { id: teacher.id }, data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: teacher.id, revokedAt: null }, data: { revokedAt: new Date() },
      });
      await transaction.auditLog.create({ data: {
        action: 'TEACHER_PASSWORD_RESET', targetUserId: teacher.id,
        performedById: BigInt(auth.userId), requestMetadata,
      } });
    });
  },
});

const teacherService = createTeacherService(prisma);
module.exports = { createTeacherService, normalizeLoginId, serializeTeacher, teacherService };
