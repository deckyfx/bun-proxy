import React, { useState, useId } from "react";

interface FloatingLabelInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
}

export function FloatingLabelInput({
  label,
  error,
  className = '',
  value,
  onFocus,
  onBlur,
  ...props
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputId = useId();
  
  const hasValue = value !== undefined && value !== '';
  const isFloating = isFocused || hasValue;

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <div className="relative">
      <input
        id={inputId}
        value={value}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`
          w-full px-4 pt-6 pb-2 border rounded-md
          focus:outline-none focus:ring-2 focus:ring-blue-500
          disabled:bg-gray-100 disabled:cursor-not-allowed
          transition-all duration-200
          ${error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'}
          ${props.type === 'password' ? 'password-dots' : ''}
          ${className}
        `.replace(/\s+/g, ' ').trim()}
        {...props}
      />
      <label
        htmlFor={inputId}
        className={`
          absolute left-4 transition-all duration-200 cursor-text pointer-events-none
          ${isFloating 
            ? 'top-2 text-xs text-gray-500' 
            : 'top-1/2 -translate-y-1/2 text-base text-gray-400'
          }
          ${isFocused && !error ? 'text-blue-500' : ''}
          ${error ? 'text-red-500' : ''}
        `.replace(/\s+/g, ' ').trim()}
      >
        {label}
      </label>
      {error && (
        <p className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}