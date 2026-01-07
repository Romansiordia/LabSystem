
import React, { useState } from 'react';

interface AdminLoginProps {
    onLoginSuccess: () => void;
    setAppMode: (mode: 'login' | 'adminLogin' | 'clientLogin') => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, setAppMode }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const googleScriptUrl = localStorage.getItem('googleScriptUrl');
        if (!googleScriptUrl) {
            setError('System not configured. Missing Google Script URL.');
            setLoading(false);
            return;
        }

        try {
            const requestPayload = {
                action: 'authenticateAdmin',
                payload: { password }
            };
            const postData = new URLSearchParams();
            postData.append('payload', JSON.stringify(requestPayload));

            const response = await fetch(googleScriptUrl, {
                method: 'POST',
                body: postData,
            });

            const result = await response.json();

            if (result.status === 'success') {
                onLoginSuccess();
            } else {
                throw new Error(result.message || 'Invalid admin password.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    };
    
    const inputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm";

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
             <div className="w-full max-w-md">
                <div className="bg-white p-8 rounded-2xl shadow-lg">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-primary tracking-wider">LabSys</h1>
                        <p className="text-gray-500 mt-2">Administrator Access</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className={inputStyle}
                            />
                        </div>
                        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-colors disabled:bg-gray-400"
                            >
                                {loading ? 'Verifying...' : 'Sign In'}
                            </button>
                        </div>
                    </form>
                </div>
                <div className="text-center mt-6">
                    <button onClick={() => setAppMode('login')} className="text-sm text-gray-600 hover:text-primary transition-colors">
                        &larr; Back to portal selection
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
