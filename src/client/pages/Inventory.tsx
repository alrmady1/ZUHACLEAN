import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Boxes as InventoryIcon,
  ClipboardList as AuditIcon,
  AlertTriangle,
  PlayCircle,
  CheckCircle2,
  Printer,
  QrCode as QrCodeIcon,
  Paperclip,
  Copy,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Asset, AssetCategory, AssetCondition, AssetStatus, AuditCycle, AuditItem, AssetScrappageLog } from '../../shared/types.js';
import {
  ASSET_CATEGORY_LABELS_AR,
  ASSET_CONDITION_LABELS_AR,
  ASSET_STATUS_LABELS_AR,
  AUDIT_PERIOD_TYPE_LABELS_AR,
  AUDIT_CYCLE_STATUS_LABELS_AR,
  VAT_RATE,
} from '../../shared/types.js';
import { computeAssetDepreciation } from '../../shared/depreciation.js';
import { formatMoney, formatDateAr } from '../lib/date.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { compressImageToDataUrl } from '../lib/image.js';

// معاينة حيّة لمبلغ الضريبة على سعر شراء أصل قبل الحفظ — نفس منطق
// computeAssetPurchaseVat في api.ts بالضبط؛ القيمة الفعلية المحفوظة
// تُحتسَب من جديد على الخادم دائماً.
function previewAssetVat(includesVat: boolean, price: number): number {
  return includesVat ? Math.round((price - price / (1 + VAT_RATE)) * 100) / 100 : Math.round(price * VAT_RATE * 100) / 100;
}

