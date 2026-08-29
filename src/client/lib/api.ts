const BASE = '/api';

// نفس المفتاح الذي يحفظ به AuthProvider هوية المستخدم الحالي (انظر
// src/client/lib/auth.tsx) — تُرسَل تلقائياً مع كل طلب تعديل/إضافة/حذف
// عبر ترويسة X-Actor-Id، ليسجّلها الخادم في سجل العمليات (الإعدادات ←
// سجل العمليات) دون حاجة لتمريرها يدوياً في كل استدعاء عبر التطبيق.
const ACTOR_STORAGE_KEY = 'zaha-ops:userId';

function currentActorId(): string | null {
  return localStorage.getItem(ACTOR_STORAGE_KEY) ?? sessionStorage.getItem(ACTOR_STORAGE_KEY);
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const actorId = currentActorId();
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (actorId) headers['X-Actor-Id'] = actorId;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `${method} ${url} failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  // body اختياري — مطلوب لحذف جماعي (مثال: حذف عدة سطور من سجل
  // العمليات دفعة واحدة، انظر ActivityLogTab في Settings.tsx).
  del: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body),
};
