
export type View = 'dashboard' | 'clients' | 'technicians' | 'analyses' | 'settings' | 'newAnalysis' | 'analysisCosts' | 'clientPortal' | 'products';

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
}

export interface Technician {
  id: string;
  name: string;
  specialty: string;
  hireDate: string;
}

export interface AnalysisCost {
    id: string;
    testName: string; // This now corresponds to AnalysisType.testName
    cost: number;
    method: string;
}

// New type for the master list of analyses defined in Google Sheets
export interface AnalysisType {
    id: string;
    testName: string;
    units: string;
    resultType: 'numeric' | 'text';
}

export interface Supplier {
    id:string;
    name: string;
    product: string;
}

export interface Product {
    id: string;
    name: string;
}

export interface Subtype {
    id: string;
    name: string;
    productTypeId: string;
}

export type AnalysisPriority = 'Normal' | 'Urgent' | 'Low';
export type AnalysisStatus = 'Received' | 'In Progress' | 'Completed' | 'Cancelled';

export interface AnalysisResultItem {
    testName: string;
    value: string | number | null;
}

export interface Analysis {
  id: string;
  folio: string;
  receptionDate: string;
  deliveryDate?: string;
  sampleName: string;
  product: string;
  subtype: string;
  clientId: string;
  technicianId: string;
  priority: AnalysisPriority;
  status: AnalysisStatus;
  cost: number;
  lot?: string;
  requestedTests: string[]; // Array of test names
  results: AnalysisResultItem[]; // Flexible array for results
}

export interface LoggedInClient {
    id: string;
    name: string;
}
