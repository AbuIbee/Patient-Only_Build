// MASTER ENTERPRISE IDENTITY DIRECTIVE §3 — exact required copy, and
// §3.1's mandatory residential separation: the prior round's "Looking
// for the residential My Memoria Ally app? Go to the patient & family
// app →" cross-link is REMOVED entirely, with no replacement — "do not
// show an unrestricted account creation mechanism," "remove Enterprise
// frontend navigation, promotional links, and signup redirects into the
// separate patient-and-family application." SignInForm's own built-in
// "Need a new account? Create account →" link is reused but repointed
// (via onBack) to /Professional/Register instead of the residential
// signup flow it leads to in its original LoginPage.tsx context — so
// there is no path out of this page back into the residential product
// at all, not even through that pre-existing control.
//
// Reuses LoginPage.tsx's own exported SignInForm verbatim for the
// actual authentication logic (Supabase Auth, must_change_password
// gate, SET_USER dispatch) — "use the existing supported Supabase Auth
// integration... do not build new credential storage... do not create a
// separate user identity for each office." Only the surrounding page
// chrome (header, background, card) is new, carrying the forest-green/
// cream/white/amber design language §11 requires.
import { Sparkles } from 'lucide-react';
import { SignInForm } from '@/pages/common/LoginPage';

export default function ProfessionalLoginPage() {
  return (
    <div className="min-h-screen bg-ent-bg flex flex-col">
      <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-ent-forest" />
          </div>
          <div>
            <div className="font-bold text-ent-ink text-sm leading-tight">Haneen Care Network</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">PROFESSIONAL WORKSPACE</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-ent-ink">Sign in to your workspace</h1>
            <p className="text-sm text-ent-muted mt-1">
              For Directors, Caregivers, Medical Professionals, Therapists, and Enterprise-covered patients.
            </p>
          </div>
          <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7">
            <SignInForm
              onBack={() => { window.history.pushState({}, '', '/Professional/Register'); window.location.reload(); }}
              onSuccess={() => { /* AppContext state drives the redirect via ProfessionalOfficeResolver. */ }}
            />
          </div>
          <p className="text-center text-sm text-ent-muted mt-4">
            Need a new professional account?{' '}
            <a href="/Professional/Register" className="font-semibold text-ent-bronze hover:underline">Create Enterprise account →</a>
          </p>
        </div>
      </main>
    </div>
  );
}
