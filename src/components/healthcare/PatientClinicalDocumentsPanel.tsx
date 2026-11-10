import { useCallback, useEffect, useId, useState } from 'react';
import { Download, FilePlus2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getMyEnterpriseOrganization } from '@/services/enterprisePatientService';
import {
  getDocumentsForPatient,
  uploadInternalDocument,
  type ClinicalDocument,
} from '@/services/hcnClinicalCoordinationService';
import {
  isPatientVisibleClinicalDocument,
  PATIENT_CLINICAL_ACCEPT,
  validatePatientClinicalFile,
} from './patientClinicalDocumentRules';

type Props = { patientId: string };
const CLINICAL_BUCKET = 'hcn-clinical-documents';

function displayReviewStatus(document: ClinicalDocument) {
  if (document.reviewStatus === 'clinical_approved') return 'Clinically approved';
  if (document.reviewStatus === 'accepted') return 'Reviewed';
  if (document.reviewStatus === 'revision_required') return 'Revision requested';
  if (document.reviewStatus === 'rejected') return 'Not accepted';
  return 'Awaiting review';
}

/**
 * Adds authorized Clinical Coordination exchange to the EXISTING patient
 * Documents page. Personal documents and bills retain their original system.
 * Org and actor are resolved from authenticated server-backed sources; RLS
 * remains the authority for every DB row and Storage object.
 */
export default function PatientClinicalDocumentsPanel({ patientId }: Props) {
  const inputId = useId();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [docs, setDocs] = useState<ClinicalDocument[]>([]);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    setOrganizationId(null);
    setActorId(null);
    setDocs([]);
    setChecking(true);
    if (!patientId) {
      setChecking(false);
      return () => { active = false; };
    }
    void Promise.all([
      getMyEnterpriseOrganization(patientId),
      supabase.auth.getUser(),
    ]).then(([organization, auth]) => {
      if (!active) return;
      setOrganizationId(organization?.organizationId ?? null);
      setActorId(auth.data.user?.id ?? null);
      if (auth.error) setErrorMessage('Your session could not be verified. Sign in again to access clinical documents.');
    }).catch(() => {
      if (active) setErrorMessage('Unable to confirm access to the care organization.');
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [patientId]);

  const refresh = useCallback(async () => {
    if (!patientId || !organizationId || !actorId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await getDocumentsForPatient(patientId);
      if (result.error) throw new Error(result.error);
      const permitted = (result.data ?? [])
        .filter((document) => isPatientVisibleClinicalDocument(document, organizationId, actorId));
      setDocs(permitted);
    } catch (error) {
      setDocs([]);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load shared care documents.');
    } finally {
      setLoading(false);
    }
  }, [actorId, organizationId, patientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (file: File) => {
    if (!organizationId || !actorId) {
      setErrorMessage('Your patient access could not be verified.');
      return;
    }
    const validationError = validatePatientClinicalFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setUploading(true);
    setErrorMessage('');
    try {
      const result = await uploadInternalDocument({
        organizationId,
        patientId,
        category: 'patient_provided_documents',
        classification: 'patient_shared_document',
        uploadedBy: actorId,
        file,
      });
      if (result.error) throw new Error(result.error);
      toast.success('Document uploaded. Your care team can review it.');
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The document could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (document: ClinicalDocument) => {
    setDownloadingId(document.id);
    setErrorMessage('');
    try {
      // Storage RLS checks the currently authenticated patient/representative.
      // No signed link is cached or sent through email.
      const result = await supabase.storage.from(CLINICAL_BUCKET).download(document.storagePath);
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? 'Download permission could not be verified.');
      }
      const objectUrl = URL.createObjectURL(result.data);
      try {
        const link = window.document.createElement('a');
        link.href = objectUrl;
        link.download = document.originalFilename;
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download this document.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (checking) return <p className="text-sm text-medium-gray" role="status">Checking shared clinical documents…</p>;
  if (!organizationId || !actorId) {
    return errorMessage ? <p className="text-sm text-gentle-coral" role="alert">{errorMessage}</p> : null;
  }

  return (
    <section aria-label="Clinical Coordination documents" className="rounded-3xl bg-white shadow-card overflow-hidden">
      <header className="border-b border-soft-taupe px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-charcoal">Shared Care Documents</h2>
            <p className="text-sm text-medium-gray mt-1">
              Exchange documents with your care team. Documents from providers appear here after authorization and review.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { void refresh(); }} disabled={loading || uploading}
              aria-label="Refresh care documents"
              className="inline-flex items-center gap-2 rounded-xl border border-soft-taupe px-3 py-2 text-sm text-charcoal disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <label htmlFor={inputId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-calm-blue px-4 py-2 text-sm font-semibold text-white">
              <FilePlus2 className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload to care team'}
            </label>
            <input id={inputId} type="file" className="sr-only" disabled={uploading}
              accept={PATIENT_CLINICAL_ACCEPT} aria-label="Choose a care team document"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void upload(file);
              }} />
          </div>
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-medium-gray">
          <ShieldCheck className="h-4 w-4" /> PDF, Word, Excel, CSV, text, JPG or PNG. Maximum 25 MiB per file.
        </p>
        {errorMessage && <p role="alert" className="mt-3 rounded-lg bg-gentle-coral/10 p-3 text-sm text-gentle-coral">{errorMessage}</p>}
      </header>

      <div className="px-6 py-5 sm:px-8">
        {loading ? (
          <p role="status" className="text-sm text-medium-gray">Loading shared care documents…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-medium-gray">No shared care documents yet. You can upload a document for your care team above.</p>
        ) : (
          <ul className="space-y-3">
            {docs.map((document) => (
              <li key={document.id} className="flex flex-col gap-3 rounded-xl border border-soft-taupe p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-charcoal">{document.originalFilename}</p>
                  <p className="mt-1 text-xs text-medium-gray">
                    {document.category.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleDateString()} · Version {document.versionNumber}
                  </p>
                  <p className="mt-1 text-xs text-medium-gray">{displayReviewStatus(document)}</p>
                </div>
                <button type="button" onClick={() => { void download(document); }}
                  disabled={downloadingId === document.id || uploading}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-calm-blue px-4 py-2 text-sm font-semibold text-calm-blue disabled:opacity-50"
                  aria-label={'Download ' + document.originalFilename}>
                  <Download className="h-4 w-4" />
                  {downloadingId === document.id ? 'Downloading…' : 'Download'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
