
import React, { useState, useEffect } from 'react';
import { Analysis, Client, Technician, AnalysisPriority, AnalysisCost, View } from '../types';

const MOCK_PRODUCTS: string[] = [ 'Corn', 'Soybean Meal', 'Wheat Midds', 'Fishmeal', 'DDGS' ];
const priorityOptions: AnalysisPriority[] = ['Normal', 'Urgent', 'Low'];

interface AnalysisRequestProps {
    clients: Client[];
    technicians: Technician[];
    analysisCosts: AnalysisCost[];
    reloadData: () => Promise<void>;
    setActiveView: (view: View) => void;
}

let folioCounter = new Date().getMilliseconds();

const generateFolio = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const sequence = String(folioCounter++).padStart(4, '0');
    return `${year}${month}${sequence}`;
};

const initialFormData = {
    folio: '',
    receptionDate: new Date().toISOString().split('T')[0],
    sampleName: '',
    product: '',
    subtype: '',
    clientId: '',
    technicianId: '',
    priority: 'Normal' as AnalysisPriority,
};

const AnalysisRequest: React.FC<AnalysisRequestProps> = ({ reloadData, setActiveView, analysisCosts, clients, technicians }) => {
    const [formData, setFormData] = useState(initialFormData);
    const [selectedTests, setSelectedTests] = useState<AnalysisCost[]>([]);
    const [totalCost, setTotalCost] = useState(0);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        setFormData(prev => ({ ...prev, folio: generateFolio() }));
    }, []);

    useEffect(() => {
        const newCost = selectedTests.reduce((sum, test) => sum + (Number(test.cost) || 0), 0);
        setTotalCost(newCost);
    }, [selectedTests]);

    const handleTestSelection = (test: AnalysisCost, isChecked: boolean) => {
        if (isChecked) {
            setSelectedTests(prev => [...prev, test]);
        } else {
            setSelectedTests(prev => prev.filter(t => t.id !== test.id));
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
         if (selectedTests.length === 0 || !formData.clientId || !formData.technicianId) {
            alert("Please select a client, technician, and at least one test.");
            return;
        }
        setSubmitStatus('submitting');
        setSubmitError(null);

        const newAnalysis: Analysis = {
            ...formData,
            id: `an${Date.now()}`,
            cost: totalCost,
            requestedTests: selectedTests.map(t => t.testName),
            status: 'Received',
            results: selectedTests.map(t => ({ testName: t.testName, value: null })), // Initialize results array
        };

        const googleScriptUrl = localStorage.getItem('googleScriptUrl');
        if (!googleScriptUrl) {
            setSubmitError('Google Sheets URL not configured. Please set it in Settings.');
            setSubmitStatus('error');
            return;
        }

        try {
            const requestPayload = { 
                action: 'create', 
                targetSheet: 'AnalysisResults', 
                payload: newAnalysis 
            };
            const postData = new URLSearchParams();
            postData.append('payload', JSON.stringify(requestPayload));
            
            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                body: postData,
            });
            const result = await response.json();

            if (result.status === 'success') {
                setSubmitStatus('success');
                
                setTimeout(() => {
                    reloadData().then(() => {
                        setActiveView('analyses');
                    });
                }, 1500);

            } else {
                throw new Error(result.message || 'Unknown error from Google Script.');
            }
        } catch (error) {
            console.error('Failed to submit to Google Sheets:', error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setSubmitError(`Submission Failed: ${errorMessage}`);
            setSubmitStatus('error');
        }
    };
    
    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";
    
    const getButtonText = () => {
        switch(submitStatus) {
            case 'submitting': return 'Registering...';
            case 'success': return 'Success!';
            case 'error': return 'Submission Failed';
            default: return 'Register Sample';
        }
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800">New Analysis Request</h1>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     <div>
                        <label htmlFor="folio" className="block text-sm font-medium text-gray-700">Folio</label>
                        <input type="text" name="folio" id="folio" value={formData.folio} required readOnly className={`${inputStyle} bg-gray-100 cursor-not-allowed`} />
                    </div>
                    <div>
                        <label htmlFor="receptionDate" className="block text-sm font-medium text-gray-700">Reception Date</label>
                        <input type="date" name="receptionDate" id="receptionDate" value={formData.receptionDate} onChange={handleChange} required className={inputStyle} />
                    </div>
                     <div>
                        <label htmlFor="sampleName" className="block text-sm font-medium text-gray-700">Sample Name</label>
                        <input type="text" name="sampleName" id="sampleName" value={formData.sampleName} onChange={handleChange} required className={inputStyle} />
                    </div>
                    <div>
                        <label htmlFor="product" className="block text-sm font-medium text-gray-700">Product</label>
                         <select name="product" id="product" value={formData.product} onChange={handleChange} required className={inputStyle}>
                            <option value="" disabled>Select a product</option>
                            {MOCK_PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">Client</label>
                        <select name="clientId" id="clientId" value={formData.clientId} onChange={handleChange} required className={inputStyle}>
                            <option value="" disabled>Select a client</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="technicianId" className="block text-sm font-medium text-gray-700">Assigned Technician</label>
                        <select name="technicianId" id="technicianId" value={formData.technicianId} onChange={handleChange} required className={inputStyle}>
                            <option value="" disabled>Select a technician</option>
                            {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="border-t pt-6">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Select Analyses</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {analysisCosts.map(test => (
                            <label key={test.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 cursor-pointer">
                                <input
                                    type="checkbox"
                                    onChange={(e) => handleTestSelection(test, e.target.checked)}
                                    checked={selectedTests.some(st => st.id === test.id)}
                                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-secondary"
                                />
                                <span className="text-sm font-medium text-gray-700">{test.testName}</span>
                                <span className="text-sm text-gray-500">(${(typeof test.cost === 'number' ? test.cost : 0).toFixed(2)})</span>
                            </label>
                        ))}
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
                    <div>
                        <label htmlFor="priority" className="block text-sm font-medium text-gray-700">Priority</label>
                        <select name="priority" id="priority" value={formData.priority} onChange={handleChange} required className={inputStyle}>
                            {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="cost" className="block text-sm font-medium text-gray-700">Total Cost ($)</label>
                        <input type="text" name="cost" id="cost" value={totalCost.toFixed(2)} readOnly className={`${inputStyle} bg-gray-100 cursor-not-allowed`} />
                    </div>
                </div>
                
                <div className="flex justify-end pt-4 flex-col items-end">
                    <button 
                        type="submit" 
                        className={`font-bold py-2 px-6 rounded-lg inline-flex items-center transition-colors w-auto ${
                            submitStatus === 'submitting' ? 'bg-gray-400 cursor-not-allowed' : 
                            submitStatus === 'success' ? 'bg-green-600' :
                            submitStatus === 'error' ? 'bg-red-600 hover:bg-red-700' :
                            'bg-primary hover:bg-secondary'
                        } text-white`}
                        disabled={submitStatus === 'submitting' || submitStatus === 'success' || selectedTests.length === 0 || !formData.clientId || !formData.technicianId}
                    >
                        {getButtonText()}
                    </button>
                    {submitStatus === 'error' && submitError && (
                        <div className="mt-4 text-center p-4 bg-red-50 border border-red-200 rounded-lg w-full">
                            <p className="text-sm font-bold text-red-700">{submitError}</p>
                            <p className="mt-2 text-xs text-gray-600">Please check your Apps Script URL in Settings. Ensure your Google Sheet file has a tab named exactly <strong className="font-extrabold">AnalysisResults</strong>. Names are case-sensitive.</p>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
};

export default AnalysisRequest;