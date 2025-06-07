import { create } from "zustand";
import type { ReactNode } from "react";

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

interface DialogStore {
  dialogs: Dialog[];
  openDialog: (dialog: Omit<Dialog, "id" | "isOpen">) => string;
  closeDialog: (id: string) => void;
  closeAll: () => void;
  
  // Helper methods
  showAlert: (
    message: string, 
    options?: { 
      title?: string; 
      confirmText?: string; 
      onConfirm?: () => void; 
    }
  ) => Promise<void>;
  
  showConfirm: (
    message: string, 
    options?: { 
      title?: string; 
      confirmText?: string; 
      cancelText?: string; 
    }
  ) => Promise<boolean>;
  
  showPrompt: (
    message: string, 
    options?: { 
      title?: string; 
      placeholder?: string; 
      defaultValue?: string; 
      confirmText?: string; 
      cancelText?: string; 
    }
  ) => Promise<string | null>;
  
  showCustom: (
    content: ReactNode, 
    options?: { 
      title?: string; 
      showCloseButton?: boolean; 
      onClose?: () => void; 
    }
  ) => string;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  dialogs: [],
  
  openDialog: (dialog) => {
    const id = `dialog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newDialog: Dialog = {
      ...dialog,
      id,
      isOpen: true,
    } as Dialog;
    
    set((state) => ({
      dialogs: [...state.dialogs, newDialog]
    }));
    
    return id;
  },
  
  closeDialog: (id) => {
    set((state) => ({
      dialogs: state.dialogs.filter(dialog => dialog.id !== id)
    }));
  },
  
  closeAll: () => {
    set({ dialogs: [] });
  },
  
  showAlert: (message, options = {}) => {
    return new Promise<void>((resolve) => {
      get().openDialog({
        type: "alert",
        title: options.title || "Alert",
        message,
        confirmText: options.confirmText || "OK",
        onConfirm: () => {
          options.onConfirm?.();
          resolve();
        },
      });
    });
  },
  
  showConfirm: (message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      get().openDialog({
        type: "confirm",
        title: options.title || "Confirm",
        message,
        confirmText: options.confirmText || "Yes",
        cancelText: options.cancelText || "No",
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  },
  
  showPrompt: (message, options = {}) => {
    return new Promise<string | null>((resolve) => {
      get().openDialog({
        type: "prompt",
        title: options.title || "Input",
        message,
        placeholder: options.placeholder,
        defaultValue: options.defaultValue,
        confirmText: options.confirmText || "OK",
        cancelText: options.cancelText || "Cancel",
        onConfirm: (value) => resolve(value),
        onCancel: () => resolve(null),
      });
    });
  },
  
  showCustom: (content, options = {}) => {
    return get().openDialog({
      type: "custom",
      title: options.title,
      content,
      showCloseButton: options.showCloseButton ?? true,
      onClose: options.onClose,
    });
  },
}));