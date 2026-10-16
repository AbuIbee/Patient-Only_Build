// REPAIR 008 / REPAIR A — Temporary (72-hour demo) account's Medication
// Management view.
//
// Deliberately NOT a mode flag inside the real PatientMedications.tsx.
// This file imports nothing from '@/lib/supabase' and calls no
// network-bound function anywhere — there is no code path in this
// component capable of reading or writing a real table, which is the
// actual guarantee behind requirement 4/8, not merely a UI choice layered
// on top of a component that otherwise could. PatientLayout.tsx renders
// this INSTEAD OF PatientMedications.tsx for a confirmed Temporary
// session (see useSubscription().isTempUserDemo — the trusted,
// non-email-derived signal); the real component is never mounted at all
// for that session, so its own Supabase calls never execute either.
import { Pill, Clock, Info, Plus, Droplets, Sticker } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { DEMO_MEDICATIONS, DEMO_DISABLED_MESSAGE, type DemoMedication } from '@/lib/tempDemoData';
import { TempDemoBanner } from './TempDemoBanner';

const FORM_ICON: Record<DemoMedication['form'], React.ElementType> = {
  pill: Pill, liquid: Droplets, injection: Pill, patch: Sticker, inhaler: Pill,
};

export default function TempDemoMedications() {
  const blocked = () => toast.message(DEMO_DISABLED_MESSAGE);

  return (
    <div className="space-y-5 max-w-2xl">
      <TempDemoBanner featureLabel="Medications" />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">My Medications</h2>
          <p className="text-sm text-medium-gray mt-0.5">{DEMO_MEDICATIONS.length} sample medications (fictional)</p>
        </div>
        <button onClick={blocked}
          className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/40 text-medium-gray rounded-xl font-medium text-sm cursor-not-allowed">
          <Plus className="w-4 h-4" /> Add Med
        </button>
      </div>

      <div className="space-y-2">
        {DEMO_MEDICATIONS.map(med => {
          const FormIcon = FORM_ICON[med.form];
          return (
            <Card key={med.id} className="p-4 border-0 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-warm-bronze/60 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FormIcon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-charcoal">{med.name}</p>
                  <p className="text-sm text-medium-gray">{med.dosage}</p>
                  <p className="text-xs text-medium-gray">Dr. {med.prescribedBy}</p>
                  <p className="text-xs text-medium-gray flex items-center gap-1 mt-1">
                    <Info className="w-3 h-3" />{med.instructions}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {med.times.map(t => (
                      <span key={t} className="text-xs bg-soft-taupe/30 text-medium-gray px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" />{t}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={blocked}
                  className="text-xs px-2 py-1 rounded-lg text-medium-gray bg-soft-taupe/30 cursor-not-allowed font-medium">
                  Demo only
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
