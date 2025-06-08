import { Button, Card, Select } from "@app_components/index";
import { useState, useEffect } from "react";
import { useDriverStore } from "@app/stores/driverStore";
import { DRIVER_TYPES } from "@src/types/driver";

export default function DNSDriver() {
  const {
    drivers,
    loading: driversLoading,
    error: driversError,
    fetchDrivers,
    setDriver,
    clearError
  } = useDriverStore();

  // Note: Polling removed - now using SSE for real-time updates

  // Driver form states
  const [driverForms, setDriverForms] = useState({
    [DRIVER_TYPES.LOGS]: { driver: '' },
    [DRIVER_TYPES.CACHE]: { driver: '' },
    [DRIVER_TYPES.BLACKLIST]: { driver: '' },
    [DRIVER_TYPES.WHITELIST]: { driver: '' },
  });

  useEffect(() => {
    fetchDrivers();
  }, []); // Empty dependency array - run only once on mount

  // Update driver forms when drivers data is loaded
  useEffect(() => {
    if (drivers?.current) {
      setDriverForms({
        [DRIVER_TYPES.LOGS]: {
          driver: drivers.current.logs.implementation || 'console'
        },
        [DRIVER_TYPES.CACHE]: {
          driver: drivers.current.cache.implementation || 'inmemory'
        },
        [DRIVER_TYPES.BLACKLIST]: {
          driver: drivers.current.blacklist.implementation || 'inmemory'
        },
        [DRIVER_TYPES.WHITELIST]: {
          driver: drivers.current.whitelist.implementation || 'inmemory'
        },
      });
    }
  }, [drivers]);

  // Polling removed - now using SSE for real-time driver content updates

  const handleDriverFormChange = (scope: string, driver: string) => {
    setDriverForms(prev => ({
      ...prev,
      [scope]: { driver }
    }));
  };

  const handleSetDriver = async (scope: string) => {
    const form = driverForms[scope as keyof typeof driverForms];
    
    try {
      await setDriver(scope as any, form.driver);
      alert(`${scope} driver updated successfully`);
    } catch (error) {
      alert(`Failed to update ${scope} driver`);
    }
  };

  const renderDriverSection = (scope: string, title: string, icon: string) => {
    const form = driverForms[scope as keyof typeof driverForms];
    const availableDrivers = drivers?.available[scope as keyof typeof drivers.available] || [];
    const currentDriver = drivers?.current[scope as keyof typeof drivers.current];
    
    return (
      <Card key={scope} title={`${title} Driver`}>
        <div className="space-y-4">
          {/* Driver Configuration */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select
                label="Driver Implementation"
                value={form.driver}
                onChange={(value) => handleDriverFormChange(scope, value)}
                options={availableDrivers.map(driver => ({
                  value: driver,
                  label: driver.charAt(0).toUpperCase() + driver.slice(1)
                }))}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSetDriver(scope)}
                disabled={!form.driver || driversLoading}
              >
                Set Driver
              </Button>
            </div>
          </div>

          {/* Driver Status */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="material-icons text-lg text-gray-600">{icon}</span>
            <div>
              <div className="font-medium text-gray-900">
                Current: {currentDriver?.implementation ? 
                  currentDriver.implementation.charAt(0).toUpperCase() + currentDriver.implementation.slice(1) 
                  : 'Unknown'
                }
              </div>
              <div className="text-sm text-gray-500">
                Status: <span className={`font-medium ${currentDriver?.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>
                  {currentDriver?.status || 'inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Content Table Placeholder */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 text-gray-600 mb-2">
              <span className="material-icons text-lg">{icon}</span>
              <span className="font-medium">{title} Content</span>
            </div>
            <p className="text-sm text-gray-500">
              Content will auto-refresh when server is running. Content table implementation coming soon.
            </p>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <>
      {/* Driver Error Display */}
      {driversError && (
        <Card title="Driver Error">
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <span className="text-red-800">{driversError}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={clearError}
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Driver Sections */}
      {driversLoading ? (
        <Card title="Loading Drivers...">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {renderDriverSection(DRIVER_TYPES.LOGS, 'Logs', 'description')}
          {renderDriverSection(DRIVER_TYPES.CACHE, 'Cache', 'storage')}
          {renderDriverSection(DRIVER_TYPES.BLACKLIST, 'Blacklist', 'block')}
          {renderDriverSection(DRIVER_TYPES.WHITELIST, 'Whitelist', 'list')}
        </div>
      )}
    </>
  );
}