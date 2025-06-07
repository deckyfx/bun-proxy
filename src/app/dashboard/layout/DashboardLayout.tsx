import type { ReactNode } from "react";
import { TopNavBar } from "./TopNavBar";
import { LeftDrawerNav } from "./LeftDrawerNav";
import { MainContent } from "./MainContent";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopNavBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftDrawerNav />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}