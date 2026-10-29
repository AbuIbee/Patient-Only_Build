// HCN: configurable specialist category is an organization membership,
// not a clinical role. This office deliberately performs NO patient queries
// and grants NO clinical authoring capability. Clinical access requires a
// separately verified profession-specific entitlement and patient assignment.
import { ShieldCheck, Building2, FileCheck2 } from 'lucide-react';

interface OtherSpecialistOfficeProps {
  organizationName: string;
}

export default function OtherSpecialistOffice({ organizationName }: OtherSpecialistOfficeProps) {
  return (
    <main className="min-h-screen bg-ent-bg px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-ent-line bg-ent-panel p-6 shadow-sm">
        <header className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-1 h-7 w-7 shrink-0 text-ent-forest" />
          <div>
            <h1 className="text-2xl font-semibold text-ent-forest">Other Specialist Office</h1>
            <p className="mt-1 text-sm text-ent-muted">Your organization-scoped specialist workspace</p>
          </div>
        </header>
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-ent-line p-4">
          <Building2 aria-hidden="true" className="h-5 w-5 shrink-0 text-ent-bronze" />
          <div>
            <p className="text-sm font-semibold text-ent-forest">Organization</p>
            <p className="mt-1 text-sm text-ent-muted">{organizationName}</p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-ent-line p-4">
          <FileCheck2 aria-hidden="true" className="h-5 w-5 shrink-0 text-ent-bronze" />
          <div>
            <h2 className="text-sm font-semibold text-ent-forest">Clinical access requires separate authorization</h2>
            <p className="mt-2 text-sm text-ent-muted">
              Other Specialist membership alone never grants access to patient records,
              clinical messaging, medical orders, or chart editing. Your organization
              must establish the profession-specific permissions, credential review,
              and patient-specific assignments before those workflows become available.
            </p>
            <p className="mt-2 text-sm text-ent-muted">
              Contact your Organization Director if your specialty requires additional access.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
