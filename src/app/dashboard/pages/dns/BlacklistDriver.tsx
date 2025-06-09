import { Button, Card, Select } from "@app/components/index";
import { useState, useEffect } from "react";
import { DRIVER_TYPES } from "@src/types/driver";
import { useDnsBlacklistStore } from "@app/stores/dnsBlacklistStore";

interface BlacklistDriverProps {
  drivers: any;
  loading: boolean;
}

export default function BlacklistDriver({ drivers, loading }: BlacklistDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: '' });
  const { setDriver } = useDnsBlacklistStore();

  useEffect(() => {
    if (drivers?.current?.blacklist) {
      setDriverForm({
        driver: drivers.current.blacklist.implementation || 'inmemory'
      });
    }
  }, [drivers]);

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    try {
      await setDriver(driverForm.driver);
    } catch (error) {
      // Error handling is done in the store
    }
  };

  const availableDrivers = drivers?.available[DRIVER_TYPES.BLACKLIST] || [];
  const currentDriver = drivers?.current[DRIVER_TYPES.BLACKLIST];

  return (
    <Card title="Blacklist">
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
          <span className="material-icons text-lg text-gray-600">block</span>
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
            <span className="material-icons text-lg">block</span>
            <span className="font-medium">Blacklist Content</span>
          </div>
          <p className="text-sm text-gray-500">
            Content will auto-refresh when server is running. Content table implementation coming soon.
          </p>
          
          {/* TODO: Add blacklist-specific content table with domain blocking features */}
          {/* Features to implement:
              - Blocked domains list with search/filter
              - Add/remove domains manually
              - Import/export blacklist files
              - Category-based blocking (ads, malware, social, etc.)
              - Wildcard domain blocking (*.domain.com)
              - Temporary vs permanent blocking
              - Blocking statistics and analytics
              - Domain reputation integration
              - Bulk domain management
              - Pattern-based blocking rules
          */}
        </div>
      </div>
    </Card>
  );
}