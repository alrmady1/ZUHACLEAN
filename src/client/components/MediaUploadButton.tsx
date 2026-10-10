import { useRef, useState, type ReactNode } from 'react';
import { Camera, Video, Image as ImageIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n.js';

// زر واحد لإضافة صور أو فيديو لمرحلة (قبل/بعد العمل): قائمة منسدلة بثلاثة
// خيارات — تصوير صورة بالكاميرا، تسجيل فيديو بالكاميرا، أو الاختيار من
// المعرض (صور وفيديو معاً، ويقبل أكثر من ملف). الاعتماد على الاختيار
// التلقائي للمتصفح بين الكاميرا والمعرض لم يكن ثابتاً عبر الأجهزة، لذا
// لكل خيار حقل ملف مخفي مستقل.
export default function MediaUploadButton({
  label,
  disabled,
  buttonClassName,
  menuClassName,
  onFiles,
}: {
  label: ReactNode;
  disabled?: boolean;
  buttonClassName: string;
  menuClassName?: string;
  onFiles: (files: File[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  function pick(ref: React.RefObject<HTMLInputElement | null>) {
    ref.current?.click();
    setOpen(false);
  }

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) onFiles(files);
  }

  const optionClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs font-medium text-slate-700 hover:bg-slate-100';

  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} className={buttonClassName}>
        {label}
      </button>
      {open && (
        <div className={menuClassName ?? 'absolute start-0 top-full z-10 mt-1 flex w-48 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-lg'}>
          <button type="button" onClick={() => pick(photoInput)} className={optionClass}>
            <Camera className="h-4 w-4 text-slate-500" /> {t('تصوير صورة')}
          </button>
          <button type="button" onClick={() => pick(videoInput)} className={optionClass}>
            <Video className="h-4 w-4 text-slate-500" /> {t('تسجيل فيديو')}
          </button>
          <button type="button" onClick={() => pick(galleryInput)} className={optionClass}>
            <ImageIcon className="h-4 w-4 text-slate-500" /> {t('من المعرض (صور أو فيديو)')}
          </button>
        </div>
      )}
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden onChange={handle} />
      <input ref={galleryInput} type="file" accept="image/*,video/*" multiple hidden onChange={handle} />
    </div>
  );
}
