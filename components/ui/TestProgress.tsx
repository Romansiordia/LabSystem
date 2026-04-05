
import React from 'react';
import { AnalysisResultItem } from '../../types';

interface TestProgressProps {
  requestedTests: string[];
  results: AnalysisResultItem[];
}

const TestProgress: React.FC<TestProgressProps> = ({ requestedTests, results }) => {
  const completedCount = (results || []).filter(r => r.value !== null && r.value !== '').length;
  const totalCount = requestedTests.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">
          {completedCount}/{totalCount}
        </span>
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300" 
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {requestedTests.map((test, idx) => {
          const result = (results || []).find(r => r.testName === test);
          const isCompleted = result && result.value !== null && result.value !== '';
          
          return (
            <span 
              key={idx}
              title={test}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${
                isCompleted 
                  ? 'bg-green-50 border-green-200 text-green-700' 
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
            >
              {test}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default TestProgress;
