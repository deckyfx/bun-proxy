import {
  Button,
  Select,
  Tabs,
  type TableColumn,
} from "@app/components/index";
import LogsStreamTab from "./LogsStreamTab";
import LogsHistoryTab from "./LogsHistoryTab";
import { useState, useEffect } from "react";
import { DRIVER_TYPES, type DriversResponse, type DriverStatus, type DriverListResponse } from "@src/types/driver";
import type { LogEntry, DecodedPacket, ServerEventLogEntry } from "@src/types/dns-unified";
import { useDnsLogStore } from "@app/stores/dnsLogStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { useDnsCacheStore } from "@app/stores/dnsCacheStore";
import { useDnsBlacklistStore } from "@app/stores/dnsBlacklistStore";
import { useDnsWhitelistStore } from "@app/stores/dnsWhitelistStore";
import { sseClient } from "@src/utils/SSEClient";
import { tryAsync, trySync } from '@src/utils/try';

interface LogsDriverProps {
  drivers: DriversResponse | null;
  loading: boolean;
}

const formatDriverName = (name: string): string => {
  if (!name) return "Unknown";

  const specialCases: Record<string, string> = {
    inmemory: "InMemory",
    console: "Console",
    file: "File",
    sqlite: "SQLite",
  };

  return (
    specialCases[name.toLowerCase()] ||
    name.charAt(0).toUpperCase() + name.slice(1)
  );
};

