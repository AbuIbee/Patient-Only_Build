import {
  Activity, ArrowRight, ArrowUpRight, Building2, CalendarDays, Check,
  ChevronDown, ClipboardCheck, ClipboardList, FileText, HeartHandshake,
  HeartPulse, LockKeyhole, MessageSquareText, ShieldCheck, Stethoscope,
  UserRoundCheck, Users, Workflow,
} from 'lucide-react';

/**
 * Public enterprise marketing page only. Shared patient landing stays intact.
 * Office links are entry points, not authorization grants: the existing
 * ProfessionalOfficeResolver independently enforces membership, entitlements
 * and patient access after sign-in.
 */
const offices = [
  {
    number: '01', name: 'Director & Administration', short: 'Director', icon: Building2,
    href: '/Professional/Admin',
    benefit: 'Run the organization, not just individual tasks.',
    detail: 'Oversee your organization, staff, patient coverage, assignments, licensing, reporting, billing and operational activity from one leadership workspace.',
    tags: ['Staff & offices', 'Licensing', 'Oversight'],
  },
  {
    number: '02', name: 'Caregiver', short: 'Caregiver', icon: HeartHandshake,
    href: '/Professional/Caregiver',
    benefit: 'Keep everyday care organized and accountable.',
    detail: 'Work with assigned patients, care plans, visits, tasks, documentation, handoffs, alerts and care-team conversations in a dedicated caregiver workspace.',
    tags: ['Care plans', 'Visits & tasks', 'Handoffs'],
  },
  {
    number: '03', name: 'Medical Professional', short: 'Medical', icon: Stethoscope,
    href: '/Professional/Medical',
    benefit: 'Relevant clinical information in one place.',
    detail: 'Review authorized patient records, assessments, diagnoses, medications, care documentation, clinical schedules and professional credentials.',
    tags: ['Clinical records', 'Assessments', 'Credentials'],
  },
  {
    number: '04', name: 'Therapy Professional', short: 'Therapy', icon: Activity,
    href: '/Professional/Therapy',
    benefit: 'Connect therapy progress with the wider care plan.',
    detail: 'Access assigned patients, session schedules, documentation, therapy goals, care plans and authorized team conversations.',
    tags: ['Sessions', 'Goals', 'Notes'],
  },
  {
    number: '05', name: 'Patient', short: 'Patient', icon: HeartPulse,
    href: '/Professional/Patient',
    benefit: 'Make personal care easier to follow.',
    detail: 'Use a private, authorized workspace for care plans, tasks, appointments, messages, care-team information and personal documents.',
    tags: ['My care plan', 'Appointments', 'Messages'],
  },
] as const;

const businessBenefits = [
  {
    icon: ClipboardList, challenge: 'Information spread across many places',
    result: 'A clearer shared care record',
    description: 'Care plans, patient records, notes and scheduled activity are organized around the people authorized to work with them.',
  },
  {
    icon: MessageSquareText, challenge: 'Missed updates and disconnected handoffs',
    result: 'Communication connected to care',
    description: 'Make care-team conversations, handoffs, incidents and follow-ups part of the workflow rather than isolated messages.',
  },
  {
    icon: CalendarDays, challenge: 'Separate schedules and competing priorities',
    result: 'Coordinated operational work',
    description: 'Give teams structured views of visits, appointments, assignments and documentation relevant to their responsibilities.',
  },
  {
    icon: ShieldCheck, challenge: 'Unclear boundaries around patient information',
    result: 'Purpose-built, role-based access',
    description: 'Separate offices and restrict access according to active organization membership, licensed entitlements and patient assignment.',
  },
] as const;

const audiences = [
  {
    title: 'Care organizations & agency owners', icon: Building2,
    description: 'For organizations overseeing multiple patients, staff, locations, professional roles, licensing and daily operations.',
  },
  {
    title: 'Caregivers & care coordinators', icon: HeartHandshake,
    description: 'For those coordinating everyday care, appointments, visits, tasks, documentation and important handoffs.',
  },
  {
    title: 'Approved clinicians & therapists', icon: Stethoscope,
    description: 'For credential-verified professionals working within licensed specialist offices and their authorized patient assignments.',
  },
  {
    title: 'Patients & participating care teams', icon: HeartPulse,
    description: 'For people receiving care through an organization that gives them access to their own patient workspace.',
  },
] as const;

