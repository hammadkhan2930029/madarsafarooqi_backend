'use strict';

const { mkdir, writeFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { prisma } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const { safeUserProfile } = require('./auth.service');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const imageType = buffer => {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mime: 'image/png', extension: 'png' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  return null;
};
const conditionsFor = user => {
  const configured = Array.isArray(user.ijaraConditions) ? user.ijaraConditions : [];
  if (configured.length) return configured.map((item, index) => typeof item === 'string' ? { id: String(index + 1), text: item } : { id: String(item.id || index + 1), text: String(item.text || '') }).filter(item => item.text.trim());
  return String(user.ijaraTerms || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean).map((text, index) => ({ id: String(index + 1), text }));
};
const getUser = async (database, userId) => {
  const user = await database.user.findFirst({ where: { id: BigInt(userId), role: 'TEACHER', status: 'ACTIVE' }, include: { branch: true, class: true } });
  if (!user) throw new ApiError(404, 'STAFF_NOT_FOUND', 'Staff profile was not found.');
  return user;
};
const createOnboardingService = (database, options = {}) => ({
  async status(userId) {
    const user = await getUser(database, userId); const conditions = conditionsFor(user);
    return { required: user.onboardingRequired, completed: !user.onboardingRequired || Boolean(user.onboardingCompletedAt), profileImageUploaded: Boolean(user.profileImageUrl), profileImageUrl: user.profileImageUrl, termsVersion: user.ijaraTermsVersion || '1', conditions };
  },
  async uploadProfileImage(userId, input) {
    await getUser(database, userId);
    let buffer; try { buffer = Buffer.from(input.data, 'base64'); } catch { throw new ApiError(422, 'INVALID_PROFILE_IMAGE', 'Profile image data is invalid.'); }
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ApiError(422, 'PROFILE_IMAGE_SIZE_INVALID', 'Profile image must not exceed 2 MB.');
    const detected = imageType(buffer);
    if (!detected || detected.mime !== input.mimeType) throw new ApiError(422, 'PROFILE_IMAGE_FORMAT_INVALID', 'Only valid JPEG, PNG and WebP images are allowed.');
    const directory = options.directory || path.join(process.cwd(), 'uploads', 'profile-images'); await mkdir(directory, { recursive: true });
    const fileName = `${randomUUID()}.${detected.extension}`; await writeFile(path.join(directory, fileName), buffer, { flag: 'wx' });
    const profileImageUrl = `/uploads/profile-images/${fileName}`;
    await database.user.update({ where: { id: BigInt(userId) }, data: { profileImageUrl } });
    return { profileImageUrl };
  },
  async complete(userId, input, requestMetadata = {}) {
    return database.$transaction(async tx => {
      const user = await getUser(tx, userId); const conditions = conditionsFor(user); const version = user.ijaraTermsVersion || '1';
      if (!user.profileImageUrl) throw new ApiError(409, 'PROFILE_IMAGE_REQUIRED', 'Upload a profile image before accepting Ijara terms.');
      if (!conditions.length) throw new ApiError(409, 'IJARA_CONDITIONS_NOT_CONFIGURED', 'Ijara conditions are not configured.');
      if (input.termsVersion !== version) throw new ApiError(409, 'IJARA_TERMS_CHANGED', 'Ijara terms have changed. Please review them again.');
      const answerMap = new Map(input.answers.map(item => [String(item.conditionId), item.answer]));
      if (conditions.some(condition => !answerMap.has(condition.id))) throw new ApiError(422, 'ALL_IJARA_ANSWERS_REQUIRED', 'Every Ijara condition must be answered.');
      const answers = conditions.map(condition => ({ conditionId: condition.id, answer: answerMap.get(condition.id) === true }));
      if (answers.some(item => !item.answer)) throw new ApiError(422, 'ALL_IJARA_TERMS_MUST_BE_ACCEPTED', 'All Ijara conditions must be accepted to continue.');
      const acceptedAt = new Date();
      await tx.ijaraAcceptance.upsert({ where: { userId_termsVersion: { userId: user.id, termsVersion: version } }, create: { userId: user.id, termsVersion: version, answers, accepted: true, acceptedAt, requestMetadata }, update: { answers, accepted: true, acceptedAt, requestMetadata } });
      const updated = await tx.user.update({ where: { id: user.id }, data: { ijaraAcceptedAt: acceptedAt, onboardingCompletedAt: acceptedAt }, include: { branch: true, class: true } });
      await tx.auditLog.create({ data: { action: 'FIRST_LOGIN_ONBOARDING_COMPLETED', targetUserId: user.id, performedById: user.id, requestMetadata: { ...requestMetadata, termsVersion: version } } });
      return safeUserProfile(updated);
    });
  },
});

const onboardingService = createOnboardingService(prisma);
module.exports = { MAX_IMAGE_BYTES, conditionsFor, createOnboardingService, imageType, onboardingService };
