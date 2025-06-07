import type { ReactNode } from "react";

interface PageContainerProps {
  title: string;
  children: ReactNode;
  maxWidth?: "4xl" | "6xl" | "full";
  actions?: ReactNode;
}

export function PageContainer({ 
  title, 
  children, 
  maxWidth = "full",
  actions 
}: PageContainerProps) {
  const maxWidthClass = {
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl", 
    "full": "max-w-full"
  }[maxWidth];

  return (
    <div className={`p-4 ${maxWidthClass}`}>
      <div className={`flex ${actions ? "justify-between items-center" : ""} mb-6`}>
        <h1 className="text-3xl font-bold">{title}</h1>
        {actions && <div>{actions}</div>}
      </div>
      {children}
    </div>
  );
}