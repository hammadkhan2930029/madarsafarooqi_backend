'use strict';

const { prisma } = require('../../config/database');

const dateKey = value => value.toISOString().slice(0, 10);
const serialize = value => ({
  id: String(value.id),
  createdAt: value.createdAt,
  leaveRequest: {
    id: String(value.leaveRequest.id),
    teacherId: String(value.leaveRequest.teacherId),
    startDate: dateKey(value.leaveRequest.startDate),
    endDate: dateKey(value.leaveRequest.endDate),
    reason: value.leaveRequest.reason,
    teacher: { id: String(value.leaveRequest.teacher.id), name: value.leaveRequest.teacher.name },
    branch: { id: String(value.leaveRequest.branch.id), name: value.leaveRequest.branch.name },
  },
});

const include = { leaveRequest: { include: { teacher: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } } } };
const createAdminNotificationService = database => ({
  async list(userId) {
    const items = await database.adminNotification.findMany({ where: { recipientUserId: BigInt(userId) }, include, orderBy: { createdAt: 'desc' } });
    return items.map(serialize);
  },
});

const adminNotificationService = createAdminNotificationService(prisma);
module.exports = { adminNotificationService, createAdminNotificationService };
