import React from 'react';
import { Icon } from './Icon';

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  placeholder?: string;
  className?: string;
}

export function Select({ 
  options, 
  value, 
  onChange, 
  disabled = false, 
  label, 
  description, 
  placeholder = 'Select an option',
  className = '' 
}: SelectProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => !disabled && onChange(e.target.value)}
          disabled={disabled}
          className={`appearance-none block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm ${
            disabled ? 'bg-gray-100 cursor-not-allowed text-gray-400' : 'hover:border-gray-400'
          } transition-colors duration-200`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <Icon 
            name="expand_more" 
            className={`h-5 w-5 ${disabled ? 'text-gray-400' : 'text-gray-500'}`} 
          />
        </div>
      </div>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  );
}