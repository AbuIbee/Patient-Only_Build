import { ArrowRight, Building2, HeartHandshake, HeartPulse, ShieldCheck, Stethoscope, CalendarCheck, Users } from 'lucide-react';

/**
 * The public home page is enabled ONLY on the dedicated enterprise Vercel site.
 * It must not change the residential My Memoria Ally landing experience.
 * All application and sign-in links retain their existing authorized routes.
 */
export default function ProfessionalLandingPage() {
  const capabilities = [
    { icon: Building2, label: 'Organizations', description: 'Director-led licensing, staff management, and oversight.' },
    { icon: Users, label: 'Caregivers', description: 'Assigned patient care, documentation, and coordination.' },
    { icon: Stethoscope, label: 'Specialists', description: 'Credential-verified access within licensed specialist offices.' },
    { icon: HeartPulse, label: 'Patients', description: 'A private care experience with assigned clinical teams.' },
  ];

  return (
    <div className="min-h-screen bg-[#f5faff] text-[#081c3e]">
      <header className="sticky top-0 z-40 border-b border-[#d3e4ef] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-7 sm:py-4">
          <a href="/" aria-label="Haneen Care Network home" className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#c28a1d] bg-[#081c3e] font-serif text-[32px] font-bold leading-none text-[#e8ba4c] shadow-sm">H</span>
            <span className="min-w-0">
              <span className="block truncate font-serif text-lg font-bold tracking-[0.04em] text-[#081c3e] sm:text-xl">HANEEN</span>
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#08779d] sm:text-[10px]">CARE NETWORK</span>
            </span>
          </a>
          <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-2 sm:gap-4">
            <a href="#network" className="hidden text-sm font-semibold text-[#344d67] transition-colors hover:text-[#08779d] sm:inline">How it works</a>
            <a href="/Professional" className="rounded-xl border border-[#08779d] bg-white px-3 py-2.5 text-xs font-bold text-[#075c7b] transition-colors hover:bg-[#e8f6fc] sm:px-5 sm:text-sm">Sign in</a>
            <a href="/Professional/Register" className="hidden rounded-xl bg-[#081c3e] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#123a65] md:inline">Apply now</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-white via-[#f5faff] to-[#dbeffc]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-4 h-[480px] w-[480px] rounded-full border-[90px] border-[#a9ddf2]/25" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-14 sm:px-7 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-24 lg:pt-24">
            <div className="max-w-2xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cfe5f3] bg-white/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#08779d]">
                <HeartHandshake className="h-4 w-4" aria-hidden="true" /> Connected care for every organization
              </p>
              <h1 className="font-serif text-4xl font-bold leading-[1.13] tracking-tight text-[#081c3e] sm:text-5xl lg:text-[3.55rem]">
                Where Compassion <span className="text-[#b77a09]">Connects</span> Care.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-[#344d67]">
                Haneen Care Network brings organizations, caregivers, patients, and authorized healthcare specialists together in one connected care platform.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#536a82]">
                Give your team the tools to coordinate the right care with clear assignments, dependable communication, and access controlled by your organization's approved license.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="/Professional/Register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#081c3e] px-6 py-3 font-bold text-white shadow-md transition-colors hover:bg-[#123a65]">
                  Apply for an organization <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </a>
                <a href="/Professional" className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-[#0b6689] bg-white px-6 py-3 font-bold text-[#075c7b] transition-colors hover:bg-[#eaf6fd]">
                  Access your workspace
                </a>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[560px]">
              <div className="overflow-hidden rounded-[2rem] border border-[#bbd9ea] bg-white p-5 shadow-[0_24px_68px_rgba(8,28,62,0.12)] sm:p-8">
                <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#081c3e] via-[#123a65] to-[#0a6388] px-6 pb-8 pt-10 text-center text-white sm:px-9">
                  <div aria-hidden="true" className="absolute -left-12 -top-16 h-60 w-60 rounded-full border-[2px] border-[#eac06a]/35" />
                  <div aria-hidden="true" className="absolute -bottom-28 -right-12 h-72 w-72 rounded-full border-[2px] border-[#bbebfb]/35" />
                  <div aria-hidden="true" className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-3xl border-2 border-[#e4b653] bg-[#07162f] shadow-[0_8px_34px_rgba(0,0,0,0.26)]">
                    <span className="font-serif text-[115px] font-bold leading-none text-[#e4b653]">H</span>
                  </div>
                  <p className="relative mt-6 font-serif text-4xl font-bold tracking-[0.1em] text-white">HANEEN</p>
                  <p className="relative mt-2 text-sm font-bold uppercase tracking-[0.27em] text-[#a9e1f2]">Care Network</p>
                  <p className="relative mt-6 font-serif text-lg italic text-white">Where Compassion <span className="text-[#e8ba4c]">Connects</span> Care.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-5 text-center text-xs font-semibold text-[#284965] sm:grid-cols-4">
                  <div className="flex flex-col items-center gap-1.5"><Building2 className="h-5 w-5 text-[#08779d]" aria-hidden="true" />Organizations</div>
                  <div className="flex flex-col items-center gap-1.5"><HeartHandshake className="h-5 w-5 text-[#08779d]" aria-hidden="true" />Caregivers</div>
                  <div className="flex flex-col items-center gap-1.5"><HeartPulse className="h-5 w-5 text-[#08779d]" aria-hidden="true" />Patients</div>
                  <div className="flex flex-col items-center gap-1.5"><Stethoscope className="h-5 w-5 text-[#08779d]" aria-hidden="true" />Specialists</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="network" className="border-t border-[#d3e4ef] bg-white px-5 py-16 sm:px-7 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#08779d]">Built for coordinated care</p>
              <h2 className="mt-3 font-serif text-3xl font-bold text-[#081c3e] sm:text-4xl">One network. The right access for every role.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#536a82]">Access follows your organization's active license, verified roles, and assigned patients. Not every specialist office is available in every package.</p>
            </div>
            <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(({ icon: Icon, label, description }) => (
                <article key={label} className="rounded-2xl border border-[#d3e4ef] bg-[#f9fcff] p-6 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e3f4fb]"><Icon className="h-6 w-6 text-[#08779d]" aria-hidden="true" /></div>
                  <h3 className="mt-5 text-lg font-bold text-[#081c3e]">{label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#536a82]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="border-t border-[#d3e4ef] bg-[#f5faff] px-5 py-12 sm:px-7">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e4f3fa]"><ShieldCheck className="h-6 w-6 text-[#08779d]" aria-hidden="true" /></div>
            <div className="flex-1">
              <h2 className="font-bold text-[#081c3e]">Care access requires authorization</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#536a82]">Licensing, office eligibility, professional credentials, and patient assignments are verified before protected information is available.</p>
            </div>
            <CalendarCheck className="hidden h-8 w-8 text-[#b77a09] sm:block" aria-hidden="true" />
          </div>
        </section>
      </main>
      <footer className="border-t border-[#d3e4ef] bg-white px-5 py-8 text-center text-xs leading-relaxed text-[#647c94] sm:px-7">
        <span className="font-bold text-[#081c3e]">Haneen Care Network</span> · Where Compassion Connects Care. · Professional access is subject to approval.
      </footer>
    </div>
  );
}