const onboarding = [
  { number: '01', title: 'Apply', text: 'Register a professional account and submit an organization application with your requested package.' },
  { number: '02', title: 'Review', text: 'The Platform Owner reviews the application, requested office eligibility and any needed corrections.' },
  { number: '03', title: 'Activate', text: 'If approved, complete the applicable agreement and billing steps before your license becomes active.' },
  { number: '04', title: 'Set up teams', text: 'A provisioned Director configures staff, patient coverage, assignments and eligible specialist offices.' },
  { number: '05', title: 'Coordinate care', text: 'Authorized members use their own professional offices to perform their assigned care responsibilities.' },
] as const;

const faq = [
  {
    q: 'What exactly does Haneen Care Network do?',
    a: 'It provides one organizational platform for leadership oversight, patient assignments, care documentation, scheduling, professional collaboration and patient participation. Each role works from an office designed around its responsibilities.',
  },
  {
    q: 'Does every organization get all five offices?',
    a: 'Five office types are supported, but a license determines which specialist offices are available. The base organizational experience includes administration, caregivers and patients; approved specialist slots depend on package entitlements and credential verification.',
  },
  {
    q: 'Can any person open any office or patient record?',
    a: 'No. An office link is only a sign-in entry. The application verifies the relevant organization membership, entitlement, professional eligibility and patient assignment or coverage before granting access.',
  },
  {
    q: 'Where can authorized users access the platform?',
    a: 'The professional platform is web-based and designed for supported desktop, tablet and mobile browsers with an internet connection. Access requires a valid account and applicable authorization.',
  },
  {
    q: 'When can our organization begin using it?',
    a: 'After application approval, applicable agreements and billing, license activation and setup of the appropriate staff and patient access. Completing a form alone does not activate an office.',
  },
] as const;

const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#081c3e] px-6 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-[#153b64] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a6b90]';
const secondary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#0b6689] bg-white px-6 py-3 text-center text-sm font-bold text-[#075c7b] transition-colors hover:bg-[#e8f6fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a6b90]';

