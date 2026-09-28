import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toastVariants } from './motion';
import { cx, focusRing } from './design';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ notify: (message: string, type?: ToastType) => void } | undefined>(undefined);

const DURATION_MS = 4000;
/** Bir vaqtning oʻzida koʻrinadigan maksimal xabar soni. */
const MAX_VISIBLE = 3;

const TONE: Record<ToastType, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-emerald-600' },
  error: { icon: XCircle, className: 'text-red-600' },
  info: { icon: Info, className: 'text-orange-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        // Bir xil xabar ketma-ket kelsa (masalan bir tugma tez bosilsa)
        // ekranni toʻldirmasligi kerak.
        const deduped = prev.filter((t) => t.message !== message);
        return [...deduped, { id, message, type }].slice(-MAX_VISIBLE);
      });
      timers.current.set(id, setTimeout(() => remove(id), DURATION_MS));
    },
    [remove]
  );

  // Ilova yopilganda kutilayotgan taymerlarni tozalaymiz.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  // Global offline/online holati — butun ilova uchun bitta listener.
  useEffect(() => {
    const onOffline = () => notify('Internet ulanishi yoʻq', 'error');
    const onOnline = () => notify('Internet ulanishi tiklandi', 'success');
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [notify]);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {/*
        `role="status"` + `aria-live="polite"` — skrinrider foydalanuvchisi
        ham "Savatga qo'shildi" kabi xabarlarni eshitadi. Ilgari bu xabarlar
        faqat ko'zga ko'rinardi.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottom-nav-h)+0.75rem)] z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end lg:bottom-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const tone = TONE[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                variants={toastVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-overlay"
              >
                <tone.icon className={cx('mt-0.5 h-5 w-5 shrink-0', tone.className)} aria-hidden="true" />
                <p className="flex-1 text-sm leading-snug text-ink-800">{t.message}</p>
                <button
                  onClick={() => remove(t.id)}
                  className={cx('-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-400 hover:bg-ink-100 hover:text-ink-700', focusRing)}
                  aria-label="Xabarni yopish"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
