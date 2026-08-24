'use strict';

const { Prisma } = require('@prisma/client');

const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');

const normalizeClassName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const classInclude = { branch: { select: { id: true, name: true, code: true, status: true } } };
const serializeClass = item => ({
  id: String(item.id), name: item.name, normalizedName: item.normalizedName,
  branchId: String(item.branchId), branch: item.branch ? { ...item.branch, id: String(item.branch.id) } : undefined,
  status: item.status, createdById: String(item.createdById), createdAt: item.createdAt, updatedAt: item.updatedAt,
});
const classScope = auth => auth.role === 'SUPER_ADMIN' ? {} : { teachers: { some: { id: BigInt(auth.userId) } } };
const duplicateClass = error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const getScopedClass = async (database, id, auth) => {
  const item = await database.class.findFirst({ where: { id: BigInt(id), ...classScope(auth) }, include: classInclude });
  if (!item) throw new ApiError(404, 'CLASS_NOT_FOUND', 'Class was not found.');
  return item;
};
const requireActiveBranch = async (database, id) => {
  const branch = await database.branch.findUnique({ where: { id: BigInt(id) }, select: { id: true, status: true } });
  if (!branch) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Branch was not found.');
  if (branch.status !== 'ACTIVE') throw new ApiError(409, 'BRANCH_INACTIVE', 'An active branch is required.');
};

const createClassService = database => ({
  async list(query, auth) {
    const where = { ...classScope(auth) };
    if (query.branchId) where.branchId = BigInt(query.branchId);
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [
      { name: { contains: query.search } },
      { branch: { name: { contains: query.search } } },
      { branch: { code: { contains: query.search } } },
    ];
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.class.findMany({ where, include: classInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      database.class.count({ where }),
    ]);
    return { items: items.map(serializeClass), pagination: {
      page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)),
    } };
  },
  async create(values, auth) {
    await requireActiveBranch(database, values.branchId);
    try {
      return serializeClass(await database.class.create({ data: {
        name: values.name.trim(), normalizedName: normalizeClassName(values.name), branchId: BigInt(values.branchId),
        createdById: BigInt(auth.userId),
      }, include: classInclude }));
    } catch (error) {
      if (duplicateClass(error)) throw new ApiError(409, 'CLASS_NAME_EXISTS', 'A class with this name already exists in the branch.');
      throw error;
    }
  },
  async get(id, auth) { return serializeClass(await getScopedClass(database, id, auth)); },
  async update(id, values, auth) {
    const current = await getScopedClass(database, id, auth);
    const nextBranchId = values.branchId || String(current.branchId);
    if (String(current.branchId) !== String(nextBranchId)) await requireActiveBranch(database, nextBranchId);
    try {
      return serializeClass(await database.class.update({ where: { id: BigInt(id) }, data: {
        ...(values.name !== undefined ? { name: values.name.trim(), normalizedName: normalizeClassName(values.name) } : {}),
        ...(values.branchId !== undefined ? { branchId: BigInt(values.branchId) } : {}),
      }, include: classInclude }));
    } catch (error) {
      if (duplicateClass(error)) throw new ApiError(409, 'CLASS_NAME_EXISTS', 'A class with this name already exists in the branch.');
      throw error;
    }
  },
  async updateStatus(id, status, auth) {
    await getScopedClass(database, id, auth);
    return serializeClass(await database.class.update({ where: { id: BigInt(id) }, data: { status }, include: classInclude }));
  },
});

const classService = createClassService(prisma);
module.exports = { classService, createClassService, normalizeClassName, serializeClass };
