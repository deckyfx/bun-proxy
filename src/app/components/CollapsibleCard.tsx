import React, { useState } from "react";
import { Card } from "@radix-ui/themes";
import { cn } from "@app/utils/cn";

interface CollapsibleCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  variant?: "classic" | "surface" | "ghost";
  size?: "1" | "2" | "3" | "4";
}

export function CollapsibleCard({ 
  title, 
  children, 
  className, 
  defaultCollapsed = false,
  variant,
  size,
  ...props 
}: CollapsibleCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={cn("relative", className)}>
      <Card variant={variant} size={size} {...props}>
        <div className={cn([
          "transition-all",
          "duration-300",
          "ease-in-out",
          "overflow-visible",
          "pt-4",
          isCollapsed ? "max-h-0 overflow-hidden" : "max-h-none"
        ])}>
          {children}
        </div>
      </Card>
      
      {/* Floating title */}
      <div 
        className={cn([
          "absolute",
          "top-0",
          "left-4",
          "text-sm",
          "font-medium",
          "bg-white",
          "px-2",
          "-translate-y-1/2",
          "text-gray-700",
          "cursor-pointer",
          "flex",
          "items-center",
          "gap-1",
          "hover:text-blue-600",
          "transition-colors",
          "duration-200",
          "z-10"
        ])}
        onClick={toggleCollapsed}
      >
        <span>{title}</span>
        <span className={cn([
          "text-xs",
          "transition-transform",
          "duration-300",
          isCollapsed ? "rotate-180" : "rotate-0"
        ])}>
          ▼
        </span>
      </div>
    </div>
  );
}