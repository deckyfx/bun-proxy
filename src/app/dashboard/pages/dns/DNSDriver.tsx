import { Button, Card, Tabs, type TabItem } from "@app/components/index";
import { useEffect } from "react";
import { useDnsDriverStore } from "@app/stores/dnsDriverStore";
import LogsDriver from "./LogsDriver";
import CacheDriver from "./CacheDriver";
import BlacklistDriver from "./BlacklistDriver";
import WhitelistDriver from "./WhitelistDriver";

export default function DNSDriver() {
  const {
    drivers,
    loading: driversLoading,
    error: driversError,
    fetchDrivers,
    clearError
  } = useDnsDriverStore();

  useEffect(() => {
    fetchDrivers();
  }, []);


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
        <Card title="DNS Drivers">
          <Tabs
            tabs={[
              {
                id: 'logs',
                label: 'Logs',
                icon: 'description',
                content: <LogsDriver drivers={drivers} loading={driversLoading} />
              },
              {
                id: 'cache',
                label: 'Cache',
                icon: 'memory',
                content: <CacheDriver drivers={drivers} loading={driversLoading} />
              },
              {
                id: 'blacklist',
                label: 'Blacklist',
                icon: 'block',
                content: <BlacklistDriver drivers={drivers} loading={driversLoading} />
              },
              {
                id: 'whitelist',
                label: 'Whitelist',
                icon: 'check_circle',
                content: <WhitelistDriver drivers={drivers} loading={driversLoading} />
              }
            ]}
            defaultTab="logs"
          />
        </Card>
      )}
    </>
  );
}