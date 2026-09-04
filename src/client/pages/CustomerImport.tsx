import { useRef, useState, type DragEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  ChevronRight,
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { api } from '../lib/api.js';
import type { Customer, CustomerType, CustomerSource } from '../../shared/types.js';
import { CUSTOMER_TYPE_LABELS_AR, CUSTOMER_SOURCE_LABELS_AR, CUSTOMER_IMPORT_ROLES } from '../../shared/types.js';
import { useI18n } from '../lib/i18n.js';
import { useAuth } from '../lib/auth.js';

// رؤوس أعمدة "النموذج" — بنفس ترتيب وتسميات حقول نموذج "إضافة عميل
// جديد" في صفحة العملاء تحديداً (بطلب صريح من المستخدم)، وليس أي تسميات
// أخرى. أول 3 أعمدة مطلوبة (تطابق تحقق POST /customers)، والباقي اختياري.
const TEMPLATE_HEADERS = [
  'الاسم',
  'الجوال',
  'العنوان',
  'الحي',
  'المدينة',
  'رابط الموقع',
  'نوع العميل',
  'المصدر',
  'الموظف الذي أجرى الاتصال',
] as const;

const TEMPLATE_EXAMPLE_ROW = [
  'أحمد الراشد',
  '0501234567',
  'حي النرجس، شارع الأمير سلطان',
  'النرجس',
  'الرياض',
  'https://maps.google.com/...',
  'فرد',
  'واتساب',
  '',
];

type ParsedRow = {
  name: string;
  phone: string;
  address: string;
  district?: string;
  city?: string;
  location_url?: string;
  customer_type?: string;
  source?: string;
  source_call_profile_id?: string;
};

type ImportResult = { inserted: Customer[]; skipped: { row: number; name?: string; reason: string }[] };

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const instructions = [
    ['تعليمات استيراد العملاء'],
    [''],
    ['١. الاسم ورقم الجوال والعنوان حقول مطلوبة لكل عميل.'],
    ['٢. رقم الجوال يجب أن يكون فريداً — أي صف برقم مكرر (داخل الملف أو مطابق لعميل موجود) يُتخطى تلقائياً.'],
    ['٣. عمود "نوع العميل" اختياري — القيم المقبولة: فرد أو شركة.'],
    [
      '٤. عمود "المصدر" اختياري — القيم المقبولة: ' +
        Object.values(CUSTOMER_SOURCE_LABELS_AR).join('، ') +
        '.',
    ],
    ['٥. عمود "الموظف الذي أجرى الاتصال" يُستخدَم فقط عندما يكون المصدر "اتصال صادر" — اكتب اسم الموظف بالضبط كما يظهر في النظام.'],
    ['٦. لا تُغيِّر أسماء الأعمدة (الصف الأول) في ورقة "النموذج" — الاستيراد يقرأها بالاسم.'],
    ['٧. احفظ الملف بصيغة xlsx. ثم ارفعه من نفس صفحة الاستيراد.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'التعليمات');

  const wsForm = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], TEMPLATE_EXAMPLE_ROW]);
  wsForm['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 26 }));
  XLSX.utils.book_append_sheet(wb, wsForm, 'النموذج');

  XLSX.writeFile(wb, 'نموذج-استيراد-العملاء.xlsx');
}

// يقرأ ورقة "النموذج" (أو أول ورقة إن لم توجد بهذا الاسم بالضبط) من ملف
// الإكسل المرفوع، ويحوّل كل صف إلى الحقول المتوقَّعة اعتماداً على اسم
// العمود في الصف الأول — مطابقة TEMPLATE_HEADERS أعلاه بالضبط.
async function parseWorkbook(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.includes('النموذج') ? 'النموذج' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map((r) => ({
    name: String(r['الاسم'] ?? '').trim(),
    phone: String(r['الجوال'] ?? '').trim(),
    address: String(r['العنوان'] ?? '').trim(),
    district: String(r['الحي'] ?? '').trim() || undefined,
    city: String(r['المدينة'] ?? '').trim() || undefined,
    location_url: String(r['رابط الموقع'] ?? '').trim() || undefined,
    customer_type: String(r['نوع العميل'] ?? '').trim() || undefined,
    source: String(r['المصدر'] ?? '').trim() || undefined,
    source_call_profile_id: String(r['الموظف الذي أجرى الاتصال'] ?? '').trim() || undefined,
  }));
}

