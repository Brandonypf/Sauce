"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const toast = React.useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[40] flex flex-col gap-2 max-sm:inset-x-4 max-sm:items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "pointer-events-auto flex min-w-[280px] items-center gap-3 rounded-md border border-default bg-bg-surface px-4 py-3 shadow-lg",
                t.type === "success" ? "border-l-4 border-l-success" : "border-l-4 border-l-danger",
              )}
              role="status"
              aria-live="polite"
            >
              {t.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
              )}
              <p className="text-small text-text-primary">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
