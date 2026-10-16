// MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 2.1 — explicit
// restriction for a reachable nav item that has no dedicated fictional
// demonstration content built for it yet (Mood, Patient Intake, Emergency
// Contact). Per that closure order's own instruction: "Either provide
// appropriate fictional demonstration presentation or explicitly restrict
// an unsupported route with a clear explanation." Building a full
// synthetic Mood history/chart and a fictional multi-step Intake form was
// judged lower-value than a clear, honest "not included in this
// demonstration" message for THIS batch — this keeps the Temporary
// experience fully isolated (no real query is ever attempted for these
// three views) rather than showing a confusing empty/broken screen. No
// '@/lib/supabase' import, same guarantee as the other Temp-demo views.
import { Sparkles } from 'lucide-react';

export function TempDemoUnavailable({ featureLabel }: { featureLabel: string }) {
  return (
    <div className="min-h-[55vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border-2 border-dashed border-amber-300 rounded-3xl shadow-card p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-charcoal">{featureLabel} isn't part of this demonstration</h2>
        <p className="text-medium-gray">
          This is a 72-hour read-only demonstration account. {featureLabel} is one of the real app's features, but a
          fictional sample version of it hasn't been built for this demonstration yet — so rather than show you an
          empty or broken screen, we're telling you plainly: it isn't available here.
        </p>
        <p className="text-sm text-medium-gray">
          The Medications, Media, and Documents sections show full fictional sample content instead.
        </p>
      </div>
    </div>
  );
}
