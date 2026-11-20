import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import HaneenAssistantPanel from '@/components/ai/HaneenAssistantPanel';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface OfficePatient {
  patientId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
}

export default function OfficeHeaderTools({ role, orgId, patients, onOpenPatient }: {
  role: 'director' | 'caregiver';
  orgId: string;
  patients: OfficePatient[];
  onOpenPatient: (patientId: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const caregiver = role === 'caregiver';
  const searchLabel = caregiver ? 'Search assigned patients' : 'Search organization patients';
  const assistantLabel = caregiver ? 'Caregiver Helper' : 'Director’s Assistant';
  const term = query.trim().toLowerCase();
  const matchingPatients = term ? patients.filter(patient =>
    [patient.firstName, patient.lastName, patient.preferredName, patient.patientId]
      .some(value => value?.toLowerCase().includes(term))
  ) : [];

  return (
    <>
      <Dialog open={searchOpen} onOpenChange={open => {
        setSearchOpen(open);
        if (!open) setQuery('');
      }}>
        <DialogTrigger className="hcn-office-tool hcn-office-search" aria-label={searchLabel}>
          <Search size={17} aria-hidden="true" />
          <span>Search patients</span>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>{searchLabel}</DialogTitle>
          <DialogDescription className="sr-only">Find a patient and open their information.</DialogDescription>
          <input type="search" aria-label="Patient name or reference" value={query} onChange={event => setQuery(event.target.value)}
            autoComplete="off" placeholder="Search patient name or reference…" className="w-full rounded-lg border border-ent-line bg-ent-panel px-3 py-2.5 text-sm" />
          {term && (
            <div role="region" aria-label="Matching patients" className="max-h-[50vh] overflow-y-auto space-y-2">
              {matchingPatients.length ? matchingPatients.map(patient => (
                <button type="button" key={patient.patientId} onClick={() => {
                  onOpenPatient(patient.patientId);
                  setSearchOpen(false);
                  setQuery('');
                }} className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-ent-line p-3 text-left text-sm hover:bg-ent-pale">
                  <span className="min-w-0 break-words">{patient.preferredName || `${patient.firstName} ${patient.lastName}`}</span>
                  <span className="text-sm font-semibold text-ent-forest">Open Patient Information →</span>
                </button>
              )) : <p className="text-sm text-ent-muted">No patient matches this search.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger className="hcn-office-tool" aria-label={assistantLabel}>
          <Sparkles size={17} aria-hidden="true" />
          <span>{assistantLabel}</span>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>{assistantLabel}</DialogTitle>
          <DialogDescription className="sr-only">Ask about scheduling and care operations.</DialogDescription>
          <HaneenAssistantPanel role={role} organizationId={orgId} showHeading={false}
            patients={caregiver ? patients.map(patient => ({
              id: patient.patientId,
              name: patient.preferredName || `${patient.firstName} ${patient.lastName}`,
            })) : undefined}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