// ---------------------------------------------------------------------------
// عناصر واجهة صغيرة مشتركة داخل هذا الملف — نفس نمط Field/Modal في
// Settings.tsx بالضبط (كل صفحة تُعرِّف نسختها الخاصة، بلا مكوِّن مشترك).
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`text-xl font-bold ${tone === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { t } = useI18n();
  const style =
    status === 'active' ? 'bg-emerald-100 text-emerald-700' : status === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{t(ASSET_STATUS_LABELS_AR[status])}</span>;
}

function AssetConditionBadge({ condition }: { condition: AssetCondition }) {
  const { t } = useI18n();
  const style =
    condition === 'excellent'
      ? 'bg-emerald-100 text-emerald-700'
      : condition === 'working'
        ? 'bg-blue-100 text-blue-700'
        : condition === 'needs_maintenance'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-red-100 text-red-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{t(ASSET_CONDITION_LABELS_AR[condition])}</span>;
}

// ---------------------------------------------------------------------------
// تبويب "الجرد والأصول الثابتة" داخل صفحة المحاسبة (Accounting.tsx) — خلف
// صلاحية view_inventory_page (الاطلاع فقط) وmanage_inventory (إضافة/تعديل/
// شطب/تنفيذ جرد). أربعة أقسام: مؤشرات الأداء، جدول الأصول الرئيسي، لوحة
// الجرد الدوري، ونافذة الشطب — انظر التعليق الشارح الكامل أعلى Asset في
// shared/types.ts لتفاصيل النماذج والحساب المالي.
// ---------------------------------------------------------------------------
export function InventoryTab() {
  const { t, tt } = useI18n();
  const { user, can } = useAuth();
  const canManage = can('manage_inventory');
  // فتح الصفحة عبر رابط ملصق QR أصل (انظر AssetLabelModal أدناه) يصل
  // بمعامل ?search=<كود الأصل> — يُقرأ مرة واحدة فقط عند التحميل لتعبئة
  // البحث تلقائياً، فيفتح مباشرة على الأصل المقصود.
  const [searchParams] = useSearchParams();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [cycles, setCycles] = useState<AuditCycle[]>([]);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [scrapLogs, setScrapLogs] = useState<AssetScrappageLog[]>([]);
  const [view, setView] = useState<'assets' | 'audits'>('assets');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  // نسخ أصل قائم — يفتح نموذج "إضافة" مُعبَّأً مسبقاً بكل بيانات هذا
  // الأصل (لسهولة إدخال أصناف متكررة عدة مرات) عدا كود الأصل نفسه (يبقى
  // فارغاً، لأنه فريد إجبارياً) وفاتورة الشراء (لا تُنسَخ).
  const [duplicateSource, setDuplicateSource] = useState<Asset | null>(null);
  const [scrappingAsset, setScrappingAsset] = useState<Asset | null>(null);
  const [printingAsset, setPrintingAsset] = useState<Asset | null>(null);
  const [showNewAudit, setShowNewAudit] = useState(false);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);

  function refresh() {
    api.get<Asset[]>('/assets').then(setAssets);
    api.get<AuditCycle[]>('/audit-cycles').then(setCycles);
    api.get<AuditItem[]>('/audit-items').then(setItems);
    api.get<AssetScrappageLog[]>('/asset-scrappage-logs').then(setScrapLogs);
  }
  useEffect(refresh, []);

  const depreciationByAsset = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeAssetDepreciation>>();
    for (const a of assets) {
      const asOf = a.status === 'scrapped' && a.scrapped_at ? new Date(a.scrapped_at) : new Date();
      map.set(a.id, computeAssetDepreciation(a.purchase_price, a.purchase_date, a.useful_life_years, a.salvage_value, asOf));
    }
    return map;
  }, [assets]);

  const kpis = useMemo(() => {
    let originalTotal = 0;
    let bookValueTotal = 0;
    let monthlyDepreciationTotal = 0;
    for (const a of assets) {
      originalTotal += a.purchase_price;
      const dep = depreciationByAsset.get(a.id);
      if (!dep) continue;
      if (a.status !== 'scrapped') {
        bookValueTotal += dep.book_value;
        monthlyDepreciationTotal += dep.monthly_depreciation;
      }
    }
    const latestCompletedOrActive = cycles
      .slice()
      .sort((a, b) => (a.audit_date < b.audit_date ? 1 : -1))[0];
    const damagedOrMissingInLatestAudit = latestCompletedOrActive
      ? items.filter((i) => i.audit_id === latestCompletedOrActive.id && (i.condition_at_audit === 'damaged' || (i.variance ?? 0) < 0)).length
      : 0;
    return { originalTotal, bookValueTotal, monthlyDepreciationTotal, damagedOrMissingInLatestAudit };
  }, [assets, depreciationByAsset, cycles, items]);

  const locations = useMemo(() => Array.from(new Set(assets.map((a) => a.location).filter(Boolean))) as string[], [assets]);

  const filteredAssets = assets.filter((a) => {
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    if (locationFilter !== 'all' && a.location !== locationFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search.trim() && !`${a.name} ${a.asset_code}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  async function handleDeleteAsset(a: Asset) {
    if (!window.confirm(tt(`حذف أصل "${a.name}" (${a.asset_code}) نهائياً؟`, `Permanently delete asset "${a.name}" (${a.asset_code})?`))) return;
    await api.del(`/assets/${a.id}`);
    refresh();
  }

  async function startNewAudit(form: { audit_code: string; audit_date: string; period_type: string }) {
    const cycle = await api.post<AuditCycle>('/audit-cycles', {
      ...form,
      created_by: user?.id,
      created_by_name: user?.full_name,
    });
    const started = await api.post<AuditCycle>(`/audit-cycles/${cycle.id}/start`, {});
    setShowNewAudit(false);
    refresh();
    setView('audits');
    setActiveAuditId(started.id);
  }

  async function completeAudit(cycle: AuditCycle) {
    if (!window.confirm(tt(`اعتماد دورة الجرد "${cycle.audit_code}"؟`, `Approve audit cycle "${cycle.audit_code}"?`))) return;
    await api.post(`/audit-cycles/${cycle.id}/complete`, {});
    refresh();
  }

  const activeAudit = cycles.find((c) => c.id === activeAuditId);
  const activeAuditItems = items.filter((i) => i.audit_id === activeAuditId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('الجرد والأصول الثابتة')}</h2>
          <p className="text-sm text-slate-400">{t('تصنيف الأصول الثابتة والمعدات، احتساب الإهلاك تلقائياً، وإدارة الجرد الدوري وشطب التالف')}</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setView('assets')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'assets' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <InventoryIcon className="h-4 w-4" /> {t('الأصول')}
          </button>
          <button
            onClick={() => setView('audits')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'audits' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            <AuditIcon className="h-4 w-4" /> {t('الجرد الدوري')}
          </button>
        </div>
      </div>

      {/* 1) مؤشرات الأداء العلوية */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label={t('إجمالي قيمة الأصول الأصلية')} value={formatMoney(kpis.originalTotal)} />
        <MiniStat label={t('إجمالي القيمة الدفترية الحالية')} value={formatMoney(kpis.bookValueTotal)} />
        <MiniStat label={t('إجمالي الإهلاك الشهري التراكمي')} value={formatMoney(kpis.monthlyDepreciationTotal)} />
        <MiniStat
          label={t('تالف/مفقود في آخر جرد')}
          value={String(kpis.damagedOrMissingInLatestAudit)}
          tone={kpis.damagedOrMissingInLatestAudit > 0 ? 'danger' : undefined}
        />
      </div>

      {view === 'assets' ? (
        <div className="space-y-4">
          {/* 2) جدول إدارة الأصول الرئيسي */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('بحث بالاسم أو الكود...')}
                className="input w-48"
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | 'all')} className="input w-auto">
                <option value="all">{t('كل الفئات')}</option>
                {(Object.keys(ASSET_CATEGORY_LABELS_AR) as AssetCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {t(ASSET_CATEGORY_LABELS_AR[c])}
                  </option>
                ))}
              </select>
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="input w-auto">
                <option value="all">{t('كل المواقع')}</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AssetStatus | 'all')} className="input w-auto">
                <option value="all">{t('كل الحالات')}</option>
                {(Object.keys(ASSET_STATUS_LABELS_AR) as AssetStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {t(ASSET_STATUS_LABELS_AR[s])}
                  </option>
                ))}
              </select>
            </div>
            {canManage && (
              <button
                onClick={() => {
                  setEditingAsset(null);
                  setDuplicateSource(null);
                  setShowAssetForm(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" /> {t('إضافة أصل جديد')}
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="p-3 text-start font-medium">{t('الكود')}</th>
                  <th className="p-3 text-start font-medium">{t('الاسم')}</th>
                  <th className="p-3 text-start font-medium">{t('الفئة')}</th>
                  <th className="p-3 text-start font-medium">{t('الموقع')}</th>
                  <th className="p-3 text-start font-medium">{t('الحالة التشغيلية')}</th>
                  <th className="p-3 text-start font-medium">{t('حالة النظام')}</th>
                  <th className="p-3 text-start font-medium">{t('القيمة الدفترية')}</th>
                  <th className="p-3 text-start font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((a) => {
                  const dep = depreciationByAsset.get(a.id);
                  return (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0">
                      <td className="p-3 font-medium text-slate-700" dir="ltr">{a.asset_code}</td>
                      <td className="p-3 text-slate-700">{a.name}</td>
                      <td className="p-3 text-slate-600">{t(ASSET_CATEGORY_LABELS_AR[a.category])}</td>
                      <td className="p-3 text-slate-600">{a.location || '—'}</td>
                      <td className="p-3"><AssetConditionBadge condition={a.current_condition} /></td>
                      <td className="p-3"><AssetStatusBadge status={a.status} /></td>
                      <td className="p-3 text-slate-700">{dep ? formatMoney(dep.book_value) : '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setPrintingAsset(a)}
                            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline"
                          >
                            <QrCodeIcon className="h-3.5 w-3.5" /> {t('ملصق الأصل')}
                          </button>
                          {a.purchase_invoice_file_url && (
                            <a
                              href={a.purchase_invoice_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline"
                            >
                              <Paperclip className="h-3.5 w-3.5" /> {t('فاتورة الشراء')}
                            </a>
                          )}
                          {canManage && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingAsset(a);
                                  setShowAssetForm(true);
                                }}
                                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                              >
                                <Pencil className="h-3.5 w-3.5" /> {t('تعديل')}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingAsset(null);
                                  setDuplicateSource(a);
                                  setShowAssetForm(true);
                                }}
                                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline"
                              >
                                <Copy className="h-3.5 w-3.5" /> {t('نسخ')}
                              </button>
                              {a.status !== 'scrapped' && (
                                <button
                                  onClick={() => setScrappingAsset(a)}
                                  className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" /> {t('شطب')}
                                </button>
                              )}
                              <button onClick={() => handleDeleteAsset(a)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:underline">
                                <Trash2 className="h-3.5 w-3.5" /> {t('حذف')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredAssets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      {t('لا توجد أصول مطابقة')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {scrapLogs.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-xs font-semibold text-slate-500">{t('سجل الأصول المشطوبة')}</h3>
              <div className="divide-y divide-slate-100">
                {scrapLogs
                  .slice()
                  .sort((a, b) => (a.scrapped_date < b.scrapped_date ? 1 : -1))
                  .map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <div>
                        <div className="font-medium text-slate-700">{log.asset_name_snapshot}</div>
                        <div className="text-xs text-slate-400">
                          {formatDateAr(log.scrapped_date)} — {log.reason}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-red-600">{formatMoney(log.book_value_at_scrappage)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 3) لوحة الجرد الدوري */}
          {!activeAudit ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{t('دورات الجرد السابقة والحالية')}</p>
                {canManage && (
                  <button
                    onClick={() => setShowNewAudit(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    <PlayCircle className="h-4 w-4" /> {t('بدء جرد جديد')}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                      <th className="p-3 text-start font-medium">{t('الرمز')}</th>
                      <th className="p-3 text-start font-medium">{t('التاريخ')}</th>
                      <th className="p-3 text-start font-medium">{t('الفترة')}</th>
                      <th className="p-3 text-start font-medium">{t('الحالة')}</th>
                      <th className="p-3 text-start font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50 last:border-0">
                        <td className="p-3 font-medium text-slate-700" dir="ltr">{c.audit_code}</td>
                        <td className="p-3 text-slate-600" dir="ltr">{c.audit_date}</td>
                        <td className="p-3 text-slate-600">{t(AUDIT_PERIOD_TYPE_LABELS_AR[c.period_type])}</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : c.status === 'in_progress'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {t(AUDIT_CYCLE_STATUS_LABELS_AR[c.status])}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {c.status !== 'draft' && (
                              <button onClick={() => setActiveAuditId(c.id)} className="text-xs font-medium text-brand-600 hover:underline">
                                {t('فتح')}
                              </button>
                            )}
                            {canManage && c.status === 'in_progress' && (
                              <button onClick={() => completeAudit(c)} className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {t('اعتماد الجرد')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {cycles.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          {t('لا توجد دورات جرد بعد')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <AuditItemsView
              cycle={activeAudit}
              items={activeAuditItems}
              assets={assets}
              canManage={canManage}
              onBack={() => setActiveAuditId(null)}
              onScrap={(assetId) => {
                const asset = assets.find((a) => a.id === assetId);
                if (asset) setScrappingAsset(asset);
              }}
              onRefresh={refresh}
            />
          )}
        </div>
      )}

      {showAssetForm && (
        <AssetFormModal
          asset={editingAsset}
          duplicateFrom={duplicateSource ?? undefined}
          onClose={() => {
            setShowAssetForm(false);
            setEditingAsset(null);
            setDuplicateSource(null);
          }}
          onSaved={() => {
            setShowAssetForm(false);
            setEditingAsset(null);
            setDuplicateSource(null);
            refresh();
          }}
        />
      )}

      {scrappingAsset && (
        <ScrapAssetModal
          asset={scrappingAsset}
          depreciation={depreciationByAsset.get(scrappingAsset.id)}
          activeAuditId={activeAuditId ?? undefined}
          onClose={() => setScrappingAsset(null)}
          onScrapped={() => {
            setScrappingAsset(null);
            refresh();
          }}
        />
      )}

      {showNewAudit && <NewAuditModal onClose={() => setShowNewAudit(false)} onCreate={startNewAudit} />}

      {printingAsset && <AssetLabelModal asset={printingAsset} onClose={() => setPrintingAsset(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// نموذج إضافة/تعديل أصل
// ---------------------------------------------------------------------------
function AssetFormModal({
  asset,
  duplicateFrom,
  onClose,
  onSaved,
}: {
  asset: Asset | null;
  duplicateFrom?: Asset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tt } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // مصدر القيم الافتراضية لكل الحقول عدا كود الأصل وفاتورة الشراء (انظر
  // تعليق duplicateSource في InventoryTab): بيانات الأصل نفسه عند التعديل،
  // أو الأصل المصدر عند النسخ، أو لا شيء عند الإضافة العادية.
  const seed = asset ?? duplicateFrom;
  // مُتحكَّم بهما (لا defaultValue) لمعاينة مبلغ الضريبة حيّاً أثناء
  // الكتابة — نفس فكرة previewExpenseTax في Expenses.tsx بالضبط.
  const [purchasePrice, setPurchasePrice] = useState(seed?.purchase_price != null ? String(seed.purchase_price) : '');
  const [includesVat, setIncludesVat] = useState(seed?.purchase_price_includes_vat ?? true);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [removeInvoiceFile, setRemoveInvoiceFile] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const purchase_invoice_file_data_url = invoiceFile ? await compressImageToDataUrl(invoiceFile) : undefined;
    const payload = {
      asset_code: form.get('asset_code'),
      name: form.get('name'),
      category: form.get('category'),
      purchase_price: purchasePrice,
      purchase_price_includes_vat: includesVat,
      purchase_invoice_file_data_url,
      purchase_invoice_file_name: invoiceFile?.name || undefined,
      remove_purchase_invoice_file: !invoiceFile && removeInvoiceFile ? true : undefined,
      purchase_date: form.get('purchase_date'),
      useful_life_years: form.get('useful_life_years'),
      salvage_value: form.get('salvage_value'),
      current_condition: form.get('current_condition'),
      status: form.get('status'),
      location: form.get('location') || undefined,
      notes: form.get('notes') || undefined,
    };
    try {
      if (asset) {
        await api.patch(`/assets/${asset.id}`, payload);
      } else {
        await api.post('/assets', payload);
      }
      onSaved();
    } catch (err) {
      let message = 'تعذّر الحفظ';
      try {
        const parsed = JSON.parse((err as Error).message);
        if (parsed?.error) message = parsed.error;
      } catch {
        // ignore
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={
        asset
          ? tt(`تعديل أصل "${asset.name}"`, `Edit asset "${asset.name}"`)
          : duplicateFrom
            ? tt(`نسخ من "${duplicateFrom.name}"`, `Duplicate "${duplicateFrom.name}"`)
            : t('إضافة أصل جديد')
      }
      onClose={onClose}
    >
      {duplicateFrom && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          {t('عُبِّئت كل البيانات من الأصل المنسوخ عدا كود الأصل — أدخل كوداً جديداً فريداً وعدِّل ما يلزم.')}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('كود الأصل')}>
            <input name="asset_code" defaultValue={asset?.asset_code} required className="input" dir="ltr" placeholder="EQ-001" />
          </Field>
          <Field label={t('اسم الأصل')}>
            <input name="name" defaultValue={seed?.name} required className="input" />
          </Field>
        </div>
        <Field label={t('الفئة')}>
          <select name="category" defaultValue={seed?.category ?? 'cleaning_equipment'} required className="input">
            {(Object.keys(ASSET_CATEGORY_LABELS_AR) as AssetCategory[]).map((c) => (
              <option key={c} value={c}>
                {t(ASSET_CATEGORY_LABELS_AR[c])}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('سعر الشراء (ر.س)')}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              required
              className="input"
            />
          </Field>
          <Field label={t('تاريخ الشراء/التأسيس')}>
            <input type="date" name="purchase_date" defaultValue={seed?.purchase_date} required className="input" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includesVat} onChange={(e) => setIncludesVat(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          <span className="font-medium text-slate-600">{t('سعر الشراء شامل ضريبة القيمة المضافة')}</span>
        </label>
        {Number(purchasePrice) > 0 && (
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            {t('قيمة الضريبة المحتسبة')}: {formatMoney(previewAssetVat(includesVat, Number(purchasePrice)))}
            {!includesVat && ` (${t('إضافية فوق سعر الشراء')})`}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('العمر الإنتاجي (سنوات)')}>
            <input type="number" name="useful_life_years" min={1} step="1" defaultValue={seed?.useful_life_years ?? 5} required className="input" />
          </Field>
          <Field label={t('القيمة التخريدية (ر.س)')}>
            <input type="number" name="salvage_value" min={0} step="0.01" defaultValue={seed?.salvage_value ?? 0} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('الحالة التشغيلية')}>
            <select name="current_condition" defaultValue={seed?.current_condition ?? 'excellent'} className="input">
              {(Object.keys(ASSET_CONDITION_LABELS_AR) as AssetCondition[]).map((c) => (
                <option key={c} value={c}>
                  {t(ASSET_CONDITION_LABELS_AR[c])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('حالة النظام')}>
            {/* عند النسخ من أصل مشطوب، لا معنى لاقتراح 'scrapped' هنا (غير
                متاحة أصلاً كخيار في نموذج إنشاء) — الافتراضي 'active' حينها. */}
            <select name="status" defaultValue={seed && seed.status !== 'scrapped' ? seed.status : 'active'} className="input">
              <option value="active">{t(ASSET_STATUS_LABELS_AR.active)}</option>
              <option value="maintenance">{t(ASSET_STATUS_LABELS_AR.maintenance)}</option>
            </select>
          </Field>
        </div>
        <Field label={t('موقع العهدة (اختياري)')}>
          <input name="location" defaultValue={seed?.location} className="input" placeholder={t('سكن العمال / السيارة / الموقع الميداني')} />
        </Field>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">{t('فاتورة الشراء (صورة أو PDF، اختياري)')}</span>
          {asset?.purchase_invoice_file_url && !removeInvoiceFile && !invoiceFile && (
            <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              <a href={asset.purchase_invoice_file_url} target="_blank" rel="noreferrer" className="truncate text-brand-600 hover:underline">
                {asset.purchase_invoice_file_name || t('ملف مرفق حالياً')}
              </a>
              <button type="button" onClick={() => setRemoveInvoiceFile(true)} className="shrink-0 font-medium text-red-600 hover:underline">
                {t('إزالة')}
              </button>
            </div>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => {
              setInvoiceFile(e.target.files?.[0] ?? null);
              setRemoveInvoiceFile(false);
            }}
            className="input file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600"
          />
          {invoiceFile && (
            <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Paperclip className="h-3 w-3" /> {invoiceFile.name}
            </span>
          )}
        </label>
        <Field label={t('ملاحظات (اختياري)')}>
          <textarea name="notes" defaultValue={seed?.notes} rows={2} className="input" />
        </Field>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الحفظ…') : t('حفظ')}
        </button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 4) نافذة شطب وإتلاف أصل
// ---------------------------------------------------------------------------
function ScrapAssetModal({
  asset,
  depreciation,
  activeAuditId,
  onClose,
  onScrapped,
}: {
  asset: Asset;
  depreciation: ReturnType<typeof computeAssetDepreciation> | undefined;
  activeAuditId?: string;
  onClose: () => void;
  onScrapped: () => void;
}) {
  const { t, tt } = useI18n();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function confirmScrap() {
    if (!reason.trim()) {
      setError(t('سبب الإتلاف مطلوب'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/assets/${asset.id}/scrap`, { reason: reason.trim(), audit_id: activeAuditId });
      onScrapped();
    } catch (err) {
      let message = 'تعذّر تنفيذ الشطب';
      try {
        const parsed = JSON.parse((err as Error).message);
        if (parsed?.error) message = parsed.error;
      } catch {
        // ignore
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={tt(`شطب أصل "${asset.name}"`, `Scrap asset "${asset.name}"`)} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {t('سيُسجَّل هذا المبلغ خسارة إتلاف أصول ضمن المصاريف التشغيلية — لا يمكن التراجع عن هذا الإجراء.')}
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center">
          <div className="text-xs text-slate-400">{t('القيمة الدفترية المتبقية')}</div>
          <div className="text-xl font-bold text-red-600">{formatMoney(depreciation?.book_value ?? 0)}</div>
        </div>
        <Field label={t('سبب الإتلاف (إجباري)')}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input" required />
        </Field>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        <button
          type="button"
          disabled={submitting}
          onClick={confirmScrap}
          className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ التنفيذ…') : t('تأكيد الشطب والتسوية')}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// نموذج بدء جرد جديد — رمز + تاريخ + فترة، ينشئ الدورة ويبدؤها فوراً
// (POST /audit-cycles ثم POST /audit-cycles/:id/start).
// ---------------------------------------------------------------------------
function NewAuditModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (form: { audit_code: string; audit_date: string; period_type: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      await onCreate({
        audit_code: String(form.get('audit_code')),
        audit_date: String(form.get('audit_date')),
        period_type: String(form.get('period_type')),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const suggestedCode = `AUD-${new Date().getFullYear()}-${today.slice(5, 7)}`;

  return (
    <Modal title={t('بدء جرد جديد')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label={t('رمز الجرد')}>
          <input name="audit_code" defaultValue={suggestedCode} required className="input" dir="ltr" />
        </Field>
        <Field label={t('تاريخ الجرد')}>
          <input type="date" name="audit_date" defaultValue={today} required className="input" />
        </Field>
        <Field label={t('فترة الجرد')}>
          <select name="period_type" defaultValue="quarterly" className="input">
            {(Object.keys(AUDIT_PERIOD_TYPE_LABELS_AR) as Array<'quarterly' | 'semi_annual' | 'annual'>).map((p) => (
              <option key={p} value={p}>
                {t(AUDIT_PERIOD_TYPE_LABELS_AR[p])}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-slate-400">{t('سيُولَّد بند جرد تلقائياً لكل أصل نشط حالياً.')}</p>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? t('جارِ الإنشاء…') : t('بدء الجرد')}
        </button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ملصق تعريف أصل قابل للطباعة — الحل العملي لسؤال "كيف أربط الكود
// بالأصل بالواقع؟": رمز QR يفتح مباشرةً صفحة الجرد مع البحث معبَّأً
// تلقائياً بكود هذا الأصل (انظر قراءة ?search= في InventoryTab أعلاه)،
// بالإضافة إلى الاسم والكود بخط كبير يمكن قراءته بالعين المجرَّدة كذلك —
// يُلصَق على الأصل نفسه (أو يُكتَب كوده يدوياً لمن لا يريد طباعة ملصقات).
// الطباعة تعزل هذه المنطقة فقط عبر .asset-label-print-area في index.css،
// نفس أسلوب .invoice-print-area في InvoiceDocument.tsx بالضبط.
// ---------------------------------------------------------------------------
function AssetLabelModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const url = `${window.location.origin}/accounting?tab=inventory&search=${encodeURIComponent(asset.asset_code)}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [asset.asset_code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl print:w-auto print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('ملصق الأصل')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="asset-label-print-area flex flex-col items-center gap-2 p-6 text-center">
          {qrDataUrl && <img src={qrDataUrl} alt="QR" className="h-40 w-40" />}
          <div className="text-lg font-bold text-slate-800" dir="ltr">{asset.asset_code}</div>
          <div className="text-sm text-slate-600">{asset.name}</div>
        </div>
        <div className="p-4 pt-0 print:hidden">
          <p className="mb-3 text-xs text-slate-400">
            {t('اطبع هذا الملصق والصقه على الأصل — مسحه ضوئياً بالجوال يفتح هذا الأصل مباشرة في صفحة الجرد. أو اكتب الكود يدوياً على الأصل إن كنت تفضّل ذلك.')}
          </p>
          <button
            onClick={() => window.print()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Printer className="h-4 w-4" /> {t('طباعة الملصق')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// كشف جرد ورقي قابل للطباعة — يجيب على "كيف أسجّل ملاحظاتي وأنا أتفقَّد
// الأصول ميدانياً بلا جوال بيدي؟": جدول بكل بنود دورة الجرد، بخانات
// المتوقَّع مُعبَّأة والفعلي/الحالة/الملاحظات فارغة عمداً للتعبئة اليدوية
// بالقلم، تُدخَل لاحقاً في واجهة الجرد الرقمية (AuditItemsView أعلاه) من
// نفس الجهاز أو جهاز آخر. الطباعة معزولة بنفس .invoice-print-area
// المستخدَمة في InvoiceDocument.tsx (صفحة كاملة، لا ملصق مصغَّر).
// ---------------------------------------------------------------------------
function AuditPrintSheet({
  cycle,
  items,
  assets,
  onClose,
}: {
  cycle: AuditCycle;
  items: AuditItem[];
  assets: Asset[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 print:hidden">
          <h2 className="text-sm font-bold text-slate-800">{t('طباعة كشف الجرد')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Printer className="h-3.5 w-3.5" /> {t('طباعة')}
            </button>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="invoice-print-area overflow-y-auto p-6">
          <div className="mb-4 text-center">
            <h1 className="text-lg font-bold text-slate-800">{t('كشف جرد')}</h1>
            <p className="text-sm text-slate-500" dir="ltr">
              {cycle.audit_code} — {cycle.audit_date}
            </p>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-slate-400 p-1.5 text-start">#</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('الكود')}</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('الاسم')}</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('الفئة')}</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('الموقع')}</th>
                <th className="border border-slate-400 p-1.5 text-center">{t('المتوقَّع')}</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('الفعلي')}</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('الحالة أثناء الجرد')}</th>
                <th className="border border-slate-400 p-1.5 text-start">{t('ملاحظات')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const asset = assetById.get(item.asset_id);
                return (
                  <tr key={item.id}>
                    <td className="border border-slate-400 p-1.5">{i + 1}</td>
                    <td className="border border-slate-400 p-1.5" dir="ltr">{item.asset_code_snapshot}</td>
                    <td className="border border-slate-400 p-1.5">{item.asset_name_snapshot}</td>
                    <td className="border border-slate-400 p-1.5">{asset ? t(ASSET_CATEGORY_LABELS_AR[asset.category]) : '—'}</td>
                    <td className="border border-slate-400 p-1.5">{asset?.location || '—'}</td>
                    <td className="border border-slate-400 p-1.5 text-center">{item.expected_qty}</td>
                    <td className="border border-slate-400 p-1.5">
                      <div className="h-6" />
                    </td>
                    <td className="border border-slate-400 p-1.5">
                      <div className="h-6" />
                    </td>
                    <td className="border border-slate-400 p-1.5">
                      <div className="h-6" />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="border border-slate-400 p-4 text-center text-slate-400">
                    {t('لا توجد بنود في هذه الدورة')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-slate-700">
            <div>{t('اسم القائم بالجرد')}: ____________________</div>
            <div>{t('التوقيع والتاريخ')}: ____________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// واجهة إدخال المشرف الميداني لجلسة جرد قائمة — مخصَّصة للمس (الآيباد/
// الجوال): حقول كبيرة، صف كامل يبرز أحمراً عند وجود عجز (variance < 0).
// ---------------------------------------------------------------------------
function AuditItemsView({
  cycle,
  items,
  assets,
  canManage,
  onBack,
  onScrap,
  onRefresh,
}: {
  cycle: AuditCycle;
  items: AuditItem[];
  assets: Asset[];
  canManage: boolean;
  onBack: () => void;
  onScrap: (assetId: string) => void;
  onRefresh: () => void;
}) {
  const { t, tt } = useI18n();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showPrintSheet, setShowPrintSheet] = useState(false);

  async function saveItem(item: AuditItem, patch: { actual_qty?: number; condition_at_audit?: AssetCondition; notes?: string }) {
    setSavingId(item.id);
    try {
      await api.patch(`/audit-items/${item.id}`, patch);
      onRefresh();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-xs font-medium text-slate-500 hover:underline">
            {t('← رجوع لكل دورات الجرد')}
          </button>
          <h3 className="mt-1 text-sm font-bold text-slate-800" dir="ltr">
            {cycle.audit_code}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintSheet(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> {t('طباعة كشف الجرد')}
          </button>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">{t(AUDIT_CYCLE_STATUS_LABELS_AR[cycle.status])}</span>
        </div>
      </div>

      {showPrintSheet && <AuditPrintSheet cycle={cycle} items={items} assets={assets} onClose={() => setShowPrintSheet(false)} />}

      <div className="space-y-2">
        {items.map((item) => {
          const hasVariance = item.actual_qty !== undefined && (item.variance ?? 0) < 0;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 ${hasVariance ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-800">{item.asset_name_snapshot}</div>
                  <div className="text-xs text-slate-400" dir="ltr">{item.asset_code_snapshot}</div>
                </div>
                {hasVariance && (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> {t('عجز/تلف')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={t('المتوقَّع')}>
                  <input value={item.expected_qty} disabled className="input bg-slate-50 text-slate-500" />
                </Field>
                <Field label={t('الفعلي')}>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    disabled={!canManage}
                    defaultValue={item.actual_qty}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? undefined : Number(e.target.value);
                      if (v !== item.actual_qty) saveItem(item, { actual_qty: v });
                    }}
                    className="input"
                  />
                </Field>
                <Field label={t('الحالة أثناء الجرد')}>
                  <select
                    disabled={!canManage}
                    defaultValue={item.condition_at_audit ?? ''}
                    onChange={(e) => saveItem(item, { condition_at_audit: (e.target.value || undefined) as AssetCondition | undefined })}
                    className="input"
                  >
                    <option value="">{t('بدون تحديد')}</option>
                    {(Object.keys(ASSET_CONDITION_LABELS_AR) as AssetCondition[]).map((c) => (
                      <option key={c} value={c}>
                        {t(ASSET_CONDITION_LABELS_AR[c])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('ملاحظات')}>
                  <input
                    disabled={!canManage}
                    defaultValue={item.notes}
                    onBlur={(e) => {
                      if (e.target.value !== (item.notes ?? '')) saveItem(item, { notes: e.target.value });
                    }}
                    className="input"
                  />
                </Field>
              </div>
              {savingId === item.id && <p className="mt-1 text-[11px] text-slate-400">{t('جارِ الحفظ…')}</p>}
              {canManage && (item.condition_at_audit === 'damaged' || hasVariance) && (
                <button
                  onClick={() => onScrap(item.asset_id)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> {t('تحويل إلى شطب')}
                </button>
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{t('لا توجد بنود في هذه الدورة')}</p>}
      </div>
    </div>
  );
}
