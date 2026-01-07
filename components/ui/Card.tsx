
import React from 'react';

interface CardProps {
  title: string;
  value: string;
}

export const Card: React.FC<CardProps> = ({ title, value }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-md font-medium text-gray-500">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-gray-800">{value}</p>
    </div>
  );
};
