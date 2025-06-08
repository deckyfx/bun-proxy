import { Button, Card, Select } from "@app/components/index";
import { useState, useEffect } from "react";
import { DRIVER_TYPES } from "@src/types/driver";

interface WhitelistDriverProps {
  drivers: any;
  loading: boolean;
  onSetDriver: (scope: string, driver: string) => Promise<void>;
}

export default function WhitelistDriver({ drivers, loading, onSetDriver }: WhitelistDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: '' });

  useEffect(() => {
    if (drivers?.current?.whitelist) {
      setDriverForm({
        driver: drivers.current.whitelist.implementation || 'inmemory'
      });
    }
  }, [drivers]);

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    try {
      await onSetDriver(DRIVER_TYPES.WHITELIST, driverForm.driver);
      alert(`${DRIVER_TYPES.WHITELIST} driver updated successfully`);
    } catch (error) {
      alert(`Failed to update ${DRIVER_TYPES.WHITELIST} driver`);
    }
  };

  const availableDrivers = drivers?.available[DRIVER_TYPES.WHITELIST] || [];
  const currentDriver = drivers?.current[DRIVER_TYPES.WHITELIST];

  return (
    <Card title="Whitelist">
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
          <span className="material-icons text-lg text-gray-600">list</span>
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
            <span className="material-icons text-lg">list</span>
            <span className="font-medium">Whitelist Content</span>
          </div>
          <p className="text-sm text-gray-500">
            Content will auto-refresh when server is running. Content table implementation coming soon.
          </p>
          
          {/* TODO: Add whitelist-specific content table with domain allowing features */}
          {/* Features to implement:
              - Allowed domains list with search/filter
              - Add/remove domains manually
              - Import/export whitelist files
              - Trusted domain categories (banking, education, work, etc.)
              - Subdomain management (*.domain.com)
              - Priority-based allowing (override blacklist)
              - Whitelist statistics and usage analytics
              - Domain verification and validation
              - Bulk domain management
              - Pattern-based allowing rules
              - Integration with parental controls
              - Time-based whitelisting (allow during work hours)
          */}
        </div>
      </div>
    </Card>
  );
}