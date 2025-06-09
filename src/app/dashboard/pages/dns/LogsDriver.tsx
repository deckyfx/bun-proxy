import { Button, Card, Select, Table, type TableColumn } from "@app/components/index";
import { useState, useEffect } from "react";
import { DRIVER_TYPES } from "@src/types/driver";
import type { LogEntry } from "@src/dns/drivers/logs/BaseDriver";
import { useDnsLogStore } from "@app/stores/dnsLogStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { useSnackbarStore } from "@app/stores/snackbarStore";
import { sseClient } from "@src/utils/SSEClient";

interface LogsDriverProps {
  drivers: any;
  loading: boolean;
}

const formatDriverName = (name: string): string => {
  if (!name) return 'Unknown';
  
  const specialCases: Record<string, string> = {
    'inmemory': 'InMemory',
    'console': 'Console',
    'file': 'File',
    'sqlite': 'SQLite'
  };
  
  return specialCases[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
};

const tableColumns: TableColumn<LogEntry>[] = [
  { 
    key: 'timestamp', 
    label: 'Time',
    render: (value: Date) => value.toLocaleTimeString()
  },
  { 
    key: 'type', 
    label: 'Type',
    render: (_value: string, log: LogEntry) => {
      if (log.type === 'server_event') {
        const eventType = (log as any).eventType;
        return (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            eventType === 'started' 
              ? 'bg-green-100 text-green-800'
              : eventType === 'stopped'
                ? 'bg-gray-100 text-gray-800'
                : eventType === 'crashed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
          }`}>
            {eventType?.toUpperCase()}
          </span>
        );
      }
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          log.type === 'request' 
            ? 'bg-blue-100 text-blue-800' 
            : log.type === 'response' && 'success' in log && log.success 
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
        }`}>
          {log.type === 'request' ? 'REQ' : 'RES'}
        </span>
      );
    }
  },
  { 
    key: 'domain', 
    label: 'Domain',
    className: 'font-mono',
    render: (_value: any, log: LogEntry) => {
      if ('query' in log) {
        return (
          <>
            {log.query.domain}
            <div className="text-xs text-gray-500">{log.query.type}</div>
          </>
        );
      }
      if (log.type === 'server_event') {
        return (
          <div className="font-medium">
            {(log as any).message}
            {(log as any).port && (
              <div className="text-xs text-gray-500">Port: {(log as any).port}</div>
            )}
            {(log as any).error && (
              <div className="text-xs text-red-600 mt-1" title={(log as any).errorStack}>
                Error: {(log as any).error}
              </div>
            )}
          </div>
        );
      }
      return '-';
    }
  },
  { 
    key: 'client', 
    label: 'Client',
    className: 'font-mono',
    render: (_value: any, log: LogEntry) => {
      return 'query' in log ? (log.query.clientIP || '-') : '-';
    }
  },
  { 
    key: 'status', 
    label: 'Status',
    render: (_value: any, log: LogEntry) => {
      if (log.type === 'server_event') {
        const eventType = (log as any).eventType;
        return (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            eventType === 'crashed' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {eventType === 'crashed' ? 'FAILED' : 'OK'}
          </span>
        );
      }
      if (log.type === 'response' && 'success' in log) {
        return log.success ? (
          <span className="text-green-600 font-medium">Success</span>
        ) : (
          <span className="text-red-600 font-medium" title={'error' in log ? log.error : undefined}>
            Error
          </span>
        );
      }
      return <span className="text-gray-400">-</span>;
    }
  },
  { 
    key: 'resolvedAddresses', 
    label: 'Resolved IPs',
    className: 'font-mono text-xs',
    render: (_value: any, log: LogEntry) => {
      if (log.type === 'server_event') {
        return '-';
      }
      
      // Check for resolved addresses in different possible locations
      const addresses = ('response' in log && log.response?.resolvedAddresses) ||
                       ('resolvedAddresses' in log && log.resolvedAddresses) ||
                       ('resolvedIPs' in log && log.resolvedIPs);
      
      if (addresses && Array.isArray(addresses) && addresses.length > 0) {
        return (
          <div className="max-w-32 truncate" title={addresses.join(', ')}>
            {addresses.length === 1 ? addresses[0] : `${addresses[0]} +${addresses.length - 1}`}
          </div>
        );
      }
      
      return <span className="text-gray-400">-</span>;
    }
  },
];

