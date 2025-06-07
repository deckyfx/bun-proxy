import { create } from 'zustand';

interface ValidationStore {
  validateEmail: (email: string) => string;
  validatePasswordMatch: (password: string, confirmPassword: string) => string;
  validateRequired: (value: string, fieldName: string) => string;
}

export const useValidationStore = create<ValidationStore>(() => ({
  validateEmail: (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      return "";
    } else if (!emailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    return "";
  },

  validatePasswordMatch: (password: string, confirmPassword: string) => {
    if (!confirmPassword) {
      return "";
    } else if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    return "";
  },

  validateRequired: (value: string, fieldName: string) => {
    if (!value || value.trim() === "") {
      return `${fieldName} is required`;
    }
    return "";
  },
}));