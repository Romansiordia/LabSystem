
import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Analysis, Client, Technician, View, AnalysisStatus, AnalysisCost, AnalysisType, AnalysisResultItem } from '../types';
import Table from './ui/Table';
import Modal from './ui/Modal';
import StatusBadge from './ui/StatusBadge';
import TestProgress from './ui/TestProgress';
import { DownloadIcon, SheetIcon, PlusIcon, SearchIcon } from './icons/Icons';
import { ADM_LOGO_BASE64 } from './admLogo';

const statusOptions: AnalysisStatus[] = ['Received', 'In Progress', 'Completed', 'Cancelled'];

interface AnalysisManagementProps {
    analyses: Analysis[];
    clients: Client[];
    technicians: Technician[];
    analysisCosts: AnalysisCost[];
    analysisTypes: AnalysisType[];
    reloadData: () => Promise<void>;
    setActiveView: (view: View) => void;
    onUpdateAnalysis?: (updated: Analysis) => void;
}

const AnalysisManagement: React.FC<AnalysisManagementProps> = ({ analyses, clients, technicians, analysisCosts, analysisTypes, reloadData, setActiveView, onUpdateAnalysis }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnalysis, setEditingAnalysis] = useState<Analysis | null>(null);
    const [modalFormData, setModalFormData] = useState<Partial<Analysis>>({});
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [syncNotification, setSyncNotification] = useState<{
        folio: string;
        status: 'syncing' | 'synced' | 'error';
        message?: string;
        payload?: Analysis;
    } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [dateSearchTerm, setDateSearchTerm] = useState('');
    const [sampleSearchTerm, setSampleSearchTerm] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [technicianSearchTerm, setTechnicianSearchTerm] = useState('');

    const filteredAnalyses = (analyses || [])
        .filter(analysis =>
            String(analysis.folio || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
        .filter(analysis => {
            if (!clientSearchTerm) return true;
            const client = (clients || []).find(c => c && c.id === analysis.clientId);
            return client ? client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) : false;
        })
        .filter(analysis => 
            String(analysis.receptionDate || '').toLowerCase().includes(dateSearchTerm.toLowerCase())
        )
        .filter(analysis => 
            String(analysis.sampleName || '').toLowerCase().includes(sampleSearchTerm.toLowerCase())
        )
        .filter(analysis => 
            String(analysis.product || '').toLowerCase().includes(productSearchTerm.toLowerCase())
        )
        .filter(analysis => {
            if (!technicianSearchTerm) return true;
            const tech = (technicians || []).find(t => t && t.id === analysis.technicianId);
            return tech ? tech.name.toLowerCase().includes(technicianSearchTerm.toLowerCase()) : false;
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

    const syncToGoogleSheets = async (payloadForSheet: Analysis) => {
        const googleScriptUrl = localStorage.getItem('googleScriptUrl');
        const folioDisplay = payloadForSheet.folio || 'N/A';

        if (!googleScriptUrl) {
            setSyncNotification({
                folio: folioDisplay,
                status: 'error',
                message: 'No se ha configurado la URL de Google Sheets en Configuración.',
                payload: payloadForSheet
            });
            return;
        }

        setSyncNotification({
            folio: folioDisplay,
            status: 'syncing',
            payload: payloadForSheet
        });

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
                setSyncNotification({
                    folio: folioDisplay,
                    status: 'synced'
                });
                setTimeout(() => {
                    setSyncNotification(prev => prev?.folio === folioDisplay && prev?.status === 'synced' ? null : prev);
                }, 3500);
            } else {
                throw new Error(result.message || 'Error en Google Script.');
            }
        } catch (error) {
            console.error('Error al sincronizar con Google Sheets:', error);
            const errorMessage = error instanceof Error ? error.message : "Error de conexión con Google Sheets";
            setSyncNotification({
                folio: folioDisplay,
                status: 'error',
                message: errorMessage,
                payload: payloadForSheet
            });
        }
    };

    const handleSaveAndSubmit = () => {
        if (!editingAnalysis) return;

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

        // 1. Guardado Optimista: Actualizar interfaz inmediatamente (0 ms)
        if (onUpdateAnalysis) {
            onUpdateAnalysis(payloadForSheet);
        }

        // 2. Cerrar el modal al instante (el usuario no espera nada)
        handleCloseModal();

        // 3. Sincronización en segundo plano con Google Sheets
        syncToGoogleSheets(payloadForSheet);
    };
    
    const getButtonText = () => {
        switch(submitStatus) {
            case 'submitting': return 'Saving...';
            case 'success': return 'Saved!';
            case 'error': return 'Retry Save';
            default: return 'Save & Submit';
        }
    }
    
    const activeTestNames = Array.from(new Set((filteredAnalyses || []).flatMap(a => a.requestedTests || []))).sort();

    const headers = [
        'Folio', 'Reception', 'Delivery', 'Sample', 'Product', 'Client', 'Technician', 'Priority', 'Status',
        ...activeTestNames
    ];

    const dataRows = (filteredAnalyses || []).map(a => [
        a.folio || 'N/A', 
        a.receptionDate || 'N/A',
        a.deliveryDate ?? 'N/A',
        a.sampleName || 'N/A',
        a.product || 'N/A',
        clients.find(c => c.id === a.clientId)?.name ?? 'Unknown',
        technicians.find(t => t.id === a.technicianId)?.name ?? 'Unknown',
        a.priority || 'Normal',
        <StatusBadge key={`status-${a.id}`} status={a.status || 'Received'} />,
        ...activeTestNames.map(testName => {
            const isRequested = (a.requestedTests || []).includes(testName);
            if (!isRequested) return <span className="text-gray-300">-</span>;
            
            const result = (a.results || []).find(r => r.testName === testName);
            const hasResult = result && result.value !== null && result.value !== '';
            
            if (hasResult) {
                return <span className="font-medium text-blue-700">{result.value}</span>;
            }
            
            return <span className="text-red-600 font-bold text-xs">Pendiente</span>;
        })
    ]);
    
    const handleDownloadPdf = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        try {
            doc.addImage(ADM_LOGO_BASE64, 'PNG', margin, 8, 20, 15);
        } catch (e) {
            console.error('Error adding logo:', e);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor('#002b66');
        doc.text('ADM - Laboratorio de Control de Calidad', margin + 24, 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor('#475569');
        doc.text('BLV. ANACLETO GONZALEZ FLORES No. 359. CP: 47600, Tepatitlan de Morelos, Jalisco, México', margin + 24, 19);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor('#002b66');
        doc.text('Reporte General de Análisis', pageWidth - margin, 14, { align: 'right' });

        const pdfDataRows = (filteredAnalyses || []).map(a => {
            const testResults = activeTestNames.map(testName => {
                const isRequested = (a.requestedTests || []).includes(testName);
                if (!isRequested) return '-';
                const result = (a.results || []).find(r => r.testName === testName);
                return result && result.value !== null && result.value !== '' ? String(result.value) : 'Pendiente';
            });

            return [
                a.folio || 'N/A', 
                a.receptionDate || 'N/A',
                a.deliveryDate ?? 'N/A',
                a.sampleName || 'N/A',
                a.product || 'N/A',
                clients.find(c => c.id === a.clientId)?.name ?? 'Unknown',
                technicians.find(t => t.id === a.technicianId)?.name ?? 'Unknown',
                a.priority || 'Normal',
                a.status || 'Received',
                ...testResults
            ];
        });
        autoTable(doc, {
            head: [headers],
            body: pdfDataRows,
            startY: 26,
            theme: 'grid',
            styles: { fontSize: 7 },
            headStyles: { fillColor: [0, 43, 102] },
        });
        doc.save('reporte-general-analisis.pdf');
    };

    const handleExportCSV = () => {
    const allTestNames = [...new Set((analyses || []).flatMap(a => a.requestedTests || []))];
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
            startY: 76,
            head: [['Parámetro / Parameter', 'Método / Method', 'Resultado / Result']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: '#002b66',
                textColor: '#ffffff',
                fontStyle: 'bold',
                halign: 'center'
            },
            alternateRowStyles: {
                fillColor: '#f8fafc'
            },
            didDrawPage: (data) => {
                // Header with ADM Logo and Laboratory Information
                try {
                    doc.addImage(ADM_LOGO_BASE64, 'PNG', margin, 10, 26, 19.5);
                } catch (e) {
                    console.error('Error drawing ADM logo:', e);
                }

                const labInfoX = margin + 29;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.setTextColor('#002b66');
                doc.text('ADM', labInfoX, 16);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor('#16a34a');
                doc.text('Laboratorio de Control de Calidad', labInfoX, 21);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.8);
                doc.setTextColor('#475569');
                doc.text('BLV. ANACLETO GONZALEZ FLORES No. 359', labInfoX, 26);
                doc.text('CP: 47600, Tepatitlan de Morelos, Jalisco, México', labInfoX, 30);

                // Right side document title & folio
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(15);
                doc.setTextColor('#002b66');
                doc.text('Reporte de Análisis', pageWidth - margin, 17, { align: 'right' });
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor('#334155');
                doc.text(`Folio: ${analysis.folio || 'N/A'}`, pageWidth - margin, 23, { align: 'right' });
                doc.text(`Recepción: ${analysis.receptionDate || 'N/A'}`, pageWidth - margin, 27.5, { align: 'right' });
                doc.text(`Entrega: ${analysis.deliveryDate ?? 'Pendiente'}`, pageWidth - margin, 32, { align: 'right' });

                doc.setDrawColor('#cbd5e1');
                doc.setLineWidth(0.4);
                doc.line(margin, 36, pageWidth - margin, 36);

                // Client and Sample Info
                doc.setFontSize(9.5);
                doc.setTextColor('#1e293b');
                
                doc.setFont('helvetica', 'bold');
                doc.text('DATOS DEL CLIENTE', margin, 44);
                doc.setFont('helvetica', 'normal');
                doc.text(client?.name ?? 'Cliente no especificado', margin, 50);
                if (client?.contactPerson) {
                    doc.text(`Contacto: ${client.contactPerson}`, margin, 55);
                }

                doc.setFont('helvetica', 'bold');
                doc.text('DATOS DE LA MUESTRA', 115, 44);
                doc.setFont('helvetica', 'normal');
                doc.text(`Muestra: ${analysis.sampleName || 'N/A'}`, 115, 50);
                doc.text(`Producto: ${analysis.product || 'N/A'}`, 115, 55);

                doc.line(margin, 66, pageWidth - margin, 66);

                // Footer
                const pageCount = (doc as any).internal.getNumberOfPages();
                doc.setFontSize(8.5);
                doc.setTextColor('#64748b');

                const footerY = pageHeight - 25;
                doc.line(margin, footerY, pageWidth - margin, footerY);

                doc.line(margin, footerY + 13, margin + 60, footerY + 13);
                doc.text('Analizado por:', margin, footerY + 18);
                doc.text(technician?.name ?? 'Técnico de Laboratorio', margin, footerY + 22);

                doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - margin, footerY + 20, { align: 'right' });
            }
        });

        doc.save(`reporte-${analysis.folio}.pdf`);
    };

    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";
    
    const translateStatus = (status: string) => {
        switch(status) {
            case 'Received': return 'Recibido';
            case 'In Progress': return 'En Proceso';
            case 'Completed': return 'Completo';
            case 'Cancelled': return 'Cancelado';
            default: return status;
        }
    };

    try {
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Folio..."
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
                            placeholder="Reception Date..."
                            value={dateSearchTerm}
                            onChange={(e) => setDateSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Sample Name..."
                            value={sampleSearchTerm}
                            onChange={(e) => setSampleSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Product..."
                            value={productSearchTerm}
                            onChange={(e) => setProductSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Client..."
                            value={clientSearchTerm}
                            onChange={(e) => setClientSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Technician..."
                            value={technicianSearchTerm}
                            onChange={(e) => setTechnicianSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>
            </div>

            <Table headers={headers} data={dataRows} onEdit={handleEdit} onDelete={handleDelete} onPrint={handlePrint} actionsIndex={1} />
            
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
                                {statusOptions.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
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
                        <button onClick={handleSaveAndSubmit} className="font-bold py-2 px-4 rounded-lg transition-colors text-white bg-primary hover:bg-secondary">
                            Guardar y Enviar
                        </button>
                    </div>
                </Modal>
            )}

            {/* Notificación flotante de sincronización en segundo plano */}
            {syncNotification && (
                <div className="fixed bottom-5 right-5 z-50 transition-all duration-300 transform">
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium ${
                        syncNotification.status === 'syncing' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                        syncNotification.status === 'synced' ? 'bg-green-50 border-green-200 text-green-800' :
                        'bg-red-50 border-red-200 text-red-800'
                    }`}>
                        {syncNotification.status === 'syncing' && (
                            <svg className="animate-spin h-5 w-5 text-blue-600 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                            </svg>
                        )}
                        {syncNotification.status === 'synced' && (
                            <svg className="h-5 w-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {syncNotification.status === 'error' && (
                            <svg className="h-5 w-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        )}
                        <div>
                            {syncNotification.status === 'syncing' && (
                                <span>Sincronizando folio <strong>{syncNotification.folio}</strong> con Google Sheets...</span>
                            )}
                            {syncNotification.status === 'synced' && (
                                <span>Folio <strong>{syncNotification.folio}</strong> guardado en Google Sheets con éxito.</span>
                            )}
                            {syncNotification.status === 'error' && (
                                <div>
                                    <p>Error al sincronizar folio <strong>{syncNotification.folio}</strong>: {syncNotification.message}</p>
                                    {syncNotification.payload && (
                                        <button 
                                            onClick={() => syncToGoogleSheets(syncNotification.payload!)}
                                            className="mt-1 underline font-bold hover:text-red-950 text-xs block"
                                        >
                                            Reintentar guardado ahora
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        );
    } catch (error) {
        console.error('AnalysisManagement render error:', error);
        return (
            <div className="p-8 text-red-600 bg-red-50 border border-red-200 rounded-lg">
                <h2 className="text-xl font-bold mb-2">Error loading analysis list</h2>
                <p className="text-sm">An error occurred while rendering the analysis management view. Please check the console for details.</p>
                <p className="mt-4 text-xs font-mono">{error instanceof Error ? error.message : String(error)}</p>
                <button onClick={() => reloadData()} className="mt-6 bg-red-600 text-white px-4 py-2 rounded-lg font-bold">Retry</button>
            </div>
        );
    }
};

export default AnalysisManagement;
