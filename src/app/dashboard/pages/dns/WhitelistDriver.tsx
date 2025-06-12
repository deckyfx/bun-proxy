import { Button, Card, Select, Table, type TableColumn, FloatingLabelInput } from "@app/components/index";
import { useState, useEffect } from "react";
import { DRIVER_TYPES, type DriversResponse } from "@src/types/driver";
import type { WhitelistEntry as ServerWhitelistEntry } from "@src/dns/drivers/whitelist/BaseDriver";
import { useDnsWhitelistStore } from "@app/stores/dnsWhitelistStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { tryAsync } from '@src/utils/try';

interface WhitelistDriverProps {
  drivers: DriversResponse | null;
  loading: boolean;
}

type WhitelistEntry = ServerWhitelistEntry;

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

const tableColumns: TableColumn<ServerWhitelistEntry>[] = [
  {
    key: "domain",
    label: "Domain",
    className: "font-mono",
    render: (value) => (
      <div className="max-w-48 truncate" title={String(value || '')}>
        {String(value || '')}
      </div>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    render: (value) => (
      <div className="max-w-32 truncate" title={String(value || '')}>
        {String(value || '') || <span className="text-gray-400">No reason</span>}
      </div>
    ),
  },
  {
    key: "category",
    label: "Category",
    render: (value) => {
      const stringValue = String(value || '');
      if (!stringValue) return <span className="text-gray-400">-</span>;
      
      const categoryColors: Record<string, string> = {
        banking: "bg-green-100 text-green-800",
        education: "bg-blue-100 text-blue-800",
        work: "bg-purple-100 text-purple-800",
        essential: "bg-indigo-100 text-indigo-800",
        trusted: "bg-emerald-100 text-emerald-800",
        logs: "bg-gray-100 text-gray-800",
        manual: "bg-yellow-100 text-yellow-800",
      };
      
      const colorClass = categoryColors[stringValue.toLowerCase()] || "bg-gray-100 text-gray-800";
      
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
          {stringValue}
        </span>
      );
    },
  },
  {
    key: "source",
    label: "Source",
    render: (value) => {
      const stringValue = String(value || '');
      if (!stringValue) return <span className="text-gray-400">-</span>;
      
      const sourceIcons: Record<string, string> = {
        manual: "person",
        import: "upload",
        logs: "description",
        api: "api",
      };
      
      const icon = sourceIcons[stringValue.toLowerCase()] || "help";
      
      return (
        <div className="flex items-center gap-1">
          <span className="material-icons text-sm text-gray-500">{icon}</span>
          <span className="text-sm capitalize">{stringValue}</span>
        </div>
      );
    },
  },
  {
    key: "addedAt",
    label: "Added",
    render: (value) => {
      if (!value || typeof value !== 'number') return <span className="text-gray-400">-</span>;
      return (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleString()}
        </span>
      );
    },
  },
];

