'use strict';

const { mkdir, writeFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { Prisma } = require('@prisma/client');

const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const { hashPassword, validatePasswordStrength } = require('../../utils/password');

const normalizeLoginId = value => String(value || '').trim().toLowerCase();
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const detectProfileImage = buffer => {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', extension: 'png' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  return null;
};
const teacherInclude = {
  branch: { select: { id: true, name: true, code: true, status: true } },
  class: { select: { id: true, name: true, status: true, branchId: true } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true, status: true } },
  supervisorBranches: { include: { branch: { select: { id: true, name: true, code: true, status: true } } } },
};
const serializeTeacher = teacher => ({
  id: String(teacher.id), name: teacher.name, loginId: teacher.loginId, email: teacher.email,
  contact: teacher.contact, role: teacher.role, teacherType: teacher.teacherType || 'TEACHER', branchId: teacher.branchId == null ? null : String(teacher.branchId), classId: teacher.classId == null ? null : String(teacher.classId),
  shiftId: teacher.shiftId == null ? null : String(teacher.shiftId), timing: teacher.timing, baseSalary: teacher.baseSalary == null ? null : String(teacher.baseSalary), ijaraFrequency: teacher.ijaraFrequency || 'MONTHLY', weeklyIjaraAmount: teacher.weeklyIjaraAmount == null ? null : String(teacher.weeklyIjaraAmount), monthlyAllowance: teacher.monthlyAllowance == null ? '0.00' : String(teacher.monthlyAllowance), attendanceAllowance: teacher.attendanceAllowance == null ? '0.00' : String(teacher.attendanceAllowance), attendanceAllowanceEnabled: Boolean(teacher.attendanceAllowanceEnabled), conveyanceAllowance: teacher.conveyanceAllowance == null ? '0.00' : String(teacher.conveyanceAllowance), medicalAllowance: teacher.medicalAllowance == null ? '0.00' : String(teacher.medicalAllowance),
  workingDays: teacher.workingDays || null, profileImageUrl: teacher.profileImageUrl || null, ijaraTerms: teacher.ijaraTerms || null, ijaraConditions: teacher.ijaraConditions || null, ijaraTermsVersion: teacher.ijaraTermsVersion || null, ijaraAcceptedAt: teacher.ijaraAcceptedAt || null, onboardingRequired: Boolean(teacher.onboardingRequired), onboardingCompletedAt: teacher.onboardingCompletedAt || null,
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
    classId ? database.class.findUnique({ where: { id: BigInt(classId) }, select: { id: true, branchId: true, status: true } }) : null,
  ]);
  if (!branch) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Branch was not found.');
  if (classId && !classItem) throw new ApiError(404, 'CLASS_NOT_FOUND', 'Class was not found.');
  if (branch.status !== 'ACTIVE') throw new ApiError(409, 'BRANCH_INACTIVE', 'An active branch is required.');
  if (classItem?.status !== undefined && classItem.status !== 'ACTIVE') throw new ApiError(409, 'CLASS_INACTIVE', 'An active class is required.');
  if (classItem && String(classItem.branchId) !== String(branch.id)) throw new ApiError(422, 'CLASS_BRANCH_MISMATCH', 'Class does not belong to the selected branch.');
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
    if (query.teacherType) where.teacherType = query.teacherType;
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
          classId: values.classId ? BigInt(values.classId) : null, shiftId: shift?.id || null, timing: shift ? `${shift.startTime}-${shift.endTime}` : values.timing.trim(), baseSalary: values.baseSalary || 0, ijaraFrequency: values.ijaraFrequency, weeklyIjaraAmount: values.ijaraFrequency === 'WEEKLY' ? values.weeklyIjaraAmount : null,
          monthlyAllowance: values.monthlyAllowance, attendanceAllowance: values.attendanceAllowance, attendanceAllowanceEnabled: values.attendanceAllowanceEnabled, conveyanceAllowance: values.conveyanceAllowance, medicalAllowance: values.medicalAllowance, workingDays: values.workingDays, profileImageUrl: null, ijaraTerms: values.ijaraTerms || null, ijaraConditions: values.ijaraConditions.map((text,index)=>({id:String(index+1),text})), ijaraTermsVersion: values.ijaraTermsVersion, onboardingRequired: true, onboardingCompletedAt: null,
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
  async uploadProfileImage(id, input) {
    await getTeacher(database, id);
    let buffer;
    try { buffer = Buffer.from(input.data, 'base64'); } catch { throw new ApiError(422, 'INVALID_PROFILE_IMAGE', 'Profile image data is invalid.'); }
    if (!buffer.length || buffer.length > MAX_PROFILE_IMAGE_BYTES) throw new ApiError(422, 'PROFILE_IMAGE_SIZE_INVALID', 'Profile image must not exceed 2 MB.');
    const detected = detectProfileImage(buffer);
    if (!detected || detected.mime !== input.mimeType) throw new ApiError(422, 'PROFILE_IMAGE_FORMAT_INVALID', 'Only valid JPEG, PNG and WebP images are allowed.');
    const directory = path.join(process.cwd(), 'uploads', 'profile-images');
    await mkdir(directory, { recursive: true });
    const profileImageUrl = `/uploads/profile-images/${randomUUID()}.${detected.extension}`;
    await writeFile(path.join(directory, path.basename(profileImageUrl)), buffer, { flag: 'wx' });
    return serializeTeacher(await database.user.update({ where: { id: BigInt(id) }, data: { profileImageUrl }, include: teacherInclude }));
  },
  async update(id, values, auth) {
    try {
      return await database.$transaction(async transaction => {
        const current = await getTeacher(transaction, id);
        const nextBranchId = values.branchId || String(current.branchId);
        const nextClassId = values.classId !== undefined ? values.classId : (current.classId == null ? null : String(current.classId));
        const nextFrequency = values.ijaraFrequency || current.ijaraFrequency || 'MONTHLY';
        const nextWeeklyAmount = values.weeklyIjaraAmount !== undefined ? values.weeklyIjaraAmount : current.weeklyIjaraAmount;
        const nextWorkingDays = values.workingDays !== undefined ? values.workingDays : current.workingDays;
        if (nextFrequency === 'WEEKLY' && (nextWeeklyAmount == null || !Array.isArray(nextWorkingDays) || !nextWorkingDays.length)) {
          throw new ApiError(422, 'WEEKLY_IJARA_CONFIGURATION_REQUIRED', 'Weekly Ijara amount and working days are required.');
        }
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
          ...(values.classId !== undefined ? { classId: values.classId ? BigInt(values.classId) : null } : {}),
          ...(values.shiftId !== undefined ? { shiftId: shift.id, timing: `${shift.startTime}-${shift.endTime}` } : values.timing !== undefined ? { timing: values.timing.trim() } : {}),
          ...(values.baseSalary !== undefined ? { baseSalary: values.baseSalary } : {}),
          ...(values.ijaraFrequency !== undefined ? { ijaraFrequency: values.ijaraFrequency, ...(values.ijaraFrequency === 'MONTHLY' ? { weeklyIjaraAmount: null } : {}) } : {}),
          ...(values.weeklyIjaraAmount !== undefined ? { weeklyIjaraAmount: values.weeklyIjaraAmount } : {}),
          ...(values.monthlyAllowance !== undefined ? { monthlyAllowance: values.monthlyAllowance } : {}),
          ...(values.attendanceAllowance !== undefined ? { attendanceAllowance: values.attendanceAllowance } : {}),
          ...(values.attendanceAllowanceEnabled !== undefined ? { attendanceAllowanceEnabled: values.attendanceAllowanceEnabled } : {}),
          ...(values.conveyanceAllowance !== undefined ? { conveyanceAllowance: values.conveyanceAllowance } : {}),
          ...(values.medicalAllowance !== undefined ? { medicalAllowance: values.medicalAllowance } : {}),
          ...(values.workingDays !== undefined ? { workingDays: values.workingDays } : {}),
          ...(values.profileImageUrl !== undefined ? { profileImageUrl: values.profileImageUrl || null } : {}),
          ...(values.ijaraTerms !== undefined ? { ijaraTerms: values.ijaraTerms || null, ijaraAcceptedAt: null } : {}),
          ...(values.ijaraConditions !== undefined ? { ijaraConditions: values.ijaraConditions.map((text,index)=>({id:String(index+1),text})), ijaraAcceptedAt: null, onboardingCompletedAt: null } : {}),
          ...(values.ijaraTermsVersion !== undefined ? { ijaraTermsVersion: values.ijaraTermsVersion || null, ijaraAcceptedAt: null, ...(current.onboardingRequired ? { onboardingCompletedAt: null } : {}) } : {}),
          ...(values.onboardingRequired !== undefined ? { onboardingRequired: values.onboardingRequired, onboardingCompletedAt: values.onboardingRequired ? null : new Date() } : {}),
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
