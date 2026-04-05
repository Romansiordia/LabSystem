import React, { useState, useEffect } from 'react';
import { Analysis, Client, Technician, AnalysisPriority, AnalysisCost, View, Product } from '../types';
import { TrashIcon, PlusIcon } from './icons/Icons';

const priorityOptions: AnalysisPriority[] = ['Normal', 'Urgent', 'Low'];

interface AnalysisRequestProps {
    clients: Client[];
    technicians: Technician[];
    products: Product[];
    analysisCosts: AnalysisCost[];
    analyses: Analysis[];
    reloadData: () => Promise<void>;
    setActiveView: (view: View) => void;
}

const generateFolio = (existingAnalyses: Analysis[]): string => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `${year}${month}`;
        
        // Find all folios for the current month
        const currentMonthFolios = (existingAnalyses || [])
            .filter(a => {
                if (!a || !a.folio) return false;
                const folioStr = String(a.folio);
                return folioStr.startsWith(prefix);
            })
            .map(a => {
                const folioStr = String(a.folio);
                const seqStr = folioStr.substring(prefix.length);
                return parseInt(seqStr, 10);
            })
            .filter(n => !isNaN(n));

        const nextSequence = currentMonthFolios.length > 0 ? Math.max(...currentMonthFolios) + 1 : 1;
        return `${prefix}${String(nextSequence).padStart(4, '0')}`;
    } catch (error) {
        console.error('Error in generateFolio:', error);
        return 'ERROR';
    }
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

