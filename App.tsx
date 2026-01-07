
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ClientManagement from './components/ClientManagement';
import TechnicianManagement from './components/TechnicianManagement';
import AnalysisManagement from './components/AnalysisManagement';
import Settings from './components/Settings';
import AnalysisRequest from './components/AnalysisRequest';
import AnalysisCostsManagement from './components/AnalysisCostsManagement';
import ClientPortal from './components/ClientPortal';
import ClientLogin from './components/ClientLogin';
import AdminLogin from './components/AdminLogin';
import PortalSelection from './components/PortalSelection';
import Loader from './components/ui/Loader';
import { View, Client, Technician, Analysis, AnalysisCost, AnalysisType, LoggedInClient } from './types';

const App: React.FC = () => {
    // State for app mode and logged in client/admin
    const [appMode, setAppMode] = useState<'login' | 'admin' | 'client' | 'clientLogin' | 'adminLogin'>('login');
    const [loggedInClient, setLoggedInClient] = useState<LoggedInClient | null>(null);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [googleScriptUrl, setGoogleScriptUrl] = useState<string | null>(localStorage.getItem('googleScriptUrl'));

    // State for data
    const [clients, setClients] = useState<Client[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [analyses, setAnalyses] = useState<Analysis[]>([]);
    const [analysisCosts, setAnalysisCosts] = useState<AnalysisCost[]>([]);
    const [analysisTypes, setAnalysisTypes] = useState<AnalysisType[]>([]);

    // UI State
    const [activeView, setActiveView] = useState<View>('dashboard');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const reloadData = async () => {
        setLoading(true);
        setError(null);
        
        if (!googleScriptUrl) {
            setError('Google Sheets URL not configured. Please set it in Settings.');
            setLoading(false);
            if(appMode === 'admin') {
                setActiveView('settings');
            }
            return;
        }

        try {
            const response = await fetch(googleScriptUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}. Check CORS settings on your script deployment.`);
            }
            const data = await response.json();
            
            if (data.status === 'error') {
                 throw new Error(`Script error: ${data.message}`);
            }
            
            if(!data.clients || !data.technicians || !data.analysisResults || !data.analysisCosts || !data.analysisTypes) {
                throw new Error("Data from Google Sheet is incomplete. Check if all required sheets (Clients, Technicians, etc.) exist and are not empty.");
            }

            setClients(data.clients);
            setTechnicians(data.technicians);
            setAnalyses(data.analysisResults);
            setAnalysisCosts(data.analysisCosts);
            setAnalysisTypes(data.analysisTypes);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            setError(`Failed to load data from Google Sheets. Error: ${errorMessage}`);
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    
    const handleUrlSaved = (url: string) => {
        localStorage.setItem('googleScriptUrl', url);
        setGoogleScriptUrl(url);
        setAppMode('login'); // Go back to login selection after URL is saved.
    };


    useEffect(() => {
        // Only load data if the admin is authenticated and in admin mode
        if (appMode === 'admin' && isAdminAuthenticated && googleScriptUrl) {
            reloadData();
        } else {
            setLoading(false);
        }
    }, [appMode, isAdminAuthenticated, googleScriptUrl]);
    
    const handleClientLoginSuccess = (client: LoggedInClient) => {
        setLoggedInClient(client);
        setAppMode('client');
    };

    const handleAdminLoginSuccess = () => {
        setIsAdminAuthenticated(true);
        setAppMode('admin');
    }

    const handleLogout = () => {
        setLoggedInClient(null);
        setIsAdminAuthenticated(false);
        setAppMode('login');
    };
    
    // --- INITIAL SETUP FLOW ---
    // If there is no URL, force the user into the settings page to configure it.
    if (!googleScriptUrl) {
        return <Settings isInitialSetup={true} onUrlSaved={handleUrlSaved} />;
    }

    // --- REGULAR APP FLOW ---
    if (appMode === 'login') {
        return <PortalSelection setAppMode={setAppMode} />;
    }

    if (appMode === 'clientLogin') {
        return <ClientLogin onLoginSuccess={handleClientLoginSuccess} setAppMode={setAppMode} />;
    }

    if (appMode === 'adminLogin') {
        return <AdminLogin onLoginSuccess={handleAdminLoginSuccess} setAppMode={setAppMode} />;
    }

    if (appMode === 'client' && loggedInClient) {
        return <ClientPortal clientInfo={loggedInClient} onLogout={handleLogout} />;
    }


    const renderContent = () => {
        if (loading) {
            return <Loader message="Loading data from Google Sheets..." />;
        }
        if (error && activeView !== 'settings') {
            return (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md" role="alert">
                    <p className="font-bold">Error Loading Data</p>
                    <p>{error}</p>
                    <button onClick={() => setActiveView('settings')} className="mt-4 bg-red-500 text-white font-bold py-2 px-4 rounded hover:bg-red-600 transition-colors">
                        Go to Settings
                    </button>
                </div>
            );
        }
        
        switch (activeView) {
            case 'dashboard':
                return <Dashboard analyses={analyses} clients={clients} technicians={technicians} />;
            case 'clients':
                return <ClientManagement clients={clients} reloadData={reloadData} />;
            case 'technicians':
                return <TechnicianManagement technicians={technicians} reloadData={reloadData} />;
            case 'newAnalysis':
                return <AnalysisRequest clients={clients} technicians={technicians} analysisCosts={analysisCosts} reloadData={reloadData} setActiveView={setActiveView} />;
            case 'analyses':
                return <AnalysisManagement analyses={analyses} clients={clients} technicians={technicians} analysisCosts={analysisCosts} analysisTypes={analysisTypes} reloadData={reloadData} setActiveView={setActiveView} />;
            case 'analysisCosts':
                return <AnalysisCostsManagement analysisCosts={analysisCosts} analysisTypes={analysisTypes} reloadData={reloadData} />;
            case 'settings':
                return <Settings reloadData={reloadData} />;
            default:
                return <Dashboard analyses={analyses} clients={clients} technicians={technicians} />;
        }
    };

    if (appMode === 'admin' && isAdminAuthenticated) {
      return (
        <div className="flex h-screen bg-gray-100 font-sans">
          <Sidebar activeView={activeView} setActiveView={setActiveView} onLogout={handleLogout} />
          <main className="flex-1 p-8 overflow-y-auto">
            {renderContent()}
          </main>
        </div>
      );
    }
    
    // Fallback to the portal selection if no other condition is met
    return <PortalSelection setAppMode={setAppMode} />;
};

export default App;
