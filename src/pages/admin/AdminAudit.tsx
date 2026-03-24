import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Search, Filter, Shield, AlertTriangle, Info, RefreshCw } from 'lucide-react';

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_state: any;
  after_state: any;
  ip_address: string;
  severity: 'info' | 'warning' | 'critical';
  details: any;
  profiles?: { email: string; first_name: string; last_name: string };
}

const SEVERITY_CONFIG = {
  info:     { icon: Info,          color: 'bg-calm-blue/10 text-blue-700',        label: 'Info' },
  warning:  { icon: AlertTriangle, color: 'bg-amber-100 text-amber-700',          label: 'Warning' },
  critical: { icon: Shield,        color: 'bg-gentle-coral/10 text-gentle-coral', label: 'Critical' },
};

export function AdminAudit() {
  const [logs,     setLogs]     = useState<AuditLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [severity, setSeverity] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*, profiles!left(email, first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (severity !== 'all') query = query.eq('severity', severity);

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Audit log error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [severity]);

  useEffect(() => { loadAuditLogs(); }, [loadAuditLogs]);

  const exportCSV = () => {
    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Severity', 'Before State', 'After State'];
    const rows = filtered.map(log => [
      new Date(log.created_at).toISOString(),
      log.user_email || getUserDisplay(log),
      log.user_role || '',
      log.action,
      log.resource_type || '',
      log.resource_id || '',
      log.ip_address || '',
      log.severity || 'info',
      log.before_state ? JSON.stringify(log.before_state) : '',
      log.after_state  ? JSON.stringify(log.after_state)  : '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `memoriahelps-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getUserDisplay = (log: AuditLog) => {
    if (log.user_email) return log.user_email;
    if (!log.profiles) return 'System';
    return `${log.profiles.first_name} ${log.profiles.last_name} (${log.profiles.email})`;
  };

  const filtered = logs.filter(log =>
    !search ||
    getUserDisplay(log).toLowerCase().includes(search.toLowerCase()) ||
    log.action?.toLowerCase().includes(search.toLowerCase()) ||
    log.resource_type?.toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    total:    logs.length,
    critical: logs.filter(l => l.severity === 'critical').length,
    warning:  logs.filter(l => l.severity === 'warning').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">System Audit Log</h2>
          <p className="text-medium-gray text-sm mt-1">
            Immutable, append-only record of all system actions.
            {counts.critical > 0 && <span className="text-gentle-coral font-medium ml-2">⚠️ {counts.critical} critical event{counts.critical !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={loadAuditLogs}
            className="flex items-center gap-2 px-3 py-2 border border-soft-taupe rounded-xl text-sm text-charcoal hover:bg-soft-taupe/30 transition-colors">
            <RefreshCw className="w-4 h-4" />Refresh
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors">
            <Download className="w-4 h-4" />Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Events',     value: counts.total,    color: 'text-charcoal' },
          { label: 'Warnings',         value: counts.warning,  color: 'text-amber-600' },
          { label: 'Critical Events',  value: counts.critical, color: 'text-gentle-coral' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-soft-taupe text-center shadow-sm">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-medium-gray mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
          <input type="text" placeholder="Search by user, action, or resource..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
        </div>
        <div className="flex gap-2">
          {(['all', 'info', 'warning', 'critical'] as const).map(s => (
            <button key={s} onClick={() => setSeverity(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${severity === s ? 'bg-warm-bronze text-white' : 'bg-white border border-soft-taupe text-charcoal hover:bg-soft-taupe/30'}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* HIPAA immutability notice */}
      <div className="flex items-start gap-3 p-3 bg-calm-blue/5 border border-calm-blue/20 rounded-xl">
        <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <strong>Immutable audit trail</strong> — These records cannot be modified or deleted. Database-level triggers enforce append-only integrity. Suitable for HIPAA regulatory defense and legal proceedings.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-medium-gray py-12">No audit logs found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-soft-taupe/20">
                <tr>
                  {['Timestamp', 'User', 'Action', 'Resource', 'IP Address', 'Severity', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-soft-taupe/30">
                {filtered.map(log => {
                  const sev = SEVERITY_CONFIG[log.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
                  const isOpen = expanded === log.id;
                  const hasChanges = log.before_state || log.after_state;
                  return (
                    <>
                      <tr key={log.id} className={`hover:bg-soft-taupe/10 transition-colors ${log.severity === 'critical' ? 'bg-gentle-coral/5' : ''}`}>
                        <td className="px-4 py-3 text-medium-gray whitespace-nowrap font-mono text-xs">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-charcoal">
                          <p className="font-medium text-xs">{getUserDisplay(log)}</p>
                          {log.user_role && <p className="text-xs text-medium-gray capitalize">{log.user_role}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-warm-bronze/10 text-warm-bronze rounded-full text-xs font-medium">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-medium-gray text-xs">
                          {log.resource_type && <span className="capitalize">{log.resource_type}</span>}
                          {log.resource_id && <p className="font-mono text-xs text-soft-taupe truncate max-w-[120px]">{log.resource_id}</p>}
                        </td>
                        <td className="px-4 py-3 text-medium-gray font-mono text-xs">
                          {log.ip_address || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium w-fit ${sev.color}`}>
                            <sev.icon className="w-3 h-3" />{sev.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {hasChanges && (
                            <button onClick={() => setExpanded(isOpen ? null : log.id)}
                              className="text-xs text-warm-bronze hover:text-deep-bronze font-medium">
                              {isOpen ? 'Hide ▲' : 'Diff ▼'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && hasChanges && (
                        <tr key={`${log.id}-diff`} className="bg-soft-taupe/10">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-semibold text-medium-gray mb-2 uppercase tracking-wide">Before</p>
                                <pre className="text-xs bg-gentle-coral/5 border border-gentle-coral/20 rounded-lg p-3 overflow-auto max-h-40 text-charcoal">
                                  {JSON.stringify(log.before_state, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-medium-gray mb-2 uppercase tracking-wide">After</p>
                                <pre className="text-xs bg-green-50 border border-green-200 rounded-lg p-3 overflow-auto max-h-40 text-charcoal">
                                  {JSON.stringify(log.after_state, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-medium-gray text-center">
        Showing {filtered.length} of {logs.length} records · Export CSV for full regulatory submission
      </p>
    </div>
  );
}