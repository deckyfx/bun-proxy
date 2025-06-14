import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: (ClassValue | ClassValue[])[]) {
  return twMerge(clsx(inputs.flat()))
}