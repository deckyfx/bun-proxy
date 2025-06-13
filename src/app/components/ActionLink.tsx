import React from "react";
import { Link } from "@radix-ui/themes";

interface ActionLinkProps {
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  color?: "red" | "blue" | "green" | "gray";
  title?: string;
}

export function ActionLink({ 
  icon, 
  onClick, 
  disabled = false, 
  color,
  title 
}: ActionLinkProps) {
  return (
    <Link
      href="#"
      color={color}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) {
          onClick();
        }
      }}
      style={{
        pointerEvents: disabled ? 'none' : 'auto',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      <span className="material-icons text-sm">{icon}</span>
    </Link>
  );
}