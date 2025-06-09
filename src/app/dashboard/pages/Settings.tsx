import { Button, FloatingLabelInput } from "@app_components/index";
import { useEffect } from "react";
import { PageContainer } from "../components/PageContainer";
import { useSettingsStore } from "@app/stores/settingsStore";

export default function Settings() {
  const {
    settings,
    dnsStatus,
    dnsLoading,
    isLoading,
    updateSetting,
    saveSettings,
    fetchDnsStatus,
    toggleDnsServer
  } = useSettingsStore();


  useEffect(() => {
    fetchDnsStatus();
  }, []);

  return (
    <PageContainer title="Settings">
      
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">General Settings</h2>
          
          <div className="space-y-4">
            <FloatingLabelInput
              label="Site Name"
              value={settings.siteName}
              onChange={(e) => updateSetting("siteName", e.target.value)}
              placeholder="Enter site name"
            />
            
            <FloatingLabelInput
              label="Site Description"
              value={settings.siteDescription}
              onChange={(e) => updateSetting("siteDescription", e.target.value)}
              placeholder="Enter site description"
            />
            
            <FloatingLabelInput
              label="API Rate Limit (per hour)"
              value={settings.apiRateLimit}
              onChange={(e) => updateSetting("apiRateLimit", e.target.value)}
              placeholder="Enter rate limit"
              type="number"
            />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Notifications</h2>
          
          <div className="space-y-4">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => updateSetting("emailNotifications", e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable email notifications</span>
            </label>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">System</h2>
          
          <div className="space-y-4">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => updateSetting("maintenanceMode", e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable maintenance mode</span>
            </label>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">DNS Proxy Server</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">DNS Proxy Status</p>
                <p className="text-xs text-gray-500">
                  {dnsStatus?.enabled ? 'Server is running and intercepting DNS queries' : 'Server is stopped'}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  dnsStatus?.enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {dnsStatus?.enabled ? 'Running' : 'Stopped'}
                </span>
                <Button 
                  variant={dnsStatus?.enabled ? "secondary" : "primary"}
                  size="sm"
                  onClick={toggleDnsServer}
                  isLoading={dnsLoading}
                  icon={dnsStatus?.enabled ? "stop" : "play_arrow"}
                >
                  {dnsStatus?.enabled ? 'Stop' : 'Start'}
                </Button>
              </div>
            </div>

            {dnsStatus?.server && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Server Statistics</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Port:</span>
                    <span className="ml-2 font-mono">{dnsStatus.server.port}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Providers:</span>
                    <span className="ml-2">{dnsStatus.server.providers?.join(', ')}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500">
              <p>The DNS proxy server intercepts DNS queries and routes them to NextDNS and Cloudflare to minimize NextDNS usage while maintaining performance.</p>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-4">
          <Button variant="secondary" size="md">
            Reset
          </Button>
          <Button 
            variant="primary" 
            size="md" 
            icon="save" 
            onClick={saveSettings}
            isLoading={isLoading}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}