const tableColumns: TableColumn<LogEntry>[] = [
  {
    key: "timestamp",
    label: "Time",
    render: (value) => {
      if (typeof value === 'number') {
        return new Date(value).toLocaleTimeString();
      }
      return String(value);
    },
  },
  {
    key: "type",
    label: "Type",
    render: (_value, log) => {
      if (log.type === "server_event") {
        const eventType = 'eventType' in log ? (log as { eventType: string }).eventType : undefined;
        return (
          <span
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              eventType === "started"
                ? "bg-green-100 text-green-800"
                : eventType === "stopped"
                ? "bg-gray-100 text-gray-800"
                : eventType === "crashed"
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {eventType?.toUpperCase()}
          </span>
        );
      }
      return (
        <span
          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            log.type === "request"
              ? "bg-blue-100 text-blue-800"
              : log.type === "response" && "success" in log && log.success
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {log.type === "request" ? "REQ" : "RES"}
        </span>
      );
    },
  },
  {
    key: "domain",
    label: "Domain",
    className: "font-mono",
    render: (_value, log) => {
      if ("query" in log) {
        return (
          <>
            {log.query?.name}
            <div className="text-xs text-gray-500">{log.query?.type}</div>
          </>
        );
      }
      if (log.type === "server_event") {
        const serverLog = log as ServerEventLogEntry;
        return (
          <div className="font-medium">
            {serverLog.message}
            {serverLog.port && (
              <div className="text-xs text-gray-500">
                Port: {serverLog.port}
              </div>
            )}
            {serverLog.error && (
              <div
                className="text-xs text-red-600 mt-1"
                title={serverLog.errorStack}
              >
                Error: {serverLog.error}
              </div>
            )}
          </div>
        );
      }
      return "-";
    },
  },
  {
    key: "client",
    label: "Client",
    className: "font-mono",
    render: (_value, log) => {
      return "client" in log ? log.client.address || "-" : "-";
    },
  },
  {
    key: "status",
    label: "Status",
    render: (_value, log) => {
      if (log.type === "server_event") {
        const serverLog = log as ServerEventLogEntry;
        const eventType = serverLog.eventType;
        return (
          <span
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              eventType === "crashed"
                ? "bg-red-100 text-red-800"
                : "bg-green-100 text-green-800"
            }`}
          >
            {eventType === "crashed" ? "FAILED" : "OK"}
          </span>
        );
      }
      if (log.type === "response" && "success" in log) {
        return log.success ? (
          <span className="text-green-600 font-medium">Success</span>
        ) : (
          <span
            className="text-red-600 font-medium"
            title={"processing" in log ? log.processing.error : undefined}
          >
            Error
          </span>
        );
      }
      return <span className="text-gray-400">-</span>;
    },
  },
  {
    key: "resolvedAddresses",
    label: "Resolved IPs",
    className: "font-mono text-xs",
    render: (_value, log) => {
      if (log.type === "server_event") {
        return "-";
      }

      // Extract IP addresses from the DNS packet if available
      let addresses: string[] = [];
      if ("packet" in log && log.packet) {
        // Use the extractIpAddresses utility from dns-bridge
        const extractIpAddresses = (packet: DecodedPacket): string[] => {
          const ips: string[] = [];
          if (packet && packet.answers) {
            const answers = packet.answers;
            if (Array.isArray(answers)) {
              for (const answer of answers) {
                if (answer.type === 'A' || answer.type === 'AAAA') {
                  const data = (answer as { data: string }).data;
                  if (data) {
                    ips.push(data);
                  }
                }
              }
            }
          }
          return ips;
        };
        
        const [extractedAddresses, extractError] = trySync(() => 
          log.packet ? extractIpAddresses(log.packet) : []
        );
        if (!extractError) {
          addresses = extractedAddresses;
        }
      }

      if (addresses && Array.isArray(addresses) && addresses.length > 0) {
        return (
          <div className="max-w-32 truncate" title={addresses.join(", ")}>
            {addresses.length === 1
              ? addresses[0]
              : `${addresses[0]} +${addresses.length - 1}`}
          </div>
        );
      }

      return <span className="text-gray-400">-</span>;
    },
  },
];

export default function LogsDriver({ drivers, loading }: LogsDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: "" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  // Removed activeTab state - now handled by Tabs component
  const [filters, setFilters] = useState({
    type: "",
    level: "",
    domain: "",
    provider: "",
    success: "",
    limit: 100,
  });

  // Use driver stores
  const { getContent, content, loading: historyLoading, error, clearContent, setDriver } =
    useDnsLogStore();
  const { addEntry: addToCache } = useDnsCacheStore();
  const { addEntry: addToBlacklist } = useDnsBlacklistStore();
  const { addEntry: addToWhitelist } = useDnsWhitelistStore();
  const { showConfirm, showCustom } = useDialogStore();

  // History logs are now handled by the LogsHistoryTab component

  useEffect(() => {
    if (drivers?.current?.[DRIVER_TYPES.LOGS]) {
      setDriverForm({
        driver: drivers.current[DRIVER_TYPES.LOGS].implementation || "console",
      });
    }
  }, [drivers]);

  // SSE connection for real-time logs
  useEffect(() => {
    // Subscribe to real-time log events
    const logEventUnsubscriber = sseClient.subscribe(
      "dns/log/event",
      (logEntry) => {
        if (logEntry && 'type' in logEntry && (logEntry.type === 'request' || logEntry.type === 'response' || logEntry.type === 'server_event')) {
          const typedLogEntry = logEntry as LogEntry;
          setLogs((prev) => {
            // Add new entry and keep last 100, sorted by timestamp (newest first)
            const updated = [typedLogEntry, ...prev]
              .sort(
                (a: LogEntry, b: LogEntry) =>
                  b.timestamp - a.timestamp
              )
              .slice(0, 100);
            return updated;
          });
        }
      }
    );

    // Subscribe to connection state changes
    const connectionUnsubscriber = sseClient.onConnectionChange(
      (isConnected) => {
        setConnected(isConnected);
      }
    );

    return () => {
      logEventUnsubscriber();
      connectionUnsubscriber();
    };
  }, []);

  // History will be fetched when tab is opened or refresh button is clicked

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    await setDriver(driverForm.driver);
    // Success case will be handled by the driver store showing a snackbar
    // No need to update form as it should stay with the selected value
  };

  const handleClearLogs = async () => {
    // Clear real-time logs
    setLogs([]);

    // Clear persistent logs using the store
    await clearContent();
  };

  // Handler for row clicks - show details for response logs
  const handleRowClick = (log: LogEntry) => {
    if (log.type === "response") {
      showResponseDetails(log);
    }
  };

  // Show response details in a custom dialog
  const showResponseDetails = (log: LogEntry) => {
    const responseLog = log.type === 'response' ? log : null;
    const domain = responseLog && "query" in responseLog ? responseLog.query?.name : "";

    const content = (
      <div className="space-y-4">
        {/* Basic Information */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain
            </label>
            <div className="p-2 bg-gray-50 rounded text-sm font-mono">
              {domain || "N/A"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Query Type
            </label>
            <div className="p-2 bg-gray-50 rounded text-sm">
              {responseLog && "query" in responseLog ? responseLog.query?.type : "N/A"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client IP
            </label>
            <div className="p-2 bg-gray-50 rounded text-sm font-mono">
              {responseLog && "client" in responseLog ? responseLog.client?.address : "N/A"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            <div className="p-2 bg-gray-50 rounded text-sm">
              {responseLog && "processing" in responseLog ? responseLog.processing?.provider || "N/A" : "N/A"}
            </div>
          </div>
        </div>

        {/* Response Details */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Response Status
          </label>
          <div className="flex items-center gap-4 flex-wrap">
            {responseLog && "success" in responseLog && responseLog.success ? (
              <span className="inline-flex px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded-full">
                Success
              </span>
            ) : (
              <span className="inline-flex px-3 py-1 text-sm font-medium bg-red-100 text-red-800 rounded-full">
                Failed
              </span>
            )}
            {responseLog && "processing" in responseLog && responseLog.processing?.responseTime && (
              <span className="text-sm text-gray-600">
                Response Time: {responseLog.processing.responseTime}ms
              </span>
            )}
          </div>
        </div>

        {/* Flags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Flags
          </label>
          <div className="flex gap-2">
            {responseLog && "processing" in responseLog && responseLog.processing?.cached && (
              <span className="inline-flex px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                Cached
              </span>
            )}
            {responseLog && "processing" in responseLog && responseLog.processing?.blocked && (
              <span className="inline-flex px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                Blocked
              </span>
            )}
            {responseLog && "processing" in responseLog && responseLog.processing?.whitelisted && (
              <span className="inline-flex px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                Whitelisted
              </span>
            )}
            {!(responseLog && "processing" in responseLog && responseLog.processing?.cached) &&
              !(responseLog && "processing" in responseLog && responseLog.processing?.blocked) &&
              !(responseLog && "processing" in responseLog && responseLog.processing?.whitelisted) && (
                <span className="text-sm text-gray-500">No flags</span>
              )}
          </div>
        </div>

        {/* Error Details */}
        {responseLog && "processing" in responseLog && responseLog.processing?.error && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Error
            </label>
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              {responseLog.processing.error}
            </div>
          </div>
        )}

        {/* Resolved IPs */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Resolved IP Addresses
          </label>
          {(() => {
            // Check for resolved addresses in different possible locations
            let addresses: string[] | undefined;
            if (responseLog && "packet" in responseLog && responseLog.packet) {
              const extractIpAddresses = (packet: DecodedPacket): string[] => {
                const ips: string[] = [];
                if (packet && packet.answers) {
                  const answers = packet.answers;
                  if (Array.isArray(answers)) {
                    for (const answer of answers) {
                      if (answer.type === 'A' || answer.type === 'AAAA') {
                        const data = (answer as { data: string }).data;
                        if (data) {
                          ips.push(data);
                        }
                      }
                    }
                  }
                }
                return ips;
              };
              
              const [extractedAddresses, extractError] = trySync(() => 
                responseLog.packet ? extractIpAddresses(responseLog.packet) : []
              );
              if (!extractError) {
                addresses = extractedAddresses;
              }
            }

            if (addresses && Array.isArray(addresses) && addresses.length > 0) {
              return (
                <div className="p-2 bg-gray-50 rounded text-sm font-mono">
                  {addresses.join(", ")}
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
                  This may be a failed request, cached response, or the DNS
                  response didn't contain A/AAAA records.
                </div>
              </div>
            );
          })()}
        </div>

        {/* Timestamp */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timestamp
          </label>
          <div className="p-2 bg-gray-50 rounded text-sm">
            {responseLog ? new Date(responseLog.timestamp).toLocaleString() : new Date().toLocaleString()}
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
                <span className="material-icons text-sm mr-1">
                  check_circle
                </span>
                Add to Whitelist
              </Button>
            </div>
          </div>
        )}
      </div>
    );

    showCustom(content, {
      title: "DNS Response Details",
      showCloseButton: true,
    });
  };

  // Handler to add domain to cache
  const handleAddToCache = async (domain: string) => {
    // Create a simple cache entry for manual addition
    const cacheValue = {
      cached: true,
      addedFrom: 'logs',
      timestamp: new Date().toISOString()
    };
    await addToCache(domain, cacheValue, 3600); // 1 hour TTL
  };

  // Handler to add domain to blacklist
  const handleAddToBlacklist = async (domain: string) => {
    await addToBlacklist(domain, 'Added from DNS logs', 'logs');
  };

  // Handler to add domain to whitelist
  const handleAddToWhitelist = async (domain: string) => {
    await addToWhitelist(domain, 'Added from DNS logs', 'logs');
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      type: "",
      level: "",
      domain: "",
      provider: "",
      success: "",
      limit: 100,
    });
  };

  const handleClearLogsClick = async () => {
    const confirmed = await showConfirm(
      "Are you sure you want to clear all logs? This will remove both real-time and persistent log data. This action cannot be undone.",
      {
        title: "Clear All Logs",
        confirmText: "Clear All",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      handleClearLogs();
    }
  };

  // Fetch log history using the driver store
  const fetchLogHistory = async (customFilters?: typeof filters) => {
    const currentFilters = customFilters || filters;
    const filterConfig = {
      ...(currentFilters.type && { type: currentFilters.type }),
      ...(currentFilters.level && { level: currentFilters.level }),
      ...(currentFilters.domain && { domain: currentFilters.domain }),
      ...(currentFilters.provider && { provider: currentFilters.provider }),
      ...(currentFilters.success && { success: currentFilters.success === "true" }),
      limit: currentFilters.limit,
    };

    const [, error] = await tryAsync(() => getContent(filterConfig));
    
    if (error) {
      // Error handling is now done in the store, but add safety net
      console.error("Error in fetchLogHistory:", error);
    }
  };

  const availableDrivers = drivers?.available?.[DRIVER_TYPES.LOGS] || [];
  const currentDriver = drivers?.current?.[DRIVER_TYPES.LOGS];

  return (
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
                label: formatDriverName(driver),
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
          <span className="material-icons text-lg text-gray-600">
            description
          </span>
          <div>
            <div className="font-medium text-gray-900">
              Current Driver:{" "}
              {formatDriverName(currentDriver?.implementation || "")}
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
        <Tabs
          tabs={[
            {
              id: 'stream',
              label: 'Real-time Stream',
              icon: 'stream',
              content: (
                <LogsStreamTab
                  logs={logs}
                  connected={connected}
                  tableColumns={tableColumns}
                  onRowClick={handleRowClick}
                />
              )
            },
            {
              id: 'history',
              label: 'History',
              icon: 'history',
              content: (
                <LogsHistoryTab
                  content={content && 'entries' in content && Array.isArray(content.entries) ? content.entries as LogEntry[] : null}
                  loading={historyLoading}
                  error={error ?? null}
                  currentDriver={currentDriver ? { implementation: currentDriver.implementation, status: currentDriver.status } : null}
                  tableColumns={tableColumns}
                  filters={filters}
                  onFiltersChange={(newFilters) => {
                    setFilters(prev => ({ ...prev, ...newFilters }));
                  }}
                  onClearFilters={clearFilters}
                  onFetchHistory={fetchLogHistory}
                  onRowClick={handleRowClick}
                />
              )
            }
          ]}
          defaultTab="stream"
          className="border border-gray-200 rounded-lg bg-white"
        />
      </div>
    );
  }
