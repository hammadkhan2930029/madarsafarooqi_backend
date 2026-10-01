'use strict';

const cors = require('cors');
const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const morgan = require('morgan');

const { env } = require('./config/env');
const { ApiError } = require('./utils/ApiError');
const { sendSuccess } = require('./utils/response');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const { createAuthRouter } = require('./modules/auth');
const { createBranchRouter } = require('./modules/branches');
const { createClassRouter } = require('./modules/classes');
const { createShiftRouter } = require('./modules/shifts');
const { createTeacherRouter } = require('./modules/teachers');
const { createStudentRouter } = require('./modules/students');
const { createAdminAttendanceRouter, createAttendanceRouter } = require('./modules/attendance');
const { createAdminReportRouter, createReportRouter } = require('./modules/reports');
const { createAdminLeaveRequestRouter, createLeaveRequestRouter } = require('./modules/leaveRequests');
const { createPayrollRouter } = require('./modules/payroll');
const { createSalaryRouter } = require('./modules/salaries');
const { createMySalaryRouter } = require('./modules/salaries/mySalaries.routes');
const { createSupervisorInspectionRouter } = require('./modules/supervisorInspections');
const { createHolidayRouter } = require('./modules/holidays');
const { createAdminNotificationRouter } = require('./modules/adminNotifications');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new ApiError(403, 'CORS_DENIED', 'Origin is not allowed.'));
  },
  credentials: true,
}));
if (env.NODE_ENV === 'development') app.use(morgan('dev'));
app.use('/api/auth/onboarding/profile-image', express.json({ limit: '4mb', strict: true }));
app.use('/api/teachers/:id/profile-image', express.json({ limit: '4mb', strict: true }));
app.use(express.json({ limit: '256kb', strict: true }));
app.use('/uploads/profile-images', express.static(path.join(process.cwd(), 'uploads', 'profile-images'), { dotfiles: 'deny', fallthrough: false, immutable: true, maxAge: '30d' }));

app.get('/api/health', (_req, res) => sendSuccess(res, { message: 'API is running' }));
app.use('/api/auth', createAuthRouter());
app.use('/api/branches', createBranchRouter());
app.use('/api/classes', createClassRouter());
app.use('/api/shifts', createShiftRouter());
app.use('/api/holidays', createHolidayRouter());
app.use('/api/teachers', createTeacherRouter());
app.use('/api/students', createStudentRouter());
app.use('/api/attendance', createAttendanceRouter());
app.use('/api/admin/attendance', createAdminAttendanceRouter());
app.use('/api/reports', createReportRouter());
app.use('/api/admin/reports', createAdminReportRouter());
app.use('/api/leave-requests', createLeaveRequestRouter());
app.use('/api/admin/leave-requests', createAdminLeaveRequestRouter());
app.use('/api/admin/notifications', createAdminNotificationRouter());
app.use('/api/admin/payroll', createPayrollRouter());
app.use('/api/admin/salaries', createSalaryRouter());
app.use('/api/salaries/me', createMySalaryRouter());
app.use('/api/supervisor/inspections', createSupervisorInspectionRouter());

app.use(notFound);
app.use(errorHandler);

module.exports = { app };