export default function WhitelistDriver({ drivers, loading }: WhitelistDriverProps) {
  const [driverForm, setDriverForm] = useState({ driver: '' });
  const [newEntry, setNewEntry] = useState({ domain: '', reason: '', category: 'manual' });
  const [filters, setFilters] = useState({ domain: '', category: '', source: '', reason: '' });
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
  } = useDnsWhitelistStore();
  const { showConfirm, showCustom, closeDialog } = useDialogStore();

  useEffect(() => {
    if (drivers?.current?.[DRIVER_TYPES.WHITELIST]) {
      setDriverForm({
        driver: drivers.current[DRIVER_TYPES.WHITELIST].implementation || 'inmemory'
      });
    }
  }, [drivers]);

  // Connect to SSE only for data change events
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

  const fetchWhitelistContent = async (customFilters?: typeof filters) => {
    const currentFilters = customFilters || filters;
    const filterConfig = {
      ...(currentFilters.domain && { domain: currentFilters.domain }),
      ...(currentFilters.category && { category: currentFilters.category }),
      ...(currentFilters.source && { source: currentFilters.source }),
      ...(currentFilters.reason && { reason: currentFilters.reason }),
    };
    await getContent(filterConfig);
  };

  const handleClearWhitelist = async () => {
    const confirmed = await showConfirm(
      "Are you sure you want to clear all whitelist entries? This action cannot be undone.",
      {
        title: "Clear Whitelist",
        confirmText: "Clear All",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      await clearContent();
      await fetchWhitelistContent();
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.domain) {
      return;
    }

    const success = await addEntry(
      newEntry.domain, 
      newEntry.reason || 'Manually added', 
      newEntry.category || 'manual'
    );
    
    if (success) {
      setNewEntry({ domain: '', reason: '', category: 'manual' });
      await fetchWhitelistContent();
    }
  };

  const handleRemoveEntry = async (domain: string) => {
    const confirmed = await showConfirm(
      `Are you sure you want to remove "${domain}" from the whitelist?`,
      {
        title: "Remove from Whitelist",
        confirmText: "Remove",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      const success = await removeEntry(domain);
      if (success) {
        await fetchWhitelistContent();
      }
    }
  };

  const showAddDialog = () => {
    const AddEntryDialog = () => {
      const [formData, setFormData] = useState({ domain: '', reason: '', category: 'manual' });
      const [submitting, setSubmitting] = useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.domain) return;

        setSubmitting(true);
        
        const [success, error] = await tryAsync(() => addEntry(
          formData.domain, 
          formData.reason || 'Manually added', 
          formData.category || 'manual'
        ));
        
        if (!error && success) {
          await fetchWhitelistContent();
          closeDialog(dialogId);
        }
        
        setSubmitting(false);
      };

      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FloatingLabelInput
            label="Domain"
            value={formData.domain}
            onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
            disabled={submitting}
            required
          />
          <FloatingLabelInput
            label="Reason (optional)"
            value={formData.reason}
            onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
            disabled={submitting}
          />
          <Select
            label="Category"
            value={formData.category}
            onChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
            options={[
              { value: 'manual', label: 'Manual' },
              { value: 'banking', label: 'Banking' },
              { value: 'education', label: 'Education' },
              { value: 'work', label: 'Work' },
              { value: 'essential', label: 'Essential' },
              { value: 'trusted', label: 'Trusted' },
            ]}
          />
          <div className="flex justify-end space-x-3 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => closeDialog(dialogId)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitting}
              disabled={submitting || !formData.domain}
            >
              Add to Whitelist
            </Button>
          </div>
        </form>
      );
    };

    const dialogId = showCustom(
      <AddEntryDialog />,
      {
        title: "Add Domain to Whitelist",
        showCloseButton: true,
      }
    );
  };

  const availableDrivers = drivers?.available?.[DRIVER_TYPES.WHITELIST] || [];
  const currentDriver = drivers?.current?.[DRIVER_TYPES.WHITELIST];

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
          <span className="material-icons text-lg text-gray-600">verified</span>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchWhitelistContent()}
              disabled={contentLoading}
              className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-300"
            >
              <span className="material-icons text-sm mr-1">refresh</span>
              {contentLoading ? "Loading..." : "Refresh"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => showAddDialog()}
              icon="add"
            >
              Add Domain
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearWhitelist}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <span className="material-icons text-sm mr-1">clear_all</span>
            Clear Whitelist
          </Button>
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
                setFilters({ domain: '', category: '', source: '', reason: '' });
                fetchWhitelistContent({ domain: '', category: '', source: '', reason: '' });
              }}
            >
              Clear Filters
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FloatingLabelInput
              label="Filter by Domain"
              value={filters.domain}
              onChange={(e) => setFilters(prev => ({ ...prev, domain: e.target.value }))}
            />
            <Select
              label="Category"
              value={filters.category}
              onChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
              options={[
                { value: '', label: 'All Categories' },
                { value: 'manual', label: 'Manual' },
                { value: 'banking', label: 'Banking' },
                { value: 'education', label: 'Education' },
                { value: 'work', label: 'Work' },
                { value: 'essential', label: 'Essential' },
                { value: 'trusted', label: 'Trusted' },
                { value: 'logs', label: 'From Logs' },
              ]}
            />
            <Select
              label="Source"
              value={filters.source}
              onChange={(value) => setFilters(prev => ({ ...prev, source: value }))}
              options={[
                { value: '', label: 'All Sources' },
                { value: 'manual', label: 'Manual' },
                { value: 'import', label: 'Import' },
                { value: 'logs', label: 'From Logs' },
                { value: 'api', label: 'API' },
              ]}
            />
            <div className="flex items-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchWhitelistContent()}
                className="w-full"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Whitelist Content Table */}
        <div className="border border-gray-200 rounded-lg bg-white">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="material-icons text-lg">verified</span>
              <span className="font-medium">Allowed Domains</span>
              <span className="text-sm text-gray-500">
                ({content && 'entries' in content && Array.isArray(content.entries) ? content.entries.length : 0} domains)
              </span>
            </div>
          </div>
          
          <Table
            columns={[...tableColumns, {
              key: "actions",
              label: "Actions",
              render: (_value, entry) => (
                <button
                  onClick={() => handleRemoveEntry(entry.domain)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  title="Remove from whitelist"
                >
                  <span className="material-icons text-sm">delete</span>
                  Remove
                </button>
              ),
            }]}
            data={content && 'entries' in content && Array.isArray(content.entries) ? content.entries as ServerWhitelistEntry[] : []}
            loading={contentLoading}
            loadingMessage="Loading whitelist entries..."
            emptyMessage={
              !content || !content.success
                ? "Failed to load whitelist entries"
                : currentDriver?.implementation === "inmemory"
                ? "No domains in whitelist. Add trusted domains manually or import from logs."
                : "No whitelist entries available. Click Refresh to load entries from the current driver."
            }
          />
        </div>
    </div>
  );
}