import React from 'react';
import { Tooltip } from './Tooltip';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Switch({ 
  checked, 
  onChange, 
  disabled = false, 
  label, 
  description, 
  tooltip,
  tooltipPosition = 'top',
  className = '' 
}: SwitchProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {(label || description || tooltip) && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            {label && (
              <span className="text-sm font-medium text-gray-700">{label}</span>
            )}
            {tooltip && (
              <div className="mt-1">
                <Tooltip
                  content={tooltip}
                  position={tooltipPosition}
                />
              </div>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-500">{description}</p>
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