import { Button, Card, Select } from "@app_components/index";
import { useState, useEffect } from "react";
import { useDriverStore } from "@app/stores/driverStore";
import { useDNSStore } from "@app/stores/dnsStore";
import { DRIVER_TYPES } from "@src/types/driver";

export default function DNSDriver() {
  const { status: dnsStatus } = useDNSStore();
  const {
    drivers,
    loading: driversLoading,
    error: driversError,
    fetchDrivers,
    setDriver,
    getDriverContent,
    clearError
  } = useDriverStore();

  const [isPolling, setIsPolling] = useState(false);

  // Driver form states
  const [driverForms, setDriverForms] = useState({
    [DRIVER_TYPES.LOGS]: { driver: '' },
    [DRIVER_TYPES.CACHE]: { driver: '' },
    [DRIVER_TYPES.BLACKLIST]: { driver: '' },
    [DRIVER_TYPES.WHITELIST]: { driver: '' },
  });

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

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

  // Polling for driver content when server is running
  useEffect(() => {
    if (dnsStatus.enabled && !isPolling) {
      setIsPolling(true);
      const interval = setInterval(() => {
        if (drivers?.current) {
          getDriverContent(DRIVER_TYPES.LOGS);
          getDriverContent(DRIVER_TYPES.CACHE);
          getDriverContent(DRIVER_TYPES.BLACKLIST);
          getDriverContent(DRIVER_TYPES.WHITELIST);
        }
      }, 10000);
      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    } else if (!dnsStatus.enabled && isPolling) {
      setIsPolling(false);
    }
  }, [dnsStatus.enabled, isPolling, drivers, getDriverContent]);

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