
import React from 'react';
import { PencilIcon, TrashIcon, PrintIcon } from '../icons/Icons';

interface TableProps {
  headers: string[];
  data: (string | number)[][];
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  onPrint?: (index: number) => void;
}

const Table: React.FC<TableProps> = ({ headers, data, onEdit, onDelete, onPrint }) => {
  const showActions = onEdit || onDelete || onPrint;
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-md">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
            {showActions && (
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {cell}
                </td>
              ))}
              {showActions && (
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-4">
                    {onPrint && (
                         <button onClick={() => onPrint(rowIndex)} className="text-gray-600 hover:text-gray-900" aria-label="Print">
                            <PrintIcon />
                        </button>
                    )}
                    {onEdit && (
                      <button onClick={() => onEdit(rowIndex)} className="text-blue-600 hover:text-blue-900" aria-label="Edit">
                        <PencilIcon />
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(rowIndex)} className="text-red-600 hover:text-red-900" aria-label="Delete">
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Table;