
import React from 'react';

interface PortalSelectionProps {
    setAppMode: (mode: 'login' | 'admin' | 'client' | 'clientLogin' | 'adminLogin') => void;
}

const PortalSelection: React.FC<PortalSelectionProps> = ({ setAppMode }) => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-lg text-center">
                <div className="bg-white p-10 rounded-2xl shadow-lg">
                    <h1 className="text-4xl font-bold text-primary tracking-wider mb-2">LabSys</h1>
                    <p className="text-gray-500 mb-8">Quality Control Management System</p>
                    
                    <div className="space-y-4">
                        <button
                            onClick={() => setAppMode('adminLogin')}
                            className="w-full text-lg py-4 px-6 bg-primary text-white font-semibold rounded-lg hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-transform transform hover:scale-105"
                        >
                            Admin Panel
                        </button>
                        <button
                            onClick={() => setAppMode('clientLogin')}
                            className="w-full text-lg py-4 px-6 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-transform transform hover:scale-105"
                        >
                            Client Portal
                        </button>
                        <button
                            onClick={() => {
                                localStorage.removeItem('googleScriptUrl');
                                window.location.reload();
                            }}
                            className="w-full text-sm py-2 px-4 text-gray-500 hover:text-primary transition-colors"
                        >
                            Configure System URL
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortalSelection;
