import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import type { UserType } from "@db/schema";
import { Icon } from "../assets";

export default function Dashboard() {
  const [healthResult, setHealthResult] = useState<any>(null);
  const [userResult, setUserResult] = useState<UserType | null>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

  const { logout, me, health, user, isLoading } = useAuthStore();

  const handleApiCall = async (
    apiCall: () => Promise<any>,
    resultSetter: (result: any) => void,
    key: string
  ) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await apiCall();
      resultSetter(result);
    } catch (error: any) {
      console.error(`${key} error:`, error);
      alert(`${key} failed: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleLogout = async () => {
    setLoading(prev => ({ ...prev, logout: true }));
    try {
      await logout();
    } catch (error: any) {
      console.error('Logout error:', error);
    } finally {
      setLoading(prev => ({ ...prev, logout: false }));
    }
  };

  const handleMe = async () => {
    await handleApiCall(
      async () => {
        await me();
        return user;
      },
      setUserResult,
      'me'
    );
  };

  const handleHealth = async () => {
    await handleApiCall(health, setHealthResult, 'health');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Dashboard</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <h2>Current User</h2>
        {user ? (
          <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>ID:</strong> {user.id}</p>
          </div>
        ) : (
          <p>No user data available</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button
          onClick={handleMe}
          disabled={loading.me || isLoading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {loading.me ? (
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          ) : (
            <Icon name="person" size={20} />
          )}
          {loading.me ? 'Loading...' : 'Get User Info (/api/me)'}
        </button>

        <button
          onClick={handleHealth}
          disabled={loading.health}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {loading.health ? (
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          ) : (
            <Icon name="health_and_safety" size={20} />
          )}
          {loading.health ? 'Loading...' : 'Health Check (/api/health)'}
        </button>

        <button
          onClick={handleLogout}
          disabled={loading.logout}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading.logout ? '#aaa' : '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading.logout ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {loading.logout ? (
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          ) : (
            <Icon name="logout" size={20} />
          )}
          {loading.logout ? 'Logging out...' : 'Logout (/api/logout)'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <h3>Me API Result</h3>
          <div style={{ 
            background: '#f8f9fa', 
            padding: '1rem', 
            borderRadius: '4px',
            minHeight: '100px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            overflow: 'auto'
          }}>
            {userResult ? JSON.stringify(userResult, null, 2) : 'No data yet'}
          </div>
        </div>

        <div>
          <h3>Health API Result</h3>
          <div style={{ 
            background: '#f8f9fa', 
            padding: '1rem', 
            borderRadius: '4px',
            minHeight: '100px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            overflow: 'auto'
          }}>
            {healthResult ? JSON.stringify(healthResult, null, 2) : 'No data yet'}
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}