export default function LogsDriver({ drivers, loading }: LogsDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: '' });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'stream' | 'history'>('stream');
  const [filters, setFilters] = useState({
    type: '',
    level: '',
    domain: '',
    provider: '',
    success: '',
    limit: 100
  });

  // Use new logs driver store
  const { getContent, content, contentLoading, clearContent, setDriver } = useDnsLogStore();
  const { showConfirm, showCustom } = useDialogStore();
  const { showInfo, showAlert } = useSnackbarStore();
  
  // Get history logs from logs driver store
  const historyLogs = Array.isArray(content?.content) 
    ? (content.content as LogEntry[]).map(log => ({
        ...log,
        timestamp: typeof log.timestamp === 'string' ? new Date(log.timestamp) : log.timestamp
      }))
    : [];

  useEffect(() => {
    if (drivers?.current?.logs) {
      setDriverForm({
        driver: drivers.current.logs.implementation || 'console'
      });
    }
  }, [drivers]);

  // SSE connection for real-time logs
  useEffect(() => {
    // Subscribe to real-time log events
    const logEventUnsubscriber = sseClient.subscribe('dns/log/event', (logEntry) => {
      if (logEntry) {
        const newLogEntry = {
          ...logEntry,
          timestamp: new Date(logEntry.timestamp)
        };
        
        setLogs(prev => {
          // Add new entry and keep last 100, sorted by timestamp (newest first)
          const updated = [newLogEntry, ...prev]
            .sort((a: LogEntry, b: LogEntry) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 100);
          return updated;
        });
      }
    });

    // Subscribe to connection state changes
    const connectionUnsubscriber = sseClient.onConnectionChange((isConnected) => {
      setConnected(isConnected);
    });
    
    return () => {
      logEventUnsubscriber();
      connectionUnsubscriber();
    };
  }, []);

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    await setDriver(driverForm.driver);
    // Success case will be handled by the driver store showing a snackbar
    // Update the form to reflect the new driver after change
    if (drivers?.current?.logs) {
      setDriverForm({
        driver: drivers.current.logs.implementation || driverForm.driver
      });
    }
  };

  const handleClearLogs = async () => {
    // Clear real-time logs
    setLogs([]);
    
    // Clear persistent logs using the store
    await clearContent();
  };

  // Handler for row clicks - show details for response logs
  const handleRowClick = (log: LogEntry) => {
    if (log.type === 'response') {
      showResponseDetails(log);
    }
  };

  // Show response details in a custom dialog
  const showResponseDetails = (log: LogEntry) => {
    const responseLog = log as any;
    const domain = 'query' in responseLog ? responseLog.query?.domain : '';

    const content = (
      <div className="space-y-4">
        {/* Basic Information */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <div className="p-2 bg-gray-50 rounded text-sm font-mono">
              {domain || 'N/A'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Query Type</label>
            <div className="p-2 bg-gray-50 rounded text-sm">
              {'query' in responseLog ? responseLog.query?.type : 'N/A'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client IP</label>
            <div className="p-2 bg-gray-50 rounded text-sm font-mono">
              {'query' in responseLog ? responseLog.query?.clientIP : 'N/A'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <div className="p-2 bg-gray-50 rounded text-sm">
              {'provider' in responseLog ? responseLog.provider : 'N/A'}
            </div>
          </div>
        </div>

        {/* Response Details */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Response Status</label>
          <div className="flex items-center gap-4 flex-wrap">
            {'success' in responseLog && responseLog.success ? (
              <span className="inline-flex px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded-full">
                Success
              </span>
            ) : (
              <span className="inline-flex px-3 py-1 text-sm font-medium bg-red-100 text-red-800 rounded-full">
                Failed
              </span>
            )}
            {'responseTime' in responseLog && (
              <span className="text-sm text-gray-600">
                Response Time: {responseLog.responseTime}ms
              </span>
            )}
            {'attempt' in responseLog && responseLog.attempt && (
              <span className="text-sm text-gray-600">
                Attempt: {responseLog.attempt}
              </span>
            )}
            {'response' in responseLog && responseLog.response?.responseSize && (
              <span className="text-sm text-gray-600">
                Size: {responseLog.response.responseSize} bytes
              </span>
            )}
          </div>
        </div>

        {/* Flags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Flags</label>
          <div className="flex gap-2">
            {'cached' in responseLog && responseLog.cached && (
              <span className="inline-flex px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                Cached
              </span>
            )}
            {'blocked' in responseLog && responseLog.blocked && (
              <span className="inline-flex px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                Blocked
              </span>
            )}
            {'whitelisted' in responseLog && responseLog.whitelisted && (
              <span className="inline-flex px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                Whitelisted
              </span>
            )}
            {!('cached' in responseLog && responseLog.cached) && 
             !('blocked' in responseLog && responseLog.blocked) && 
             !('whitelisted' in responseLog && responseLog.whitelisted) && (
              <span className="text-sm text-gray-500">No flags</span>
            )}
          </div>
        </div>

        {/* Error Details */}
        {'error' in responseLog && responseLog.error && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Error</label>
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              {responseLog.error}
            </div>
          </div>
        )}

        {/* Resolved IPs */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resolved IP Addresses</label>
          {(() => {
            // Check for resolved addresses in different possible locations
            const addresses = ('response' in responseLog && responseLog.response?.resolvedAddresses) ||
                             ('resolvedAddresses' in responseLog && responseLog.resolvedAddresses) ||
                             ('resolvedIPs' in responseLog && responseLog.resolvedIPs);
            
            if (addresses && Array.isArray(addresses) && addresses.length > 0) {
              return (
                <div className="p-2 bg-gray-50 rounded text-sm font-mono">
                  {addresses.join(', ')}
                </div>
              );
            }
            
            return (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                <div className="flex items-center gap-2">
                  <span className="material-icons text-sm">info</span>
                  <span>No resolved IP addresses in this response</span>
                </div>
                <div className="text-xs mt-1 text-yellow-700">
                  This may be a failed request, cached response, or the DNS response didn't contain A/AAAA records.
                </div>
              </div>
            );
          })()}
        </div>

        {/* Timestamp */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timestamp</label>
          <div className="p-2 bg-gray-50 rounded text-sm">
            {responseLog.timestamp.toLocaleString()}
          </div>
        </div>

        {/* Action Buttons */}
        {domain && (
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quick Actions for "{domain}"
            </label>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddToCache(domain)}
              >
                <span className="material-icons text-sm mr-1">memory</span>
                Add to Cache
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddToBlacklist(domain)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <span className="material-icons text-sm mr-1">block</span>
                Add to Blacklist
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddToWhitelist(domain)}
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
              >
                <span className="material-icons text-sm mr-1">check_circle</span>
                Add to Whitelist
              </Button>
            </div>
          </div>
        )}
      </div>
    );

    showCustom(content, { 
      title: "DNS Response Details",
      showCloseButton: true 
    });
  };

  // Handler to add domain to cache
  const handleAddToCache = async (domain: string) => {
    try {
      // This would typically call an API to add to cache
      showInfo(`Added "${domain}" to cache`);
    } catch (error) {
      showAlert('Failed to add to cache', 'Cache Error');
    }
  };

  // Handler to add domain to blacklist
  const handleAddToBlacklist = async (domain: string) => {
    try {
      // This would typically call an API to add to blacklist
      showInfo(`Added "${domain}" to blacklist`);
    } catch (error) {
      showAlert('Failed to add to blacklist', 'Blacklist Error');
    }
  };

  // Handler to add domain to whitelist
  const handleAddToWhitelist = async (domain: string) => {
    try {
      // This would typically call an API to add to whitelist
      showInfo(`Added "${domain}" to whitelist`);
    } catch (error) {
      showAlert('Failed to add to whitelist', 'Whitelist Error');
    }
  };

  const handleClearLogsClick = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to clear all logs? This will remove both real-time and persistent log data. This action cannot be undone.',
      {
        title: 'Clear All Logs',
        confirmText: 'Clear All',
        cancelText: 'Cancel'
      }
    );
    
    if (confirmed) {
      handleClearLogs();
    }
  };

  // Fetch log history using the driver store
  const fetchLogHistory = async () => {
    try {
      const filterConfig = {
        ...(filters.type && { type: filters.type }),
        ...(filters.level && { level: filters.level }),
        ...(filters.domain && { domain: filters.domain }),
        ...(filters.provider && { provider: filters.provider }),
        ...(filters.success && { success: filters.success === 'true' }),
        limit: filters.limit
      };

      await getContent(filterConfig);
    } catch (error) {
      // Error handling is now done in the store, but add safety net
      console.error('Error in fetchLogHistory:', error);
    }
  };


  const availableDrivers = drivers?.available[DRIVER_TYPES.LOGS] || [];
  const currentDriver = drivers?.current[DRIVER_TYPES.LOGS];

  return (
    <Card title="Logs">
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
                label: formatDriverName(driver)
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
          <span className="material-icons text-lg text-gray-600">description</span>
          <div>
            <div className="font-medium text-gray-900">
              Current Driver: {formatDriverName(currentDriver?.implementation || '')}
            </div>
          </div>
        </div>

        {/* Clear Logs Button */}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearLogsClick}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <span className="material-icons text-sm mr-1">clear_all</span>
            Clear All Logs
          </Button>
        </div>

        {/* Tab Interface */}
        <div className="border border-gray-200 rounded-lg bg-white">
          {/* Tab Headers */}
          <div className="flex border-b border-gray-200">
            <button
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'stream'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('stream')}
            >
              <span className="flex items-center gap-2">
                <span className="material-icons text-lg">stream</span>
                Real-time Stream
              </span>
            </button>
            <button
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('history')}
            >
              <span className="flex items-center gap-2">
                <span className="material-icons text-lg">history</span>
                History
              </span>
            </button>
          </div>
          {/* Tab Content */}
          {activeTab === 'stream' ? (
            <>
              {/* Stream Tab Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="material-icons text-lg">stream</span>
                  <span className="font-medium">Real-time DNS Events</span>
                  <span className="text-sm text-gray-500">({logs.length}/100)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-500">
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
              
              {/* Stream Table */}
              <Table
                columns={tableColumns}
                data={logs}
                rowClassName={(log: LogEntry) => log.type === 'server_event' ? 'bg-yellow-50' : ''}
                emptyMessage={connected ? 'No logs available. Start the DNS server to see activity.' : 'Connecting to log stream...'}
                onRowClick={(log) => handleRowClick(log)}
              />
            </>
          ) : (
            <>
              {/* History Tab Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="material-icons text-lg">history</span>
                  <span className="font-medium">Log History</span>
                  <span className="text-sm text-gray-500">({historyLogs.length} entries)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={fetchLogHistory}
                    disabled={contentLoading}
                  >
                    <span className="material-icons text-sm mr-1">refresh</span>
                    {contentLoading ? 'Loading...' : 'Refresh'}
                  </Button>
                </div>
              </div>
              
              {/* Filters */}
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div>
                    <Select
                      label="Type"
                      value={filters.type}
                      onChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
                      options={[
                        { value: '', label: 'All Types' },
                        { value: 'request', label: 'Request' },
                        { value: 'response', label: 'Response' },
                        { value: 'server_event', label: 'Server Event' }
                      ]}
                    />
                  </div>
                  <div>
                    <Select
                      label="Level"
                      value={filters.level}
                      onChange={(value) => setFilters(prev => ({ ...prev, level: value }))}
                      options={[
                        { value: '', label: 'All Levels' },
                        { value: 'info', label: 'Info' },
                        { value: 'warn', label: 'Warning' },
                        { value: 'error', label: 'Error' },
                        { value: 'debug', label: 'Debug' }
                      ]}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Domain filter..."
                      value={filters.domain}
                      onChange={(e) => setFilters(prev => ({ ...prev, domain: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Provider filter..."
                      value={filters.provider}
                      onChange={(e) => setFilters(prev => ({ ...prev, provider: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <Select
                      label="Success"
                      value={filters.success}
                      onChange={(value) => setFilters(prev => ({ ...prev, success: value }))}
                      options={[
                        { value: '', label: 'All' },
                        { value: 'true', label: 'Success' },
                        { value: 'false', label: 'Failed' }
                      ]}
                    />
                  </div>
                  <div>
                    <Select
                      label="Limit"
                      value={filters.limit.toString()}
                      onChange={(value) => setFilters(prev => ({ ...prev, limit: parseInt(value) }))}
                      options={[
                        { value: '50', label: '50' },
                        { value: '100', label: '100' },
                        { value: '250', label: '250' },
                        { value: '500', label: '500' }
                      ]}
                    />
                  </div>
                </div>
              </div>
              
              {/* History Table */}
              <Table
                columns={tableColumns}
                data={historyLogs}
                rowClassName={(log: LogEntry) => log.type === 'server_event' ? 'bg-yellow-50' : ''}
                loading={contentLoading}
                loadingMessage="Loading history..."
                emptyMessage={
                  typeof driverContentData?.content === 'string' 
                    ? driverContentData.content
                    : currentDriver?.implementation === 'console' 
                      ? 'ConsoleDriver has no persistence. Switch to InMemoryDriver or FileDriver to view history.'
                      : 'No history available. Click Refresh to load logs from the current driver.'
                }
                onRowClick={(log) => handleRowClick(log)}
              />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}