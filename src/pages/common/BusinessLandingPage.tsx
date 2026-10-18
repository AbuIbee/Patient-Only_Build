// OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase C: a separate
// commercial landing route (/business), structured so it can later support
// a dedicated domain/subdomain without further restructuring (it is a
// self-contained page component with its own copy — nothing here assumes
// it is served from the same host as the residential site).
//
// Item 4 is the binding constraint on every line of copy below: "Do not
// represent organization workspaces, multi-patient management, or
// commercial billing as available if not implemented." Multi-patient
// caregiver management (one caregiver, several linked patients) IS real
// and already shipped (CaregiverPortal.tsx) — described as such. A
// multi-SEAT organization workspace (several staff accounts sharing one
// organization's patients, roles, and billing) is NOT implemented anywhere
// in this codebase — described only as a direction being explored, never
// as available today. Enterprise Therapist / Enterprise Integrated Care
// are named as CONCEPTS per the owner's own item 3, not shipped tiers.
// Pricing is deliberately NOT shown as a public number (item 3: "pricing
// only after approved") — the CTA is a contact/sign-up path, not a price.
import { useApp } from '@/store/useApp';
import {
  Building2, Users, ShieldCheck, Stethoscope, Network,
  ArrowRight, CheckCircle2, Mail,
} from 'lucide-react';
import { motion } from 'framer-motion';

const CONCEPTS = [
  {
    icon: Stethoscope,
    title: 'Enterprise Therapist',
    description:
      'A concept we are exploring with care teams: a therapist-facing view across the patients they support, built on the same Care Partner data caregivers already record — not yet available.',
  },
  {
    icon: Network,
    title: 'Enterprise Integrated Care',
    description:
      'A concept for connecting caregiver, clinical, and facility workflows into one coordinated record — not yet available. We are gathering interest before building it.',
  },
];

const AVAILABLE_TODAY = [
  'A caregiver account that registers and manages multiple patients directly (no administrator approval required)',
  'Each patient gets their own secure, private account and daily experience',
  'Full Daily Care and Full Support entitlements, same as the residential product',
];

const NOT_YET_AVAILABLE = [
  'A shared organization workspace with multiple staff logins',
  'Role-based access across a care organization (e.g. supervisor vs. front-line staff)',
  'Consolidated organization-level billing or invoicing',
];

export default function BusinessLandingPage() {
  const { dispatch } = useApp();

  const goToCaregiverSignIn = () => {
    dispatch({ type: 'SET_VIEW', payload: 'login' });
  };

  return (
    <div className="min-h-screen bg-warm-ivory">
      <header className="bg-white border-b border-soft-taupe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-9 h-9 rounded-xl object-cover" />
            <div>
              <span className="font-bold text-charcoal">My Memoria Ally</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-warm-bronze">For Organizations</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-medium-gray hover:text-charcoal font-medium hidden sm:inline">
              Residential site
            </a>
            <button
              onClick={goToCaregiverSignIn}
              className="bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Caregiver Sign In
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-16">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="text-center space-y-5"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-warm-bronze/10 text-warm-bronze rounded-full text-xs font-bold uppercase tracking-wide">
            <Building2 className="w-3.5 h-3.5" /> Built for Care Organizations
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-charcoal max-w-2xl mx-auto leading-tight">
            Register and support every patient your organization cares for
          </h1>
          <p className="text-medium-gray max-w-xl mx-auto">
            One caregiver account can register and manage multiple patients today, each with
            their own private, secure experience. We're also exploring deeper organization and
            clinical-team tools — see below for what's ready now and what's still in progress.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={goToCaregiverSignIn}
              className="flex items-center gap-2 bg-warm-bronze hover:bg-deep-bronze text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-md"
            >
              Create a Caregiver Account <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.section>

        {/* Available today vs not yet — the honesty-critical section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-soft-sage/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-soft-sage">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="font-bold text-charcoal">Available today</h2>
            </div>
            <ul className="space-y-2.5">
              {AVAILABLE_TODAY.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-charcoal">
                  <CheckCircle2 className="w-4 h-4 text-soft-sage flex-shrink-0 mt-0.5" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white border border-soft-taupe rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-medium-gray">
              <Users className="w-5 h-5" />
              <h2 className="font-bold text-charcoal">Not yet available</h2>
            </div>
            <ul className="space-y-2.5">
              {NOT_YET_AVAILABLE.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-medium-gray">
                  <span className="w-4 h-4 rounded-full border-2 border-soft-taupe flex-shrink-0 mt-0.5" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="text-xs text-medium-gray italic">
              If your organization needs these, tell us below — they shape what we build next.
            </p>
          </div>
        </section>

        {/* Concepts being explored */}
        <section className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-charcoal">What we're exploring next</h2>
            <p className="text-medium-gray text-sm mt-1">Concepts under consideration — not shipped, not priced yet.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {CONCEPTS.map((c) => (
              <div key={c.title} className="bg-white border border-soft-taupe rounded-2xl p-6 space-y-3">
                <div className="w-11 h-11 rounded-xl bg-warm-bronze/10 flex items-center justify-center">
                  <c.icon className="w-5 h-5 text-warm-bronze" />
                </div>
                <h3 className="font-bold text-charcoal">{c.title}</h3>
                <p className="text-sm text-medium-gray leading-relaxed">{c.description}</p>
                <span className="inline-block text-[11px] font-bold uppercase tracking-wide text-soft-taupe bg-soft-taupe/20 px-2 py-0.5 rounded-full">
                  Concept — not yet available
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing — contact path, not a public number (item 3) */}
        <section className="bg-charcoal text-white rounded-2xl p-8 sm:p-10 text-center space-y-4">
          <ShieldCheck className="w-8 h-8 mx-auto text-warm-bronze" />
          <h2 className="text-2xl font-bold">Organization pricing, by conversation</h2>
          <p className="text-white/70 max-w-lg mx-auto text-sm">
            Residential Daily Care and Full Support pricing is published on our main site.
            Organization-level licensing is confirmed with your account team before anything is
            billed — nothing here reflects a final commercial price.
          </p>
          <a
            href="mailto:hello@mymemoriaally.com"
            className="inline-flex items-center gap-2 bg-white text-charcoal font-semibold px-6 py-3 rounded-xl hover:bg-warm-ivory transition-colors"
          >
            <Mail className="w-4 h-4" /> Talk to our team
          </a>
        </section>

        <p className="text-center text-xs text-medium-gray">
          Registering on behalf of a single patient or family member?{' '}
          <a href="/" className="text-warm-bronze font-semibold hover:underline">Visit the residential site</a> instead.
        </p>
      </main>
    </div>
  );
}
