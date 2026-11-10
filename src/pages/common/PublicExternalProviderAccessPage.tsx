import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldCheck, FileText, Upload, Send, Download, AlertTriangle, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';

/*
 * HCN-CLINICAL-MASTER-002 Feature 2.3 / SEC-001 -- the external
 * healthcare provider's own access point. No Haneen account, no
 * Supabase Auth session, no persistent login at all: this page talks
 * directly to the hcn-external-request-access Edge Function (which has
 * verify_jwt disabled for exactly this reason) over plain fetch, the
 * same convention every other Edge-Function-calling code in this repo
 * already uses (see src/services/communicationsService.ts).
 *
 * SEC-001: possessing this link is NOT sufficient on its own. A
 * server-issued verification code (sent only to the request's own
 * stored recipient email, never a value this page collects) must be
 * entered before anything about the request becomes visible, and the
 * resulting session_token -- never the raw link token -- is what every
 * subsequent action uses. The session_token lives only in this page's
 * own React state; it is never written to localStorage/sessionStorage,
 * so a page refresh correctly requires re-verifying.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const FN_URL = `${SUPABASE_URL}/functions/v1/hcn-external-request-access`;

const DOCUMENT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'medical_records', label: 'Medical records' },
  { value: 'therapy_reports', label: 'Therapy reports' },
  { value: 'medication_lists', label: 'Medication list' },
  { value: 'discharge_documents', label: 'Discharge documents' },
  { value: 'care_instructions', label: 'Care instructions' },
  { value: 'referral_documents', label: 'Referral documents' },
  { value: 'specialist_assessments', label: 'Specialist assessment' },
  { value: 'patient_provided_documents', label: 'Patient-provided document' },
  { value: 'administrative_coordination', label: 'Administrative coordination' },
  { value: 'other_clinical_attachment', label: 'Other clinical attachment' },
];

type RequestInfo = {
  id: string; title: string; requestType: string; description: string | null;
  requestedItems: unknown; patientLabel: string; providerDisplayName: string | null; deadlineAt: string | null;
};
type SharedDocument = { document_id: string; original_filename: string; category: string; version_number: number; created_at: string };

async function callFunction(action: string, body: unknown, isForm = false): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${FN_URL}?action=${action}`, {
    method: 'POST',
    headers: isForm ? { apikey: ANON_KEY } : { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: isForm ? (body as FormData) : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, body: json };
}

const OUTCOME_MESSAGES: Record<string, string> = {
  not_found: 'This link is not valid. Please check the link you were sent, or contact the organization that sent it to you.',
  revoked: 'This access link has been revoked and is no longer active.',
  expired: 'This access link has expired. Please contact the organization that sent it to you for a new one.',
  rate_limited: 'A code was already sent recently. Please wait a minute before requesting another.',
  too_many_requests: 'Too many codes have been requested for this link. Please contact the organization that sent it to you.',
  email_failed: 'We could not send your verification code. Please contact the organization that sent you this link.',
  wrong_code: 'That code was not correct. Please try again.',
  too_many_attempts: 'Too many incorrect attempts. Please request a new code.',
  code_expired: 'That code has expired. Please request a new one.',
  invalid_session: 'Your session is no longer valid. Please verify again.',
  request_no_longer_open: 'This request is no longer open.',
};

export default function PublicExternalProviderAccessPage() {
  const rawToken = useMemo(() => new URLSearchParams(window.location.search).get('rt') || '', []);
  const [stage, setStage] = useState<'intro' | 'code_sent' | 'verified'>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  const [sharedDocs, setSharedDocs] = useState<SharedDocument[]>([]);
  const [category, setCategory] = useState('other_clinical_attachment');
  const [file, setFile] = useState<File | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!rawToken) setError('This link is missing required information. Please use the exact link you were sent.');
  }, [rawToken]);

  const requestCode = async () => {
    setBusy(true); setError(null);
    const { body } = await callFunction('request_code', { rawToken });
    setBusy(false);
    const outcome = body.outcome as string;
    if (outcome === 'code_sent') { setStage('code_sent'); return; }
    setError(OUTCOME_MESSAGES[outcome] ?? 'Something went wrong. Please try again.');
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true); setError(null);
    const { body } = await callFunction('verify_code', { rawToken, code: code.trim() });
    if (body.outcome !== 'verified') {
      setBusy(false);
      setError(OUTCOME_MESSAGES[body.outcome as string] ?? 'That code was not correct. Please try again.');
      return;
    }
    const token = body.sessionToken as string;
    setSessionToken(token);
    const { body: infoBody } = await callFunction('verify', { sessionToken: token });
    setBusy(false);
    if (infoBody.outcome !== 'verified') {
      setError(OUTCOME_MESSAGES[infoBody.outcome as string] ?? 'Could not load this request.');
      return;
    }
    setRequestInfo(infoBody.request as RequestInfo);
    setSharedDocs((infoBody.sharedDocuments as SharedDocument[]) ?? []);
    setStage('verified');
  };

  const downloadDocument = async (documentId: string, filename: string) => {
    const { body } = await callFunction('download', { sessionToken, documentId });
    if (!body.url) { toast.error('Could not open this document.'); return; }
    const a = document.createElement('a');
    a.href = body.url as string;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    a.click();
    void filename;
  };

  const uploadFile = async () => {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set('sessionToken', sessionToken || '');
    form.set('category', category);
    form.set('file', file);
    const { status, body } = await callFunction('upload', form, true);
    setBusy(false);
    if (status !== 200) {
      toast.error((body.error as string) || 'Could not upload this file.');
      return;
    }
    toast.success(`${file.name} uploaded.`);
    setFile(null);
  };

  const submitResponse = async () => {
    setBusy(true);
    const { status, body } = await callFunction('submit', { sessionToken, responseText: responseText.trim() || null });
    setBusy(false);
    if (status !== 200) {
      toast.error((body.error as string) || 'Could not submit your response.');
      return;
    }
    setSubmitted(true);
    toast.success('Your response has been submitted.');
  };

  return (
    <div className="min-h-screen bg-warm-ivory flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2 text-deep-bronze">
          <Stethoscope className="h-6 w-6" />
          <span className="font-semibold text-lg">Haneen Care Network — Secure Provider Access</span>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-start gap-2 pt-4 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {!rawToken ? null : stage === 'intro' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5" /> Verify your identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-medium-gray">
                For your security, we need to confirm it's really you before showing any information about this request.
                We'll send a one-time verification code to the email address already on file for this request.
              </p>
              <Button onClick={requestCode} disabled={busy} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send me a verification code
              </Button>
            </CardContent>
          </Card>
        )}

        {stage === 'code_sent' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enter your verification code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-medium-gray">
                A 6-digit code has been sent to the email address on file. It expires in 10 minutes.
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input id="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
              </div>
              <Button onClick={verifyCode} disabled={busy || code.length < 6} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify code
              </Button>
              <Button variant="ghost" onClick={requestCode} disabled={busy} className="w-full text-xs">
                Didn't get a code? Send another
              </Button>
            </CardContent>
          </Card>
        )}

        {stage === 'verified' && requestInfo && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" /> {requestInfo.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">Regarding:</span> {requestInfo.patientLabel}</p>
                {requestInfo.description && <p className="text-medium-gray">{requestInfo.description}</p>}
                {requestInfo.deadlineAt && <p className="text-medium-gray">Requested by: {new Date(requestInfo.deadlineAt).toLocaleDateString()}</p>}
              </CardContent>
            </Card>

            {sharedDocs.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Shared with you</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {sharedDocs.map((doc) => (
                    <div key={doc.document_id} className="flex items-center justify-between gap-2 border rounded-md p-2">
                      <span className="text-sm truncate">{doc.original_filename}</span>
                      <Button size="sm" variant="outline" onClick={() => downloadDocument(doc.document_id, doc.original_filename)}>
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!submitted && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-5 w-5" /> Upload a document</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>Document type</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="file">File (PDF, Word, Excel, CSV, text, or image — up to 25 MB)</Label>
                    <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <Button onClick={uploadFile} disabled={busy || !file} className="w-full">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Upload
                  </Button>
                </CardContent>
              </Card>
            )}

            {!submitted ? (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="h-5 w-5" /> Respond</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea placeholder="Optional note for the care team..." value={responseText} onChange={(e) => setResponseText(e.target.value)} rows={4} />
                  <Button onClick={submitResponse} disabled={busy} className="w-full">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Submit response
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-4 text-sm text-green-800">
                  Thank you — your response has been submitted to the care team.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
