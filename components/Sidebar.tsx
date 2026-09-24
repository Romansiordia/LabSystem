
import React from 'react';
import { View } from '../types';
import { DashboardIcon, ClientIcon, TechnicianIcon, AnalysisIcon, SettingsIcon, NewAnalysisIcon, AnalysisCostIcon, ProductIcon } from './icons/Icons';

const LogoutIcon: React.FC = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
);

interface SidebarProps {
  activeView: View;
  setActiveView: (view: View) => void;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, onLogout, onRefresh, isRefreshing }) => {
  const navItems: { id: View; label: string; icon: React.ReactElement }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { id: 'clients', label: 'Clients', icon: <ClientIcon /> },
    { id: 'technicians', label: 'Technicians', icon: <TechnicianIcon /> },
    { id: 'products', label: 'Products', icon: <ProductIcon /> },
    { id: 'newAnalysis', label: 'New Analysis', icon: <NewAnalysisIcon /> },
    { id: 'analyses', label: 'Analyses', icon: <AnalysisIcon /> },
    { id: 'analysisCosts', label: 'Analysis Costs', icon: <AnalysisCostIcon /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  return (
    <aside className="w-64 bg-primary text-white flex flex-col">
      <div className="flex items-center justify-center h-20 border-b border-blue-800">
        <h1 className="text-2xl font-bold tracking-wider">LabSys</h1>
      </div>
      <nav className="flex-1 px-4 py-6">
        <ul>
          {navItems.map((item) => (
            <li key={item.id} className="mb-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView(item.id);
                }}
                className={`flex items-center p-3 rounded-lg transition-colors ${
                  activeView === item.id
                    ? 'bg-secondary'
                    : 'hover:bg-blue-800'
                }`}
              >
                {item.icon}
                <span className="ml-4 text-md font-medium">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-blue-800 space-y-2">
         {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="w-full flex items-center justify-center p-2.5 rounded-lg transition-colors bg-blue-800 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
              title="Sincronizar datos con Google Sheets"
            >
              <svg className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{isRefreshing ? 'Sincronizando...' : 'Actualizar Datos'}</span>
            </button>
         )}
         <button
            onClick={onLogout}
            className="w-full flex items-center p-3 rounded-lg transition-colors bg-red-600 hover:bg-red-700"
          >
            <LogoutIcon />
            <span className="ml-4 text-md font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
