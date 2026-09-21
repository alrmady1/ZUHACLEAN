import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { store } from '../store/db.js';
import type { MobileOtpRecord, MobileSessionRecord } from '../../shared/types.js';

// تسجيل دخول عملاء تطبيق الجوال برمز يصل عبر واتساب — لا كلمات مرور ولا
// حسابات مسبقة. الرمز صالح OTP_TTL_MS فقط ولعدد محدود من المحاولات، وبعد
// نجاحه تُصدَر جلسة (token عشوائي طويل) تُخزَّن بصمته فقط. الجلسة تمنح
// قراءة حجوزات صاحب الرقم وحده (GET /public/mobile/bookings).

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 5;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// أي صيغة يُدخِلها العميل (5XXXXXXXX، 05XXXXXXXX، 9665XXXXXXXX، +9665...) إلى
// الصيغة المحلية 05XXXXXXXX المخزَّنة في Customer.phone؛ null إن لم تكن رقم
// جوال سعودياً صالحاً.
export function toLocalSaudiMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('966') && digits.length === 12) digits = digits.slice(3);
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
  return /^05\d{8}$/.test(digits) ? digits : null;
}

// مقارنة رقم مخزَّن (بأي صيغة) برقم محلي موحَّد.
export function samePhone(stored: string, localPhone: string): boolean {
  const digits = stored.replace(/\D/g, '');
  const local = digits.startsWith('966') ? `0${digits.slice(3)}` : digits.length === 9 ? `0${digits}` : digits;
  return local === localPhone;
}

export type OtpIssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'cooldown' | 'rate_limited' };

// يُنشئ رمزاً جديداً لهذا الرقم (يستبدل أي رمز سابق)، مع حدّ الإعادة
// (دقيقة) وحدّ الساعة. لا يُرسل شيئاً — الإرسال مسؤولية المُستدعي.
export function issueOtp(phone: string): OtpIssueResult {
  store.mobileOtps.purgeExpired();
  const now = Date.now();
  const existing = store.mobileOtps.get(phone);
  if (existing && now - new Date(existing.created_at).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' };
  }
  const windowActive = !!existing && now - new Date(existing.window_start).getTime() < 3600_000;
  const windowCount = windowActive ? existing!.window_count : 0;
  if (windowCount >= OTP_MAX_PER_HOUR) return { ok: false, reason: 'rate_limited' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  const record: MobileOtpRecord = {
    phone,
    code_hash: sha256(salt + code),
    salt,
    attempts: 0,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
    window_start: windowActive ? existing!.window_start : new Date(now).toISOString(),
    window_count: windowCount + 1,
  };
  store.mobileOtps.set(record);
  return { ok: true, code };
}

export type OtpVerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'invalid' | 'too_many_attempts' };

// يتحقق من الرمز؛ عند النجاح يستهلكه ويُصدر جلسة. رسالة الفشل واحدة لكل
// الحالات (لا رمز، منتهٍ، خاطئ) حتى لا يُكشف هل الرقم مسجَّل لدينا.
export function verifyOtp(phone: string, code: string): OtpVerifyResult {
  const record = store.mobileOtps.get(phone);
  if (!record || new Date(record.expires_at).getTime() < Date.now()) return { ok: false, reason: 'invalid' };
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  const expected = Buffer.from(record.code_hash, 'hex');
  const actual = Buffer.from(sha256(record.salt + code), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!matches) {
    store.mobileOtps.set({ ...record, attempts: record.attempts + 1 });
    return { ok: false, reason: record.attempts + 1 >= OTP_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid' };
  }

  // إبقاء سجل الرقم (مع تصفير الرمز) ضروري لاحتساب حدّ الساعة، فيُبطَل الرمز
  // بجعل انتهائه في الماضي بدل حذف السجل.
  store.mobileOtps.set({ ...record, expires_at: new Date(0).toISOString() });

  store.mobileSessions.purgeExpired();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const session: MobileSessionRecord = {
    id: store.id(),
    token_hash: sha256(token),
    phone,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  store.mobileSessions.insert(session);
  return { ok: true, token };
}

// الجلسة الصالحة من ترويسة Authorization: Bearer <token>، أو undefined.
export function getMobileSession(authorizationHeader: string | undefined): MobileSessionRecord | undefined {
  const match = /^Bearer\s+(\S+)$/.exec(authorizationHeader ?? '');
  if (!match) return undefined;
  const session = store.mobileSessions.getByTokenHash(sha256(match[1]));
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return undefined;
  return session;
}

export function endMobileSession(session: MobileSessionRecord): void {
  store.mobileSessions.remove(session.id);
}
