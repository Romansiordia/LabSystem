
import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Analysis, Client, Technician, View, AnalysisStatus, AnalysisCost, AnalysisType, AnalysisResultItem } from '../types';
import Table from './ui/Table';
import Modal from './ui/Modal';
import { DownloadIcon, SheetIcon, PlusIcon } from './icons/Icons';

const statusOptions: AnalysisStatus[] = ['Received', 'In Progress', 'Completed', 'Cancelled'];

const SearchIcon = () => (
    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
);

interface AnalysisManagementProps {
    analyses: Analysis[];
    clients: Client[];
    technicians: Technician[];
    analysisCosts: AnalysisCost[];
    analysisTypes: AnalysisType[];
    reloadData: () => Promise<void>;
    setActiveView: (view: View) => void;
}

const AnalysisManagement: React.FC<AnalysisManagementProps> = ({ analyses, clients, technicians, analysisCosts, analysisTypes, reloadData, setActiveView }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnalysis, setEditingAnalysis] = useState<Analysis | null>(null);
    const [modalFormData, setModalFormData] = useState<Partial<Analysis>>({});
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');

    const filteredAnalyses = analyses
        .filter(analysis =>
            String(analysis.folio || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
        .filter(analysis => {
            if (!clientSearchTerm) return true;
            const client = clients.find(c => c.id === analysis.clientId);
            return client ? client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) : false;
        });

    const handleEdit = (index: number) => {
        const analysisToEdit = filteredAnalyses[index];
        setEditingAnalysis(analysisToEdit);
        // Ensure results array exists and has entries for all requested tests
        const initialResults = analysisToEdit.requestedTests.map(testName => {
            const existingResult = (analysisToEdit.results || []).find(r => r.testName === testName);
            return existingResult || { testName, value: null };
        });
        setModalFormData({ ...analysisToEdit, results: initialResults });
        setIsModalOpen(true);
    };

    const handleDelete = async (index: number) => {
        if (window.confirm('Are you sure you want to delete this analysis? This will also remove it from your Google Sheet.')) {
            const analysisToDelete = filteredAnalyses[index];
            const googleScriptUrl = localStorage.getItem('googleScriptUrl');

            if (!googleScriptUrl) {
                alert('Google Sheets URL not configured. Please set it in Settings.');
                return;
            }
            
            try {
                const requestPayload = {
                    action: 'delete',
                    targetSheet: 'AnalysisResults',
                    payload: { id: analysisToDelete.id }
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
                    alert('Analysis deleted successfully.');
                } else {
                    throw new Error(result.message || 'Unknown error from Google Script.');
                }
            } catch (error) {
                console.error('Failed to delete from Google Sheets:', error);
                alert(`Failed to delete analysis. Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };
    
    const handlePrint = (index: number) => {
        handlePrintReport(filteredAnalyses[index]);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingAnalysis(null);
        setSubmitStatus('idle');
        setSubmitError(null);
    };
    
    const handleModalFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setModalFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleModalResultChange = (testName: string, value: string) => {
        setModalFormData(prev => {
            const newResults = [...(prev.results || [])];
            const resultIndex = newResults.findIndex(r => r.testName === testName);
            
            const finalValue = value === '' ? null : value;

            if (resultIndex > -1) {
                newResults[resultIndex] = { ...newResults[resultIndex], value: finalValue };
            } else {
                newResults.push({ testName, value: finalValue });
            }
            return { ...prev, results: newResults };
        });
    }

    const handleSaveAndSubmit = async () => {
        if (!editingAnalysis) return;

        setSubmitStatus('submitting');
        setSubmitError(null);

        const googleScriptUrl = localStorage.getItem('googleScriptUrl');
        if (!googleScriptUrl) {
            setSubmitError('Google Sheets URL not configured. Please set it in Settings.');
            setSubmitStatus('error');
            return;
        }
        
        const processedResults = (modalFormData.results || []).map(result => {
            const analysisType = analysisTypes.find(at => at.testName === result.testName);
            if (analysisType?.resultType === 'numeric') {
                if (result.value === null || result.value === '') {
                    return { ...result, value: null };
                }
                const parsedValue = parseFloat(String(result.value));
                return {
                    ...result,
                    value: isNaN(parsedValue) ? null : parsedValue,
                };
            }
            return result;
        });


        const payloadForSheet: Analysis = {
            ...editingAnalysis,
            ...modalFormData,
            results: processedResults,
        };

        try {
            const requestPayload = {
                action: 'update',
                targetSheet: 'AnalysisResults',
                payload: payloadForSheet
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
                setTimeout(async () => {
                    await reloadData();
                    handleCloseModal();
                }, 1500);
            } else {
                 throw new Error(result.message || 'Unknown error from Google Script.');
            }
        } catch (error) {
             console.error('Failed to submit to Google Sheets:', error);
             const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
             setSubmitError(`Failed to submit data: ${errorMessage}. Check URL and sheet permissions.`);
             setSubmitStatus('error');
        }
    }
    
    const getButtonText = () => {
        switch(submitStatus) {
            case 'submitting': return 'Saving...';
            case 'success': return 'Saved!';
            case 'error': return 'Retry Save';
            default: return 'Save & Submit';
        }
    }
    
    const headers = ['Folio', 'Reception', 'Delivery', 'Sample', 'Product', 'Client', 'Technician', 'Priority', 'Status'];
    const dataRows = filteredAnalyses.map(a => [
        a.folio, 
        a.receptionDate,
        a.deliveryDate ?? 'N/A',
        a.sampleName,
        a.product,
        clients.find(c => c.id === a.clientId)?.name ?? 'Unknown',
        technicians.find(t => t.id === a.technicianId)?.name ?? 'Unknown',
        a.priority,
        a.status,
    ]);
    
    const handleDownloadPdf = () => {
        const doc = new jsPDF();
        doc.text("Analysis Report", 14, 15);
        autoTable(doc, {
            head: [headers],
            body: dataRows,
            startY: 20,
            theme: 'grid',
            headStyles: { fillColor: [30, 64, 175] },
        });
        doc.save('analysis-report.pdf');
    };

    const handleExportCSV = () => {
        const allTestNames = [...new Set(analyses.flatMap(a => a.requestedTests))];
        const csvHeaders = ['Folio', 'Reception Date', 'Delivery Date', 'Sample', 'Product', 'Client', 'Technician', 'Priority', 'Status', 'Cost ($)', ...allTestNames];
        
        const escapeCsvCell = (cell: any): string => {
            const strCell = String(cell ?? '');
            if (strCell.includes(',') || strCell.includes('"') || strCell.includes('\n')) {
                return `"${strCell.replace(/"/g, '""')}"`;
            }
            return strCell;
        };

        const csvRows = analyses.map(a => {
            const clientName = clients.find(c => c.id === a.clientId)?.name ?? 'Unknown';
            const technicianName = technicians.find(t => t.id === a.technicianId)?.name ?? 'Unknown';
            const resultsMap = new Map((a.results || []).map(r => [r.testName, r.value]));
            
            const resultValues = allTestNames.map(testName => resultsMap.get(testName) ?? '');

            return [
                a.folio, a.receptionDate, a.deliveryDate, a.sampleName, a.product,
                clientName, technicianName, a.priority, a.status, a.cost,
                ...resultValues
            ].map(escapeCsvCell).join(',');
        });

        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "analysis-report.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handlePrintReport = (analysis: Analysis) => {
        const doc = new jsPDF();
        const client = clients.find(c => c.id === analysis.clientId);
        const technician = technicians.find(t => t.id === analysis.technicianId);
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        const tableBody = (analysis.results || [])
            .map(result => {
                const analysisCost = analysisCosts.find(ac => ac.testName === result.testName);
                const analysisType = analysisTypes.find(at => at.testName === result.testName);
                const resultValue = result.value ?? 'N/A';
                const units = analysisType?.units ?? '';
                const displayValue = (typeof resultValue === 'number' ? resultValue.toFixed(2) : resultValue) + (units ? ` ${units}`: '');

                return [result.testName, analysisCost?.method ?? 'N/A', displayValue];
            });
        
        autoTable(doc, {
            startY: 85,
            head: [['Parameter', 'Method', 'Result']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: '#1e40af',
                textColor: '#ffffff',
                fontStyle: 'bold',
                halign: 'center'
            },
            alternateRowStyles: {
                fillColor: '#f5f5f5'
            },
            didDrawPage: (data) => {
                // Header
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(22);
                doc.setTextColor('#1e40af');
                doc.text('LabSys', margin, 22);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor('#333333');
                doc.text('Quality Control Laboratory', margin, 28);
                doc.text('123 Science Rd, Tech Park, 54321', margin, 32);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.text('Analysis Report', pageWidth - margin, 22, { align: 'right' });
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(`Folio: ${analysis.folio}`, pageWidth - margin, 28, { align: 'right' });
                doc.text(`Reception: ${analysis.receptionDate}`, pageWidth - margin, 32, { align: 'right' });
                doc.text(`Delivery: ${analysis.deliveryDate ?? 'N/A'}`, pageWidth - margin, 36, { align: 'right' });

                doc.setDrawColor('#cccccc');
                doc.line(margin, 42, pageWidth - margin, 42);

                // Client and Sample Info
                doc.setFontSize(10);
                doc.setTextColor('#333333');
                
                doc.setFont('helvetica', 'bold');
                doc.text('BILLED TO', margin, 50);
                doc.setFont('helvetica', 'normal');
                doc.text(client?.name ?? 'Unknown Client', margin, 56);
                doc.text(client?.contactPerson ?? '', margin, 61);

                doc.setFont('helvetica', 'bold');
                doc.text('SAMPLE DETAILS', 110, 50);
                doc.setFont('helvetica', 'normal');
                doc.text(`Sample Name: ${analysis.sampleName}`, 110, 56);
                doc.text(`Product Type: ${analysis.product}`, 110, 61);

                doc.line(margin, 70, pageWidth - margin, 70);

                // Footer
                const pageCount = (doc as any).internal.getNumberOfPages();
                doc.setFontSize(9);
                doc.setTextColor('#888888');

                const footerY = pageHeight - 25;
                doc.line(margin, footerY, pageWidth - margin, footerY);

                doc.line(margin, footerY + 15, margin + 60, footerY + 15);
                doc.text('Analyzed by:', margin, footerY + 20);
                doc.text(technician?.name ?? 'Unknown', margin, footerY + 24);

                doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - margin, footerY + 22, { align: 'right' });
            }
        });

        doc.save(`report-${analysis.folio}.pdf`);
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Analysis Management</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleDownloadPdf} className="bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                        <DownloadIcon /> <span className="ml-2">Download PDF</span>
                    </button>
                    <button onClick={handleExportCSV} className="bg-green-600 text-white hover:bg-green-700 font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                        <SheetIcon /> <span className="ml-2">Export CSV</span>
                    </button>
                    <button onClick={() => setActiveView('newAnalysis')} className="bg-primary text-white hover:bg-secondary font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors">
                        <PlusIcon /> <span className="ml-2">New Analysis</span>
                    </button>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Search by Folio number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Search by Client name..."
                            value={clientSearchTerm}
                            onChange={(e) => setClientSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>
            </div>

            <Table headers={headers} data={dataRows} onEdit={handleEdit} onDelete={handleDelete} onPrint={handlePrint} />
            
            {isModalOpen && editingAnalysis && (
                <Modal onClose={handleCloseModal} title={`Edit Analysis - ${editingAnalysis.folio}`}>
                    <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="deliveryDate" className="block text-sm font-medium text-gray-700">Delivery Date</label>
                            <input type="date" name="deliveryDate" id="deliveryDate" value={modalFormData.deliveryDate?.split('T')[0] || ''} onChange={handleModalFormChange} className={inputStyle} />
                        </div>
                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
                            <select name="status" id="status" value={modalFormData.status} onChange={handleModalFormChange} className={inputStyle}>
                                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                      </div>
                      <div className="border-t pt-4">
                        <h3 className="text-lg font-medium text-gray-800 mb-2">Analysis Results</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {(modalFormData.results || []).map((resultItem) => {
                                const analysisType = analysisTypes.find(at => at.testName === resultItem.testName);
                                const inputType = analysisType?.resultType === 'numeric' ? 'number' : 'text';
                                const units = analysisType?.units;

                                return (
                                    <div key={resultItem.testName}>
                                        <label htmlFor={resultItem.testName} className="block text-sm font-medium text-gray-700">{resultItem.testName} {units ? `(${units})` : ''}</label>
                                        <input 
                                            type={inputType}
                                            id={resultItem.testName}
                                            name={resultItem.testName}
                                            value={resultItem.value ?? ''}
                                            onChange={(e) => handleModalResultChange(resultItem.testName, e.target.value)}
                                            className={inputStyle}
                                            placeholder={inputType === 'number' ? '0.00' : 'Result'}
                                            step={inputType === 'number' ? '0.01' : undefined}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                      </div>
                       {submitStatus === 'error' && submitError && (
                            <div className="mt-4 text-center p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm font-bold text-red-700">{submitError}</p>
                                <p className="mt-1 text-xs text-gray-600">Please check the Apps Script URL in Settings and ensure your Google Sheet tab is named exactly <strong className="font-extrabold">AnalysisResults</strong>.</p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end p-4 bg-gray-50 border-t">
                        <button onClick={handleCloseModal} className="bg-gray-200 text-gray-800 hover:bg-gray-300 font-bold py-2 px-4 rounded-lg transition-colors mr-2">
                            Cancel
                        </button>
                        <button onClick={handleSaveAndSubmit} disabled={submitStatus === 'submitting' || submitStatus === 'success'} className={`font-bold py-2 px-4 rounded-lg transition-colors text-white ${
                             submitStatus === 'submitting' ? 'bg-gray-400 cursor-not-allowed' : 
                             submitStatus === 'success' ? 'bg-green-600' : 
                             submitStatus === 'error' ? 'bg-red-600 hover:bg-red-700' :
                             'bg-primary hover:bg-secondary'
                        }`}>
                            {getButtonText()}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AnalysisManagement;
