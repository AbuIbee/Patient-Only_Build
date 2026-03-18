import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSelectedPatient } from '@/hooks/useSelectedPatient';
import {
  getAllTherapists, assignTherapistToPatient,
  removeTherapistFromPatient, getPatientTherapists,
} from '@/services/patientService';
import { X, Stethoscope, CheckCircle, UserMinus, Mail, Loader2, Link } from 'lucide-react';
import { toast } from 'sonner';

interface Therapist { id: string; name: string; email: string; phone?: string; }

interface AssignTherapistModalProps {
  onClose: () => void;
}

export default function AssignTherapistModal({ onClose }: AssignTherapistModalProps) {
  const selectedPatient = useSelectedPatient();
  const [allTherapists,     setAllTherapists]     = useState<Therapist[]>([]);
  const [assignedTherapists,setAssignedTherapists] = useState<Therapist[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [sending,   setSending]   = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const [all, assigned] = await Promise.all([
        getAllTherapists(),
        getPatientTherapists(selectedPatient.patient.id),
      ]);
      setAllTherapists(all);
      setAssignedTherapists(assigned);
    } catch (err: any) {
      toast.error('Failed to load therapists: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isAssigned = (therapistId: string) =>
    assignedTherapists.some(t => t.id === therapistId);

  const handleAssign = async (therapist: Therapist) => {
    if (!selectedPatient) return;
    setSaving(therapist.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not logged in');

      await assignTherapistToPatient(
        selectedPatient.patient.id,
        therapist.id,
        session.user.id
      );
      await loadData();
      toast.success(`${therapist.name} assigned to ${selectedPatient.patient.firstName}`);
    } catch (err: any) {
      toast.error('Failed to assign therapist: ' + err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (therapist: Therapist) => {
    if (!selectedPatient) return;
    if (!confirm(`Remove ${therapist.name} from ${selectedPatient.patient.firstName}?`)) return;
    setSaving(therapist.id);
    try {
      await removeTherapistFromPatient(selectedPatient.patient.id, therapist.id);
      await loadData();
      toast.success(`${therapist.name} removed`);
    } catch (err: any) {
      toast.error('Failed to remove therapist: ' + err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleSendInvite = async (therapist: Therapist) => {
    if (!selectedPatient) return;
    setSending(therapist.id);
    try {
      // Send password reset / portal link email to therapist
      const { error } = await supabase.auth.resetPasswordForEmail(therapist.email, {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;
      toast.success(`Portal link sent to ${therapist.email}`);
    } catch (err: any) {
      toast.error('Failed to send link: ' + err.message);
    } finally {
      setSending(null);
    }
  };

  if (!selectedPatient) return null;

  const patient = selectedPatient.patient;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-calm-blue" />
              Assign Therapist
            </h2>
            <p className="text-sm text-medium-gray mt-0.5">
              Patient: {patient.firstName} {patient.lastName}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors">
            <X className="w-4 h-4 text-medium-gray" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Currently assigned */}
          {assignedTherapists.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Currently Assigned ({assignedTherapists.length})
              </h3>
              <div className="space-y-2">
                {assignedTherapists.map(t => (
                  <div key={t.id}
                    className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
                    <div>
                      <p className="font-medium text-charcoal text-sm">{t.name}</p>
                      <p className="text-xs text-medium-gray">{t.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Send portal link */}
                      <button
                        onClick={() => handleSendInvite(t)}
                        disabled={sending === t.id}
                        title="Send portal link email"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-calm-blue/10 text-blue-700 rounded-lg hover:bg-calm-blue/20 transition-colors text-xs font-medium"
                      >
                        {sending === t.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Link className="w-3.5 h-3.5" />
                        }
                        Send Link
                      </button>
                      {/* Remove */}
                      <button
                        onClick={() => handleRemove(t)}
                        disabled={saving === t.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gentle-coral/10 text-gentle-coral rounded-lg hover:bg-gentle-coral/20 transition-colors text-xs font-medium"
                      >
                        {saving === t.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <UserMinus className="w-3.5 h-3.5" />
                        }
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All available therapists */}
          <div>
            <h3 className="text-sm font-semibold text-charcoal mb-3">
              Available Therapists ({allTherapists.length})
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-calm-blue" />
              </div>
            ) : allTherapists.length === 0 ? (
              <div className="text-center py-8 text-medium-gray">
                <Stethoscope className="w-10 h-10 mx-auto mb-3 text-soft-taupe" />
                <p className="font-medium">No therapists found</p>
                <p className="text-sm mt-1">
                  Add therapist accounts in the Admin dashboard first
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {allTherapists.map(t => {
                  const assigned = isAssigned(t.id);
                  const isSaving = saving === t.id;
                  return (
                    <div key={t.id}
                      className={`flex items-center justify-between p-3 border rounded-xl transition-colors ${
                        assigned ? 'border-green-200 bg-green-50' : 'border-soft-taupe hover:bg-soft-taupe/20'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-calm-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 font-semibold text-sm">{t.name[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium text-charcoal text-sm">{t.name}</p>
                          <p className="text-xs text-medium-gray">{t.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {assigned ? (
                          <>
                            <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Assigned
                            </span>
                            <button
                              onClick={() => handleSendInvite(t)}
                              disabled={sending === t.id}
                              className="flex items-center gap-1 px-2.5 py-1 bg-calm-blue/10 text-blue-700 rounded-lg text-xs font-medium hover:bg-calm-blue/20 transition-colors"
                            >
                              {sending === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                              Send Link
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleAssign(t)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-calm-blue text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
                          >
                            {isSaving
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Stethoscope className="w-3.5 h-3.5" />
                            }
                            {isSaving ? 'Assigning...' : 'Assign'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-soft-taupe flex-shrink-0">
          <p className="text-xs text-medium-gray">
            Clicking <strong>Send Link</strong> emails the therapist a link to access the patient portal.
            They must have an account in the system first.
          </p>
        </div>
      </div>
    </div>
  );
}