
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LoggedInClient, Analysis } from '../types';
import Table from './ui/Table';
import Loader from './ui/Loader';

interface ClientPortalProps {
    clientInfo: LoggedInClient;
    onLogout: () => void;
}

const ClientPortal: React.FC<ClientPortalProps> = ({ clientInfo, onLogout }) => {
    const [analyses, setAnalyses] = useState<Analysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchClientData = async () => {
            setLoading(true);
            setError(null);
            const googleScriptUrl = localStorage.getItem('googleScriptUrl');

            if (!googleScriptUrl) {
                setError("System configuration error. Please contact administrator.");
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`${googleScriptUrl}?clientId=${clientInfo.id}`);
                if (!response.ok) throw new Error("Failed to fetch analysis data.");
                
                const data = await response.json();
                if (data.analysisResults) {
                    setAnalyses(data.analysisResults);
                } else {
                    throw new Error("Invalid data format received.");
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "An unknown error occurred.");
            } finally {
                setLoading(false);
            }
        };

        fetchClientData();
    }, [clientInfo.id]);
    
    const handlePrintReport = (analysis: Analysis) => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        const tableBody = (analysis.results || [])
            .map(result => {
                const resultValue = result.value ?? 'N/A';
                return [result.testName, resultValue];
            });
        
        autoTable(doc, {
            startY: 85,
            head: [['Parameter', 'Result']],
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

                doc.setFontSize(10);
                doc.setTextColor('#333333');
                
                doc.setFont('helvetica', 'bold');
                doc.text('BILLED TO', margin, 50);
                doc.setFont('helvetica', 'normal');
                doc.text(clientInfo.name, margin, 56);

                doc.setFont('helvetica', 'bold');
                doc.text('SAMPLE DETAILS', 110, 50);
                doc.setFont('helvetica', 'normal');
                doc.text(`Sample Name: ${analysis.sampleName}`, 110, 56);
                doc.text(`Product Type: ${analysis.product}`, 110, 61);

                doc.line(margin, 70, pageWidth - margin, 70);

                const pageCount = (doc as any).internal.getNumberOfPages();
                doc.setFontSize(9);
                doc.setTextColor('#888888');
                const footerY = pageHeight - 20;
                doc.line(margin, footerY, pageWidth - margin, footerY);
                doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - margin, footerY + 12, { align: 'right' });
            }
        });

        doc.save(`report-${analysis.folio}.pdf`);
    };

    const headers = ['Folio', 'Reception', 'Delivery', 'Sample', 'Product', 'Status'];
    const dataRows = analyses.map(a => [
        a.folio,
        a.receptionDate,
        a.deliveryDate ?? 'Pending',
        a.sampleName,
        a.product,
        a.status
    ]);

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-primary">LabSys Client Portal</h1>
                        <p className="text-gray-600">Welcome, {clientInfo.name}</p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="bg-red-600 text-white hover:bg-red-700 font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        Logout
                    </button>
                </div>
            </header>
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {loading && <Loader message="Loading your analysis results..." />}
                {error && <p className="text-center text-red-600">{error}</p>}
                {!loading && !error && (
                    <Table 
                        headers={headers} 
                        data={dataRows}
                        onPrint={(index) => handlePrintReport(analyses[index])}
                    />
                )}
            </main>
        </div>
    );
};

export default ClientPortal;
