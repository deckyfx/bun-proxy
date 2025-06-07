import React from 'react';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 24, className = '' }) => {
  return (
    <span 
      className={`material-icons ${className}`} 
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
};

export default Icon;