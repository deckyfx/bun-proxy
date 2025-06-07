import { create } from "zustand";

export type SnackbarType = "info" | "debug" | "warning" | "alert";

export interface Snackbar {
  id: string;
  type: SnackbarType;
  title?: string;
  message: string;
  duration?: number;
}

interface SnackbarStore {
  snackbars: Snackbar[];
  addSnackbar: (snackbar: Omit<Snackbar, "id">) => void;
  removeSnackbar: (id: string) => void;
  clearAll: () => void;
  showInfo: (message: string, title?: string, duration?: number) => void;
  showDebug: (message: string, title?: string, duration?: number) => void;
  showWarning: (message: string, title?: string, duration?: number) => void;
  showAlert: (message: string, title?: string, duration?: number) => void;
}

export const useSnackbarStore = create<SnackbarStore>((set, get) => ({
  snackbars: [],
  
  addSnackbar: (snackbar) => {
    const id = `snackbar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newSnackbar: Snackbar = {
      ...snackbar,
      id,
      duration: snackbar.duration ?? 5000,
    };
    
    set((state) => ({
      snackbars: [...state.snackbars, newSnackbar]
    }));
  },
  
  removeSnackbar: (id) => {
    set((state) => ({
      snackbars: state.snackbars.filter(snackbar => snackbar.id !== id)
    }));
  },
  
  clearAll: () => {
    set({ snackbars: [] });
  },
  
  showInfo: (message, title?, duration?) => {
    get().addSnackbar({ type: "info", message, title, duration });
  },
  
  showDebug: (message, title?, duration?) => {
    get().addSnackbar({ type: "debug", message, title, duration });
  },
  
  showWarning: (message, title?, duration?) => {
    get().addSnackbar({ type: "warning", message, title, duration });
  },
  
  showAlert: (message, title?, duration?) => {
    get().addSnackbar({ type: "alert", message, title, duration });
  },
}));