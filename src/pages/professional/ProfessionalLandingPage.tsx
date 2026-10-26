import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';

/** Enterprise-only public homepage; authorization remains server-enforced. */
export default function ProfessionalLandingPage() {
  const offices = [
    ['Director', 'Organization oversight and licensing'],
    ['Caregiver', 'Care coordination and reporting'],
    ['Medical', 'Authorized clinical workflows'],
    ['Therapy', 'Authorized therapy workflows'],
    ['Patient', 'Private patient experience'],
  ];

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-[#292c29]">
      <header className="border-b border-[#ddd7cb] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <a href="/" className="text-lg font-bold">My Memoria <span className="text-[#8d653f]">Professional</span></a>
          <a href="/Professional" className="rounded-lg border border-[#a68c72] px-4 py-2 text-sm font-semibold hover:bg-[#f7f4ee]">Professional Sign In</a>
        </div>
      </header>
      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#8d653f]">Enterprise care coordination</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">One professional workspace. Coordinated care across your organization.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#5b605b]">A dedicated platform for organization leadership, caregivers, medical professionals, therapists, and patients. Access depends on approved organization membership, licensing, and patient assignments.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/Professional/Register" className="inline-flex items-center gap-2 rounded-xl bg-[#785738] px-6 py-3 font-semibold text-white hover:bg-[#62462d]">Apply for an organization <ArrowRight size={18} aria-hidden="true" /></a>
              <a href="/Professional" className="rounded-xl border border-[#b8aa99] px-6 py-3 font-semibold hover:bg-white">Access your office</a>
            </div>
          </div>
          <div className="rounded-3xl border border-[#dfd8cc] bg-white p-7 shadow-xl shadow-black/5">
            <div className="mb-6 flex items-center gap-3"><Building2 className="text-[#785738]" aria-hidden="true" /><h2 className="text-xl font-bold">Five connected offices</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {offices.map(([name, description]) => (
                <div key={name} className="rounded-xl border border-[#e7e1d7] bg-[#faf8f4] p-4">
                  <h3 className="font-bold">{name}</h3>
                  <p className="mt-1 text-sm text-[#5b605b]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="border-t border-[#ddd7cb] bg-white px-5 py-12">
          <div className="mx-auto flex max-w-6xl items-start gap-4">
            <ShieldCheck className="mt-1 shrink-0 text-[#785738]" aria-hidden="true" />
            <div><h2 className="font-bold">Controlled access</h2><p className="mt-2 text-sm text-[#5b605b]">Only authorized members can enter licensed offices and view assigned patient information.</p></div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#ddd7cb] px-5 py-7 text-center text-sm text-[#626660]">My Memoria Professional · Enterprise access requires approval.</footer>
    </div>
  );
}
