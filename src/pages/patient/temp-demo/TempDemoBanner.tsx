// REPAIR 008 / REPAIR A requirement 3: "Display a prominent indication
// that the content is a demonstration." This is intentionally more
// prominent, and worded differently, than the existing amber
// ReadOnlyBanner (src/components/TempUserGuard.tsx) — that banner says
// access is read-only; this one additionally says the CONTENT ITSELF is
// not real. Both render together (PatientLayout.tsx keeps the existing
// ReadOnlyBanner mounted app-wide for Temp accounts; this banner is
// rendered a second time, inline, at the top of each of the three
// Temp-demo views specifically) because a user who lands directly on a
// deep-linked view should see this warning without having to notice a
// slim top-of-page strip first.
import { Sparkles } from 'lucide-react';

export function TempDemoBanner({ featureLabel }: { featureLabel: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-amber-900">Demonstration {featureLabel} — not real data</p>
        <p className="text-sm text-amber-800 mt-0.5">
          Everything below is fictional sample content shown only to demonstrate what {featureLabel.toLowerCase()} looks like.
          Nothing here belongs to a real patient, and nothing you do on this screen is saved.
        </p>
      </div>
    </div>
  );
}
