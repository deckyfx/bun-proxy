import { Button, FloatingLabelInput } from "@app/components";
import { useState } from "react";

export default function Settings() {
  const [settings, setSettings] = useState({
    siteName: "My Application",
    siteDescription: "A modern web application",
    emailNotifications: true,
    maintenanceMode: false,
    apiRateLimit: "1000"
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    console.log("Saving settings:", settings);
    alert("Settings saved successfully!");
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">General Settings</h2>
          
          <div className="space-y-4">
            <FloatingLabelInput
              label="Site Name"
              value={settings.siteName}
              onChange={(e) => handleInputChange("siteName", e.target.value)}
              placeholder="Enter site name"
            />
            
            <FloatingLabelInput
              label="Site Description"
              value={settings.siteDescription}
              onChange={(e) => handleInputChange("siteDescription", e.target.value)}
              placeholder="Enter site description"
            />
            
            <FloatingLabelInput
              label="API Rate Limit (per hour)"
              value={settings.apiRateLimit}
              onChange={(e) => handleInputChange("apiRateLimit", e.target.value)}
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
                onChange={(e) => handleInputChange("emailNotifications", e.target.checked)}
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
                onChange={(e) => handleInputChange("maintenanceMode", e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable maintenance mode</span>
            </label>
          </div>
        </div>
        
        <div className="flex justify-end space-x-4">
          <Button variant="secondary" size="md">
            Reset
          </Button>
          <Button variant="primary" size="md" icon="save" onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}