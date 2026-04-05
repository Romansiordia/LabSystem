
import React, { useState, useEffect } from 'react';
import CodeBlock from './ui/CodeBlock';

interface SettingsProps {
    reloadData?: () => Promise<void>;
    isInitialSetup?: boolean;
    onUrlSaved?: (url: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ reloadData, isInitialSetup = false, onUrlSaved }) => {
    const [googleScriptUrl, setGoogleScriptUrl] = useState('');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    
    useEffect(() => {
        const savedUrl = localStorage.getItem('googleScriptUrl');
        if (savedUrl) {
            setGoogleScriptUrl(savedUrl);
        }
    }, []);

    const handleSaveUrl = () => {
        if (onUrlSaved) {
            onUrlSaved(googleScriptUrl);
        } else {
            localStorage.setItem('googleScriptUrl', googleScriptUrl);
            alert('URL saved successfully! The app will now reload data with the new URL.');
            if (reloadData) reloadData();
        }
    };

    const handleTestConnection = async () => {
        if (!googleScriptUrl) {
            alert('Please enter a URL first.');
            return;
        }
        setTestStatus('testing');
        try {
            // Test 1: GET request
            const getResponse = await fetch(googleScriptUrl);
            if (!getResponse.ok) throw new Error(`GET Test Failed: Status ${getResponse.status}`);
            const getResult = await getResponse.json();
            
            if (getResult.status === 'error') {
                throw new Error(`GET Test Failed: ${getResult.message}`);
            }
            
            if (!getResult || typeof getResult !== 'object' || !getResult.clients || !getResult.analysisTypes || !getResult.products) {
                throw new Error(`GET Test Failed: Invalid JSON response. Missing required data like clients, analysisTypes, or products.`);
            }

            // Test 2: POST request using URLSearchParams to avoid CORS preflight
            const postData = new URLSearchParams();
            const requestPayload = { action: 'testConnection', targetSheet: 'any', payload: {} };
            postData.append('payload', JSON.stringify(requestPayload));

            const postResponse = await fetch(googleScriptUrl, {
                method: 'POST',
                body: postData
            });
            if (!postResponse.ok) throw new Error(`POST Test Failed: Status ${postResponse.status}`);
            const postResult = await postResponse.json();
            if (postResult.status !== 'success') throw new Error(`POST Test Failed: ${postResult.message}`);
            
            setTestStatus('success');
        } catch (error) {
            console.error('Connection test failed:', error);
            setTestStatus('error');
        } finally {
            setTimeout(() => setTestStatus('idle'), 5000);
        }
    };
    
    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";
    
    const renderSettingsContent = () => (
        <>
            <div className="bg-white p-6 rounded-lg shadow-md">
                 <h2 className="text-2xl font-semibold text-gray-700">Google Sheets Integration</h2>
                 <p className="text-gray-600 mt-2 mb-4">
                    Connect your Google Sheet as a database. This allows the app to load your clients, technicians, and costs, and also to submit new analysis results.
                 </p>
                <div>
                    <label htmlFor="googleScriptUrl" className="block text-sm font-medium text-gray-700">Apps Script URL</label>
                    <input 
                        type="url" 
                        name="googleScriptUrl" 
                        id="googleScriptUrl" 
                        value={googleScriptUrl}
                        onChange={(e) => setGoogleScriptUrl(e.target.value)}
                        className={inputStyle}
                        placeholder="https://script.google.com/macros/s/..."
                    />
                </div>
                <div className="flex items-center space-x-2 mt-4">
                    <button onClick={handleSaveUrl} className="bg-primary text-white hover:bg-secondary font-bold py-2 px-4 rounded-lg transition-colors">
                       Save URL
                    </button>
                    <button onClick={handleTestConnection} className="bg-gray-600 text-white hover:bg-gray-700 font-bold py-2 px-4 rounded-lg transition-colors" disabled={testStatus === 'testing'}>
                       {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testStatus === 'success' && <span className="text-green-600 font-medium">Connection successful!</span>}
                    {testStatus === 'error' && <span className="text-red-600 font-medium">Connection failed. Check URL/permissions and browser console for CORS errors.</span>}
                </div>
            </div>

             <div className="bg-white p-6 rounded-lg shadow-md">
                 <h2 className="text-2xl font-semibold text-gray-700">Setup Your Google Sheet as a Database</h2>
                 <div className="prose max-w-none mt-4 text-gray-800">
                    <p>Follow these steps to get your Google Sheet ready:</p>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>Create a new Google Sheet.</li>
                        <li>Create **seven** tabs named exactly: <strong>Clients</strong>, <strong>Technicians</strong>, <strong>Products</strong>, <strong>AnalysisTypes</strong>, <strong>AnalysisCosts</strong>, <strong>AnalysisResults</strong>, and <strong>ClientLogins</strong>.</li>
                        <li>In the first row of each sheet, add the required headers.
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li><strong>Clients:</strong> id, name, contactPerson, email, phone</li>
                                <li><strong>Technicians:</strong> id, name, specialty, hireDate</li>
                                <li><strong>Products:</strong> id, name</li>
                                <li><strong>AnalysisTypes:</strong> id, testName, units, resultType (use 'numeric' or 'text')</li>
                                <li><strong>AnalysisCosts:</strong> id, testName, cost, method</li>
                                <li><strong>AnalysisResults:</strong> Headers for fixed data (id, folio, etc.) plus one column for each possible test name (e.g., 'Protein', 'Fat').</li>
                                <li><strong>ClientLogins:</strong> clientId, username, password</li>
                            </ul>
                        </li>
                        <li>Go to `Extensions &gt; Apps Script`, paste the code below, and save the project.</li>
                        <li>Click `Deploy &gt; New Deployment`. Select `Web app` as the type.</li>
                        <li>In the dialog, set `Execute as` to `Me` and `Who has access` to `Anyone`.</li>
                        <li>Click `Deploy`. Authorize the script's permissions when prompted.</li>
                        <li>Copy the `Web app URL` provided and paste it into the input field above.</li>
                    </ol>
                    <div className="mt-4 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-r-lg">
                        <h4 className="font-bold">Troubleshooting Connection Errors</h4>
                        <p>The most common error is a "CORS" or "Network" error. This happens because Google Scripts can block certain types of web requests. The code provided here is specifically designed to avoid this issue. If you still see an error like "Sheet not found", it means the name of the tab in your Google Sheet does not <strong className="font-extrabold">exactly</strong> match the name required (e.g., "AnalysisResults"). Names are case-sensitive. After any script change, you must re-deploy: select <strong>Deploy &gt; Manage Deployments</strong>, edit your deployment, choose a <strong>New version</strong>, and click <strong>Deploy</strong>.</p>
                    </div>
                 </div>
                 <CodeBlock />
            </div>
        </>
    );

    if (isInitialSetup) {
        return (
             <div className="min-h-screen bg-gray-100 p-4 sm:p-8 flex flex-col items-center">
                <div className="w-full max-w-4xl space-y-8">
                    <div className="text-center">
                         <h1 className="text-4xl font-bold text-primary tracking-wider">Welcome to LabSys</h1>
                         <p className="mt-2 text-lg text-gray-600">Initial Setup: Please configure your Google Script URL to begin.</p>
                    </div>
                    {renderSettingsContent()}
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
            <div className="space-y-8">
                {renderSettingsContent()}
            </div>
        </div>
    );
};

export default Settings;
