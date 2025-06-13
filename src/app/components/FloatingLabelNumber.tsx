import React, { useState, useRef, useEffect } from "react";
import { TextField } from "@radix-ui/themes";
import { cn } from "@app/utils/cn";

interface FloatingLabelNumberProps extends Omit<React.ComponentProps<typeof TextField.Root>, 'placeholder' | 'type'> {
  label: string;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  status?: 'error' | 'warning' | 'success';
  message?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export function FloatingLabelNumber({ label, id, min, max, step, className, status, message, icon, iconPosition = 'left', ...props }: FloatingLabelNumberProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setHasValue(inputRef.current?.value !== '');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasValue(e.target.value !== '');
    if (props.onChange) {
      props.onChange(e);
    }
  };

  // Check for initial value on mount
  useEffect(() => {
    if (inputRef.current?.value) {
      setHasValue(true);
    }
  }, [props.value, props.defaultValue]);

  const isFloating = isFocused || hasValue;

  const getStatusColors = () => {
    switch (status) {
      case 'error':
        return {
          border: 'border-red-500',
          label: isFloating ? 'text-red-600' : 'text-gray-500',
          message: 'text-red-600'
        };
      case 'warning':
        return {
          border: 'border-yellow-500',
          label: isFloating ? 'text-yellow-600' : 'text-gray-500',
          message: 'text-yellow-600'
        };
      case 'success':
        return {
          border: 'border-green-500',
          label: isFloating ? 'text-green-600' : 'text-gray-500',
          message: 'text-green-600'
        };
      default:
        return {
          border: '',
          label: isFloating ? 'text-blue-600' : 'text-gray-500',
          message: 'text-gray-600'
        };
    }
  };

  const colors = getStatusColors();

  return (
    <div className={cn("relative", message && "mb-6", className)}>
      <div className="relative">
        <TextField.Root
          ref={inputRef}
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          className={cn([
            "floating-input", 
            status && colors.border,
            icon && iconPosition === 'left' && "icon-left",
            icon && iconPosition === 'right' && "icon-right"
          ])}
          {...props}
        />
        
        {icon && (
          <div className={cn([
            "absolute",
            "top-1/2",
            "-translate-y-1/2",
            "flex",
            "items-center",
            "justify-center",
            "w-5",
            "h-5",
            "text-gray-500",
            "pointer-events-none",
            iconPosition === 'left' ? "left-3" : "right-3"
          ])}>
            {icon}
          </div>
        )}
      </div>
      
      <label
        htmlFor={id}
        className={cn([
          "absolute",
          "left-3",
          "transition-all",
          "duration-200",
          "ease-in-out",
          "pointer-events-none",
          "z-10",
          colors.label,
          isFloating ? [
            "top-0",
            "text-sm",
            "bg-white",
            "px-1",
            "-translate-y-1/2",
            icon && iconPosition === 'left' ? "translate-x-7" : "translate-x-0"
          ] : [
            "top-1/2",
            "-translate-y-1/2",
            "text-base",
            icon && iconPosition === 'left' ? "translate-x-7" : "translate-x-0"
          ]
        ])}
      >
        {label}
      </label>
      {message && (
        <div className={cn(["absolute", "top-full", "left-0", "text-xs", "mt-1", colors.message])}>
          {message}
        </div>
      )}
    </div>
  );
}