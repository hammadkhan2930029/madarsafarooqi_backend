'use strict';

const { Prisma } = require('@prisma/client');

const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');

const normalizeCode = value => String(value || '').trim().toUpperCase();
const normalizeClassName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const serializeBranch = branch => ({
  id: String(branch.id), name: branch.name, code: branch.code, address: branch.address,
  contact: branch.contact, status: branch.status, createdById: String(branch.createdById),
  createdAt: branch.createdAt, updatedAt: branch.updatedAt,
  classCount: branch._count?.classes ?? branch.classes?.length ?? 0,
  ...(branch.classes ? { classes: branch.classes.map(item => ({
    id: String(item.id), name: item.name, status: item.status,
  })) } : {}),
});
const listInclude = { _count: { select: { classes: true } } };
const detailInclude = { classes: { orderBy: { name: 'asc' }, select: { id: true, name: true, status: true } }, _count: { select: { classes: true } } };
const branchScope = auth => auth.role === 'SUPER_ADMIN'
  ? {}
  : { teachers: { some: { id: BigInt(auth.userId) } } };
const getScopedBranch = async (database, id, auth) => {
  const branch = await database.branch.findFirst({ where: { id: BigInt(id), ...branchScope(auth) }, include: detailInclude });
  if (!branch) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Branch was not found.');
  return branch;
};
const duplicateCode = error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const createBranchService = database => ({
  async list(query, auth) {
    const where = { ...branchScope(auth) };
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [
      { name: { contains: query.search } }, { code: { contains: normalizeCode(query.search) } },
      { address: { contains: query.search } }, { contact: { contains: query.search } },
    ];
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.branch.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      database.branch.count({ where }),
    ]);
    return { items: items.map(serializeBranch), pagination: {
      page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)),
    } };
  },
  async create(values, auth) {
    try {
      return await database.$transaction(async transaction => {
        const branch = await transaction.branch.create({ data: {
          name: values.name.trim(), code: normalizeCode(values.code), address: values.address.trim(),
          contact: values.contact?.trim() || null, createdById: BigInt(auth.userId),
        } });
        await transaction.class.createMany({ data: values.classes.map(name => ({
          name: name.trim(), normalizedName: normalizeClassName(name), branchId: branch.id,
          createdById: BigInt(auth.userId),
        })) });
        return serializeBranch(await transaction.branch.findUnique({ where: { id: branch.id }, include: detailInclude }));
      });
    } catch (error) {
      if (duplicateCode(error)) {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '');
        if (target.includes('normalized_name') || target.includes('branch_id')) {
          throw new ApiError(409, 'CLASS_NAME_EXISTS', 'A class with this name already exists in the branch.');
        }
        throw new ApiError(409, 'BRANCH_CODE_EXISTS', 'Branch code already exists.');
      }
      throw error;
    }
  },
  async get(id, auth) { return serializeBranch(await getScopedBranch(database, id, auth)); },
  async update(id, values, auth) {
    await getScopedBranch(database, id, auth);
    return serializeBranch(await database.branch.update({ where: { id: BigInt(id) }, data: {
      ...(values.name !== undefined ? { name: values.name.trim() } : {}),
      ...(values.address !== undefined ? { address: values.address.trim() } : {}),
      ...(values.contact !== undefined ? { contact: values.contact?.trim() || null } : {}),
    } }));
  },
  async updateStatus(id, status, auth) {
    await getScopedBranch(database, id, auth);
    return serializeBranch(await database.branch.update({ where: { id: BigInt(id) }, data: { status } }));
  },
});

const branchService = createBranchService(prisma);
module.exports = { branchService, createBranchService, normalizeCode, serializeBranch };
