// HIPAA Compliance & BAA management page for SuperAdmin portal
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Shield, CheckCircle2, AlertCircle, FileText, Download, Plus } from 'lucide-react';

interface ComplianceRecord {
  id: string;
  record_type: string;
  status: string;
  signed_at: string;
  signed_by: string;
  expires_at: string;
  notes: string;
  organization_id: string;
}

export default function HIPAACompliancePage() {
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadRecords(); }, []);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('compliance_records')
        .select('*').order('created_at', { ascending: false });
      setRecords(data || []);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  const statusConfig: Record<string, { color: string; icon: any }> = {
    active:  { color: 'bg-green-100 text-green-700',           icon: CheckCircle2 },
    pending: { color: 'bg-amber-100 text-amber-700',           icon: AlertCircle },
    expired: { color: 'bg-gentle-coral/10 text-gentle-coral', icon: AlertCircle },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-charcoal">HIPAA Compliance & BAA</h2>
        <p className="text-medium-gray text-sm mt-1">Business Associate Agreements and compliance documentation</p>
      </div>

      {/* Encryption status */}
      <div className="bg-white rounded-2xl border border-soft-taupe p-6 space-y-4">
        <h3 className="font-semibold text-charcoal flex items-center gap-2"><Shield className="w-5 h-5 text-warm-bronze" />Data Security Status</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'Encryption at Rest', value: 'AES-256 (Supabase managed)', status: 'active' },
            { label: 'Encryption in Transit', value: 'TLS 1.3', status: 'active' },
            { label: 'Audit Log Immutability', value: 'Database trigger enforced', status: 'active' },
            { label: 'Role-Based Access Control', value: 'JWT + Row Level Security', status: 'active' },
            { label: 'Session Timeout', value: '15 minutes inactivity', status: 'active' },
            { label: 'MFA Support', value: 'TOTP (Google Auth, Authy)', status: 'active' },
          ].map(({ label, value, status }) => (
            <div key={label} className="flex items-start gap-3 p-3 bg-soft-taupe/20 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-charcoal">{label}</p>
                <p className="text-xs text-medium-gray">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BAA Records */}
      <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe">
          <h3 className="font-semibold text-charcoal">Business Associate Agreements</h3>
          <button className="flex items-center gap-2 px-3 py-2 bg-warm-bronze text-white rounded-xl text-sm font-medium hover:bg-deep-bronze transition-colors">
            <Plus className="w-4 h-4" />Add BAA
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-medium-gray">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-soft-taupe mx-auto mb-3" />
            <p className="text-medium-gray font-medium">No compliance records yet</p>
            <p className="text-sm text-medium-gray mt-1">Add BAA agreements for each covered organization</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['Type', 'Organization', 'Status', 'Signed By', 'Expires', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {records.map(r => {
                const s = statusConfig[r.status] || statusConfig.pending;
                return (
                  <tr key={r.id} className="hover:bg-soft-taupe/10">
                    <td className="px-5 py-3 font-medium text-charcoal text-sm">{r.record_type}</td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{r.organization_id || 'System-wide'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${s.color}`}>{r.status}</span>
                    </td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{r.signed_by || '—'}</td>
                    <td className="px-5 py-3 text-medium-gray text-sm">
                      {r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button className="text-xs text-warm-bronze hover:text-deep-bronze font-medium flex items-center gap-1">
                        <Download className="w-3 h-3" />Download
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}