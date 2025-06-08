import { Button, Card, Select } from "@app/components/index";
import { useState, useEffect } from "react";
import { useDriverStore } from "@app/stores/driverStore";
import { DRIVER_TYPES } from "@src/types/driver";

interface CacheDriverProps {
  drivers: any;
  loading: boolean;
  onSetDriver: (scope: string, driver: string) => Promise<void>;
}

export default function CacheDriver({ drivers, loading, onSetDriver }: CacheDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: '' });

  useEffect(() => {
    if (drivers?.current?.cache) {
      setDriverForm({
        driver: drivers.current.cache.implementation || 'inmemory'
      });
    }
  }, [drivers]);

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    try {
      await onSetDriver(DRIVER_TYPES.CACHE, driverForm.driver);
      alert(`${DRIVER_TYPES.CACHE} driver updated successfully`);
    } catch (error) {
      alert(`Failed to update ${DRIVER_TYPES.CACHE} driver`);
    }
  };

  const availableDrivers = drivers?.available[DRIVER_TYPES.CACHE] || [];
  const currentDriver = drivers?.current[DRIVER_TYPES.CACHE];

  return (
    <Card title="Cache">
      <div className="space-y-4">
        {/* Driver Configuration */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Select
              label="Driver Implementation"
              value={driverForm.driver}
              onChange={(value) => handleDriverFormChange(value)}
              options={availableDrivers.map((driver: string) => ({
                value: driver,
                label: driver.charAt(0).toUpperCase() + driver.slice(1)
              }))}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSetDriver}
              disabled={!driverForm.driver || loading}
            >
              Set Driver
            </Button>
          </div>
        </div>

        {/* Driver Status */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <span className="material-icons text-lg text-gray-600">storage</span>
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
            <span className="material-icons text-lg">storage</span>
            <span className="font-medium">Cache Content</span>
          </div>
          <p className="text-sm text-gray-500">
            Content will auto-refresh when server is running. Content table implementation coming soon.
          </p>
          
          {/* TODO: Add cache-specific content table with cache management features */}
          {/* Features to implement:
              - Cache entries display (domain -> IP mapping)
              - Cache hit/miss statistics
              - TTL (Time To Live) management
              - Manual cache invalidation
              - Cache size and memory usage
              - Cache performance metrics
              - Export cache data
              - Cache warming functionality
          */}
        </div>
      </div>
    </Card>
  );
}