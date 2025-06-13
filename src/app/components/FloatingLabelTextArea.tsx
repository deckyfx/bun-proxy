import React, { useState, useRef, useEffect } from "react";
import { TextArea } from "@radix-ui/themes";
import { cn } from "@app/utils/cn";

interface FloatingLabelTextAreaProps extends Omit<React.ComponentProps<typeof TextArea>, 'placeholder'> {
  label: string;
  id?: string;
  status?: 'error' | 'warning' | 'success';
  message?: string;
}

export function FloatingLabelTextArea({ label, id, className, status, message, ...props }: FloatingLabelTextAreaProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setHasValue(textAreaRef.current?.value !== '');
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHasValue(e.target.value !== '');
    if (props.onChange) {
      props.onChange(e);
    }
  };

  // Check for initial value on mount
  useEffect(() => {
    if (textAreaRef.current?.value) {
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
      <TextArea
        ref={textAreaRef}
        id={id}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        className={cn(["floating-input", status && colors.border])}
        style={{ 
          paddingTop: '1.5rem',
          paddingBottom: '0.5rem',
          minHeight: '6rem',
          maxHeight: '12rem',
          resize: 'vertical',
          overflow: 'auto'
        }}
        {...props}
      />
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
            "-translate-y-1/2"
          ] : [
            "top-4",
            "left-3",
            "text-base"
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