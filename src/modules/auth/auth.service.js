'use strict';

const { createHash } = require('node:crypto');

const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const { hashPassword, validatePasswordStrength, verifyPassword } = require('../../utils/password');

const normalizeLoginId = loginId => String(loginId || '').trim().toLowerCase();
const hashRefreshToken = token => createHash('sha256').update(token).digest('hex');
const DUMMY_PASSWORD_HASH = '$2b$12$Woby/iV4l8Xuo8EC.d1CGOZbv7PdJ8og7Se2a8CPhn1mCC/Sk6FVW';
const profileInclude = { branch: { select: { id: true, name: true, code: true } }, class: { select: { id: true, name: true } } };

const safeUserProfile = user => ({
  id: String(user.id),
  name: user.name,
  loginId: user.loginId,
  email: user.email ?? null,
  contact: user.contact ?? null,
  role: user.role,
  teacherType: user.teacherType ?? null,
  baseSalary: user.baseSalary == null ? null : String(user.baseSalary),
  ijaraFrequency: user.ijaraFrequency || 'MONTHLY',
  weeklyIjaraAmount: user.weeklyIjaraAmount == null ? null : String(user.weeklyIjaraAmount),
  monthlyAllowance: user.monthlyAllowance == null ? '0.00' : String(user.monthlyAllowance),
  attendanceAllowance: user.attendanceAllowance == null ? '0.00' : String(user.attendanceAllowance),
  attendanceAllowanceEnabled: Boolean(user.attendanceAllowanceEnabled),
  conveyanceAllowance: user.conveyanceAllowance == null ? '0.00' : String(user.conveyanceAllowance),
  medicalAllowance: user.medicalAllowance == null ? '0.00' : String(user.medicalAllowance),
  workingDays: user.workingDays ?? null,
  profileImageUrl: user.profileImageUrl ?? null,
  ijaraTerms: user.ijaraTerms ?? null,
  ijaraConditions: user.ijaraConditions ?? null,
  ijaraTermsVersion: user.ijaraTermsVersion ?? null,
  ijaraAcceptedAt: user.ijaraAcceptedAt ?? null,
  onboardingRequired: Boolean(user.onboardingRequired),
  onboardingCompletedAt: user.onboardingCompletedAt ?? null,
  branchId: user.branchId == null ? null : String(user.branchId),
  classId: user.classId == null ? null : String(user.classId),
  timing: user.timing ?? null,
  status: user.status,
  branch: user.branch ? {
    id: String(user.branch.id),
    name: user.branch.name,
    code: user.branch.code,
  } : null,
  class: user.class ? {
    id: String(user.class.id),
    name: user.class.name,
  } : null,
});

const decodeRefresh = token => {
  try {
    const payload = verifyRefreshToken(token);
    if (payload.type !== 'refresh' || !payload.userId || !payload.role ||
        !Number.isInteger(payload.tokenVersion) || !payload.exp) {
      throw new Error('Invalid refresh claims.');
    }
    return payload;
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Refresh token has expired.');
    }
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
  }
};

const createTokenPair = async (database, user) => {
  const claims = { userId: String(user.id), role: user.role, tokenVersion: user.tokenVersion };
  const accessToken = signAccessToken(claims);
  const refreshToken = signRefreshToken(claims);
  const payload = decodeRefresh(refreshToken);
  await database.refreshToken.create({ data: {
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(payload.exp * 1000),
  } });
  return { accessToken, refreshToken };
};

const createAuthService = database => ({
  async login({ loginId, password }) {
    const user = await database.user.findUnique({ where: { loginId: normalizeLoginId(loginId) }, include: profileInclude });
    const passwordMatches = await verifyPassword(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Login ID or password is incorrect.');
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Account is inactive. Contact the Super Admin.');
    }
    const tokens = await createTokenPair(database, user);
    return { user: safeUserProfile(user), ...tokens };
  },

  async refresh(rawToken) {
    const payload = decodeRefresh(rawToken);
    const tokenHash = hashRefreshToken(rawToken);
    return database.$transaction(async transaction => {
      const stored = await transaction.refreshToken.findUnique({
        where: { tokenHash }, include: { user: { include: profileInclude } },
      });
      if (!stored || stored.revokedAt || stored.expiresAt <= new Date() ||
          String(stored.userId) !== String(payload.userId)) {
        throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked.');
      }
      if (stored.user.status !== 'ACTIVE') {
        throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Account is inactive. Contact the Super Admin.');
      }
      if (stored.user.tokenVersion !== payload.tokenVersion) {
        throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has been revoked.');
      }
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null }, data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has already been used.');
      }
      const tokens = await createTokenPair(transaction, stored.user);
      return { user: safeUserProfile(stored.user), ...tokens };
    });
  },

  async logout(rawToken) {
    decodeRefresh(rawToken);
    const result = await database.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked.');
    }
  },

  async me(userId) {
    const user = await database.user.findUnique({ where: { id: BigInt(userId) }, include: profileInclude });
    if (!user) throw new ApiError(401, 'INVALID_TOKEN', 'Authenticated user no longer exists.');
    if (user.status !== 'ACTIVE') throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Account is inactive.');
    return safeUserProfile(user);
  },

  async acceptIjaraTerms(userId, version) {
    const user = await database.user.findFirst({ where: { id: BigInt(userId), role: 'TEACHER', status: 'ACTIVE' } });
    if (!user) throw new ApiError(404, 'STAFF_NOT_FOUND', 'Staff profile was not found.');
    if (!user.ijaraTerms) throw new ApiError(409, 'IJARA_TERMS_NOT_CONFIGURED', 'Ijara terms are not configured.');
    if (version && user.ijaraTermsVersion && version !== user.ijaraTermsVersion) throw new ApiError(409, 'IJARA_TERMS_CHANGED', 'Ijara terms have changed. Please review them again.');
    return safeUserProfile(await database.user.update({ where: { id: user.id }, data: { ijaraAcceptedAt: new Date() }, include: profileInclude }));
  },

  async changePassword(userId, { currentPassword, newPassword, confirmPassword }) {
    if (newPassword !== confirmPassword) {
      throw new ApiError(422, 'PASSWORDS_DO_NOT_MATCH', 'New password and confirmation do not match.');
    }
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) throw new ApiError(422, 'WEAK_PASSWORD', strengthError);
    const user = await database.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ApiError(401, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect.');
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new ApiError(422, 'PASSWORD_UNCHANGED', 'New password must differ from the current password.');
    }
    const passwordHash = await hashPassword(newPassword);
    await database.$transaction(async transaction => {
      await transaction.user.update({
        where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() },
      });
    });
  },
});

const authService = createAuthService(prisma);

module.exports = { authService, createAuthService, hashRefreshToken, normalizeLoginId, safeUserProfile };