export default function CustomerImport() {
  const { t, tt } = useI18n();
  const { user, allProfiles } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // مخفية تماماً عن أي دور آخر — حتى لو وصل الرابط مباشرة.
  if (user && !CUSTOMER_IMPORT_ROLES.includes(user.role)) return <Navigate to="/customers" replace />;

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setParseError(null);
    setParsedCount(null);
    try {
      const rows = await parseWorkbook(f);
      const valid = rows.filter((r) => r.name && r.phone && r.address);
      if (valid.length === 0) {
        setParseError(t('لم يُعثر على أي صف صالح — تأكد أن الملف يطابق تنسيق النموذج وأن أعمدة الاسم/الجوال/العنوان معبَّأة'));
        return;
      }
      setParsedCount(valid.length);
    } catch {
      setParseError(t('تعذّرت قراءة الملف — تأكد أنه ملف إكسل (xlsx.) سليم'));
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  // يحاول مطابقة "الموظف الذي أجرى الاتصال" باسمه الكامل بالضبط ضد قائمة
  // الموظفين — تطابق نصي بسيط (بلا حساسية لحالة الأحرف/المسافات الطرفية)
  // كافٍ هنا لأن العمود مخصَّص أصلاً ليُكتَب بالاسم كما يظهر في النظام.
  function resolveProfileId(nameRaw: string | undefined): string | undefined {
    if (!nameRaw) return undefined;
    const name = nameRaw.trim().toLowerCase();
    return allProfiles.find((p) => p.full_name.trim().toLowerCase() === name)?.id;
  }

  async function startImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const rows = await parseWorkbook(file);
      const payloadRows = rows
        .filter((r) => r.name && r.phone && r.address)
        .map((r) => {
          const customer_type =
            r.customer_type && (Object.keys(CUSTOMER_TYPE_LABELS_AR) as CustomerType[]).find((k) => CUSTOMER_TYPE_LABELS_AR[k] === r.customer_type);
          const source =
            r.source && (Object.keys(CUSTOMER_SOURCE_LABELS_AR) as CustomerSource[]).find((k) => CUSTOMER_SOURCE_LABELS_AR[k] === r.source);
          return {
            name: r.name,
            phone: r.phone,
            address: r.address,
            district: r.district,
            city: r.city,
            location_url: r.location_url,
            customer_type: customer_type || undefined,
            source: source || undefined,
            source_call_profile_id: source === 'outbound_call' ? resolveProfileId(r.source_call_profile_id) : undefined,
          };
        });
      const res = await api.post<ImportResult>('/customers/import', { rows: payloadRows });
      setResult(res);
      setFile(null);
      setParsedCount(null);
    } catch {
      setParseError(t('فشل الاستيراد — حاول مرة أخرى'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <button
          onClick={() => navigate('/customers')}
          className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-600"
        >
          <ChevronRight className="h-3.5 w-3.5" /> {t('الرجوع إلى سجل العملاء')}
        </button>
        <h1 className="text-xl font-bold text-slate-800">{t('استيراد العملاء بالجملة')}</h1>
        <p className="text-sm text-slate-400">{t('رفع ملف إكسل لإضافة عدة عملاء دفعة واحدة بدل إدخالهم واحداً تلو الآخر')}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-900 p-6 text-white">
        <div>
          <div className="text-lg font-bold">{t('استيراد العملاء')}</div>
          <p className="mt-1 text-sm text-slate-300">{t('قم بتحميل النموذج ورفع ملف الإكسل لاستيراد عدة عملاء في وقت واحد')}</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <FileSpreadsheet className="h-6 w-6" />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-800">{t('الإرشادات والمميزات')}</h2>
        <ul className="mb-4 space-y-2 text-sm text-slate-600">
          {[
            t('الاسم ورقم الجوال والعنوان حقول مطلوبة لكل عميل.'),
            t('رقم الجوال يجب أن يكون فريداً — الصفوف المكررة تُتخطى تلقائياً بدل رفض الملف كله.'),
            t('استخدم نفس القيم الظاهرة في ورقة "التعليمات" لعمودي نوع العميل والمصدر.'),
            t('عند اختيار "اتصال صادر" كمصدر، اكتب اسم الموظف بالضبط كما يظهر في النظام.'),
            t('تأكد من تحميل أحدث نسخة من النموذج قبل رفع ملف الاستيراد.'),
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Download className="h-4 w-4" /> {t('تحميل النموذج')}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-800">{t('رفع ملف إكسل')}</h2>
        <p className="mb-4 text-sm text-slate-400">{t('ارفع ملف الإكسل المكتمل لاستيراد العملاء')}</p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragOver ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
          <UploadCloud className="h-9 w-9 text-slate-300" />
          <div className="text-sm font-medium text-slate-600">{t('انقر هنا أو اسحب ملف الإكسل لإرفاقه')}</div>
          <div className="text-xs text-slate-400">{tt('يدعم ملفات .xlsx حتى 10 ميجابايت', 'Supports .xlsx files up to 10MB')}</div>
          <span className="mt-2 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <FolderOpen className="h-3.5 w-3.5" /> {t('تصفح الملفات')}
          </span>
        </div>

        {file && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="font-medium">{file.name}</span>
              {parsedCount !== null && (
                <span className="text-xs text-slate-400">— {tt(`${parsedCount} عميل جاهز للاستيراد`, `${parsedCount} customers ready`)}</span>
              )}
            </div>
            <button
              disabled={importing || parsedCount === null}
              onClick={startImport}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importing ? t('جارِ الاستيراد…') : t('بدء الاستيراد')}
            </button>
          </div>
        )}

        {parseError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {parseError}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {tt(`تم استيراد ${result.inserted.length} عميل بنجاح.`, `${result.inserted.length} customers imported successfully.`)}
            </div>
            {result.skipped.length > 0 && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="mb-1.5 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {tt(`تم تخطي ${result.skipped.length} صف:`, `${result.skipped.length} rows skipped:`)}
                </div>
                <ul className="space-y-1 text-xs text-amber-700">
                  {result.skipped.map((s) => (
                    <li key={s.row}>
                      {tt(`صف ${s.row}`, `Row ${s.row}`)} {s.name ? `(${s.name})` : ''} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={() => navigate('/customers')} className="text-sm font-medium text-brand-600 hover:underline">
              {t('الرجوع إلى سجل العملاء')} ←
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