const AnalysisRequest: React.FC<AnalysisRequestProps> = ({ reloadData, setActiveView, analysisCosts, clients, technicians, products, analyses }) => {
    console.log('AnalysisRequest rendering with:', { 
        hasAnalysisCosts: !!analysisCosts, 
        hasClients: !!clients, 
        hasTechnicians: !!technicians, 
        hasProducts: !!products, 
        hasAnalyses: !!analyses 
    });

    const [formData, setFormData] = useState(initialFormData);
    const [selectedTests, setSelectedTests] = useState<AnalysisCost[]>([]);
    const [totalCost, setTotalCost] = useState(0);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setFormData(prev => ({ ...prev, folio: generateFolio(analyses) }));
    }, [analyses]);

    useEffect(() => {
        try {
            const newCost = (selectedTests || []).reduce((sum, test) => sum + (test && Number(test.cost) || 0), 0);
            setTotalCost(newCost);
        } catch (error) {
            console.error('Error calculating total cost:', error);
        }
    }, [selectedTests]);

    const handleAddTest = (testId: string) => {
        try {
            const test = (analysisCosts || []).find(t => t && t.id === testId);
            if (test && !(selectedTests || []).find(st => st && st.id === test.id)) {
                setSelectedTests(prev => [...(prev || []), test]);
                setSearchTerm(''); // Reset search after adding
            }
        } catch (error) {
            console.error('Error in handleAddTest:', error);
        }
    };

    const handleRemoveTest = (testId: string) => {
        try {
            setSelectedTests(prev => (prev || []).filter(t => t && t.id !== testId));
        } catch (error) {
            console.error('Error in handleRemoveTest:', error);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (selectedTests.length === 0 || !formData.clientId || !formData.technicianId) {
            setSubmitError("Please select a client, technician, and at least one test.");
            setSubmitStatus('error');
            return;
        }

        setSubmitStatus('submitting');
        setSubmitError(null);

        // Final folio recalculation to ensure uniqueness
        const finalFolio = generateFolio(analyses);
        
        const newAnalysis: Analysis = {
            ...formData,
            folio: finalFolio,
            id: `an${Date.now()}`,
            cost: totalCost,
            requestedTests: (selectedTests || []).filter(t => t && t.testName).map(t => t.testName),
            status: 'Received',
            results: (selectedTests || []).filter(t => t && t.testName).map(t => ({ testName: t.testName, value: null })),
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
    
    const availableTests = (analysisCosts || []).filter(t => 
        t &&
        !(selectedTests || []).find(st => st && st.id === t.id) &&
        (t.testName || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    );

    if (!analysisCosts || !clients || !technicians || !products || !analyses) {
        console.warn('AnalysisRequest: Some props are missing, rendering fallback.');
        return (
            <div className="p-8 text-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
                    <div className="h-4 w-48 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                </div>
                <p className="mt-4 text-gray-500">Preparing form data...</p>
            </div>
        );
    }

    try {
        return (
            <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">New Analysis Request</h1>
                <div className="text-right">
                    <span className="text-sm text-gray-500">Folio</span>
                    <p className="text-xl font-mono font-bold text-primary">{formData.folio}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT COLUMN: General Info */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                        <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">General Information</h2>
                        
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label htmlFor="receptionDate" className="block text-sm font-medium text-gray-700">Reception Date</label>
                                <input type="date" name="receptionDate" id="receptionDate" value={formData.receptionDate} onChange={handleChange} required className={inputStyle} />
                            </div>
                            <div>
                                <label htmlFor="sampleName" className="block text-sm font-medium text-gray-700">Sample Name</label>
                                <input type="text" name="sampleName" id="sampleName" value={formData.sampleName} onChange={handleChange} required className={inputStyle} placeholder="e.g. Batch #452" />
                            </div>
                            <div>
                                <label htmlFor="product" className="block text-sm font-medium text-gray-700">Product</label>
                                <select name="product" id="product" value={formData.product} onChange={handleChange} required className={inputStyle}>
                                    <option value="" disabled>Select a product</option>
                                    {products && products.map(p => p && <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">Client</label>
                                <select name="clientId" id="clientId" value={formData.clientId} onChange={handleChange} required className={inputStyle}>
                                    <option value="" disabled>Select a client</option>
                                    {clients && clients.map(c => c && <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="technicianId" className="block text-sm font-medium text-gray-700">Assigned Technician</label>
                                <select name="technicianId" id="technicianId" value={formData.technicianId} onChange={handleChange} required className={inputStyle}>
                                    <option value="" disabled>Select a technician</option>
                                    {technicians && technicians.map(t => t && <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="priority" className="block text-sm font-medium text-gray-700">Priority</label>
                                <select name="priority" id="priority" value={formData.priority} onChange={handleChange} required className={inputStyle}>
                                    {priorityOptions.map(p => p && <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Analysis Selection */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
                        <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-4">Analysis Selection</h2>
                        
                        {/* Search and Add */}
                        <div className="relative mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Search & Add Analysis</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <select 
                                        className={inputStyle}
                                        value=""
                                        onChange={(e) => handleAddTest(e.target.value)}
                                    >
                                        <option value="" disabled>Search or select an analysis...</option>
                                        {availableTests.map(t => t && (
                                            <option key={t.id} value={t.id}>
                                                {t.testName} - ${Number(t.cost).toFixed(2)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Selected Tests Table */}
                        <div className="flex-1 overflow-auto min-h-[300px]">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analysis</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {selectedTests.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                                                No analyses selected yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        (selectedTests || []).map((test) => test && (
                                            <tr key={test.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{test.testName}</td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{test.method || 'N/A'}</td>
                                                <td className="px-4 py-3 text-sm text-right text-gray-900 font-mono">${Number(test.cost).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleRemoveTest(test.id)}
                                                        className="text-red-500 hover:text-red-700 transition-colors p-1"
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Summary and Submit */}
                        <div className="border-t mt-6 pt-6 space-y-4">
                            <div className="flex justify-between items-center text-xl font-bold text-gray-800">
                                <span>Total Cost:</span>
                                <span className="text-primary font-mono">${totalCost.toFixed(2)}</span>
                            </div>

                            <button 
                                type="submit" 
                                className={`w-full font-bold py-3 px-6 rounded-xl flex justify-center items-center transition-all shadow-lg ${
                                    submitStatus === 'submitting' ? 'bg-gray-400 cursor-not-allowed' : 
                                    submitStatus === 'success' ? 'bg-green-600' :
                                    submitStatus === 'error' ? 'bg-red-600 hover:bg-red-700' :
                                    'bg-primary hover:bg-secondary hover:-translate-y-0.5 active:translate-y-0'
                                } text-white`}
                                disabled={submitStatus === 'submitting' || submitStatus === 'success' || selectedTests.length === 0 || !formData.clientId || !formData.technicianId}
                            >
                                {submitStatus === 'submitting' && (
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {submitStatus === 'success' ? 'Request Registered!' : 
                                 submitStatus === 'error' ? 'Error - Try Again' : 
                                 'Register Analysis Request'}
                            </button>

                            {submitStatus === 'error' && submitError && (
                                <div className="text-center p-3 bg-red-50 border border-red-100 rounded-lg">
                                    <p className="text-xs font-bold text-red-700">{submitError}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </form>
        </div>
        );
    } catch (error) {
        console.error('AnalysisRequest render error:', error);
        return (
            <div className="p-8 text-red-600 bg-red-50 border border-red-200 rounded-lg">
                <h2 className="text-xl font-bold mb-2">Error loading form</h2>
                <p className="text-sm">An error occurred while rendering the analysis request form. Please check the console for details.</p>
                <p className="mt-4 text-xs font-mono">{error instanceof Error ? error.message : String(error)}</p>
                <button onClick={() => setActiveView('analyses')} className="mt-6 bg-red-600 text-white px-4 py-2 rounded-lg font-bold">Go Back</button>
            </div>
        );
    }
};

export default AnalysisRequest;
