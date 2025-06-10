import { Button, Card, Select, Table, type TableColumn, FloatingLabelInput } from "@app/components/index";
import { useState, useEffect } from "react";
import { useDnsCacheStore } from "@app/stores/dnsCacheStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { DRIVER_TYPES } from "@src/types/driver";

interface CacheDriverProps {
  drivers: any;
  loading: boolean;
}

interface CacheEntry {
  key: string;
  value: any;
  ttl?: number;
  addedAt?: string;
}

const formatDriverName = (name: string): string => {
  if (!name) return "Unknown";

  const specialCases: Record<string, string> = {
    inmemory: "InMemory",
    file: "File",
    sqlite: "SQLite",
  };

  return (
    specialCases[name.toLowerCase()] ||
    name.charAt(0).toUpperCase() + name.slice(1)
  );
};

const tableColumns: TableColumn<CacheEntry>[] = [
  {
    key: "key",
    label: "Domain/Key",
    className: "font-mono",
    render: (value: string) => (
      <div className="max-w-48 truncate" title={value}>
        {value}
      </div>
    ),
  },
  {
    key: "value",
    label: "Cached Value",
    render: (_value: any, entry: CacheEntry) => {
      if (typeof entry.value === 'object') {
        const addresses = entry.value?.addresses || entry.value?.resolvedAddresses || [];
        if (Array.isArray(addresses) && addresses.length > 0) {
          return (
            <div className="font-mono text-sm">
              <div className="max-w-32 truncate" title={addresses.join(", ")}>
                {addresses.length === 1
                  ? addresses[0]
                  : `${addresses[0]} +${addresses.length - 1}`}
              </div>
            </div>
          );
        }
        return (
          <div className="text-xs text-gray-500 max-w-32 truncate" title={JSON.stringify(entry.value)}>
            {JSON.stringify(entry.value).length > 30 
              ? JSON.stringify(entry.value).substring(0, 30) + '...'
              : JSON.stringify(entry.value)
            }
          </div>
        );
      }
      return <span className="font-mono text-sm">{String(entry.value)}</span>;
    },
  },
  {
    key: "ttl",
    label: "TTL",
    render: (value: number | undefined) => {
      if (value === undefined) return <span className="text-gray-400">No TTL</span>;
      if (value === 0) return <span className="text-red-500">Expired</span>;
      
      const hours = Math.floor(value / 3600);
      const minutes = Math.floor((value % 3600) / 60);
      const seconds = value % 60;
      
      if (hours > 0) {
        return <span className="text-sm">{hours}h {minutes}m</span>;
      } else if (minutes > 0) {
        return <span className="text-sm">{minutes}m {seconds}s</span>;
      } else {
        return <span className="text-sm">{seconds}s</span>;
      }
    },
  },
  {
    key: "addedAt",
    label: "Added",
    render: (value: string | undefined) => {
      if (!value) return <span className="text-gray-400">-</span>;
      return (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleTimeString()}
        </span>
      );
    },
  },
];

