import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useI18n } from '../lib/i18n.js';

export interface LightboxItem {
  url: string;
  isVideo: boolean;
}

// مصغّرة قابلة للنقر داخل شبكة الوسائط — تفتح المعاينة بدل تشغيل الفيديو
// داخل المربع الصغير (الفيديو يُعرض إطاره الأول مع أيقونة تشغيل).
export function MediaThumb({ item, alt, onOpen }: { item: LightboxItem; alt?: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative h-full w-full overflow-hidden rounded-xl bg-black">
      {item.isVideo ? (
        <>
          <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-full bg-white/90 p-2 text-slate-700">
              <Play className="h-5 w-5" />
            </span>
          </span>
        </>
      ) : (
        <img src={item.url} alt={alt ?? ''} className="h-full w-full object-cover" />
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
        <img src={item.url} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />
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
