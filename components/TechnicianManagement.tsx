
import React, { useState } from 'react';
import { Technician } from '../types';
import Table from './ui/Table';
import Modal from './ui/Modal';
import { PlusIcon, UploadIcon } from './icons/Icons';

const initialFormState: Omit<Technician, 'id'> = {
    name: '',
    specialty: '',
    hireDate: new Date().toISOString().split('T')[0],
};

interface TechnicianManagementProps {
    technicians: Technician[];
    reloadData: () => Promise<void>;
}

const TechnicianManagement: React.FC<TechnicianManagementProps> = ({ technicians, reloadData }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(initialFormState);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          console.log(`Uploading file: ${file.name}`);
          alert('File import is not connected to Google Sheets yet. This is a placeholder.');
        }
    };
    
    const handleModalClose = () => {
        setIsModalOpen(false);
        setFormData(initialFormState);
        setSubmitStatus('idle');
        setSubmitError(null);
    }
      
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if(!formData.name || !formData.specialty || !formData.hireDate) {
            alert("Please fill in all required fields.");
            return;
        }

        setSubmitStatus('submitting');
        setSubmitError(null);
        
        const newTechnician: Technician = {
          id: `tec${Date.now()}`,
          ...formData
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
                targetSheet: 'Technicians', 
                payload: newTechnician 
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
                setTimeout(() => handleModalClose(), 1000);
            } else {
                throw new Error(result.message || 'Unknown error from Google Script.');
            }
        } catch(error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setSubmitError(`Failed to save technician: ${errorMessage}. Check sheet name and script permissions.`);
            setSubmitStatus('error');
        }
    }

    const headers = ['Name', 'Specialty', 'Hire Date'];
    const dataRows = technicians.map(t => [t.name, t.specialty, t.hireDate]);
    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";

    const getButtonText = () => {
        switch(submitStatus) {
            case 'submitting': return 'Saving...';
            case 'success': return 'Saved!';
            case 'error': return 'Retry Save';
            default: return 'Save Technician';
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Technician Management</h1>
                <div className="flex items-center space-x-2">
                    <label htmlFor="tech-upload" className="cursor-pointer bg-white text-primary hover:bg-gray-50 border border-primary font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                        <UploadIcon />
                        <span className="ml-2">Import Technicians</span>
                    </label>
                    <input id="tech-upload" type="file" className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileUpload} />

                    <button onClick={() => setIsModalOpen(true)} className="bg-primary text-white hover:bg-secondary font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                        <PlusIcon />
                        <span className="ml-2">Add Technician</span>
                    </button>
                </div>
            </div>
            <Table headers={headers} data={dataRows} />
            {isModalOpen && (
                <Modal onClose={handleModalClose} title="Add New Technician">
                    <form onSubmit={handleFormSubmit}>
                        <div className="p-6 space-y-4">
                          <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Technician Name</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleFormChange} required className={inputStyle} />
                          </div>
                          <div>
                            <label htmlFor="specialty" className="block text-sm font-medium text-gray-700">Specialty</label>
                            <input type="text" name="specialty" id="specialty" value={formData.specialty} onChange={handleFormChange} required className={inputStyle} />
                          </div>
                          <div>
                            <label htmlFor="hireDate" className="block text-sm font-medium text-gray-700">Hire Date</label>
                            <input type="date" name="hireDate" id="hireDate" value={formData.hireDate} onChange={handleFormChange} required className={inputStyle} />
                          </div>
                          {submitStatus === 'error' && submitError && (
                            <div className="text-xs text-center p-2 bg-red-50 text-red-700 rounded-md">{submitError}</div>
                          )}
                        </div>
                        <div className="flex justify-end p-4 bg-gray-50 border-t">
                            <button type="button" onClick={handleModalClose} className="bg-gray-200 text-gray-800 hover:bg-gray-300 font-bold py-2 px-4 rounded-lg transition-colors mr-2">
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

export default TechnicianManagement;
