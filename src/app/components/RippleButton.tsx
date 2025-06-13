import React, { useRef } from "react";
import { Button } from "@radix-ui/themes";
import { cn } from "@app/utils/cn";

interface RippleButtonProps extends React.ComponentProps<typeof Button> {
  children: React.ReactNode;
  loading?: boolean;
}

export function RippleButton({ children, className, onClick, loading, ...props }: RippleButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Don't create ripple if loading or disabled
    if (loading || props.disabled) return;
    
    const button = buttonRef.current;
    if (!button) return;

    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add("ripple-effect");

    const ripple = button.getElementsByClassName("ripple-effect")[0];
    if (ripple) {
      ripple.remove();
    }

    button.appendChild(circle);

    // Remove ripple after animation
    setTimeout(() => {
      circle.remove();
    }, 600);

    // Call original onClick if provided and not loading
    if (onClick && !loading) {
      onClick(event);
    }
  };

  return (
    <Button
      ref={buttonRef}
      className={cn("ripple-button", loading && "loading-button", className)}
      onClick={createRipple}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <span className="loading-spinner"></span>
      )}
      <span className={cn("flex items-center gap-2", loading && "opacity-70")}>
        {children}
      </span>
    </Button>
  );
}