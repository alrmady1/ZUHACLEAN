// إنشاء صورة (PNG) ببيانات الحساب البنكي للشركة، ثم مشاركتها مباشرة عبر
// واجهة المشاركة الأصلية للجهاز (تفتح واتساب/الإيميل/إلخ) أو تنزيلها إذا لم
// تكن المشاركة مدعومة. تُستخدَم عند اختيار "حوالة بنكية" كطريقة دفع، سواء في
// PayAppointmentModal أو غيرها لاحقاً.
import type { CompanyBankAccount } from '../../shared/types.js';

const CARD_WIDTH = 900;
const NAVY = '#0F2A3D';
const CREAM = '#E6DCCB';
const CREAM_DIM = 'rgba(230, 220, 203, 0.65)';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`تعذّر تحميل الصورة: ${src}`));
    img.src = src;
  });
}

function wrapAndDraw(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, centerX, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, centerX, lineY);
    lineY += lineHeight;
  }
  return lineY;
}

// يبني صورة بطاقة عمودية بألوان هوية الشركة (كُحلي/كريمي) تعرض اسم الحساب،
// اسم البنك، رقم الآيبان، رقم الحساب، ورمز السويفت — كل حقل معنون بوضوح
// وقابل للنسخ يدوياً من الصورة عند تكبيرها.
export async function generateBankAccountImage(account: CompanyBankAccount, companyName: string): Promise<Blob> {
  const allFields: [string, string][] = [
    ['اسم الحساب', account.account_holder_name || companyName],
    ['اسم البنك', account.bank_name],
    ['رقم الآيبان (IBAN)', account.iban],
    ['رقم الحساب', account.account_number],
    ['رمز السويفت (SWIFT)', account.swift_code],
  ];
  const fields = allFields.filter(([, value]) => value);

  // ارتفاع ديناميكي حسب عدد الحقول المعبّأة فعلياً.
  const headerHeight = 260;
  const rowHeight = 130;
  const footerHeight = 70;
  const height = headerHeight + fields.length * rowHeight + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء الصورة');

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // الخلفية
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, CARD_WIDTH, height);

  const centerX = CARD_WIDTH / 2;

  // الشعار
  try {
    const logo = await loadImage('/icon-192.png');
    const logoSize = 110;
    ctx.save();
    ctx.beginPath();
    const radius = 22;
    const lx = centerX - logoSize / 2;
    const ly = 50;
    ctx.moveTo(lx + radius, ly);
    ctx.arcTo(lx + logoSize, ly, lx + logoSize, ly + logoSize, radius);
    ctx.arcTo(lx + logoSize, ly + logoSize, lx, ly + logoSize, radius);
    ctx.arcTo(lx, ly + logoSize, lx, ly, radius);
    ctx.arcTo(lx, ly, lx + logoSize, ly, radius);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, lx, ly, logoSize, logoSize);
    ctx.restore();
  } catch {
    // تجاهل فشل تحميل الشعار — الصورة تبقى صالحة بدونه.
  }

  // العنوان
  ctx.fillStyle = CREAM;
  ctx.font = '700 34px Cairo, Tahoma, sans-serif';
  ctx.fillText('بيانات الحساب البنكي', centerX, 210);

  // الحقول
  let y = headerHeight + 40;
  const boxMargin = 50;
  const boxWidth = CARD_WIDTH - boxMargin * 2;
  for (const [label, value] of fields) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const boxTop = y - 46;
    const boxHeight = rowHeight - 24;
    const boxRadius = 16;
    ctx.beginPath();
    ctx.moveTo(boxMargin + boxRadius, boxTop);
    ctx.arcTo(boxMargin + boxWidth, boxTop, boxMargin + boxWidth, boxTop + boxHeight, boxRadius);
    ctx.arcTo(boxMargin + boxWidth, boxTop + boxHeight, boxMargin, boxTop + boxHeight, boxRadius);
    ctx.arcTo(boxMargin, boxTop + boxHeight, boxMargin, boxTop, boxRadius);
    ctx.arcTo(boxMargin, boxTop, boxMargin + boxWidth, boxTop, boxRadius);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = CREAM_DIM;
    ctx.font = '600 22px Cairo, Tahoma, sans-serif';
    ctx.fillText(label, centerX, y);

    ctx.fillStyle = CREAM;
    ctx.font = '700 30px Cairo, Tahoma, sans-serif';
    // القيم (أرقام آيبان/حساب) قد تكون طويلة — التفاف تلقائي عند الحاجة.
    wrapAndDraw(ctx, value, centerX, y + 44, boxWidth - 40, 36);

    y += rowHeight;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('تعذّر إنشاء الصورة'))), 'image/png');
  });
}

// يشارك الصورة عبر واجهة المشاركة الأصلية للجهاز (تفتح واتساب/الإيميل/إلخ
// على الجوال) إن كانت مدعومة، وإلا يُنزّلها كملف PNG عادي.
export async function shareOrDownloadImage(blob: Blob, filename: string, shareTitle: string, shareText: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle, text: shareText });
      return;
    } catch (err) {
      // المستخدم أغلق نافذة المشاركة بنفسه — ليس خطأً فعلياً، لا داعي للتنزيل بدلاً منها.
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
