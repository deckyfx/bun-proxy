import type { ReactNode } from "react";

// Dialog Types
export type DialogType = "alert" | "confirm" | "prompt" | "custom";

export interface BaseDialog {
  id: string;
  type: DialogType;
  title?: string;
  isOpen: boolean;
}

export interface AlertDialog extends BaseDialog {
  type: "alert";
  message: string;
  confirmText?: string;
  onConfirm?: () => void;
}

export interface ConfirmDialog extends BaseDialog {
  type: "confirm";
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface PromptDialog extends BaseDialog {
  type: "prompt";
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
}

export interface CustomDialog extends BaseDialog {
  type: "custom";
  content: ReactNode;
  showCloseButton?: boolean;
  onClose?: () => void;
}

export type Dialog = AlertDialog | ConfirmDialog | PromptDialog | CustomDialog;

// Snackbar Types
export type SnackbarType = "info" | "debug" | "warning" | "alert";

export interface Snackbar {
  id: string;
  type: SnackbarType;
  title?: string;
  message: string;
  duration?: number;
}

// Validation Types
export interface ValidationErrors {
  [field: string]: string;
}

export interface FormField {
  value: string;
  error: string;
  touched: boolean;
}