'use strict';

const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');

const normalizeAdmissionNo = value => String(value || '').normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '');
const studentInclude = {
  branch: { select: { id: true, name: true, code: true, status: true } },
  class: { select: { id: true, name: true, branchId: true, status: true } },
};
const serializeStudent = student => ({
  id: String(student.id), admissionNo: student.admissionNo, name: student.name,
  fatherName: student.fatherName, contact: student.contact, branchId: String(student.branchId),
  classId: String(student.classId), status: student.status, createdById: String(student.createdById),
  createdAt: student.createdAt, updatedAt: student.updatedAt,
  branch: student.branch ? { ...student.branch, id: String(student.branch.id) } : undefined,
  class: student.class ? { ...student.class, id: String(student.class.id), branchId: String(student.class.branchId) } : undefined,
});
const getStudentRecord = async (database, id) => {
  const student = await database.student.findUnique({ where: { id: BigInt(id) }, include: studentInclude });
  if (!student) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student was not found.');
  return student;
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
const isAdmissionConflict = error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const createStudentService = database => ({
  async mine(userId, query) {
    const teacher = await database.user.findFirst({ where: { id: BigInt(userId), role: 'TEACHER', status: 'ACTIVE', teacherType: 'TEACHER' }, select: { classId: true } });
    if (!teacher?.classId) throw new ApiError(409, 'TEACHER_ASSIGNMENT_INCOMPLETE', 'Teacher requires a class assignment.');
    const where = { classId: teacher.classId, status: 'ACTIVE' };
    if (query.search) where.OR = [{ name: { contains: query.search } }, { admissionNo: { contains: normalizeAdmissionNo(query.search) } }];
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([database.student.findMany({ where, include: studentInclude, orderBy: { name: 'asc' }, skip, take: query.limit }), database.student.count({ where })]);
    return { items: items.map(serializeStudent), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } };
  },
  async list(query) {
    const where = {};
    if (query.branchId) where.branchId = BigInt(query.branchId);
    if (query.classId) where.classId = BigInt(query.classId);
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [{ name: { contains: query.search } }, { admissionNo: { contains: normalizeAdmissionNo(query.search) } }];
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.student.findMany({ where, include: studentInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      database.student.count({ where }),
    ]);
    return { items: items.map(serializeStudent), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } };
  },
  async create(values, auth) {
    try {
      return await database.$transaction(async transaction => {
        await requireActiveAssignment(transaction, values.branchId, values.classId);
        return serializeStudent(await transaction.student.create({ data: {
          admissionNo: normalizeAdmissionNo(values.admissionNo), name: values.name.trim(), fatherName: values.fatherName.trim(),
          contact: values.contact?.trim() || null, branchId: BigInt(values.branchId), classId: BigInt(values.classId),
          createdById: BigInt(auth.userId),
        }, include: studentInclude }));
      });
    } catch (error) {
      if (isAdmissionConflict(error)) throw new ApiError(409, 'ADMISSION_NO_EXISTS', 'Admission number already exists.');
      throw error;
    }
  },
  async get(id) { return serializeStudent(await getStudentRecord(database, id)); },
  async update(id, values) {
    return database.$transaction(async transaction => {
      const current = await getStudentRecord(transaction, id);
      const nextBranchId = values.branchId || String(current.branchId);
      const nextClassId = values.classId || String(current.classId);
      if (String(current.branchId) !== String(nextBranchId) || String(current.classId) !== String(nextClassId)) await requireActiveAssignment(transaction, nextBranchId, nextClassId);
      return serializeStudent(await transaction.student.update({ where: { id: BigInt(id) }, data: {
        ...(values.name !== undefined ? { name: values.name.trim() } : {}),
        ...(values.fatherName !== undefined ? { fatherName: values.fatherName.trim() } : {}),
        ...(values.contact !== undefined ? { contact: values.contact?.trim() || null } : {}),
        ...(values.branchId !== undefined ? { branchId: BigInt(values.branchId) } : {}),
        ...(values.classId !== undefined ? { classId: BigInt(values.classId) } : {}),
      }, include: studentInclude }));
    });
  },
  async updateStatus(id, status) {
    await getStudentRecord(database, id);
    return serializeStudent(await database.student.update({ where: { id: BigInt(id) }, data: { status }, include: studentInclude }));
  },
  async remove(id) {
    await getStudentRecord(database, id);
    return serializeStudent(await database.student.update({ where: { id: BigInt(id) }, data: { status: 'INACTIVE' }, include: studentInclude }));
  },
});

const studentService = createStudentService(prisma);
module.exports = { createStudentService, normalizeAdmissionNo, serializeStudent, studentService };
