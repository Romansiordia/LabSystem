
import React, { useState } from 'react';
import { AnalysisCost, AnalysisType } from '../types';
import Table from './ui/Table';
import Modal from './ui/Modal';
import { PlusIcon } from './icons/Icons';

const initialCostFormState: Omit<AnalysisCost, 'id'> = {
    testName: '',
    cost: 0,
    method: ''
};

interface AnalysisCostsManagementProps {
    analysisCosts: AnalysisCost[];
    analysisTypes: AnalysisType[];
    reloadData: () => Promise<void>;
}

const AnalysisCostsManagement: React.FC<AnalysisCostsManagementProps> = ({ analysisCosts, analysisTypes, reloadData }) => {
    const [isCostModalOpen, setIsCostModalOpen] = useState(false);
    const [costFormData, setCostFormData] = useState(initialCostFormState);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleCloseCostModal = () => {
        setIsCostModalOpen(false);
        setCostFormData(initialCostFormState);
        setSubmitStatus('idle');
        setSubmitError(null);
    };

    const handleCostFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setCostFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) : value
        }));
    };

    const handleCostFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!costFormData.testName || !costFormData.method || costFormData.cost <= 0) {
            alert('Please fill all fields correctly. Cost must be greater than 0.');
            return;
        }

        setSubmitStatus('submitting');
        setSubmitError(null);

        const newCost: AnalysisCost = {
            id: `c${Date.now()}`,
            ...costFormData
        };

        const googleScriptUrl = localStorage.getItem('googleScriptUrl');
        if (!googleScriptUrl) {
            setSubmitError('Google Sheets URL not configured.');
            setSubmitStatus('error');
            return;
        }

        try {
            const requestPayload = { 
                action: 'create', 
                targetSheet: 'AnalysisCosts', 
                payload: newCost
            };
            const postData = new URLSearchParams();
            postData.append('payload', JSON.stringify(requestPayload));

            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                body: postData,
            });
            const result = await response.json();

            if (result.status === 'success') {
                await reloadData();
                setSubmitStatus('success');
                setTimeout(() => handleCloseCostModal(), 1000);
            } else {
                throw new Error(result.message || 'Unknown error from Google Script.');
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setSubmitError(`Failed to save cost: ${errorMessage}.`);
            setSubmitStatus('error');
        }
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";
    
    const getButtonText = () => {
        switch(submitStatus) {
            case 'submitting': return 'Saving...';
            case 'success': return 'Saved!';
            case 'error': return 'Retry Save';
            default: return 'Save Cost';
        }
    }
    
    // Get analysis types that don't already have a cost assigned.
    const availableAnalysisTypes = analysisTypes.filter(
        at => !analysisCosts.some(ac => ac.testName === at.testName)
    );

    const headers = ['Test Name', 'Method', 'Cost ($)'];
    const dataRows = analysisCosts.map(c => [c.testName, c.method, (typeof c.cost === 'number' ? c.cost : 0).toFixed(2)]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Analysis Costs Management</h1>
                 <button onClick={() => setIsCostModalOpen(true)} className="bg-primary text-white hover:bg-secondary font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                    <PlusIcon /> <span className="ml-2">Add Cost</span>
                </button>
            </div>
            <Table headers={headers} data={dataRows} />

            {isCostModalOpen && (
                <Modal onClose={handleCloseCostModal} title="Add New Analysis Cost">
                    <form onSubmit={handleCostFormSubmit}>
                        <div className="p-6 space-y-4">
                            <div>
                                <label htmlFor="testName" className="block text-sm font-medium text-gray-700">Test Name</label>
                                <select 
                                    name="testName" 
                                    id="testName" 
                                    value={costFormData.testName} 
                                    onChange={handleCostFormChange} 
                                    required 
                                    className={inputStyle}
                                >
                                    <option value="" disabled>Select an analysis</option>
                                    {availableAnalysisTypes.map(type => <option key={type.id} value={type.testName}>{type.testName}</option>)}
                                </select>
                                <p className="mt-2 text-xs text-gray-500">
                                    This list is managed from your 'AnalysisTypes' sheet. You can only add costs for analyses that are not already in the table above.
                                </p>
                            </div>
                            <div>
                                <label htmlFor="method" className="block text-sm font-medium text-gray-700">Analytical Method</label>
                                <input type="text" name="method" id="method" value={costFormData.method} onChange={handleCostFormChange} required className={inputStyle} placeholder="e.g., AOAC 984.13"/>
                            </div>
                            <div>
                                <label htmlFor="cost" className="block text-sm font-medium text-gray-700">Cost ($)</label>
                                <input type="number" name="cost" id="cost" value={costFormData.cost} onChange={handleCostFormChange} required className={inputStyle} step="0.01" min="0"/>
                            </div>
                             {submitStatus === 'error' && submitError && (
                                <div className="text-xs text-center p-2 bg-red-50 text-red-700 rounded-md">{submitError}</div>
                            )}
                        </div>
                        <div className="flex justify-end p-4 bg-gray-50 border-t">
                             <button type="button" onClick={handleCloseCostModal} className="bg-gray-200 text-gray-800 hover:bg-gray-300 font-bold py-2 px-4 rounded-lg transition-colors mr-2">
                                Cancel
                            </button>
                            <button type="submit" className={`font-bold py-2 px-4 rounded-lg transition-colors text-white ${
                                submitStatus === 'submitting' ? 'bg-gray-400 cursor-not-allowed' :
                                submitStatus === 'success' ? 'bg-green-600' :
                                submitStatus === 'error' ? 'bg-red-600 hover:bg-red-700' :
                                'bg-primary hover:bg-secondary'
                            }`} disabled={submitStatus === 'submitting' || submitStatus === 'success'}>
                                {getButtonText()}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default AnalysisCostsManagement;