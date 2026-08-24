'use strict';

const { ApiError } = require('../../utils/ApiError');

const formatterCache = new Map();
const getFormatter = timeZone => {
  if (!formatterCache.has(timeZone)) formatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23',
  }));
  return formatterCache.get(timeZone);
};
const zonedParts = (date, timeZone) => Object.fromEntries(getFormatter(timeZone).formatToParts(date)
  .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
const dateKeyInTimeZone = (date, timeZone) => {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};
const dateKeyToDatabaseDate = value => new Date(`${value}T00:00:00.000Z`);
const parseDateKey = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new ApiError(422, 'INVALID_DATE', 'Date must use YYYY-MM-DD.');
  const date = dateKeyToDatabaseDate(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(422, 'INVALID_DATE', 'Date is invalid.');
  return date;
};
const parseTiming = value => {
  if (value == null || String(value).trim() === '') return null;
  const source = String(value).trim().toUpperCase().replace(/\s+/g, ' ');
  const twelve = source.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)\s*-\s*(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/);
  const twentyFour = source.match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
  if (!twelve && !twentyFour) return null;
  const to24 = (hour, meridiem) => meridiem ? (Number(hour) % 12) + (meridiem === 'PM' ? 12 : 0) : Number(hour);
  const startHour = to24((twelve || twentyFour)[1], twelve?.[3]);
  const startMinute = Number((twelve || twentyFour)[2]);
  const endHour = to24(twelve ? twelve[4] : twentyFour[3], twelve?.[6]);
  const endMinute = Number(twelve ? twelve[5] : twentyFour[4]);
  const startMinutes = startHour * 60 + startMinute; const endMinutes = endHour * 60 + endMinute;
  const display = minutes => `${String((Math.floor(minutes / 60) % 12) || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${Math.floor(minutes / 60) >= 12 ? 'PM' : 'AM'}`;
  return endMinutes > startMinutes ? { normalized: `${display(startMinutes)}-${display(endMinutes)}`, startMinutes, endMinutes } : null;
};
const calculateLateMinutes = (now, timeZone, timing, graceMinutes = 0) => {
  const parsed = parseTiming(timing);
  if (!parsed) return null;
  const parts = zonedParts(now, timeZone);
  return Math.max(0, parts.hour * 60 + parts.minute - parsed.startMinutes - graceMinutes);
};
const calculateIsLate = (now, timeZone, timing, graceMinutes = 0) => { const minutes = calculateLateMinutes(now, timeZone, timing, graceMinutes); return minutes == null ? null : minutes > 0; };
const checkInAvailability = (now, timeZone, timing, graceMinutes = 0, openBeforeMinutes = 20) => {
  const parsed = parseTiming(timing);
  if (!parsed) return { canCheckIn: false, reason: 'MISSING_TIMING', opensInMinutes: null, timing: null, lateMinutes: 0 };
  const parts = zonedParts(now, timeZone); const currentMinutes = parts.hour * 60 + parts.minute;
  const opensInMinutes = Math.max(0, parsed.startMinutes - openBeforeMinutes - currentMinutes);
  const isClosed = currentMinutes > parsed.endMinutes;
  return { canCheckIn: opensInMinutes === 0 && !isClosed, reason: opensInMinutes ? 'CHECK_IN_TOO_EARLY' : isClosed ? 'CHECK_IN_CLOSED' : null, opensInMinutes, timing: parsed.normalized, lateMinutes: calculateLateMinutes(now, timeZone, timing, graceMinutes) };
};
const checkOutAvailability = (now, timeZone, timing, closeAfterMinutes = 30) => {
  const parsed = parseTiming(timing);
  if (!parsed) return { canCheckOut: false, checkOutReason: 'MISSING_TIMING', checkOutClosesInMinutes: null };
  const parts = zonedParts(now, timeZone); const currentMinutes = parts.hour * 60 + parts.minute;
  const closesAtMinutes = parsed.endMinutes + closeAfterMinutes;
  return { canCheckOut: currentMinutes <= closesAtMinutes, checkOutReason: currentMinutes > closesAtMinutes ? 'CHECK_OUT_CLOSED' : null, checkOutClosesInMinutes: Math.max(0, closesAtMinutes - currentMinutes) };
};

module.exports = { calculateIsLate, calculateLateMinutes, checkInAvailability, checkOutAvailability, dateKeyInTimeZone, dateKeyToDatabaseDate, parseDateKey, parseTiming, zonedParts };
