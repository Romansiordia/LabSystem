
import React from 'react';

interface CardProps {
  title: string;
  value: string;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ title, value, className }) => {
  return (
    <div className={`p-6 rounded-lg shadow-md ${className || 'bg-white'}`}>
      <h3 className="text-md font-medium text-gray-500">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-gray-800">{value}</p>
    </div>
  );
};