export default function ProfessionalLandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f5faff] font-sans text-[#081c3e]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-[#d0e3f0] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-7">
          <a href="/" aria-label="Haneen Care Network home" className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d6a036] bg-[#081c3e] font-serif text-[30px] font-bold text-[#f0c15d]">H</span>
            <span className="min-w-0 leading-tight">
              <span className="block font-serif text-lg font-bold tracking-[0.05em] sm:text-xl">HANEEN</span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-[#08779d]">Care Network</span>
            </span>
          </a>
          <nav aria-label="Primary navigation" className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a href="#offices" className="hidden text-sm font-semibold text-[#344d67] hover:text-[#0b6689] lg:inline">Five Offices</a>
            <a href="#how-it-works" className="hidden text-sm font-semibold text-[#344d67] hover:text-[#0b6689] lg:inline">How It Works</a>
            <a href="/Professional" className="inline-flex min-h-11 items-center rounded-lg border border-[#0b6689] px-3 py-2 text-center text-xs font-bold text-[#075c7b] hover:bg-[#e8f6fc] sm:px-4 sm:text-sm"><span className="sm:hidden">Sign In</span><span className="hidden sm:inline">Professional Sign In</span></a>
            <a href="/Professional/Register" className="inline-flex min-h-11 items-center rounded-lg bg-[#081c3e] px-3 py-2 text-xs font-bold text-white hover:bg-[#153b64] sm:px-4 sm:text-sm"><span className="sm:hidden">Apply</span><span className="hidden sm:inline">Apply for Organization</span></a>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="relative overflow-hidden bg-gradient-to-b from-[#ebf7ff] via-white to-[#f5faff]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-56 h-[560px] w-[560px] rounded-full border-[85px] border-[#a8dcf5]/25" />
          <div className="relative mx-auto grid max-w-7xl gap-9 px-5 pb-12 pt-12 sm:px-7 sm:pb-16 sm:pt-16 lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:gap-14 lg:py-20">
            <div className="max-w-[660px]">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c4e4f4] bg-white px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#075c7b] sm:px-4 sm:text-xs">
                <Workflow className="h-4 w-4 shrink-0" aria-hidden="true" /> Five connected offices. One care network.
              </p>
              <h1 className="font-serif text-[clamp(2.3rem,5.7vw,4.6rem)] font-bold leading-[1.08] tracking-tight">
                Run your care organization <span className="text-[#0a6b90]">together.</span> Not in pieces.
              </h1>
              <p className="mt-6 max-w-xl text-[17px] font-semibold leading-[1.6] text-[#344d67] sm:text-xl">
                Bring leadership, caregivers, medical professionals, therapists and patients into one connected care platform.
              </p>
              <p className="mt-3 max-w-xl text-[15px] leading-[1.7] text-[#536a82] sm:text-base">
                Organize patient assignments, care plans, visits, documentation, team communication and operational oversight—through the right workspace for each person.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="/Professional/Register" className={primary}>Apply for an Organization <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                <a href="/Professional" className={secondary}>Professional Sign In <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#34556b] sm:text-sm">
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#0b6689]" aria-hidden="true" /> Role-specific offices</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#0b6689]" aria-hidden="true" /> Assigned-patient access</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#0b6689]" aria-hidden="true" /> License-based controls</span>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[540px]">
              <div className="rounded-[26px] border border-[#b9dceb] bg-white p-4 shadow-[0_24px_68px_rgba(8,28,62,0.10)] sm:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0a6b90]">Explore the Network</p>
                    <h2 className="mt-1 font-serif text-xl font-bold sm:text-2xl">Five offices, connected</h2>
                  </div>
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf7fc] text-[#0b6689]"><Workflow className="h-6 w-6" /></span>
                </div>
                <div className="space-y-2">
                  {offices.map(({ number, short, icon: Icon, href, benefit }) => (
                    <a key={number} href={href} className="group flex min-h-[68px] items-center gap-3 rounded-xl border border-[#d7e7f0] bg-[#fbfdff] px-3 py-2.5 transition-colors hover:border-[#0b6689] hover:bg-[#eef8fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b6689] sm:px-4">
                      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e3f4fb] text-[#08779d]"><Icon className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{short} Office</span>
                        <span className="block text-xs leading-relaxed text-[#536a82]">{benefit}</span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#0a6b90] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
                <p className="mt-4 rounded-lg bg-[#eef8fc] px-3 py-2.5 text-xs leading-relaxed text-[#36586b]">
                  <LockKeyhole className="mr-1 inline h-3.5 w-3.5 text-[#0b6689]" aria-hidden="true" />
                  Office access requires the appropriate membership, patient authorization and license.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Core platform value" className="border-y border-[#d5e5ef] bg-[#081c3e] px-5 py-6 text-white sm:px-7">
          <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-3 sm:gap-8">
            <div className="flex items-start gap-3"><Users className="mt-0.5 h-6 w-6 shrink-0 text-[#e8ba4c]" aria-hidden="true" /><div><p className="font-bold">One connected organization</p><p className="mt-1 text-sm text-[#c2d8e7]">People and care activities in context</p></div></div>
            <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#e8ba4c]" aria-hidden="true" /><div><p className="font-bold">Workflows built for care</p><p className="mt-1 text-sm text-[#c2d8e7]">Plans, schedules and documentation</p></div></div>
            <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-6 w-6 shrink-0 text-[#e8ba4c]" aria-hidden="true" /><div><p className="font-bold">The right access for each role</p><p className="mt-1 text-sm text-[#c2d8e7]">Membership, license and patient scope</p></div></div>
          </div>
        </section>

        <section id="offices" className="scroll-mt-24 bg-white px-5 py-16 sm:px-7 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-[790px]">
              <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#08779d]">The Five Connected Offices</p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">Every person has a role. Every role has a place.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#536a82] sm:text-lg">The Director oversees the organization. Caregivers coordinate daily care. Approved medical and therapy professionals work with assigned patients. Patients follow their care journey. Select your office to reach professional sign-in; only authorized accounts can enter.</p>
            </div>
            <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {offices.map(({ number, name, icon: Icon, href, benefit, detail, tags }) => (
                <article key={number} className="group flex h-full flex-col rounded-2xl border border-[#d4e6f0] bg-[#f9fcff] p-6 transition-shadow hover:shadow-[0_10px_28px_rgba(8,28,62,0.08)]">
                  <div className="flex items-start justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e4f3fa] text-[#0b6689]"><Icon className="h-6 w-6" aria-hidden="true" /></span>
                    <span className="font-serif text-2xl font-bold text-[#b77a09]">{number}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-bold">{name} Office</h3>
                  <p className="mt-2 text-sm font-semibold text-[#0b6689]">{benefit}</p>
                  <p className="mt-3 flex-1 text-sm leading-[1.8] text-[#536a82]">{detail}</p>
                  <div className="mt-5 flex flex-wrap gap-2">{tags.map(tag => <span key={tag} className="rounded-full border border-[#d5e7ef] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#36546a]">{tag}</span>)}</div>
                  <a href={href} aria-label={'Access '+name+' Office'} className="mt-6 inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[#0b6689] px-4 py-2.5 text-sm font-bold text-[#075c7b] transition-colors hover:bg-[#e8f6fc]">
                    Access this office <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </article>
              ))}
              <div className="flex flex-col justify-center rounded-2xl bg-[#081c3e] p-6 text-white">
                <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#f1c361]">New Organization?</p>
                <h3 className="mt-3 font-serif text-2xl font-bold">Build your connected care team.</h3>
                <p className="mt-3 flex-1 text-sm leading-[1.8] text-[#d1e0ec]">Start with Director, caregiver and patient workflows, then add approved specialist office capabilities according to your licensed package and credentials.</p>
                <a href="/Professional/Register" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e6b64e] px-5 py-3 text-sm font-bold text-[#071a3a] hover:bg-[#f3cb79]">Apply for an Organization <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
              </div>
            </div>
          </div>
        </section>

        <section id="why-haneen" className="scroll-mt-24 border-y border-[#d6e7ef] bg-[#f3f9fd] px-5 py-16 sm:px-7 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-[820px]">
              <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#08779d]">Why Haneen Care Network?</p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">Care is complicated. Your business tools should help bring it together.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#536a82] sm:text-lg">When information lives in separate tools, staff must keep reconnecting the details. Haneen gives your organization a common structure while respecting the responsibilities of each professional and patient.</p>
            </div>
            <div className="mt-9 grid gap-4 lg:grid-cols-2">
              {businessBenefits.map(({ icon: Icon, challenge, result, description }) => (
                <article key={challenge} className="rounded-2xl border border-[#d7e6ef] bg-white p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e5f3fa] text-[#0b6689]"><Icon className="h-5 w-5" aria-hidden="true" /></div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#687e90]">The problem</p>
                  <p className="mt-1 text-base font-semibold text-[#344d67]">{challenge}</p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#a46d08]">The Haneen approach</p>
                  <h3 className="mt-1 text-lg font-bold">{result}</h3>
                  <p className="mt-2 text-sm leading-[1.8] text-[#536a82]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="who-its-for" className="scroll-mt-24 bg-white px-5 py-16 sm:px-7 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#08779d]">Who We Help</p>
              <h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Built for the people responsible for care.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#536a82] sm:text-lg">A clearer way to work for leadership, frontline caregivers, specialist providers and people receiving care.</p>
            </div>
            <div className="mt-9 grid gap-5 sm:grid-cols-2">
              {audiences.map(({ title, icon: Icon, description }) => (
                <article key={title} className="flex gap-4 rounded-2xl border border-[#d4e6f0] bg-white p-5 sm:p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e4f3fa] text-[#0b6689]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <div><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-[1.8] text-[#536a82]">{description}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y border-[#d2e5ef] bg-[#eef8fd] px-5 py-16 sm:px-7 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#08779d]">How and When to Begin</p>
              <h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">From organization application to connected care.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#536a82] sm:text-lg">Your organization starts with a reviewed application and activated license. The right people and offices are then provisioned under your approved terms.</p>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {onboarding.map(({ number, title, text }) => (
                <li key={number} className="rounded-2xl border border-[#d3e6ef] bg-white p-5">
                  <span className="font-serif text-3xl font-bold text-[#b77a09]">{number}</span>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-[1.8] text-[#536a82]">{text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/Professional/Register" className={primary}>Start an Organization Application <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
              <a href="/Professional" className={secondary}>Already registered? Sign in</a>
            </div>
          </div>
        </section>

        <section id="where-and-when" className="bg-white px-5 py-16 sm:px-7 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#08779d]">Where Care Comes Together</p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">One network across the places your people work.</h2>
              <p className="mt-5 text-base leading-[1.85] text-[#536a82]">Haneen is web-based, with responsive professional workspaces for supported desktop, tablet and mobile browsers. Staff and approved participants can reach their own office using an internet-connected device, subject to access requirements.</p>
              <p className="mt-4 text-base leading-[1.85] text-[#536a82]">Whether you coordinate care from a single organization or several operating locations, the goal is fewer disconnected handoffs and a clearer picture of the work each authorized team member needs to do.</p>
            </div>
            <div className="rounded-3xl border border-[#d6e5ee] bg-[#f5faff] p-6 sm:p-8">
              <h3 className="font-serif text-2xl font-bold">What this means for your business</h3>
              <div className="mt-6 space-y-5">
                <div className="flex gap-3"><UserRoundCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0b6689]" aria-hidden="true" /><div><h4 className="font-bold">Director-level visibility</h4><p className="mt-1 text-sm leading-relaxed text-[#536a82]">Dedicated oversight of staff, patient coverage, licensing and care operations.</p></div></div>
                <div className="flex gap-3"><Workflow className="mt-0.5 h-5 w-5 shrink-0 text-[#0b6689]" aria-hidden="true" /><div><h4 className="font-bold">Five purposeful offices</h4><p className="mt-1 text-sm leading-relaxed text-[#536a82]">A different experience for each role—not the same generic dashboard for everyone.</p></div></div>
                <div className="flex gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#0b6689]" aria-hidden="true" /><div><h4 className="font-bold">Documentation alongside care</h4><p className="mt-1 text-sm leading-relaxed text-[#536a82]">Appointments, visits, notes, plans and communication in appropriate workspaces.</p></div></div>
                <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0b6689]" aria-hidden="true" /><div><h4 className="font-bold">Defined access boundaries</h4><p className="mt-1 text-sm leading-relaxed text-[#536a82]">Professional credentials, licensing and assignments control eligible access.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-[#d5e5ef] bg-[#f3f9fd] px-5 py-16 sm:px-7 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#08779d]">The Practical Details</p>
            <h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Your questions, answered.</h2>
            <div className="mt-8 space-y-3">
              {faq.map(({ q, a }) => (
                <details key={q} className="group rounded-xl border border-[#d5e6ef] bg-white px-5 py-4 open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left text-sm font-bold marker:content-none sm:text-base">
                    {q} <ChevronDown className="h-5 w-5 shrink-0 text-[#0b6689] transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="mt-3 border-t border-[#e2eef4] pt-3 text-sm leading-[1.85] text-[#536a82]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#081c3e] px-5 py-16 text-white sm:px-7 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-[#e8ba4c]">Where Compassion Connects Care.</p>
              <h2 className="mt-4 font-serif text-3xl font-bold leading-tight sm:text-4xl">Your teams deserve more than disconnected tools.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#c8dbe9]">Bring your organization, caregivers, authorized specialists and patients into a connected professional network.</p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row lg:flex-col">
              <a href="/Professional/Register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e8ba4c] px-6 py-3 text-sm font-bold text-[#081c3e] hover:bg-[#f2d084]">Apply for an Organization <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
              <a href="/Professional" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#b2d9e8] px-6 py-3 text-sm font-bold text-white hover:bg-[#164266]">Professional Sign In <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-[#07162e] px-5 py-9 text-white sm:px-7">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 md:flex-row md:items-center">
          <div>
            <a href="/" className="font-serif text-xl font-bold tracking-[0.08em] text-white">HANEEN <span className="text-[#a4def1]">CARE NETWORK</span></a>
            <p className="mt-2 text-sm italic text-[#e8ba4c]">Where Compassion Connects Care.</p>
            <p className="mt-3 max-w-lg text-xs leading-relaxed text-[#bbd3e3]">A connected care platform for organizations, caregivers, patients and authorized healthcare specialists.</p>
          </div>
          <nav aria-label="Footer links" className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-[#d6e4ee]">
            <a href="#offices" className="hover:underline">Five Offices</a>
            <a href="#who-its-for" className="hover:underline">Who We Help</a>
            <a href="#how-it-works" className="hover:underline">How to Apply</a>
            <a href="/Professional" className="hover:underline">Professional Sign In</a>
            <a href="/Professional/Register" className="hover:underline">Apply</a>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-7xl border-t border-[#24435e] pt-6 text-xs leading-relaxed text-[#a8c5d8]">Professional office access depends on application approval, licensing, role and patient authorization. Haneen is not an emergency response service.</p>
      </footer>
    </div>
  );
}
