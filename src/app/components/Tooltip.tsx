import React, { useState } from 'react';
import { Icon } from './Icon';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, position = 'top', className = '' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-1',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-t-gray-800 border-t-[6px] border-x-transparent border-x-[6px] border-b-0',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-800 border-b-[6px] border-x-transparent border-x-[6px] border-t-0',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-l-gray-800 border-l-[6px] border-y-transparent border-y-[6px] border-r-0',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-r-gray-800 border-r-[6px] border-y-transparent border-y-[6px] border-l-0',
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children || <Icon name="help" className="h-4 w-4 text-gray-400 hover:text-gray-600" />}
      </div>
      
      {isVisible && (
        <div className="absolute z-50">
          <div className={`absolute ${positionClasses[position]} w-max min-w-[200px] max-w-sm`}>
            <div className="bg-gray-800 text-white text-xs rounded-md px-3 py-2 shadow-lg">
              {content}
            </div>
            <div className={`absolute ${arrowClasses[position]}`} />
          </div>
        </div>
      )}
    </div>
  );
}