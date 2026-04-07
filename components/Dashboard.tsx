
import React, { useState, useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart, Line, ComposedChart, Area
} from 'recharts';
import { Card } from './ui/Card';
import { Analysis, Client, Technician } from '../types';
import { CalendarIcon, UserIcon } from './icons/Icons';

interface DashboardProps {
    analyses: Analysis[];
    clients: Client[];
    technicians: Technician[];
}

const Dashboard: React.FC<DashboardProps> = ({ analyses, clients, technicians }) => {
    const [selectedClientId, setSelectedClientId] = useState<string>('all');
    const [selectedMonthYear, setSelectedMonthYear] = useState<string>('all');

    // Extract unique months from analyses for the filter
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        analyses.forEach(a => {
            if (a && a.receptionDate) {
                // Try to parse date safely
                const date = new Date(a.receptionDate);
                if (!isNaN(date.getTime())) {
                    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    months.add(monthYear);
                } else {
                    // Fallback for common formats if Date fails
                    // e.g. DD/MM/YYYY or MM/DD/YYYY
                    const parts = a.receptionDate.split(/[-/]/);
                    if (parts.length === 3) {
                        // Assume YYYY-MM-DD or similar
                        if (parts[0].length === 4) {
                            months.add(`${parts[0]}-${parts[1].padStart(2, '0')}`);
                        } else if (parts[2].length === 4) {
                            // Assume DD/MM/YYYY or MM/DD/YYYY
                            months.add(`${parts[2]}-${parts[1].padStart(2, '0')}`);
                        }
                    }
                }
            }
        });
        const sortedMonths = Array.from(months).sort().reverse();
        console.log('Dashboard: Available Months:', sortedMonths);
        return sortedMonths;
    }, [analyses]);

    const filteredAnalyses = useMemo(() => {
        const filtered = analyses.filter(a => {
            if (!a) return false;
            const matchesClient = selectedClientId === 'all' || String(a.clientId) === selectedClientId;
            let matchesDate = true;
            if (selectedMonthYear !== 'all' && a.receptionDate) {
                const date = new Date(a.receptionDate);
                let monthYear = '';
                if (!isNaN(date.getTime())) {
                    monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    const parts = a.receptionDate.split(/[-/]/);
                    if (parts.length === 3) {
                        if (parts[0].length === 4) {
                            monthYear = `${parts[0]}-${parts[1].padStart(2, '0')}`;
                        } else if (parts[2].length === 4) {
                            monthYear = `${parts[2]}-${parts[1].padStart(2, '0')}`;
                        }
                    }
                }
                matchesDate = monthYear === selectedMonthYear;
            }
            return matchesClient && matchesDate;
        });
        console.log('Dashboard: Filtered Analyses Count:', filtered.length, 'Total:', analyses.length);
        return filtered;
    }, [analyses, selectedClientId, selectedMonthYear]);

    const totalRevenue = filteredAnalyses.reduce((sum, a) => sum + (Number(a.cost) || 0), 0);
    const totalAnalyses = filteredAnalyses.length;
    const totalSamples = new Set(filteredAnalyses.map(a => a.sampleName)).size;

    // Billing and Count per Client
    const clientData = useMemo(() => {
        const dataMap: Record<string, { name: string, billing: number, count: number }> = {};
        
        filteredAnalyses.forEach(a => {
            if (!a) return;
            const client = clients.find(c => c && String(c.id) === String(a.clientId));
            const clientName = client ? client.name : 'Unknown';
            const clientIdStr = String(a.clientId);
            if (!dataMap[clientIdStr]) {
                dataMap[clientIdStr] = { name: clientName, billing: 0, count: 0 };
            }
            dataMap[clientIdStr].billing += Number(a.cost) || 0;
            dataMap[clientIdStr].count += 1;
        });

        return Object.values(dataMap).sort((a, b) => b.billing - a.billing);
    }, [filteredAnalyses, clients]);

    // Monthly Summary (Trend)
    const monthlyTrendData = useMemo(() => {
        const trendMap: Record<string, { month: string, analyses: number, samples: number }> = {};
        
        // Use all analyses for trend, but filter by client if selected
        const trendAnalyses = selectedClientId === 'all' 
            ? analyses 
            : analyses.filter(a => a && String(a.clientId) === selectedClientId);

        trendAnalyses.forEach(a => {
            if (a && a.receptionDate) {
                const date = new Date(a.receptionDate);
                let monthYear = '';
                if (!isNaN(date.getTime())) {
                    monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    const parts = a.receptionDate.split(/[-/]/);
                    if (parts.length === 3) {
                        if (parts[0].length === 4) {
                            monthYear = `${parts[0]}-${parts[1].padStart(2, '0')}`;
                        } else if (parts[2].length === 4) {
                            monthYear = `${parts[2]}-${parts[1].padStart(2, '0')}`;
                        }
                    }
                }

                if (monthYear) {
                    if (!trendMap[monthYear]) {
                        trendMap[monthYear] = { month: monthYear, analyses: 0, samples: 0 };
                    }
                    trendMap[monthYear].analyses += 1;
                    trendMap[monthYear].samples += 1; 
                }
            }
        });

        return Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));
    }, [analyses, selectedClientId]);

    if (analyses.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center">
                <div className="bg-gray-50 p-4 rounded-full mb-4">
                    <CalendarIcon className="w-8 h-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-700">No data available</h2>
                <p className="text-gray-500 mt-2 max-w-xs">
                    There are no analysis records yet. Once you register your first analysis, the dashboard will show your reports here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                
                <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <select 
                            value={selectedClientId}
                            onChange={(e) => setSelectedClientId(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-600 cursor-pointer"
                        >
                            <option value="all">All Clients</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="w-px h-6 bg-gray-200 hidden md:block"></div>
                    
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        <select 
                            value={selectedMonthYear}
                            onChange={(e) => setSelectedMonthYear(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-600 cursor-pointer"
                        >
                            <option value="all">All Time</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card 
                    title="Total Billing" 
                    value={`$${totalRevenue.toLocaleString()}`} 
                    className="bg-gradient-to-br from-blue-50 to-white border-l-4 border-blue-500"
                />
                <Card 
                    title="Total Analyses" 
                    value={totalAnalyses.toString()} 
                    className="bg-gradient-to-br from-green-50 to-white border-l-4 border-green-500"
                />
                <Card 
                    title="Total Samples" 
                    value={totalSamples.toString()} 
                    className="bg-gradient-to-br from-purple-50 to-white border-l-4 border-purple-500"
                />
            </div>

            <div className="grid grid-cols-1 gap-8">
                {/* Monthly Trend */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-gray-800">Monthly Summary (Analyses & Samples)</h2>
                        <div className="flex items-center gap-4 text-xs font-medium">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span>Analyses</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span>Samples</span>
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={350}>
                        <ComposedChart data={monthlyTrendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis 
                                dataKey="month" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="analyses" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                            <Line type="monotone" dataKey="samples" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Billing per Client */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Billing per Client</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={clientData.slice(0, 10)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#475569', fontSize: 11 }}
                                    width={100}
                                />
                                <Tooltip 
                                    formatter={(value: number) => `$${value.toLocaleString()}`}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="billing" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Analyses per Client */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Analyses per Client</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={clientData.slice(0, 10)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#475569', fontSize: 11 }}
                                    width={100}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
