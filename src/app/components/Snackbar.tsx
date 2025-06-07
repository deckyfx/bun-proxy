import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";

import type { SnackbarType } from "@app/stores/snackbarStore";

export interface SnackbarProps {
  id: string;
  type: SnackbarType;
  title?: string;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
}

const snackbarConfig = {
  info: {
    icon: "info",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    iconColor: "text-blue-600",
    titleColor: "text-blue-900",
    messageColor: "text-blue-800",
  },
  debug: {
    icon: "bug_report",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    iconColor: "text-gray-600",
    titleColor: "text-gray-900",
    messageColor: "text-gray-800",
  },
  warning: {
    icon: "warning",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    iconColor: "text-yellow-600",
    titleColor: "text-yellow-900",
    messageColor: "text-yellow-800",
  },
  alert: {
    icon: "error",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    iconColor: "text-red-600",
    titleColor: "text-red-900",
    messageColor: "text-red-800",
  },
};

export function Snackbar({ 
  id, 
  type, 
  title, 
  message, 
  duration = 5000, 
  onClose 
}: SnackbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const config = snackbarConfig[type];

  useEffect(() => {
    // Trigger enter animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose(id);
    }, 300);
  };

  return (
    <div
      className={`
        ${config.bgColor} ${config.borderColor} 
        border rounded-lg shadow-lg p-4 mb-3 min-w-80 max-w-md
        transition-all duration-300 ease-in-out transform
        ${isVisible && !isLeaving 
          ? "translate-x-0 opacity-100" 
          : "translate-x-full opacity-0"
        }
      `}
    >
      <div className="flex items-start space-x-3">
        <Icon 
          name={config.icon} 
          size={20} 
          className={`${config.iconColor} mt-0.5 flex-shrink-0`} 
        />
        
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`text-sm font-semibold ${config.titleColor} mb-1`}>
              {title}
            </h4>
          )}
          <p className={`text-sm ${config.messageColor}`}>
            {message}
          </p>
        </div>
        
        <button
          onClick={handleClose}
          className={`${config.iconColor} hover:opacity-70 transition-opacity clickable flex-shrink-0`}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}