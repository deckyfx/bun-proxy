import * as RadixTabs from '@radix-ui/react-tabs';
import { type ReactNode } from 'react';
import { cn } from '@app/utils/cn';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  icon?: string;
}

export interface RadixTabsProps {
  tabs: TabItem[];
  defaultTab?: string;
  className?: string;
}

export function Tabs({ tabs, defaultTab, className = '' }: RadixTabsProps) {
  return (
    <RadixTabs.Root
      className={cn('w-full', className)}
      defaultValue={defaultTab || tabs[0]?.id}
    >
      {/* Tab Navigation */}
      <RadixTabs.List className="border-b border-gray-200 bg-gray-50">
        <nav className="-mb-px flex" aria-label="Tabs">
          {tabs.map((tab) => (
            <RadixTabs.Trigger
              key={tab.id}
              value={tab.id}
              className={cn([
                'whitespace-nowrap py-3 px-6 border-b-2 border-r border-gray-200 font-medium text-sm flex items-center gap-2 transition-colors',
                'data-[state=active]:border-b-blue-500 data-[state=active]:text-blue-600 data-[state=active]:bg-white',
                'data-[state=inactive]:border-b-transparent data-[state=inactive]:text-gray-500',
                'hover:text-gray-700 hover:border-b-gray-300 hover:bg-gray-100',
                'focus:outline-none'
              ])}
            >
              {tab.icon && (
                <span className="material-icons text-lg">{tab.icon}</span>
              )}
              {tab.label}
            </RadixTabs.Trigger>
          ))}
        </nav>
      </RadixTabs.List>

      {/* Tab Content */}
      {tabs.map((tab) => (
        <RadixTabs.Content
          key={tab.id}
          value={tab.id}
          className="mt-6 focus:outline-none"
        >
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

export default Tabs;