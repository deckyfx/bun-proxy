import { RippleButton, CollapsibleCard, Select, FloatingLabelInput } from "@app/components/index";
import { Table, type TableColumn } from "@app/components/index";
import { useState, useEffect } from "react";
import { DRIVER_TYPES, type DriversResponse } from "@src/types/driver";
import type { CachedDnsResponse } from "@src/types/dns-unified";
import { useDnsCacheStore } from "@app/stores/dnsCacheStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { tryAsync, trySync } from '@src/utils/try';

interface CacheDriverProps {
  drivers: DriversResponse | null;
  loading: boolean;
}

interface CacheEntry extends CachedDnsResponse {
  key: string;
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
    render: (value) => (
      <div className="max-w-48 truncate" title={String(value || '')}>
        {String(value || '')}
      </div>
    ),
  },
  {
    key: "packet",
    label: "Cached Value",
    render: (_value, entry) => {
      if (entry.packet && entry.packet.answers && Array.isArray(entry.packet.answers)) {
        const addresses = entry.packet.answers
          .filter((answer) => answer.type === 'A' || answer.type === 'AAAA')
          .map((answer) => {
            // A and AAAA records have string data
            if (answer.type === 'A' || answer.type === 'AAAA') {
              return (answer as { data: string }).data;
            }
            return null;
          })
          .filter((data): data is string => typeof data === 'string');
        if (addresses.length > 0) {
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
      }
      return (
        <div className="text-xs text-gray-500 max-w-32 truncate" title={JSON.stringify(entry.packet)}>
          {JSON.stringify(entry.packet).length > 30 
            ? JSON.stringify(entry.packet).substring(0, 30) + '...'
            : JSON.stringify(entry.packet)
          }
        </div>
      );
    },
  },
  {
    key: "cache",
    label: "TTL",
    render: (_value, entry) => {
      const ttl = entry.cache?.ttl;
      if (ttl === undefined) return <span className="text-gray-400">No TTL</span>;
      if (ttl === 0) return <span className="text-red-500">Expired</span>;
      
      const hours = Math.floor(ttl / 3600);
      const minutes = Math.floor((ttl % 3600) / 60);
      const seconds = ttl % 60;
      
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
    key: "cache",
    label: "Added",
    render: (_value, entry) => {
      const timestamp = entry.cache?.timestamp;
      if (!timestamp || typeof timestamp !== 'number') return <span className="text-gray-400">-</span>;
      return (
        <span className="text-sm text-gray-600">
          {new Date(timestamp).toLocaleTimeString()}
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
  const { showConfirm, showCustom, closeDialog } = useDialogStore();

  useEffect(() => {
    if (drivers?.current?.[DRIVER_TYPES.CACHE]) {
      setDriverForm({
        driver: drivers.current[DRIVER_TYPES.CACHE].implementation || 'inmemory'
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

    const [parsedValue, parseError] = trySync(() => JSON.parse(newEntry.value as string));
    const finalValue = parseError ? newEntry.value : parsedValue;

    const ttl = newEntry.ttl ? parseInt(newEntry.ttl) : undefined;
    const success = await addEntry(newEntry.key, finalValue, ttl);
    
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

  const showAddDialog = () => {
    const AddEntryDialog = () => {
      const [formData, setFormData] = useState({ key: '', value: '', ttl: '3600' });
      const [submitting, setSubmitting] = useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.key || !formData.value) return;

        setSubmitting(true);
        
        const [parsedValue, parseError] = trySync(() => JSON.parse(formData.value as string));
        const finalValue = parseError ? formData.value : parsedValue;
        
        const ttl = formData.ttl ? parseInt(formData.ttl) : undefined;
        const [success, error] = await tryAsync(() => addEntry(formData.key, finalValue, ttl));
        
        if (!error && success) {
          await fetchCacheContent();
          closeDialog(dialogId);
        }
        
        setSubmitting(false);
      };

      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FloatingLabelInput
            label="Domain/Key"
            value={formData.key}
            onChange={(e) => setFormData(prev => ({ ...prev, key: e.target.value }))}
            disabled={submitting}
            required
          />
          <FloatingLabelInput
            label="Value (JSON or String)"
            value={formData.value}
            onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
            disabled={submitting}
            required
          />
          <FloatingLabelInput
            label="TTL (seconds)"
            type="number"
            value={formData.ttl}
            onChange={(e) => setFormData(prev => ({ ...prev, ttl: e.target.value }))}
            disabled={submitting}
          />
          <div className="flex justify-end space-x-3 mt-6">
            <RippleButton
              type="button"
              variant="soft"
              color="gray"
              onClick={() => closeDialog(dialogId)}
              disabled={submitting}
            >
              <span className="material-icons">close</span>
              <span>Cancel</span>
            </RippleButton>
            <RippleButton
              type="submit"
              variant="solid"
              color="blue"
              loading={submitting}
              disabled={submitting || !formData.key || !formData.value}
            >
              <span className="material-icons">add</span>
              <span>Add Entry</span>
            </RippleButton>
          </div>
        </form>
      );
    };

    const dialogId = showCustom(
      <AddEntryDialog />,
      {
        title: "Add Cache Entry",
        showCloseButton: true,
      }
    );
  };

  const availableDrivers = drivers?.available[DRIVER_TYPES.CACHE] || [];
  const currentDriver = drivers?.current[DRIVER_TYPES.CACHE];

  return (
    <div className="space-y-4">
        {/* Driver Configuration */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Select
              label="Driver Implementation"
              labelPosition="top"
              value={driverForm.driver}
              onChange={(value) => handleDriverFormChange(value)}
              options={availableDrivers.map((driver: string) => ({
                value: driver,
                label: formatDriverName(driver)
              }))}
            />
          </div>
          <RippleButton
            variant="solid"
            color="blue"
            onClick={handleSetDriver}
            disabled={!driverForm.driver || loading}
          >
            <span className="material-icons">settings</span>
            <span>Set Driver</span>
          </RippleButton>
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
          <div className="flex items-center gap-3">
            <RippleButton
              variant="soft"
              color="green"
              onClick={() => fetchCacheContent()}
              disabled={contentLoading}
            >
              <span className="material-icons">refresh</span>
              <span>{contentLoading ? "Loading..." : "Refresh"}</span>
            </RippleButton>
            <RippleButton
              variant="solid"
              color="blue"
              onClick={() => showAddDialog()}
            >
              <span className="material-icons">add</span>
              <span>Add Entry</span>
            </RippleButton>
          </div>
          <RippleButton
            variant="soft"
            color="red"
            onClick={handleClearCache}
          >
            <span className="material-icons">clear_all</span>
            <span>Clear Cache</span>
          </RippleButton>
        </div>

        {/* Filters */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <span className="material-icons text-lg">filter_list</span>
              Filters
            </h4>
            <RippleButton
              variant="soft"
              color="gray"
              onClick={() => {
                setFilters({ key: '' });
                fetchCacheContent({ key: '' });
              }}
            >
              <span className="material-icons">filter_list_off</span>
              <span>Clear Filters</span>
            </RippleButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingLabelInput
              label="Filter by Key"
              value={filters.key}
              onChange={(e) => setFilters(prev => ({ ...prev, key: e.target.value }))}
            />
            <div className="flex items-end">
              <RippleButton
                variant="soft"
                color="blue"
                onClick={() => fetchCacheContent()}
                className="w-full"
              >
                <span className="material-icons">search</span>
                <span>Apply Filters</span>
              </RippleButton>
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
                ({content && 'entries' in content && Array.isArray(content.entries) ? content.entries.length : 0} entries)
              </span>
            </div>
          </div>
          
          <Table
            columns={[...tableColumns, {
              key: "actions",
              label: "Actions",
              render: (_value, entry) => (
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
            data={content && 'entries' in content && Array.isArray(content.entries) ? content.entries as CacheEntry[] : []}
            loading={contentLoading}
            loadingMessage="Loading cache entries..."
            emptyMessage={
              !content || !content.success
                ? "Failed to load cache entries"
                : currentDriver?.implementation === "inmemory"
                ? "No cache entries found. Add entries manually or start DNS queries to populate the cache."
                : "No cache entries available. Click Refresh to load entries from the current driver."
            }
          />
        </div>
    </div>
  );
}