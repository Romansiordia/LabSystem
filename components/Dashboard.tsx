
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card } from './ui/Card';
import { Analysis, Client, Technician } from '../types';

interface DashboardProps {
    analyses: Analysis[];
    clients: Client[];
    technicians: Technician[];
}

const Dashboard: React.FC<DashboardProps> = ({ analyses, clients, technicians }) => {
    const totalClients = clients.length;
    const totalAnalyses = analyses.length;
    const totalRevenue = analyses.reduce((sum, a) => sum + (Number(a.cost) || 0), 0);

    const analysesPerClient = clients.map(client => ({
        name: client.name.split(' ')[0],
        Analyses: analyses.filter(a => a.clientId === client.id).length
    })).filter(c => c.Analyses > 0);

    const costsPerTechnician = technicians.map(tech => ({
        name: tech.name,
        value: analyses
            .filter(a => a.technicianId === tech.id)
            .reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
    })).filter(d => d.value > 0);

    const COLORS = ['#3b82f6', '#16a34a', '#f97316', '#dc2626', '#6b21a8'];

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card title="Total Clients" value={totalClients.toString()} />
                <Card title="Total Analyses" value={totalAnalyses.toString()} />
                <Card title="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Analyses per Client</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analysesPerClient}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="Analyses" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Revenue per Technician</h2>
                     <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={costsPerTechnician}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={110}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {costsPerTechnician.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;