import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Play, ImageOff } from 'lucide-react';
import { useI18n } from '../lib/i18n.js';
import { cdnImageUrl } from '../lib/mediaUrl.js';

export interface LightboxItem {
  url: string;
  isVideo: boolean;
  // مصغّرة الصورة / لقطة عرض الفيديو (≈480px) للشبكات — غائبة على ما رُفع
  // قبل هذه الميزة، فتُستخدَم الصورة الكاملة (وللفيديو بطاقة تشغيل عامة).
  thumbUrl?: string;
}

// صورة بثلاث محاولات: المسار المخزَّن مؤقتاً أولاً (يوفّر حصة النقل)، ثم
// الرابط الأصلي، ثم عنصر بديل مفهوم (بدل مربع أسود بأيقونة مكسورة) إن تعذّر
// تحميلها — مثلاً عند توقف التخزين مؤقتاً.
function SmartImage({ url, alt, className, fallback }: { url: string; alt?: string; className?: string; fallback: React.ReactNode }) {
  const [stage, setStage] = useState<'cdn' | 'original' | 'failed'>('cdn');
  const cdn = cdnImageUrl(url);
  if (stage === 'failed') return <>{fallback}</>;
  const src = stage === 'cdn' ? cdn : url;
  return (
    <img
      key={src}
      src={src}
      alt={alt ?? ''}
      className={className}
      onError={() => setStage((s) => (s === 'cdn' && cdn !== url ? 'original' : 'failed'))}
    />
  );
}

// مصغّرة قابلة للنقر داخل شبكة الوسائط — تفتح المعاينة بدل تشغيل الفيديو
// داخل المربع الصغير (الفيديو يُعرض إطاره الأول مع أيقونة تشغيل).
export function MediaThumb({ item, alt, onOpen }: { item: LightboxItem; alt?: string; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onOpen} className={`relative h-full w-full overflow-hidden rounded-xl ${item.isVideo ? 'bg-black' : 'bg-slate-100'}`}>
      {item.isVideo ? (
        <>
          {/* لا عنصر <video> هنا إطلاقاً: تحميل الفيديو (حتى البيانات
              الوصفية) لكل مصغّرة كان يستهلك حصة النقل — يُحمَّل فقط عند
              فتح المعاينة. */}
          {item.thumbUrl && (
            <SmartImage url={item.thumbUrl} className="h-full w-full object-cover" fallback={null} />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-full bg-white/90 p-2 text-slate-700">
              <Play className="h-5 w-5" />
            </span>
          </span>
        </>
      ) : (
        <SmartImage
          url={item.thumbUrl ?? item.url}
          alt={alt}
          className="h-full w-full object-cover"
          fallback={
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-slate-400">
              <ImageOff className="h-5 w-5" />
              <span className="text-[10px] leading-tight">{t('تعذّر تحميل الصورة')}</span>
            </span>
          }
        />
      )}
    </button>
  );
}

// معاينة بالحجم الكامل لصورة أو فيديو (مع تصفّح بقية صور/فيديوهات نفس
// المجموعة بالأسهم أو لوحة المفاتيح). النقر خارج الوسائط أو Esc يغلقها.
export default function MediaLightbox({ items, startIndex, onClose }: { items: LightboxItem[]; startIndex: number; onClose: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(startIndex);
  const item = items[index];
  const hasMany = items.length > 1;

  const go = (delta: number) => setIndex((i) => (i + delta + items.length) % items.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(1);
      else if (e.key === 'ArrowRight') go(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      {item.isVideo ? (
        <video
          key={item.url}
          src={item.url}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg bg-black"
        />
      ) : (
        <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full items-center justify-center">
          <SmartImage
            key={item.url}
            url={item.url}
            className="max-h-full max-w-full rounded-lg object-contain"
            fallback={
              <div className="flex flex-col items-center gap-2 rounded-xl bg-white/10 px-8 py-10 text-center text-sm text-white/80">
                <ImageOff className="h-8 w-8" />
                {t('تعذّر تحميل الصورة — قد يكون تخزين الصور متوقفاً مؤقتاً')}
              </div>
            }
          />
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t('إغلاق')}
        className="absolute end-4 top-4 rounded-full bg-white/90 p-2 text-slate-700 hover:bg-white"
      >
        <X className="h-5 w-5" />
      </button>

      {hasMany && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-700 hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-700 hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white" dir="ltr">
            {index + 1} / {items.length}
          </div>
        </>
      )}
    </div>
  );
}
