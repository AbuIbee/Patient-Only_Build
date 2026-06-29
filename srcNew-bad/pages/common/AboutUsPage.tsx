import { Heart, Shield, Users, BarChart3, Building2, Lock, ArrowRight, CheckCircle } from 'lucide-react';

const COMPANY = 'Salahuddeen Enterprises LLC';
const EMAIL = 's.muhammad@salahuddeenenterprises.com';
const APP_URL = 'mymemoriaally.com';

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-14">
      <h2 className="text-2xl font-bold text-charcoal mb-4 pb-3 border-b-2 border-warm-bronze/20">{title}</h2>
      <div className="space-y-4 text-charcoal/80 leading-8 text-base">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 pl-5 border-l-2 border-stone-200">
      <h3 className="font-bold text-charcoal mb-2">{title}</h3>
      <div className="space-y-3 text-charcoal/75 leading-8 text-sm">{children}</div>
    </div>
  );
}

function CalloutBox({
  icon: Icon,
  title,
  children,
  color = 'bronze',
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
  color?: 'bronze' | 'sage' | 'blue' | 'slate';
}) {
  const palette = {
    bronze: { bg: 'bg-warm-bronze/8',  border: 'border-warm-bronze/25', icon: 'text-warm-bronze', title: 'text-warm-bronze'  },
    sage:   { bg: 'bg-emerald-50',      border: 'border-emerald-200',    icon: 'text-emerald-600', title: 'text-emerald-700' },
    blue:   { bg: 'bg-blue-50',         border: 'border-blue-200',       icon: 'text-blue-600',    title: 'text-blue-700'    },
    slate:  { bg: 'bg-slate-50',        border: 'border-slate-200',      icon: 'text-slate-600',   title: 'text-slate-700'   },
  }[color];

  return (
    <div className={'border rounded-2xl p-6 my-6 ' + palette.bg + ' ' + palette.border}>
      <div className="flex items-start gap-4">
        <div className={'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ' + palette.bg + ' ' + palette.border}>
          <Icon className={'w-5 h-5 ' + palette.icon} />
        </div>
        <div>
          <p className={'font-bold text-sm mb-2 uppercase tracking-wide ' + palette.title}>{title}</p>
          <div className="text-charcoal/75 text-sm leading-7">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl px-6 py-5 text-center shadow-sm">
      <p className="text-3xl font-bold text-warm-bronze mb-1">{value}</p>
      <p className="text-xs text-charcoal/60 font-medium leading-snug max-w-[120px] mx-auto">{label}</p>
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-charcoal/75 text-sm leading-7">
          <CheckCircle className="w-4 h-4 text-warm-bronze flex-shrink-0 mt-1" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-stone-50">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
            <div>
              <p className="font-bold text-charcoal leading-tight">My Memoria Ally</p>
              <p className="text-xs text-charcoal/50 leading-tight">About Us</p>
            </div>
          </div>
          <a
            href={'https://' + APP_URL}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm text-warm-bronze hover:underline font-medium"
          >
            ← Back to App
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 md:py-20">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-warm-bronze bg-warm-bronze/10 px-3 py-1.5 rounded-full mb-5">
              About My Memoria Ally
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-charcoal leading-tight mb-6">
              Structured care coordination for people when consistency matters most.
            </h1>
            <p className="text-lg text-charcoal/70 leading-8 mb-8">
                My Memoria Ally was built for the days that blend together — and the people who hold them steady.  
                Whether you are caring for a parent Alzheimer's, Dementia or Parkinson's, a spouse with ALS, a partner with MS, a sibling with Huntington's, or someone needing Hospice care — this is for you.</p>
            <p className="text-lg text-charcoal/70 leading-8 mb-8">
                Here is what too few tools understand: Cognitive changes, physical changes, and mental health changes do not happen in isolation. A poor night's sleep affects everything. A medication side effect can look like depression. Fatigue can mask as withdrawal. My Memoria Ally helps you see the full picture — not just the fragments.</p>
            <p className="text-lg text-charcoal/70 leading-8 mb-8">
                This app does not promise a cure. It does not promise more time. It promises fewer missed doses, fewer forgotten details, fewer moments of panic when a doctor asks, "When did that start?"</p>
            <div className="flex flex-wrap gap-3">
              <a
                href={'https://' + APP_URL}
                className="inline-flex items-center gap-2 bg-warm-bronze hover:bg-warm-bronze/90 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm text-sm"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={'mailto:' + EMAIL}
                className="inline-flex items-center gap-2 border-2 border-warm-bronze/30 hover:border-warm-bronze text-warm-bronze font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
              >
                Contact us
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <div className="bg-warm-bronze/5 border-b border-warm-bronze/15">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatPill value="6+" label="Cognitive conditions supported" />
            <StatPill value="HIPAA" label="Compliant from day one" />
            <StatPill value="3-Role" label="Patient, caregiver & care team" />
            <StatPill value="AES-256" label="Encryption for all health data" />
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16">

        {/* Table of contents */}
        <div className="hidden lg:block bg-white border border-stone-200 rounded-2xl p-5 mb-12 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-charcoal/40 mb-3">On This Page</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              ['#problem',    'The Problem Space'],
              ['#what-we-do', 'What We Do'],
              ['#stability',  'How We Support Stability'],
              ['#broader',    'Broader Application'],
              ['#compliance', 'Compliance & Security'],
              ['#enterprise', 'Enterprise & Facilities'],
              ['#company',    'About the Company'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-warm-bronze hover:underline font-medium">
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* ── 1. Problem Space ───────────────────────────────────────────────── */}
        <Section title="Understanding the Problem Space" id="problem">
          <SubSection title="What Is Dementia and Cognitive Decline">
            <p>Dementia is not a single disease — it is a term describing a decline in cognitive function severe enough to interfere with daily life. It can affect memory, reasoning, language, spatial orientation, and emotional regulation. Individuals experiencing dementia often struggle with recognizing familiar people, recalling recent events, following routines, or understanding where they are and what is happening around them.</p>
            <p>Alzheimer's disease is the most common form, accounting for roughly 60–80% of all dementia cases. Other forms include vascular dementia, Lewy body dementia, and frontotemporal dementia. Each progresses differently, but all share a common outcome: the individual becomes increasingly dependent on their environment and support system to maintain stability and quality of life.</p>
            <p>The challenges addressed by My Memoria Ally, however, extend beyond dementia alone. Similar patterns of disruption occur in individuals experiencing traumatic brain injury (TBI), neurological disorders, aging-related mild cognitive impairment (MCI), anxiety disorders, autism spectrum conditions, ADHD, and disorientation related to medical treatment or medication changes. In all of these cases, the core issue is not simply memory loss — it is <strong>loss of consistency</strong>. When consistency is lost, individuals become dependent on external systems to restore structure.</p>
          </SubSection>

          <SubSection title="The Reality of Care Today">
            <p>In most households and care environments, that external system does not formally exist. Instead, care is managed through a patchwork of methods: handwritten notes, verbal reminders, text messages, shared spreadsheets, and personal memory. Each of these tools serves a limited purpose, but none of them function as a unified system.</p>
            <p>This fragmentation creates dangerous gaps. A medication may be given late or doubled because administration was not recorded. A caregiver may repeat or miss a task because the handoff was unclear. A patient may become anxious or disoriented because their environment does not reinforce familiarity. Over time, these gaps compound, increasing risk and placing growing, unsustainable pressure on caregivers.</p>
            <p>Caregivers compensate through personal effort — longer hours, more reminders, more checking. This works for a time, but it does not scale. It leads to burnout, inconsistency, and a system that is only as reliable as the most tired person in it.</p>
          </SubSection>

          <CalloutBox icon={BarChart3} title="The Scale of the Challenge" color="blue">
            <p>Over 55 million people worldwide live with dementia. In the United States alone, more than 11 million family members and friends provide unpaid care. The vast majority of this care is managed without a structured digital system — relying instead on informal coordination, memory, and improvisation. My Memoria Ally is designed to change that.</p>
          </CalloutBox>
        </Section>

        {/* ── 2. What We Do ──────────────────────────────────────────────────── */}
        <Section title="What My Memoria Ally Is Designed to Do" id="what-we-do">
          <p>My Memoria Ally is not simply a tracking tool or a reminder application. It is a structured care environment that organizes the essential components of daily care into a coherent, repeatable system. At its core, the platform functions as a <strong>daily operational layer for care</strong> — a consistent interface through which patients can orient themselves and caregivers can manage responsibilities without relying on memory or improvised coordination alone.</p>

          <SubSection title="The Patient Experience">
            <p>The patient-facing interface is intentionally simplified and designed to reduce cognitive load. Every element — from the greeting screen to the routine display to the medication reminder — is built around one principle: predictability reduces anxiety. Individuals experiencing cognitive challenges rely heavily on environmental cues and repetition to maintain a sense of stability. The App reinforces time, routine, and familiarity through consistent, calm patterns that feel the same every day.</p>
            <p>Key features supporting patients include: daily orientation with time, date, and personalized greeting; step-by-step routine guidance for morning, afternoon, and evening; medication reminders with visual cues and acknowledgment; mood tracking to surface emotional patterns; family photos and voice recordings for reassurance; calming media including nature sounds and audio stories; and an emergency contact interface accessible at all times.</p>
          </SubSection>

          <SubSection title="The Caregiver Experience">
            <p>On the caregiver side, the system provides visibility and structure. Tasks, medications, mood patterns, and daily activities are no longer isolated pieces of information — they are part of a continuous record that can be reviewed, updated, and shared across authorized roles. This removes the cognitive burden of having to hold everything in memory and enables caregivers to focus on the human aspects of caregiving rather than administrative tracking.</p>
          </SubSection>

          <SubSection title="The Care Team Experience">
            <p>For clinical professionals and care coordinators, the platform provides structured documentation and pattern visibility. Mood trends, ADL completion rates, medication adherence, and behavioral observations accumulate over time, enabling more informed oversight and earlier identification of concerning changes. Instead of relying on snapshot assessments during brief visits, care teams have access to a continuous longitudinal record.</p>
          </SubSection>

          <CalloutBox icon={CheckCircle} title="Core Platform Capabilities" color="sage">
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 mt-1 text-sm">
              {[
                'Daily orientation and routine reinforcement',
                'Medication tracking and adherence logging',
                'Mood and behavioral pattern monitoring',
                'Activities of daily living (ADL) documentation',
                'Care partner check-in and note logging',
                'Patient intake and medical history management',
                'Emergency contact and safety features',
                'Secure family connection and photo sharing',
                'Memory games and cognitive engagement',
                'Voice recording for personalized reassurance',
                'Document and care paper organization',
                'Role-based care team coordination',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-emerald-600 flex-shrink-0">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CalloutBox>
        </Section>

        {/* ── 3. Stability ───────────────────────────────────────────────────── */}
        <Section title="How the Platform Supports Stability" id="stability">
          <p>The design of My Memoria Ally is built on a single foundational principle: <strong>stability is achieved through consistency</strong>. This is not a philosophical position — it is a clinical reality documented across dementia care research. Predictable environments, consistent routines, and familiar cues directly reduce anxiety, agitation, and behavioral disruption in individuals with cognitive impairment.</p>

          <SubSection title="For Patients">
            <p>When a patient interacts with the platform, they encounter the same structure every time. The greeting uses their name. The time and date are always present. The routine appears at the same points in the day. Familiar faces are one tap away. This predictability does not merely provide comfort — it actively reduces disorientation, which is one of the most significant triggers of distress in dementia care.</p>
            <p>The platform also includes sundowning-aware design — the interface adjusts its visual tone and messaging during late afternoon and early evening hours, when cognitive disruption is statistically most likely to occur. This kind of contextual adaptation is a level of care that generic reminder apps cannot provide.</p>
          </SubSection>

          <SubSection title="For Caregivers">
            <p>When a caregiver interacts with the platform, they see a centralized, accurate picture of the patient's day. What was completed, what was missed, what the patient's mood has been, what medications are pending. This clarity reduces the mental overhead of caregiving — which matters enormously, because caregiver mental load is directly correlated with care quality and long-term burnout risk.</p>
            <p>The system also creates accountability without surveillance. The record exists not to monitor caregivers, but to ensure that care is never dependent on any single person's memory on any given day.</p>
          </SubSection>

          <SubSection title="Over Time: The Value of Continuity">
            <p>Perhaps the most significant benefit of My Memoria Ally is what accumulates over time. When information is captured consistently, patterns become visible. A gradual decline in medication adherence. A shift in mood trends over a three-week period. An increase in missed ADL tasks that might signal a physical or cognitive change. These patterns are invisible when care is managed informally — they only emerge when there is a structured longitudinal record. My Memoria Ally provides that record.</p>
          </SubSection>
        </Section>

        {/* ── 4. Broader Application ─────────────────────────────────────────── */}
        <Section title="Beyond Dementia: A Broader Application" id="broader">
          <p>Although dementia is a primary use case for My Memoria Ally, the platform is intentionally designed to support a broader population. The underlying framework — structured routine, coordinated oversight, consistent documentation, and family visibility — is beneficial in any scenario where an individual requires external support to maintain stability in daily life.</p>

          <div className="grid sm:grid-cols-2 gap-4 my-6">
            {[
              {
                title: 'Traumatic Brain Injury (TBI)',
                body: 'Recovery from TBI often involves persistent challenges with memory, executive function, and emotional regulation. Structured routine and caregiver visibility support rehabilitation and reduce compensatory burden on families.',
              },
              {
                title: 'Mild Cognitive Impairment (MCI)',
                body: 'Individuals in early stages of cognitive decline benefit from supportive structure before full dependence develops. Early engagement with a coordinated system can slow functional deterioration and extend independence.',
              },
              {
                title: 'Autism Spectrum and ADHD',
                body: 'Routine-dependent individuals benefit from clear visual schedules, medication reminders, and behavioral tracking that helps caregivers identify triggers and patterns over time.',
              },
              {
                title: 'Post-Hospitalization Recovery',
                body: 'Patients discharged after major medical events often face temporary or permanent changes in cognitive function. A structured coordination platform reduces readmission risk and supports caregiver confidence.',
              },
            ].map(({ title, body }) => (
              <div key={title} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                <h4 className="font-bold text-charcoal mb-2 text-sm">{title}</h4>
                <p className="text-charcoal/70 text-sm leading-7">{body}</p>
              </div>
            ))}
          </div>

          <p>By focusing on the underlying need for consistency rather than a single diagnosis, My Memoria Ally remains adaptable across care environments while maintaining a strong, purpose-built foundation.</p>
        </Section>

        {/* ── 5. Compliance ──────────────────────────────────────────────────── */}
        <Section title="Compliance, Data Security, and Trust" id="compliance">
          <p>My Memoria Ally operates in a domain that involves highly sensitive personal and health-related information. This introduces a level of responsibility that extends far beyond typical software applications — and we treat it accordingly.</p>

          <CalloutBox icon={Lock} title="HIPAA Compliance" color="slate">
            <p>My Memoria Ally is designed and operated in compliance with the Health Insurance Portability and Accountability Act (HIPAA). {COMPANY} functions as a Business Associate under HIPAA when processing Protected Health Information (PHI) on behalf of healthcare provider Covered Entities. We maintain a Business Associate Agreement (BAA) with all healthcare organizations and facilities using the platform. Full compliance documentation is available at <a href="/privacy" className="text-warm-bronze underline">mymemoriaally.com/privacy</a>.</p>
          </CalloutBox>

          <SubSection title="Technical Security Standards">
            <CheckList items={[
              'AES-256 encryption for all health data stored at rest',
              'TLS 1.3 encryption for all data transmitted between users and servers',
              'Database-level Row Level Security (RLS) policies enforced on all PHI tables — cannot be bypassed by application code or API calls',
              'JWT-based session authentication stored in sessionStorage only — sessions expire automatically on browser close',
              'Automatic session termination after 15 minutes of inactivity',
              'Private storage buckets for all uploaded media — access via time-limited cryptographically signed URLs only',
              'Immutable audit logging of all access to patient records, retained for a minimum of 7 years',
              'Infrastructure hosted on AWS with SOC 2 Type II compliance via Supabase',
            ]} />
          </SubSection>

          <SubSection title="Access Control Architecture">
            <p>My Memoria Ally implements a strict role-based access control (RBAC) model with database-level enforcement. Every user operates within a precisely defined scope: patients access only their own records; care coordinators access only patients explicitly assigned to them; administrators access only records within their organization. No user can access information outside their authorized boundary — not through the application, and not through direct API access.</p>
            <p>This architecture ensures that sensitive health information is protected not just by policy, but by technical design. Trust is built through consistent, reliable operation — not through statements alone.</p>
          </SubSection>

          <SubSection title="Data Practices Commitment">
            <CheckList items={[
              'We do not sell, rent, or trade user data under any circumstances',
              'No third-party advertising networks, behavioral analytics, or tracking pixels',
              'No use of health data for AI model training or commercial profiling',
              'Payment processing handled externally by Stripe — we never store card data',
              'Data deletion requests completed within 30 days of verification',
              'HIPAA breach notification procedures in place with 60-day reporting requirement to affected Covered Entities',
            ]} />
          </SubSection>
        </Section>

        {/* ── 6. Enterprise ──────────────────────────────────────────────────── */}
        <Section title="For Healthcare Facilities and Enterprise Organizations" id="enterprise">
          <p>My Memoria Ally is built not only for individual families but as a platform that can extend care infrastructure for healthcare organizations, memory care facilities, assisted living communities, home health agencies, and provider networks.</p>

          <SubSection title="What Enterprise Deployment Looks Like">
            <p>Organizations that deploy My Memoria Ally gain a structured digital layer that extends care continuity beyond the walls of the facility. Family members receive visibility and reassurance, reducing call volume to nursing staff. Care coordinators gain documentation tools that reduce administrative burden. Administrators gain oversight and compliance-grade audit records.</p>
            <p>The result is a measurable improvement in care consistency — across shifts, across staff changes, and across the transitions that are most vulnerable in care environments.</p>
          </SubSection>

          <SubSection title="Organizational Benefits">
            <CheckList items={[
              'Structured ADL, medication, and behavioral documentation across the entire patient population',
              'Role-based access ensuring clinical staff see only what they need to see',
              'Longitudinal patient records supporting clinical decision-making and family communication',
              'Audit-ready documentation for regulatory compliance and accreditation reviews',
              'Reduced caregiver burden through centralized task and communication management',
              'Family engagement tools that reduce unsolicited contact and improve satisfaction',
              'HIPAA Business Associate Agreement available for all organizational deployments',
              'Master Administrator accounts with organization-level oversight and reporting',
            ]} />
          </SubSection>

          <CalloutBox icon={Building2} title="Interested in Organizational Deployment?" color="bronze">
            <p>We work directly with healthcare facilities, memory care communities, and care organizations to configure My Memoria Ally for organizational use. This includes BAA execution, staff onboarding, custom configuration, and ongoing support.</p>
            <p className="mt-2">Contact us at <a href={'mailto:' + EMAIL} className="text-warm-bronze font-semibold underline">{EMAIL}</a> to discuss your organization's needs.</p>
          </CalloutBox>
        </Section>

        {/* ── 7. Company ─────────────────────────────────────────────────────── */}
        <Section title={'About ' + COMPANY} id="company">
          <p>My Memoria Ally is developed and operated by {COMPANY}. The company was established with a focus on building structured digital systems that address complex, real-world challenges — particularly those where failure carries real consequences for real people.</p>
          <p>Rather than creating isolated features or short-term solutions, {COMPANY} approaches product development as system design. This means prioritizing long-term usability, structural reliability, and the ability to function dependably within workflows where consistency is not optional.</p>
          <p>In the context of care, this means creating systems that users can depend on every day — without ambiguity, without confusion, and without requiring technical expertise to operate. The design of My Memoria Ally reflects this commitment at every level, from the patient-facing interface to the underlying data architecture.</p>

          <SubSection title="Our Philosophy">
            <p>We believe that the people who need the most support deserve the most thoughtfully designed tools. Cognitive care is not a niche market — it is one of the fastest-growing healthcare challenges of the 21st century. The families navigating it deserve more than repurposed productivity apps and disconnected reminder tools.</p>
            <p>My Memoria Ally was built from the ground up for this specific context. Every feature, every design decision, and every security control reflects the weight of the domain it operates in.</p>
          </SubSection>

          <SubSection title="Long-Term Vision">
            <p>The long-term vision of My Memoria Ally is to redefine how care is coordinated in environments where consistency is critical. Instead of fragmented tools and informal processes, care becomes structured, trackable, and coordinated through a unified system — one that reduces caregiver burden, improves patient stability, and creates a more predictable and supportive daily experience for everyone involved.</p>
            <p>My Memoria Ally represents the beginning of that shift. The platform is actively growing — in features, in supported care scenarios, and in its ability to serve organizations at scale.</p>
          </SubSection>
        </Section>

        {/* ── Contact CTA ────────────────────────────────────────────────────── */}
        <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm text-center">
          <div className="w-14 h-14 bg-warm-bronze/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Heart className="w-7 h-7 text-warm-bronze" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Get in Touch</h2>
          <p className="text-charcoal/70 text-sm leading-7 max-w-md mx-auto mb-6">
            Whether you are a family member exploring options, a clinician evaluating platforms, or a care organization considering deployment — we welcome the conversation.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={'mailto:' + EMAIL}
              className="inline-flex items-center justify-center gap-2 bg-warm-bronze hover:bg-warm-bronze/90 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm shadow-sm"
            >
              <Users className="w-4 h-4" /> Contact Us
            </a>
            <a
              href="/privacy"
              className="inline-flex items-center justify-center gap-2 border-2 border-stone-200 hover:border-warm-bronze/40 text-charcoal hover:text-warm-bronze font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              <Shield className="w-4 h-4" /> Privacy & Legal
            </a>
          </div>
          <p className="mt-6 text-xs text-charcoal/40">
            {COMPANY} · <a href={'mailto:' + EMAIL} className="hover:text-warm-bronze transition-colors">{EMAIL}</a> · {APP_URL}
          </p>
        </div>

      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="mt-8 border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-charcoal/40">
          <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-warm-bronze transition-colors">Privacy & Legal</a>
            <a href={'mailto:' + EMAIL} className="hover:text-warm-bronze transition-colors">{EMAIL}</a>
          </div>
        </div>
      </footer>

    </div>
  );
}