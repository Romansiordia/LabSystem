
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LoggedInClient, Analysis } from '../types';
import Table from './ui/Table';
import Loader from './ui/Loader';
import StatusBadge from './ui/StatusBadge';
import TestProgress from './ui/TestProgress';
import { ADM_LOGO_BASE64 } from './admLogo';

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
            startY: 76,
            head: [['Parámetro / Parameter', 'Resultado / Result']],
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
                doc.text(clientInfo.name, margin, 50);

                doc.setFont('helvetica', 'bold');
                doc.text('DATOS DE LA MUESTRA', 115, 44);
                doc.setFont('helvetica', 'normal');
                doc.text(`Muestra: ${analysis.sampleName || 'N/A'}`, 115, 50);
                doc.text(`Producto: ${analysis.product || 'N/A'}`, 115, 55);

                doc.line(margin, 66, pageWidth - margin, 66);

                const pageCount = (doc as any).internal.getNumberOfPages();
                doc.setFontSize(8.5);
                doc.setTextColor('#64748b');
                const footerY = pageHeight - 20;
                doc.line(margin, footerY, pageWidth - margin, footerY);
                doc.text('ADM - Laboratorio de Control de Calidad', margin, footerY + 12);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - margin, footerY + 12, { align: 'right' });
            }
        });

        doc.save(`reporte-${analysis.folio}.pdf`);
    };

    const allTestNames = Array.from(new Set(analyses.flatMap(a => a.requestedTests || []))).sort();
    const headers = ['Folio', 'Reception', 'Delivery', 'Sample', 'Product', 'Status', ...allTestNames];
    const dataRows = analyses.map(a => [
        a.folio,
        a.receptionDate,
        a.deliveryDate ?? 'Pending',
        a.sampleName,
        a.product,
        <StatusBadge key={`status-${a.id}`} status={a.status || 'Received'} />,
        ...allTestNames.map(testName => {
            const isRequested = (a.requestedTests || []).includes(testName);
            if (!isRequested) return <span className="text-gray-300">-</span>;
            const result = (a.results || []).find(r => r.testName === testName);
            const hasResult = result && result.value !== null && result.value !== '';
            if (hasResult) return <span className="font-medium text-blue-700">{result.value}</span>;
            return <span className="text-red-600 font-bold text-xs">Pendiente</span>;
        })
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
                        actionsIndex={1}
                    />
                )}
            </main>
        </div>
    );
};

export default ClientPortal;
