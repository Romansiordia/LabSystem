import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Analysis, AnalysisCost, AnalysisType, AnalysisResultItem, Client, Product } from '../types';
import { UploadIcon, SheetIcon } from './icons/Icons';

interface ImportResultsModalProps {
    isOpen: boolean;
    onClose: () => void;
    analyses: Analysis[];
    analysisCosts: AnalysisCost[];
    analysisTypes: AnalysisType[];
    clients?: Client[];
    products?: Product[];
    onBatchUpdateAnalyses?: (updatedList: Analysis[]) => void;
    onUpdateAnalysis?: (updated: Analysis) => void;
    reloadData: () => Promise<void>;
}

type ImportMode = 'matrix' | 'single' | 'vertical';

interface ColumnMapping {
    fileColumn: string;
    targetTestName: string;
    enabled: boolean;
}

interface PreviewItem {
    rowIndex: number;
    rawFolio: string;
    matchedAnalysis: Analysis | null;
    status: 'matched' | 'unmatched';
    updates: {
        testName: string;
        rawValue: any;
        cleanedValue: string | number | null;
        previousValue?: string | number | null;
        isOverwrite: boolean;
    }[];
}

export const ImportResultsModal: React.FC<ImportResultsModalProps> = ({
    isOpen,
    onClose,
    analyses,
    analysisCosts,
    analysisTypes,
    clients,
    products,
    onBatchUpdateAnalyses,
    onUpdateAnalysis,
    reloadData
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [fileName, setFileName] = useState<string | null>(null);
    const [fileRows, setFileRows] = useState<any[]>([]);
    const [fileHeaders, setFileHeaders] = useState<string[]>([]);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string>('');
    const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null);

    const [importMode, setImportMode] = useState<ImportMode>('matrix');
    const [folioColumn, setFolioColumn] = useState<string>('');
    
    // Matrix Mode mappings
    const [matrixMappings, setMatrixMappings] = useState<ColumnMapping[]>([]);

    // Single Analyte Mode settings
    const [singleTargetTest, setSingleTargetTest] = useState<string>('');
    const [singleValueColumn, setSingleValueColumn] = useState<string>('');

    // Vertical Mode settings
    const [verticalAnalyteColumn, setVerticalAnalyteColumn] = useState<string>('');
    const [verticalValueColumn, setVerticalValueColumn] = useState<string>('');

    // Options
    const [allowOverwrite, setAllowOverwrite] = useState<boolean>(true);
    const [autoMarkCompleted, setAutoMarkCompleted] = useState<boolean>(true);
    const [addMissingTests, setAddMissingTests] = useState<boolean>(true);

    // Processing State
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Helper: Normalize strings for fuzzy comparison
    const normalize = (str: string) => {
        return (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();
    };

    // Master list of all available laboratory test names
    const availableTestNames = useMemo(() => {
        const namesSet = new Set<string>();
        (analysisCosts || []).forEach(ac => {
            if (ac && ac.testName) namesSet.add(ac.testName.trim());
        });
        (analysisTypes || []).forEach(at => {
            if (at && at.testName) namesSet.add(at.testName.trim());
        });
        (analyses || []).forEach(a => {
            (a.requestedTests || []).forEach(t => {
                if (t) namesSet.add(t.trim());
            });
        });
        return Array.from(namesSet).sort();
    }, [analysisCosts, analysisTypes, analyses]);

    // Clean numeric or text values from spreadsheet
    const cleanValue = (val: any): string | number | null => {
        if (val === null || val === undefined) return null;
        let str = String(val).trim();
        if (str === '' || str === '-' || str === 'NA' || str === 'N/A') return null;

        // If it's a percentage (e.g., "12.5%"), remove %
        if (str.endsWith('%')) {
            str = str.slice(0, -1).trim();
        }

        // Handle comma as decimal separator if standard number pattern (e.g., "12,5")
        if (/^-?\d+,\d+$/.test(str)) {
            str = str.replace(',', '.');
        }

        const numeric = Number(str);
        if (!isNaN(numeric) && str !== '') {
            // Round to 4 decimals max for clean storage
            return Math.round(numeric * 10000) / 10000;
        }

        return str;
    };

    // Auto-detect best match for a column header against available lab tests
    const findBestTestMatch = (columnHeader: string): string => {
        const normHeader = normalize(columnHeader);
        if (!normHeader) return '';

        // Exact normalized match
        for (const test of availableTestNames) {
            if (normalize(test) === normHeader) return test;
        }

        // Substring match
        for (const test of availableTestNames) {
            const normTest = normalize(test);
            if (normTest && (normHeader.includes(normTest) || normTest.includes(normHeader))) {
                return test;
            }
        }

        // Common lab aliases
        const aliases: Record<string, string[]> = {
            'proteina': ['prot', 'protein', 'pc', 'pb'],
            'humedad': ['hum', 'moisture', 'mst', 'h2o'],
            'grasa': ['fat', 'gra', 'ee', 'lipidos'],
            'fibra': ['fiber', 'fbr', 'fc', 'fda', 'fdn'],
            'ceniza': ['ash', 'cen', 'cz'],
            'aflatoxina': ['afla', 'aflatoxin', 'afl'],
            'ocratoxina': ['ocra', 'ochra', 'ota'],
            'zearalenona': ['zera', 'zea', 'zen'],
            'fumonisina': ['fumo', 'fmn', 'fumb1'],
            'vomitoxina': ['don', 'vomitoxin', 'vom'],
            'toxina t2': ['t2', 't-2', 'toxinat2']
        };

        for (const [key, aliasList] of Object.entries(aliases)) {
            if (aliasList.some(a => normHeader.includes(a)) || normHeader.includes(key)) {
                // Find a test that has this key
                const match = availableTestNames.find(t => normalize(t).includes(key));
                if (match) return match;
            }
        }

        return '';
    };

    // Auto-detect folio column
    const detectFolioColumn = (headers: string[]): string => {
        const keywords = ['folio', 'muestra', 'sample', 'id', 'lote', 'codigo', 'code', 'no'];
        for (const header of headers) {
            const norm = normalize(header);
            if (keywords.some(k => norm.includes(k))) {
                return header;
            }
        }
        return headers[0] || '';
    };

    // Process file reading
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSaveSuccess(null);
        setSaveError(null);
        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
                setRawWorkbook(wb);
                setSheetNames(wb.SheetNames);
                const firstSheet = wb.SheetNames[0];
                setSelectedSheet(firstSheet);
                parseSheet(wb, firstSheet);
            } catch (err) {
                console.error('Error reading spreadsheet:', err);
                setSaveError('No se pudo leer el archivo. Asegúrate de que sea un archivo Excel (.xlsx, .xls) o CSV válido.');
            }
        };
        reader.readAsBinaryString(file);
    };

    const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return;

        // Convert to array of arrays to safely find header row
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!data || data.length === 0) {
            setFileHeaders([]);
            setFileRows([]);
            return;
        }

        // Find first non-empty row as header
        let headerRowIdx = 0;
        while (headerRowIdx < data.length && (!data[headerRowIdx] || data[headerRowIdx].every(c => c === ''))) {
            headerRowIdx++;
        }

        if (headerRowIdx >= data.length) {
            setFileHeaders([]);
            setFileRows([]);
            return;
        }

        const rawHeaders = (data[headerRowIdx] || []).map((h: any, i: number) => {
            const str = String(h || '').trim();
            return str !== '' ? str : `Columna_${i + 1}`;
        });

        // Filter out completely empty columns from the end
        const headers = rawHeaders;
        setFileHeaders(headers);

        // Parse remaining rows as objects
        const rows: any[] = [];
        for (let i = headerRowIdx + 1; i < data.length; i++) {
            const rowData = data[i];
            if (!rowData || rowData.every(c => c === '' || c === null || c === undefined)) {
                continue; // Skip empty rows
            }
            const rowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
                rowObj[h] = rowData[idx] !== undefined ? rowData[idx] : '';
            });
            rows.push(rowObj);
        }
        setFileRows(rows);

        // Auto-configure initial parameters
        const detectedFolio = detectFolioColumn(headers);
        setFolioColumn(detectedFolio);

        // Build matrix mappings
        const initialMappings: ColumnMapping[] = headers
            .filter(h => h !== detectedFolio)
            .map(h => {
                const matchedTest = findBestTestMatch(h);
                return {
                    fileColumn: h,
                    targetTestName: matchedTest,
                    enabled: Boolean(matchedTest)
                };
            });
        setMatrixMappings(initialMappings);

        // Auto-configure single analyte if applicable
        const nonFolioHeaders = headers.filter(h => h !== detectedFolio);
        if (nonFolioHeaders.length > 0) {
            setSingleValueColumn(nonFolioHeaders[0]);
            const guessedSingleTest = findBestTestMatch(nonFolioHeaders[0]);
            if (guessedSingleTest) {
                setSingleTargetTest(guessedSingleTest);
            } else if (availableTestNames.length > 0) {
                setSingleTargetTest(availableTestNames[0]);
            }
        }

        // Auto-configure vertical mode
        if (headers.length >= 3) {
            setVerticalAnalyteColumn(headers[1]);
            setVerticalValueColumn(headers[2]);
        }
    };

    const handleSheetChange = (newSheet: string) => {
        setSelectedSheet(newSheet);
        if (rawWorkbook) {
            parseSheet(rawWorkbook, newSheet);
        }
    };

    // Match a raw folio string to an Analysis in our database
    const findMatchedAnalysis = (rawFolio: string): Analysis | null => {
        if (!rawFolio) return null;
        const normRaw = normalize(rawFolio);
        if (!normRaw) return null;

        // 1. Exact match by folio
        let found = (analyses || []).find(a => normalize(a.folio) === normRaw);
        if (found) return found;

        // 2. Exact match by sampleName or ID
        found = (analyses || []).find(a => normalize(a.sampleName) === normRaw || normalize(a.id) === normRaw);
        if (found) return found;

        // 3. Match by lot
        if (analyses.some(a => a.lot)) {
            found = (analyses || []).find(a => a.lot && normalize(a.lot) === normRaw);
            if (found) return found;
        }

        // 4. Loose match: strip leading zeros or prefix (e.g. M-2026-001 vs 2026-001 or 001)
        const digitsOnlyRaw = rawFolio.replace(/\D/g, '');
        if (digitsOnlyRaw.length >= 3) {
            found = (analyses || []).find(a => {
                const aDigits = (a.folio || '').replace(/\D/g, '');
                return aDigits && (aDigits === digitsOnlyRaw || aDigits.endsWith(digitsOnlyRaw));
            });
            if (found) return found;
        }

        return null;
    };

    // Generate preview items based on current mode and mappings
    const previewData = useMemo<PreviewItem[]>(() => {
        if (!fileRows.length || !folioColumn) return [];

        const items: PreviewItem[] = [];

        if (importMode === 'matrix') {
            const activeMappings = matrixMappings.filter(m => m.enabled && m.targetTestName);

            fileRows.forEach((row, idx) => {
                const rawFolio = String(row[folioColumn] || '').trim();
                if (!rawFolio) return;

                const matchedAnalysis = findMatchedAnalysis(rawFolio);
                const updates: PreviewItem['updates'] = [];

                activeMappings.forEach(mapping => {
                    const rawVal = row[mapping.fileColumn];
                    const cleaned = cleanValue(rawVal);
                    if (cleaned === null) return; // Skip blank cells

                    // Check previous value
                    let prevVal: string | number | null = null;
                    if (matchedAnalysis && matchedAnalysis.results) {
                        const existingRes = matchedAnalysis.results.find(r => r.testName === mapping.targetTestName);
                        if (existingRes && existingRes.value !== null && existingRes.value !== undefined && existingRes.value !== '') {
                            prevVal = existingRes.value;
                        }
                    }

                    updates.push({
                        testName: mapping.targetTestName,
                        rawValue: rawVal,
                        cleanedValue: cleaned,
                        previousValue: prevVal,
                        isOverwrite: prevVal !== null
                    });
                });

                items.push({
                    rowIndex: idx + 1,
                    rawFolio,
                    matchedAnalysis,
                    status: matchedAnalysis ? 'matched' : 'unmatched',
                    updates
                });
            });
        } else if (importMode === 'single') {
            if (!singleTargetTest || !singleValueColumn) return [];

            fileRows.forEach((row, idx) => {
                const rawFolio = String(row[folioColumn] || '').trim();
                if (!rawFolio) return;

                const matchedAnalysis = findMatchedAnalysis(rawFolio);
                const rawVal = row[singleValueColumn];
                const cleaned = cleanValue(rawVal);
                if (cleaned === null) return;

                let prevVal: string | number | null = null;
                if (matchedAnalysis && matchedAnalysis.results) {
                    const existingRes = matchedAnalysis.results.find(r => r.testName === singleTargetTest);
                    if (existingRes && existingRes.value !== null && existingRes.value !== undefined && existingRes.value !== '') {
                        prevVal = existingRes.value;
                    }
                }

                items.push({
                    rowIndex: idx + 1,
                    rawFolio,
                    matchedAnalysis,
                    status: matchedAnalysis ? 'matched' : 'unmatched',
                    updates: [{
                        testName: singleTargetTest,
                        rawValue: rawVal,
                        cleanedValue: cleaned,
                        previousValue: prevVal,
                        isOverwrite: prevVal !== null
                    }]
                });
            });
        } else if (importMode === 'vertical') {
            if (!verticalAnalyteColumn || !verticalValueColumn) return [];

            // Group by folio for clean display
            const groupedByFolio = new Map<string, {
                rawFolio: string;
                rowIndex: number;
                updates: PreviewItem['updates'];
            }>();

            fileRows.forEach((row, idx) => {
                const rawFolio = String(row[folioColumn] || '').trim();
                const rawAnalyte = String(row[verticalAnalyteColumn] || '').trim();
                const rawVal = row[verticalValueColumn];
                if (!rawFolio || !rawAnalyte) return;

                const targetTest = findBestTestMatch(rawAnalyte) || rawAnalyte;
                const cleaned = cleanValue(rawVal);
                if (cleaned === null) return;

                if (!groupedByFolio.has(rawFolio)) {
                    groupedByFolio.set(rawFolio, {
                        rawFolio,
                        rowIndex: idx + 1,
                        updates: []
                    });
                }

                const currentGroup = groupedByFolio.get(rawFolio)!;
                currentGroup.updates.push({
                    testName: targetTest,
                    rawValue: rawVal,
                    cleanedValue: cleaned,
                    previousValue: null, // Will calculate below
                    isOverwrite: false
                });
            });

            groupedByFolio.forEach((group) => {
                const matchedAnalysis = findMatchedAnalysis(group.rawFolio);
                const updatesWithPrev = group.updates.map(u => {
                    let prevVal: string | number | null = null;
                    if (matchedAnalysis && matchedAnalysis.results) {
                        const existingRes = matchedAnalysis.results.find(r => r.testName === u.testName);
                        if (existingRes && existingRes.value !== null && existingRes.value !== undefined && existingRes.value !== '') {
                            prevVal = existingRes.value;
                        }
                    }
                    return {
                        ...u,
                        previousValue: prevVal,
                        isOverwrite: prevVal !== null
                    };
                });

                items.push({
                    rowIndex: group.rowIndex,
                    rawFolio: group.rawFolio,
                    matchedAnalysis,
                    status: matchedAnalysis ? 'matched' : 'unmatched',
                    updates: updatesWithPrev
                });
            });
        }

        return items;
    }, [fileRows, folioColumn, importMode, matrixMappings, singleTargetTest, singleValueColumn, verticalAnalyteColumn, verticalValueColumn, analyses]);

    // Statistics
    const stats = useMemo(() => {
        const totalRows = previewData.length;
        const matchedRows = previewData.filter(p => p.status === 'matched').length;
        const unmatchedRows = previewData.filter(p => p.status === 'unmatched').length;
        
        let totalUpdates = 0;
        let overwriteCount = 0;

        previewData.forEach(p => {
            if (p.status === 'matched') {
                p.updates.forEach(u => {
                    if (u.isOverwrite) {
                        overwriteCount++;
                        if (allowOverwrite) totalUpdates++;
                    } else {
                        totalUpdates++;
                    }
                });
            }
        });

        return {
            totalRows,
            matchedRows,
            unmatchedRows,
            totalUpdates,
            overwriteCount
        };
    }, [previewData, allowOverwrite]);

    // Execute Import
    const handleExecuteImport = async () => {
        if (stats.matchedRows === 0) {
            alert('No hay muestras coincidentes para importar.');
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(null);

        try {
            // Group updates by matched Analysis ID
            const analysisUpdatesMap = new Map<string, Analysis>();

            previewData.forEach(item => {
                if (item.status !== 'matched' || !item.matchedAnalysis) return;

                const currentAnalysis = analysisUpdatesMap.get(item.matchedAnalysis.id) || {
                    ...item.matchedAnalysis,
                    requestedTests: [...(item.matchedAnalysis.requestedTests || [])],
                    results: [...(item.matchedAnalysis.results || [])]
                };

                item.updates.forEach(up => {
                    if (up.isOverwrite && !allowOverwrite) {
                        return; // Skip overwriting
                    }

                    // Add to requestedTests if missing and option is active
                    if (addMissingTests && !currentAnalysis.requestedTests.includes(up.testName)) {
                        currentAnalysis.requestedTests.push(up.testName);
                    }

                    // Update or insert result item
                    const resIdx = currentAnalysis.results.findIndex(r => r.testName === up.testName);
                    if (resIdx > -1) {
                        currentAnalysis.results[resIdx] = {
                            testName: up.testName,
                            value: up.cleanedValue
                        };
                    } else {
                        currentAnalysis.results.push({
                            testName: up.testName,
                            value: up.cleanedValue
                        });
                    }
                });

                // Check if all requested tests have a value -> auto mark as Completed
                if (autoMarkCompleted && currentAnalysis.requestedTests.length > 0) {
                    const allDone = currentAnalysis.requestedTests.every(testName => {
                        const r = currentAnalysis.results.find(itemRes => itemRes.testName === testName);
                        return r && r.value !== null && r.value !== undefined && r.value !== '';
                    });
                    if (allDone) {
                        currentAnalysis.status = 'Completed';
                    } else if (currentAnalysis.results.some(r => r.value !== null && r.value !== '')) {
                        currentAnalysis.status = 'In Progress';
                    }
                }

                analysisUpdatesMap.set(currentAnalysis.id, currentAnalysis);
            });

            const updatedAnalysesList = Array.from(analysisUpdatesMap.values());

            // 1. Optimistic Batch UI Update (Instant)
            if (onBatchUpdateAnalyses) {
                onBatchUpdateAnalyses(updatedAnalysesList);
            } else if (onUpdateAnalysis) {
                updatedAnalysesList.forEach(a => onUpdateAnalysis(a));
            }

            // 2. Background Sync with Google Sheets
            const googleScriptUrl = localStorage.getItem('googleScriptUrl');
            if (googleScriptUrl) {
                setSyncProgress({ current: 0, total: updatedAnalysesList.length });
                
                let successCount = 0;
                let failCount = 0;

                for (let i = 0; i < updatedAnalysesList.length; i++) {
                    const targetAnalysis = updatedAnalysesList[i];
                    try {
                        const requestPayload = {
                            action: 'update',
                            targetSheet: 'AnalysisResults',
                            payload: targetAnalysis
                        };
                        const postData = new URLSearchParams();
                        postData.append('payload', JSON.stringify(requestPayload));

                        const response = await fetch(googleScriptUrl, {
                            method: 'POST',
                            body: postData,
                        });
                        const result = await response.json();
                        if (result.status === 'success') {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    } catch (e) {
                        console.error('Error syncing individual analysis to Google Sheets:', e);
                        failCount++;
                    }
                    setSyncProgress({ current: i + 1, total: updatedAnalysesList.length });
                }

                // Finish
                setSaveSuccess(`¡Importación completada! Se actualizaron ${updatedAnalysesList.length} muestras (${stats.totalUpdates} resultados) en el sistema y se sincronizaron con Google Sheets.`);
            } else {
                setSaveSuccess(`¡Importación completada! Se actualizaron ${updatedAnalysesList.length} muestras localmente. (Nota: Configura la URL de Google Sheets en Settings para sincronización remota).`);
            }

            setTimeout(async () => {
                try {
                    await reloadData();
                } catch (e) {
                    console.error('Error reloading data after import:', e);
                }
            }, 1000);

        } catch (error) {
            console.error('Failed to execute import:', error);
            setSaveError(`Ocurrió un error al importar: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setFileName(null);
        setFileRows([]);
        setFileHeaders([]);
        setMatrixMappings([]);
        setSaveSuccess(null);
        setSaveError(null);
        setSyncProgress(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-sm">
                            <UploadIcon />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">
                                Importador Rápido de Resultados (Excel / CSV)
                            </h2>
                            <p className="text-xs text-gray-500">
                                Asocia automáticamente resultados a muestras mediante Folio y Analito
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label="Cerrar"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/40">
                    {/* Status Alerts */}
                    {saveSuccess && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-sm">
                            <div className="flex items-center space-x-3">
                                <span className="text-xl">✅</span>
                                <span className="text-sm font-medium">{saveSuccess}</span>
                            </div>
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition"
                            >
                                Cerrar Ventana
                            </button>
                        </div>
                    )}

                    {saveError && (
                        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center space-x-3 shadow-sm">
                            <span className="text-xl">⚠️</span>
                            <span className="text-sm font-medium">{saveError}</span>
                        </div>
                    )}

                    {/* Step 1: Upload File Area */}
                    {!fileName ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/30 rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 group"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".xlsx, .xls, .csv"
                                className="hidden"
                            />
                            <div className="w-16 h-16 mx-auto bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <SheetIcon />
                            </div>
                            <h3 className="text-lg font-bold text-gray-800 mb-1">
                                Haz clic aquí o arrastra tu archivo Excel o CSV
                            </h3>
                            <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
                                Compatible con archivos generados por equipos NIR (FOSS/Perten), lectores de micotoxinas o bitácoras de laboratorio en hojas de cálculo.
                            </p>
                            <span className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm group-hover:bg-indigo-700 transition">
                                <UploadIcon /> <span className="ml-2">Seleccionar archivo (.xlsx, .xls, .csv)</span>
                            </span>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* File Info Card */}
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                                        <SheetIcon />
                                    </div>
                                    <div>
                                        <div className="flex items-center space-x-2">
                                            <h4 className="text-sm font-bold text-gray-800">{fileName}</h4>
                                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                                {fileRows.length} filas detectadas
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {fileHeaders.length} columnas leídas correctamente
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-3">
                                    {sheetNames.length > 1 && (
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs font-semibold text-gray-600">Hoja:</span>
                                            <select
                                                value={selectedSheet}
                                                onChange={(e) => handleSheetChange(e.target.value)}
                                                className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                            >
                                                {sheetNames.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        disabled={isSaving}
                                        className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition"
                                    >
                                        Cambiar archivo
                                    </button>
                                </div>
                            </div>

                            {/* Format & Mode Selector */}
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800">
                                            Configuración del Formato de Archivo
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            Selecciona cómo están estructurados los datos en tu hoja de cálculo
                                        </p>
                                    </div>

                                    {/* Tabs for Mode */}
                                    <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setImportMode('matrix')}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                                importMode === 'matrix'
                                                    ? 'bg-white text-indigo-700 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            🌾 Matriz Varios Analitos (NIR)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setImportMode('single')}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                                importMode === 'single'
                                                    ? 'bg-white text-indigo-700 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            🔬 Un Solo Analito (Bitácora)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setImportMode('vertical')}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                                importMode === 'vertical'
                                                    ? 'bg-white text-indigo-700 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            📋 Listado Vertical
                                        </button>
                                    </div>
                                </div>

                                {/* Common: Folio Column Selector */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">
                                            Columna de Folio / Muestra:
                                        </label>
                                        <select
                                            value={folioColumn}
                                            onChange={(e) => setFolioColumn(e.target.value)}
                                            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        >
                                            {fileHeaders.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Mode-specific column selectors */}
                                    {importMode === 'single' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                                    Analito al que corresponde:
                                                </label>
                                                <select
                                                    value={singleTargetTest}
                                                    onChange={(e) => setSingleTargetTest(e.target.value)}
                                                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                >
                                                    {availableTestNames.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                                    Columna del Resultado:
                                                </label>
                                                <select
                                                    value={singleValueColumn}
                                                    onChange={(e) => setSingleValueColumn(e.target.value)}
                                                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                >
                                                    {fileHeaders.filter(h => h !== folioColumn).map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    )}

                                    {importMode === 'vertical' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                                    Columna con Nombre de Analito:
                                                </label>
                                                <select
                                                    value={verticalAnalyteColumn}
                                                    onChange={(e) => setVerticalAnalyteColumn(e.target.value)}
                                                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                >
                                                    {fileHeaders.filter(h => h !== folioColumn).map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                                    Columna del Resultado:
                                                </label>
                                                <select
                                                    value={verticalValueColumn}
                                                    onChange={(e) => setVerticalValueColumn(e.target.value)}
                                                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                >
                                                    {fileHeaders.filter(h => h !== folioColumn && h !== verticalAnalyteColumn).map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Matrix Mode: Column by Column Mapping Cards */}
                                {importMode === 'matrix' && (
                                    <div className="mt-4 pt-3 border-t border-gray-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-gray-700">
                                                Mapeo de Columnas del Archivo → Analito en el Laboratorio:
                                            </span>
                                            <span className="text-[11px] text-gray-500">
                                                {matrixMappings.filter(m => m.enabled).length} de {matrixMappings.length} columnas seleccionadas
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
                                            {matrixMappings.map((mapping, idx) => (
                                                <div 
                                                    key={mapping.fileColumn}
                                                    className={`p-2.5 rounded-lg border text-xs transition ${
                                                        mapping.enabled 
                                                            ? 'border-indigo-200 bg-indigo-50/40' 
                                                            : 'border-gray-200 bg-gray-50 opacity-60'
                                                    }`}
                                                >
                                                    <div className="flex items-center space-x-2 mb-1.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={mapping.enabled}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setMatrixMappings(prev => prev.map((m, i) => i === idx ? { ...m, enabled: checked } : m));
                                                            }}
                                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <span className="font-bold text-gray-800 truncate" title={mapping.fileColumn}>
                                                            {mapping.fileColumn}
                                                        </span>
                                                    </div>
                                                    {mapping.enabled && (
                                                        <div className="pl-6">
                                                            <select
                                                                value={mapping.targetTestName}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setMatrixMappings(prev => prev.map((m, i) => i === idx ? { ...m, targetTestName: val } : m));
                                                                }}
                                                                className="w-full text-[11px] border border-gray-300 rounded px-2 py-1 bg-white font-medium focus:ring-1 focus:ring-indigo-500"
                                                            >
                                                                <option value="">-- Ignorar columna --</option>
                                                                {availableTestNames.map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Summary Bar */}
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="px-3 py-1.5 rounded-lg font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        🟢 {stats.matchedRows} Muestras encontradas
                                    </span>
                                    <span className="px-3 py-1.5 rounded-lg font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        ⚡ {stats.totalUpdates} Resultados listos
                                    </span>
                                    {stats.overwriteCount > 0 && (
                                        <span className="px-3 py-1.5 rounded-lg font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                            ⚠️ {stats.overwriteCount} Con valor previo
                                        </span>
                                    )}
                                    {stats.unmatchedRows > 0 && (
                                        <span className="px-3 py-1.5 rounded-lg font-bold bg-red-50 text-red-700 border border-red-200">
                                            ❌ {stats.unmatchedRows} Folios no registrados
                                        </span>
                                    )}
                                </div>

                                {/* Options Toggles */}
                                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-700">
                                    <label className="flex items-center space-x-1.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={allowOverwrite}
                                            onChange={(e) => setAllowOverwrite(e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span>Sobreescribir valores existentes</span>
                                    </label>
                                    <label className="flex items-center space-x-1.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoMarkCompleted}
                                            onChange={(e) => setAutoMarkCompleted(e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span>Marcar como &quot;Completed&quot; si finaliza</span>
                                    </label>
                                </div>
                            </div>

                            {/* Pre-Validation Table */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Vista Previa de Validación ({previewData.length} registros)
                                    </h4>
                                    <span className="text-[11px] text-gray-500">
                                        Verifica la coincidencia antes de confirmar la importación
                                    </span>
                                </div>

                                <div className="max-h-72 overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-bold text-gray-600">Estado</th>
                                                <th className="px-3 py-2 text-left font-bold text-gray-600">Folio en Archivo</th>
                                                <th className="px-3 py-2 text-left font-bold text-gray-600">Muestra en Sistema</th>
                                                <th className="px-3 py-2 text-left font-bold text-gray-600">Cliente / Producto</th>
                                                <th className="px-3 py-2 text-left font-bold text-gray-600">Resultados a Guardar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {previewData.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                                                        No hay datos para mostrar con la configuración actual.
                                                    </td>
                                                </tr>
                                            ) : (
                                                previewData.map((item, idx) => {
                                                    const client = (clients || []).find(c => c.id === item.matchedAnalysis?.clientId);
                                                    return (
                                                        <tr 
                                                            key={`${item.rawFolio}-${idx}`}
                                                            className={`hover:bg-gray-50/80 transition ${
                                                                item.status === 'matched' ? 'bg-white' : 'bg-red-50/20'
                                                            }`}
                                                        >
                                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                                {item.status === 'matched' ? (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                                                        🟢 Listo
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800" title="Este folio no existe en el sistema">
                                                                        ❌ No existe
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">
                                                                {item.rawFolio}
                                                            </td>
                                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                                {item.matchedAnalysis ? (
                                                                    <div>
                                                                        <span className="font-semibold text-gray-800">
                                                                            {item.matchedAnalysis.folio}
                                                                        </span>
                                                                        {item.matchedAnalysis.sampleName && (
                                                                            <span className="text-[11px] text-gray-500 block">
                                                                                {item.matchedAnalysis.sampleName}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-gray-400 italic">No encontrado</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                                                                {item.matchedAnalysis ? (
                                                                    <div>
                                                                        <span className="font-medium text-gray-800">
                                                                            {client ? client.name : 'Cliente no esp.'}
                                                                        </span>
                                                                        <span className="text-[11px] text-gray-500 block">
                                                                            {item.matchedAnalysis.product || 'Sin producto'}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    '-'
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5">
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {item.updates.map((u, uIdx) => (
                                                                        <span
                                                                            key={uIdx}
                                                                            className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border ${
                                                                                u.isOverwrite
                                                                                    ? allowOverwrite
                                                                                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                                                                                        : 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                                                                                    : 'bg-indigo-50 text-indigo-900 border-indigo-100'
                                                                            }`}
                                                                        >
                                                                            <strong className="mr-1">{u.testName}:</strong>
                                                                            {u.isOverwrite ? (
                                                                                <>
                                                                                    <span className="text-gray-400 line-through mr-1">{String(u.previousValue)}</span>
                                                                                    <span>→ <strong>{String(u.cleanedValue)}</strong></span>
                                                                                </>
                                                                            ) : (
                                                                                <strong>{String(u.cleanedValue)}</strong>
                                                                            )}
                                                                        </span>
                                                                    ))}
                                                                    {item.updates.length === 0 && (
                                                                        <span className="text-gray-400 italic text-[11px]">Sin valores</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-gray-500 flex items-center space-x-2">
                        {syncProgress && (
                            <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="font-semibold text-indigo-700">
                                    Sincronizando con Google Sheets: {syncProgress.current} de {syncProgress.total} muestras...
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition"
                        >
                            {saveSuccess ? 'Cerrar' : 'Cancelar'}
                        </button>

                        {fileName && !saveSuccess && (
                            <button
                                type="button"
                                onClick={handleExecuteImport}
                                disabled={isSaving || stats.matchedRows === 0}
                                className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center space-x-2 transition ${
                                    isSaving || stats.matchedRows === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                }`}
                            >
                                {isSaving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>Importando...</span>
                                    </>
                                ) : (
                                    <>
                                        <UploadIcon />
                                        <span>
                                            Confirmar e Importar ({stats.matchedRows} Muestras / {stats.totalUpdates} Resultados)
                                        </span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportResultsModal;
