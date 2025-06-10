import { create } from 'zustand';

interface ValidationStore {
  validateEmail: (email: string) => string;
  validateUsername: (username: string) => string;
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

  validateUsername: (username: string) => {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!username) {
      return "";
    } else if (!usernameRegex.test(username)) {
      return "Username must be 3-20 characters and contain only letters, numbers, underscores, or hyphens";
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