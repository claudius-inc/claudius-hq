"use client";

import { useState, useCallback, useRef } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ConfirmOptions {
  variant?: "danger" | "default";
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingConfirm {
  resolve: (value: boolean) => void;
  title: string;
  message: string;
  options: Required<ConfirmOptions>;
}

export function useConfirmDialog() {
  const [current, setCurrent] = useState<PendingConfirm | null>(null);
  const queueRef = useRef<PendingConfirm[]>([]);

  const confirm = useCallback(
    (title: string, message: string, options?: ConfirmOptions): Promise<boolean> => {
      const opts: Required<ConfirmOptions> = {
        variant: options?.variant ?? "danger",
        confirmLabel: options?.confirmLabel ?? "Confirm",
        cancelLabel: options?.cancelLabel ?? "Cancel",
      };

      return new Promise<boolean>((resolve) => {
        const pending: PendingConfirm = { resolve, title, message, options: opts };

        if (current) {
          // Queue if one is already showing
          queueRef.current.push(pending);
        } else {
          setCurrent(pending);
        }
      });
    },
    [current],
  );

  const handleClose = useCallback(() => {
    if (current) {
      current.resolve(false);
      setCurrent(null);
    }
    // Process next in queue
    if (queueRef.current.length > 0) {
      setCurrent(queueRef.current.shift()!);
    }
  }, [current]);

  const handleConfirm = useCallback(() => {
    if (current) {
      current.resolve(true);
      setCurrent(null);
    }
    // Process next in queue
    if (queueRef.current.length > 0) {
      setCurrent(queueRef.current.shift()!);
    }
  }, [current]);

  const dialogProps = current
    ? {
        open: true,
        title: current.title,
        message: current.message,
        confirmLabel: current.options.confirmLabel,
        cancelLabel: current.options.cancelLabel,
        variant: current.options.variant,
        onClose: handleClose,
        onConfirm: handleConfirm,
      }
    : {
        open: false,
        title: "",
        message: "",
        onClose: () => {},
        onConfirm: () => {},
      };

  return { confirm, dialogProps };
}
