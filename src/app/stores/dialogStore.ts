import { create } from "zustand";
import type { ReactNode } from "react";
import type { Dialog, AlertDialog, ConfirmDialog, PromptDialog, CustomDialog } from "@src/types/ui";

// Re-export Dialog type for components
export type { Dialog } from "@src/types/ui";

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
    const id = `dialog_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
      const alertDialog: Omit<AlertDialog, "id" | "isOpen"> = {
        type: "alert",
        title: options.title || "Alert",
        message,
        confirmText: options.confirmText || "OK",
        onConfirm: () => {
          options.onConfirm?.();
          resolve();
        },
      };
      get().openDialog(alertDialog);
    });
  },
  
  showConfirm: (message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      const confirmDialog: Omit<ConfirmDialog, "id" | "isOpen"> = {
        type: "confirm",
        title: options.title || "Confirm",
        message,
        confirmText: options.confirmText || "Yes",
        cancelText: options.cancelText || "No",
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      };
      get().openDialog(confirmDialog);
    });
  },
  
  showPrompt: (message, options = {}) => {
    return new Promise<string | null>((resolve) => {
      const promptDialog: Omit<PromptDialog, "id" | "isOpen"> = {
        type: "prompt",
        title: options.title || "Input",
        message,
        placeholder: options.placeholder,
        defaultValue: options.defaultValue,
        confirmText: options.confirmText || "OK",
        cancelText: options.cancelText || "Cancel",
        onConfirm: (value: string) => resolve(value),
        onCancel: () => resolve(null),
      };
      get().openDialog(promptDialog);
    });
  },
  
  showCustom: (content, options = {}) => {
    const customDialog: Omit<CustomDialog, "id" | "isOpen"> = {
      type: "custom",
      title: options.title,
      content,
      showCloseButton: options.showCloseButton ?? true,
      onClose: options.onClose,
    };
    return get().openDialog(customDialog);
  },
}));