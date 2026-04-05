
import React from 'react';
import { AnalysisStatus } from '../../types';

interface StatusBadgeProps {
  status: AnalysisStatus | string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-800';
  let label = status;

  switch (status) {
    case 'Completed':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      label = 'Completo';
      break;
    case 'Received':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      label = 'Recibido';
      break;
    case 'In Progress':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      label = 'En Proceso';
      break;
    case 'Cancelled':
      bgColor = 'bg-gray-200';
      textColor = 'text-gray-600';
      label = 'Cancelado';
      break;
    default:
      break;
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {label}
    </span>
  );
};

export default StatusBadge;