export default function CacheDriver({ drivers, loading }: CacheDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: '' });
  const [newEntry, setNewEntry] = useState({ key: '', value: '', ttl: '3600' });
  const [filters, setFilters] = useState({ key: '' });
  const { 
    setDriver, 
    getContent, 
    content, 
    contentLoading, 
    clearContent, 
    addEntry, 
    removeEntry,
    connectSSE, 
    disconnectSSE 
  } = useDnsCacheStore();
  const { showConfirm } = useDialogStore();

  useEffect(() => {
    if (drivers?.current?.cache) {
      setDriverForm({
        driver: drivers.current.cache.implementation || 'inmemory'
      });
    }
  }, [drivers]);

  // Connect to SSE only for data change events (add/remove/edit)
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE]);

  const handleDriverFormChange = (driver: string) => {
    setDriverForm({ driver });
  };

  const handleSetDriver = async () => {
    await setDriver(driverForm.driver);
  };

  const fetchCacheContent = async (customFilters?: typeof filters) => {
    const currentFilters = customFilters || filters;
    const filterConfig = {
      ...(currentFilters.key && { key: currentFilters.key }),
    };
    await getContent(filterConfig);
  };

  const handleClearCache = async () => {
    const confirmed = await showConfirm(
      "Are you sure you want to clear all cache entries? This action cannot be undone.",
      {
        title: "Clear Cache",
        confirmText: "Clear All",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      await clearContent();
      await fetchCacheContent();
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.key || !newEntry.value) {
      return;
    }

    let parsedValue: any;
    try {
      // Try to parse as JSON first
      parsedValue = JSON.parse(newEntry.value);
    } catch {
      // If not JSON, treat as string
      parsedValue = newEntry.value;
    }

    const ttl = newEntry.ttl ? parseInt(newEntry.ttl) : undefined;
    const success = await addEntry(newEntry.key, parsedValue, ttl);
    
    if (success) {
      setNewEntry({ key: '', value: '', ttl: '3600' });
      await fetchCacheContent();
    }
  };

  const handleRemoveEntry = async (key: string) => {
    const confirmed = await showConfirm(
      `Are you sure you want to remove the cache entry for "${key}"?`,
      {
        title: "Remove Cache Entry",
        confirmText: "Remove",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      const success = await removeEntry(key);
      if (success) {
        await fetchCacheContent();
      }
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
          <span className="material-icons text-lg text-gray-600">storage</span>
          <div>
            <div className="font-medium text-gray-900">
              Current Driver: {formatDriverName(currentDriver?.implementation || '')}
            </div>
            <div className="text-sm text-gray-500">
              Status: <span className={`font-medium ${currentDriver?.status === 'active' ? 'text-green-600' : 'text-gray-600'}`}>
                {currentDriver?.status || 'inactive'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchCacheContent()}
            disabled={contentLoading}
          >
            <span className="material-icons text-sm mr-1">refresh</span>
            {contentLoading ? "Loading..." : "Refresh"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearCache}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <span className="material-icons text-sm mr-1">clear_all</span>
            Clear Cache
          </Button>
        </div>

        {/* Add New Entry */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <span className="material-icons text-lg">add</span>
            Add Cache Entry
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FloatingLabelInput
              label="Domain/Key"
              value={newEntry.key}
              onChange={(e) => setNewEntry(prev => ({ ...prev, key: e.target.value }))}
              placeholder="example.com"
            />
            <FloatingLabelInput
              label="Value (JSON or String)"
              value={newEntry.value}
              onChange={(e) => setNewEntry(prev => ({ ...prev, value: e.target.value }))}
              placeholder='{"addresses": ["1.1.1.1"]}'
            />
            <FloatingLabelInput
              label="TTL (seconds)"
              type="number"
              value={newEntry.ttl}
              onChange={(e) => setNewEntry(prev => ({ ...prev, ttl: e.target.value }))}
              placeholder="3600"
            />
            <div className="flex items-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddEntry}
                disabled={!newEntry.key || !newEntry.value}
                className="w-full"
              >
                Add Entry
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <span className="material-icons text-lg">filter_list</span>
              Filters
            </h4>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFilters({ key: '' });
                fetchCacheContent({ key: '' });
              }}
            >
              Clear Filters
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingLabelInput
              label="Filter by Key"
              value={filters.key}
              onChange={(e) => setFilters(prev => ({ ...prev, key: e.target.value }))}
              placeholder="Search keys..."
            />
            <div className="flex items-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchCacheContent()}
                className="w-full"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Cache Content Table */}
        <div className="border border-gray-200 rounded-lg bg-white">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="material-icons text-lg">storage</span>
              <span className="font-medium">Cache Entries</span>
              <span className="text-sm text-gray-500">
                ({Array.isArray(content?.content) ? content.content.length : 0} entries)
              </span>
            </div>
          </div>
          
          <Table
            columns={[...tableColumns, {
              key: "actions",
              label: "Actions",
              render: (_value: any, entry: CacheEntry) => (
                <button
                  onClick={() => handleRemoveEntry(entry.key)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  title="Remove from cache"
                >
                  <span className="material-icons text-sm">delete</span>
                  Remove
                </button>
              ),
            }]}
            data={Array.isArray(content?.content) ? content.content : []}
            loading={contentLoading}
            loadingMessage="Loading cache entries..."
            emptyMessage={
              typeof content?.content === "string"
                ? content.content
                : currentDriver?.implementation === "inmemory"
                ? "No cache entries found. Add entries manually or start DNS queries to populate the cache."
                : "No cache entries available. Click Refresh to load entries from the current driver."
            }
          />
        </div>
      </div>
    </Card>
  );
}