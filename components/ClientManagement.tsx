
import React, { useState } from 'react';
import { Client } from '../types';
import Table from './ui/Table';
import Modal from './ui/Modal';
import { PlusIcon, UploadIcon } from './icons/Icons';

const initialFormState: Omit<Client, 'id'> = {
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
};

interface ClientManagementProps {
  clients: Client[];
  reloadData: () => Promise<void>;
}

const ClientManagement: React.FC<ClientManagementProps> = ({ clients, reloadData }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      alert('File import is not connected to Google Sheets yet. This is a placeholder.');
      console.log(`Uploading file: ${file.name}`);
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
      if(!formData.name || !formData.contactPerson || !formData.email) {
          alert("Please fill in all required fields.");
          return;
      }

      setSubmitStatus('submitting');
      setSubmitError(null);
      
      const newClient: Client = {
        id: `cli${Date.now()}`,
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
            targetSheet: 'Clients', 
            payload: newClient 
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
        setSubmitError(`Failed to save client: ${errorMessage}. Check sheet name and script permissions.`);
        setSubmitStatus('error');
      }
  }

  const headers = ['Name', 'Contact Person', 'Email', 'Phone'];
  const dataRows = clients.map(c => [c.name, c.contactPerson, c.email, c.phone]);
  const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";
  
  const getButtonText = () => {
    switch(submitStatus) {
        case 'submitting': return 'Saving...';
        case 'success': return 'Saved!';
        case 'error': return 'Retry Save';
        default: return 'Save Client';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Client Management</h1>
        <div className="flex items-center space-x-2">
            <label htmlFor="client-upload" className="cursor-pointer bg-white text-primary hover:bg-gray-50 border border-primary font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                <UploadIcon />
                <span className="ml-2">Import Clients</span>
            </label>
            <input id="client-upload" type="file" className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileUpload} />
            <button onClick={() => setIsModalOpen(true)} className="bg-primary text-white hover:bg-secondary font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                <PlusIcon />
                <span className="ml-2">Add Client</span>
            </button>
        </div>
      </div>
      <Table headers={headers} data={dataRows} />
      {isModalOpen && (
        <Modal onClose={handleModalClose} title="Add New Client">
          <form onSubmit={handleFormSubmit}>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Client Name</label>
                <input type="text" name="name" id="name" value={formData.name} onChange={handleFormChange} required className={inputStyle} />
              </div>
              <div>
                <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700">Contact Person</label>
                <input type="text" name="contactPerson" id="contactPerson" value={formData.contactPerson} onChange={handleFormChange} required className={inputStyle} />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="email" id="email" value={formData.email} onChange={handleFormChange} required className={inputStyle} />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleFormChange} className={inputStyle} />
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

export default ClientManagement;
