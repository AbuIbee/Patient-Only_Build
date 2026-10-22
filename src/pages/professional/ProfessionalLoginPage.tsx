// P1 CORRECTIVE ORDER §4 — "a distinct, professionally branded sign-in
// experience using the approved Enterprise visual system." Reuses
// LoginPage.tsx's own exported SignInForm verbatim for the actual
// authentication logic (Supabase Auth, must_change_password gate,
// SET_USER dispatch) — "use the existing supported Supabase Auth
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
            <div className="font-bold text-ent-ink text-sm leading-tight">My Memoria Ally</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">PROFESSIONAL WORKSPACE</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-ent-ink">Sign in to your workspace</h1>
            <p className="text-sm text-ent-muted mt-1">
              For Directors, Enterprise Caregivers, Medical Professionals, Therapists, and Enterprise-covered patients.
            </p>
          </div>
          <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7">
            <SignInForm onBack={() => { window.location.href = '/'; }} onSuccess={() => { /* AppContext state drives the redirect via ProfessionalOfficeResolver. */ }} />
          </div>
          <p className="text-center text-xs text-ent-muted mt-4">
            Looking for the residential My Memoria Ally app? <a href="/" className="font-semibold text-ent-bronze hover:underline">Go to the patient &amp; family app →</a>
          </p>
        </div>
      </main>
    </div>
  );
}
