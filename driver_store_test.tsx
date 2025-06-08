import React, { useEffect } from 'react';
import { useDriverStore } from './src/app/stores/driverStore';
import { DRIVER_TYPES } from './src/types/driver';

// Simple test component to verify driver store functionality
const DriverStoreTest: React.FC = () => {
  const {
    drivers,
    loading,
    error,
    contentLoading,
    driverContent,
    fetchDrivers,
    getDriverContent,
    setDriver,
    clearError
  } = useDriverStore();

  useEffect(() => {
    // Fetch drivers on component mount
    fetchDrivers();
  }, [fetchDrivers]);

  const handleGetLogs = () => {
    getDriverContent(DRIVER_TYPES.LOGS);
  };

  const handleSetFileDriver = () => {
    setDriver(DRIVER_TYPES.LOGS, 'file', { filepath: '/tmp/test_logs.json' });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Driver Store Test</h2>
      
      {error && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          Error: {error}
          <button onClick={clearError} style={{ marginLeft: '10px' }}>Clear</button>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h3>Current Drivers</h3>
        {loading ? (
          <p>Loading drivers...</p>
        ) : drivers ? (
          <div>
            <p>Logs: {drivers.current.logs.implementation} ({drivers.current.logs.status})</p>
            <p>Cache: {drivers.current.cache.implementation} ({drivers.current.cache.status})</p>
            <p>Blacklist: {drivers.current.blacklist.implementation} ({drivers.current.blacklist.status})</p>
            <p>Whitelist: {drivers.current.whitelist.implementation} ({drivers.current.whitelist.status})</p>
          </div>
        ) : (
          <p>No driver data</p>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Available Drivers</h3>
        {drivers?.available && (
          <div>
            <p>Logs: {drivers.available.logs.join(', ')}</p>
            <p>Cache: {drivers.available.cache.join(', ')}</p>
            <p>Blacklist: {drivers.available.blacklist.join(', ')}</p>
            <p>Whitelist: {drivers.available.whitelist.join(', ')}</p>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Actions</h3>
        <button onClick={fetchDrivers} disabled={loading}>
          Refresh Drivers
        </button>
        <button onClick={handleGetLogs} disabled={contentLoading} style={{ marginLeft: '10px' }}>
          Get Logs Content
        </button>
        <button onClick={handleSetFileDriver} disabled={loading} style={{ marginLeft: '10px' }}>
          Set File Driver for Logs
        </button>
      </div>

      <div>
        <h3>Logs Content</h3>
        {contentLoading ? (
          <p>Loading content...</p>
        ) : driverContent.logs ? (
          <div>
            <p>Driver: {driverContent.logs.driver}</p>
            <p>Content: {JSON.stringify(driverContent.logs.content)}</p>
            <p>Timestamp: {driverContent.logs.metadata?.timestamp}</p>
          </div>
        ) : (
          <p>No logs content</p>
        )}
      </div>
    </div>
  );
};

export default DriverStoreTest;