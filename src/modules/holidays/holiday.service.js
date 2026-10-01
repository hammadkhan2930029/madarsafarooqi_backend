'use strict';
const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const dbDate = value => new Date(`${value}T00:00:00.000Z`);
const includeCreator = { createdBy: { select: { id: true, name: true, loginId: true } } };
const serialize = item => ({ ...item, id: String(item.id), createdById: String(item.createdById),
  startDate: item.startDate.toISOString().slice(0, 10), endDate: item.endDate.toISOString().slice(0, 10),
  createdBy: item.createdBy ? { ...item.createdBy, id: String(item.createdBy.id) } : undefined });
const requireHoliday = async (database, id) => {
  const item = await database.holiday.findUnique({ where: { id: BigInt(id) }, include: includeCreator });
  if (!item) throw new ApiError(404, 'HOLIDAY_NOT_FOUND', 'Holiday was not found.');
  return item;
};
const createHolidayService = database => ({
  async list(query) {
    const where = {};
    if (query.search) where.OR = [{ title: { contains: query.search } }, { description: { contains: query.search } }];
    if (query.status) where.status = query.status;
    if (query.affectsAttendance !== undefined) where.affectsAttendance = query.affectsAttendance;
    if (query.dateFrom || query.dateTo) {
      if (query.dateTo) where.startDate = { lte: dbDate(query.dateTo) };
      if (query.dateFrom) where.endDate = { gte: dbDate(query.dateFrom) };
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await database.$transaction([
      database.holiday.findMany({ where, include: includeCreator, orderBy: [{ startDate: 'desc' }, { id: 'desc' }], skip, take: query.limit }),
      database.holiday.count({ where }),
    ]);
    return { items: items.map(serialize), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } };
  },
  async create(values, auth) {
    return serialize(await database.holiday.create({ data: { title: values.title.trim(), description: values.description?.trim() || null,
      startDate: dbDate(values.startDate), endDate: dbDate(values.endDate), affectsAttendance: values.affectsAttendance,
      createdById: BigInt(auth.userId) }, include: includeCreator }));
  },
  async get(id) { return serialize(await requireHoliday(database, id)); },
  async update(id, values) {
    const current = await requireHoliday(database, id);
    const startDate = values.startDate ? dbDate(values.startDate) : current.startDate;
    const endDate = values.endDate ? dbDate(values.endDate) : current.endDate;
    if (startDate > endDate) throw new ApiError(422, 'HOLIDAY_DATE_RANGE_INVALID', 'Start date cannot be after end date.');
    return serialize(await database.holiday.update({ where: { id: current.id }, data: {
      ...(values.title !== undefined ? { title: values.title.trim() } : {}),
      ...(values.description !== undefined ? { description: values.description?.trim() || null } : {}),
      ...(values.startDate !== undefined ? { startDate } : {}), ...(values.endDate !== undefined ? { endDate } : {}),
      ...(values.affectsAttendance !== undefined ? { affectsAttendance: values.affectsAttendance } : {}),
    }, include: includeCreator }));
  },
  async updateStatus(id, status) { const current = await requireHoliday(database, id); return serialize(await database.holiday.update({ where: { id: current.id }, data: { status }, include: includeCreator })); },
});
const holidayService = createHolidayService(prisma);
module.exports = { createHolidayService, holidayService };
