'use strict';
const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const normalizeTime = value => value.trim().toUpperCase().replace(/\s+/g, ' ');
const timing = item => `${normalizeTime(item.startTime)}-${normalizeTime(item.endTime)}`;
const serialize = item => ({ ...item, id: String(item.id), createdById: String(item.createdById), timing: timing(item) });
const find = async (db, id) => { const item = await db.shift.findUnique({ where: { id: BigInt(id) } }); if (!item) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'Shift was not found.'); return item; };
const duplicate = error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const createShiftService = db => ({
  async list(query) { const where = {}; if (query.status) where.status = query.status; if (query.search) where.name = { contains: query.search }; const skip = (query.page - 1) * query.limit; const [items, total] = await db.$transaction([db.shift.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: query.limit }), db.shift.count({ where })]); return { items: items.map(serialize), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } }; },
  async get(id) { return serialize(await find(db, id)); },
  async create(values, auth) { try { return serialize(await db.shift.create({ data: { name: values.name.trim(), startTime: normalizeTime(values.startTime), endTime: normalizeTime(values.endTime), createdById: BigInt(auth.userId) } })); } catch (error) { if (duplicate(error)) throw new ApiError(409, 'SHIFT_NAME_EXISTS', 'Shift name already exists.'); throw error; } },
  async update(id, values) { const current = await find(db, id); const startTime = normalizeTime(values.startTime ?? current.startTime); const endTime = normalizeTime(values.endTime ?? current.endTime); const toMinutes = value => { const match = value.match(/(\d{1,2}):([0-5]\d)\s*(AM|PM)/); return (Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]); }; if (toMinutes(endTime) <= toMinutes(startTime)) throw new ApiError(422, 'INVALID_SHIFT_TIME', 'End time must be after start time.'); try { return serialize(await db.shift.update({ where: { id: current.id }, data: { ...(values.name !== undefined ? { name: values.name.trim() } : {}), startTime, endTime } })); } catch (error) { if (duplicate(error)) throw new ApiError(409, 'SHIFT_NAME_EXISTS', 'Shift name already exists.'); throw error; } },
  async updateStatus(id, status) { const current = await find(db, id); return serialize(await db.shift.update({ where: { id: current.id }, data: { status } })); },
});
const shiftService = createShiftService(prisma);
module.exports = { createShiftService, shiftService };
