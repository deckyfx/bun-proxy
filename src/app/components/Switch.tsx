import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  className?: string;
}

export function Switch({ 
  checked, 
  onChange, 
  disabled = false, 
  label, 
  description, 
  className = '' 
}: SwitchProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      {(label || description) && (
        <div>
          {label && (
            <label className="text-sm font-medium text-gray-700">{label}</label>
          )}
          {description && (
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}