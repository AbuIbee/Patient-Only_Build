import { useState } from 'react';
import { Heart, Shield, Lock, FileText, Users, CheckCircle, AlertTriangle, Bold } from 'lucide-react';

const EFFECTIVE_DATE = 'April 19, 2026';
const COMPANY = 'Salahuddeen Enterprises LLC';
const EMAIL = 's.muhammad@salahuddeenenterprises.com';
const APP_URL = 'mymemoriaally.com';
const APP_STORE_URL = 'https://mymemoriaally.com';

type DocId = 'privacy' | 'hipaa' | 'baa' | 'consent' | 'security' | 'terms';

const DOCS: { id: DocId; label: string; emoji: string; icon: any }[] = [
  { id: 'privacy',  label: 'Privacy Policy',               emoji: '🔒', icon: Lock },
  { id: 'hipaa',    label: 'HIPAA Compliance',             emoji: '🏥', icon: Shield },
  { id: 'baa',      label: 'Business Associate Agreement', emoji: '📋', icon: FileText },
  { id: 'consent',  label: 'Data Consent',                 emoji: '✅', icon: CheckCircle },
  { id: 'security', label: 'Security Practices',           emoji: '🛡️', icon: Shield },
  { id: 'terms',    label: 'Terms of Service',             emoji: '📄', icon: FileText },
];

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-lg font-bold text-charcoal mb-3 pb-2 border-b-2 border-warm-bronze/20">{title}</h2>
      <div className="space-y-3 text-charcoal/80 leading-7 text-sm">{children}</div>
    </div>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 pl-4 border-l-2 border-stone-200">
      <h3 className="font-semibold text-charcoal mb-2 text-sm">{title}</h3>
      <div className="space-y-2 text-charcoal/75 leading-7 text-sm">{children}</div>
    </div>
  );
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-charcoal/75 text-sm">
          <span className="text-warm-bronze mt-1 flex-shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoBox({ children, color = 'amber' }: { children: React.ReactNode; color?: 'amber' | 'blue' | 'green' | 'red' }) {
  const cls = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    blue:  'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    red:   'bg-red-50 border-red-200 text-red-900',
  }[color];
  return <div className={`border rounded-xl p-4 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

function DocHeader({ title, subtitle, tag }: { title: string; subtitle?: string; tag?: string }) {
  return (
    <div className="mb-10 pb-6 border-b border-stone-200">
      {tag && (
        <span className="inline-block text-xs font-bold uppercase tracking-widest text-warm-bronze bg-warm-bronze/10 px-3 py-1 rounded-full mb-3">{tag}</span>
      )}
      <h1 className="text-2xl md:text-3xl font-bold text-charcoal mb-2">{title}</h1>
      {subtitle && <p className="text-charcoal/60 text-base">{subtitle}</p>}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-charcoal/50">
        <span>Effective: <strong className="text-charcoal/70">{EFFECTIVE_DATE}</strong></span>
        <span>Operator: <strong className="text-charcoal/70">{COMPANY}</strong></span>
        <span>Contact: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline hover:no-underline">{EMAIL}</a></span>
      </div>
    </div>
  );
}

// ─── PRIVACY POLICY ───────────────────────────────────────────────────────────

function PrivacyPolicyContent() {
  return (
    <>
      <DocHeader
        title="Privacy Policy"
        subtitle="How We Collect, Use, Protect, and Disclose Your Information"
        tag="My Memoria Ally"
      />

      <InfoBox color="blue">
        <strong>Summary:</strong> We collect only the information needed to provide your care support services. We do not sell your data, use it for advertising, or share it with anyone outside your authorized care team. All health information is protected under HIPAA.
      </InfoBox>

      <div className="my-6" />

      <Sec title="1. Introduction and Scope">
        <p>{COMPANY} ("we," "us," or "our") operates the My Memoria Ally mobile and web application (the "App") available at {APP_URL}. My Memoria Ally is a dementia and cognitive care support platform serving patients, family caregivers, Patient Care Coordinators, licensed therapists, and healthcare facility administrators.</p>
        <p>This Privacy Policy describes how we collect, use, disclose, and protect your personal information and Protected Health Information (PHI) when you use the App. It applies to all users of the App regardless of how they access it — via web browser, iOS app, or Android app.</p>
        <p>By creating an account or using the App, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with any part of this policy, please discontinue use of the App immediately.</p>
      </Sec>

      <Sec title="2. Who This Policy Covers">
        <p>This Privacy Policy applies to all categories of users of the My Memoria Ally platform:</p>
        <Ul items={[
          "Patients — individuals living with Alzheimer's, Dementia, Parkinson's, MS (Multiple Sclerosis), ALS (Amyotrophic Lateral Sclerosis), Huntington's, PSP (Progressive Supranuclear Palsy), MSA (Multiple System Atrophy), Muscular Dystrophy, TBI (Traumatic Brain Injury), Hospice Care, ADHD, Autism or other cognitive needs who use the App directly for daily support",
          "Patient Care Coordinators — professional caregivers, family members, or designated support persons who manage a patient's care within the App",
          "Therapists — licensed clinical professionals (including occupational therapists, speech-language pathologists, neuropsychologists, and social workers) assigned to patient care",
          "Administrators — facility managers, organizational administrators, or Master Admins who have oversight of accounts within their facility or organization",
        ]} />
      </Sec>

      <Sec title="3. Information We Collect - Salahuddeen Enterprises Staff"> — ",
        <Sub title="3.1 Technical and operational personnel access the platform for maintenance and support purposes only.">
           <Sub title="Information You Provide Directly When Creating an Account">
          <Ul items={[
            "Full legal name and preferred name",
            "Email address and password (password stored as a bcrypt hash — never in plaintext)",
            "Phone number",
            "Date of birth (for patient accounts)",
            "Profile photograph (optional)",
            "Professional license number and credentials (for therapists and clinical staff)",
            "Organization or facility affiliation (for administrative and clinical staff)",
            "Emergency contact name, relationship, and phone number",
          ]} />
          </Sub>
        </Sub>
        <Sub title="3.2 Health and Care Information (Protected Health Information / PHI)">
          <p>For patient users, we collect and store health-related information that may constitute PHI under HIPAA. This information is provided directly by patients, their care coordinators, or clinical staff.  We take your privacy seriously. We store your health information securely and it is protected by HIPAA laws. We do not sell your personal information or share it with any unauthorized third parties. Your data is used exclusively to provide you with care and for internal operational purposes:</p>
          <Ul items={[
            "Dementia or cognitive condition diagnosis, type, stage, and progression notes",
            "Medication names, dosages, schedules, administration routes, and adherence records",
            "Mood entries, emotional state logs, and behavioral observations",
            "Activities of daily living (ADL) assessments including dressing, bathing, toileting, mobility, and nutrition",
            "Behavioral and psychological symptoms of dementia (BPSD) documentation",
            "Therapy goals, care plans, and clinical progress notes",
            "Incident reports, fall documentation, and safety observations",
            "Sleep patterns and quality observations",
            "Family check-in logs and care partner notes",
            "Patient intake forms including medical history and care preferences",
            "Documents, photographs, and media files uploaded by patients or care staff",
            "Voice recordings uploaded for personalized comfort messages",
            "Daily routine configurations and task completion records",
            "Reminder settings and notification preferences",
          ]} />
        </Sub>
        <Sub title="3.3 Information Collected Automatically During App Use">
          <Ul items={[
            "Authentication session tokens (stored in sessionStorage only — not persistent cookies — expire when the browser tab is closed)",
            "Device type, operating system, and browser type (for compatibility and technical support)",
            "App usage patterns and feature interactions (necessary to provide and improve the service — no personal health data is included in usage analytics)",
            "Error logs and diagnostic crash reports (do not include PHI)",
            "Approximate geographic location for weather display feature (not stored, processed client-side only)",
          ]} />
        </Sub>
        <Sub title="3.4 Information We Explicitly Do NOT Collect">
          <Ul items={[
            "We do not use Google Analytics, Mixpanel, Segment, Amplitude, or any third-party behavioral analytics service",
            "We do not use advertising cookies, tracking pixels, or cross-site tracking technologies",
            "We do not collect payment card numbers, bank account information, or full financial data (payment is processed externally through Stripe — we receive only subscription status)",
            "We do not access your device's contacts, camera, or microphone without your explicit, in-session permission",
            "We do not collect data from other apps on your device",
            "We do not build advertising profiles or share data with advertising networks",
          ]} />
        </Sub>
      </Sec>

      <Sec title="4. Protected Health Information (PHI) and HIPAA Compliance">
        <p>Because My Memoria Ally is used to manage care for individuals with cognitive conditions, certain information you provide constitutes Protected Health Information (PHI) under the Health Insurance Portability and Accountability Act of 1996 (HIPAA) and the Health Information Technology for Economic and Clinical Health Act (HITECH).</p>
        <p>We treat all health-related information with the highest level of protection. Our specific HIPAA compliance program is described in detail in the HIPAA Compliance Statement tab. Key points:</p>
        <Ul items={[
          "We function as a Business Associate under HIPAA when processing PHI on behalf of healthcare provider Covered Entities",
          "We maintain a Business Associate Agreement (BAA) with all healthcare organizations and facilities using the platform",
          "All PHI is encrypted at rest (AES-256) and in transit (TLS 1.3)",
          "Access to PHI is restricted by role-based access controls and database-level Row Level Security policies",
          "We support patients' HIPAA rights to access, amend, and request restrictions on their PHI",
          "We maintain an audit log of all access to PHI as required by 45 CFR §164.312(b)",
          "Strict Security & No Selling: Explicitly state that their health information is never sold, rented, or shared with third parties for marketing purposes.",
          "Need-to-Know Access: Emphasize that PHI is only accessed on a strict 'need-to-know' basis for necessary care and administrative functions.",
          "HIPAA Compliance: Reassure them that you comply with all HIPAA regulations, which prohibit unauthorized disclosure of patient information.",
          "Controlled Access: Explain that they have the right to request access to their records and that you will not disclose their information to third parties without their direct authorization, unless legally permitted.",
        ]} />
      </Sec>

      <Sec title="5. How We Use Your Information">
        <p>We use the information we collect exclusively for the following purposes:</p>
        <Ul items={[
          "Providing, operating, and maintaining the App and all its features",
          "Creating and managing user accounts and authenticating users",
          "Enabling secure communication among authorized care team members",
          "Maintaining patient care records accessible to the assigned care team",
          "Sending account-related communications such as password reset emails and system alerts",
          "Generating immutable audit logs for HIPAA compliance and security monitoring",
          "Diagnosing and resolving technical errors",
          "Improving App features based on aggregated, anonymized usage patterns",
          "Complying with legal, regulatory, and contractual obligations",
          "Responding to lawful requests from government authorities or courts",
        ]} />
        <InfoBox color="red">
          <strong>We will NEVER use your information for:</strong> marketing or advertising to you or third parties · sale, rental, or trade to any third party · training artificial intelligence or machine learning models · profiling for commercial purposes · any purpose beyond what is described in this policy.  We do not sell your personal information or share it with any unauthorized third parties. Your data is used exclusively to provide you with care and for internal operational purposes.
        </InfoBox>
      </Sec>

      <Sec title="6. Legal Basis for Processing (GDPR / North Carolina NCIPA)">
        <p>For users protected by the European General Data Protection Regulation (GDPR) or the North Carolina Identity Protection Act, our legal bases for processing personal data are:</p>
        <Ul items={[
          "Contract performance — processing necessary to provide the App services you have subscribed to",
          "Vital interests — processing necessary to protect the vital interests of the patient (emergency features)",
          "Legitimate interests — fraud prevention, security monitoring, and improving service quality",
          "Legal obligation — audit logging and breach notification as required by HIPAA",
          "Explicit consent — health data processing where consent is the appropriate legal basis",
        ]} />
      </Sec>

      <Sec title="7. Information Sharing and Disclosure">
        <p><strong>We do not sell, rent, or trade your personal information.</strong> We share information only in the following limited, necessary circumstances:</p>
        <Sub title="7.1 Within Your Authorized Care Team">
          <p>Information is shared between authorized members of a patient's care team — patient, their assigned Care Coordinator, their assigned Therapist, and their facility's Administrator — strictly within the bounds of their authorized role. No user can access information outside their assigned scope.</p>
        </Sub>
        <Sub title="7.2 Infrastructure Service Providers">
          <Ul items={[
            "Supabase, Inc. — our database, authentication, and storage infrastructure provider. Supabase stores and processes data on our behalf under a Data Processing Agreement. Infrastructure is hosted on AWS. Supabase has no independent right to use your data.",
            "Vercel — our application hosting and CDN provider. Vercel does not have access to health data or PHI.",
            "Stripe, Inc. — payment processing. Stripe receives subscription payment information. Stripe does not receive PHI or detailed personal health information.",
          ]} />
        </Sub>
        <Sub title="7.3 Legal Requirements">
          <p>We may disclose information when required to do so by law, court order, subpoena, or other legal process, or when we believe in good faith that disclosure is necessary to prevent fraud, protect our rights, or protect the safety of users or the public.</p>
        </Sub>
        <Sub title="7.4 Business Transfers">
          <p>If {COMPANY} is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you via email or prominent notice in the App before your information is transferred and becomes subject to a different privacy policy.</p>
        </Sub>
      </Sec>

      <Sec title="8. Data Retention">
        <p>We retain your personal information for as long as your account is active or as necessary to provide services. More specifically:</p>
        <Ul items={[
          "Active account data: retained throughout the life of your subscription",
          "Health records and PHI: retained for a minimum of 6 years from the date of creation or last use, as required by HIPAA (45 CFR §164.530(j))",
          "Audit logs: retained for a minimum of 7 years per HIPAA requirements",
          "Account deletion: upon verified request, we will delete or anonymize personal data within 30 days, except where retention is required by law or for fraud prevention",
          "Backups: deleted from backup systems within 90 days of deletion from primary systems",
        ]} />
      </Sec>

      <Sec title="9. Your Privacy Rights">
        <p>Depending on your location and applicable law, you may have the following rights regarding your personal information:</p>
        <Ul items={[
          "Right of Access — request a copy of the personal information we hold about you",
          "Right to Correction — request correction of inaccurate, incomplete, or outdated information",
          "Right to Deletion ('Right to be Forgotten') — request deletion of your personal information, subject to legal retention requirements",
          "Right to Restrict Processing — request that we limit how we use your data in certain circumstances",
          "Right to Data Portability — request your data in a structured, machine-readable format",
          "Right to Withdraw Consent — withdraw consent to data processing at any time (this will result in account deactivation)",
          "Right to Lodge a Complaint — file a complaint with your applicable data protection supervisory authority",
          "HIPAA Rights — patients have additional rights under HIPAA including the right to access PHI, request amendments, and request an accounting of disclosures",
        ]} />
        <p>To exercise any of these rights, contact us at: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a>. We will respond within 30 days of receiving your request.</p>
      </Sec>

      <Sec title="10. Cookies and Tracking Technologies">
        <p>The App does not use persistent cookies for tracking or advertising. The only storage used by the App is:</p>
        <Ul items={[
          "sessionStorage — authentication tokens that expire automatically when you close the browser tab",
          "localStorage — limited app preferences (such as UI settings) that do not contain PHI",
        ]} />
        <p>We do not use third-party cookies, tracking pixels, or behavioral advertising technologies of any kind.</p>
      </Sec>

      <Sec title="11. Children's Privacy">
        <p>My Memoria Ally is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13 without verifiable parental consent. Patient accounts may be created on behalf of minors by a parent or legal guardian who accepts this Privacy Policy on their behalf and remains responsible for the minor's use of the App.</p>
        <p>If we become aware that we have collected personal information from a child under 13 without parental consent, we will take steps to delete that information promptly. Contact us at <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a> with concerns.</p>
      </Sec>

      <Sec title="12. International Data Transfers">
        <p>My Memoria Ally is operated from the United States. If you access the App from outside the United States, your information will be transferred to, stored, and processed in the United States. By using the App, you consent to this transfer. Our infrastructure provider (Supabase / AWS) maintains appropriate safeguards for international data transfers.</p>
      </Sec>

      <Sec title="13. Security">
        <p>We implement comprehensive administrative, technical, and physical safeguards to protect your information. These include AES-256 encryption at rest, TLS 1.3 encryption in transit, role-based access controls, database-level Row Level Security, 15-minute session timeouts, immutable audit logging, and private storage buckets with time-limited signed URL access. Full details are provided in our Security Practices document (see Security Practices tab).</p>
        <p>Despite our best efforts, no method of electronic transmission or storage is 100% secure. In the event of a data breach affecting your personal information, we will notify you in accordance with applicable law and HIPAA breach notification requirements.</p>
      </Sec>

      <Sec title="14. Third-Party Links">
        <p>The App may contain links to third-party websites or services that are not operated by us. We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party sites. We encourage you to review the privacy policy of every site you visit.</p>
      </Sec>

      <Sec title="15. Changes to This Privacy Policy">
        <p>We reserve the right to update this Privacy Policy at any time. When we make changes, we will:</p>
        <Ul items={[
          "Post the updated policy on this page with a new effective date",
          "Send an email notification to all registered users for material changes",
          "Display a prominent in-App notice for material changes",
          "Where required by law, obtain your consent before applying material changes",
        ]} />
        <p>Your continued use of the App after changes take effect constitutes acceptance of the updated policy.</p>
      </Sec>

      <Sec title="16. Contact Us">
        <p>For questions, concerns, or requests related to this Privacy Policy:</p>
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong></p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>Website: <a href={"https://" + APP_URL} className="text-warm-bronze underline">{APP_URL}</a></p>
        </div>
      </Sec>
    </>
  );
}

// ─── HIPAA COMPLIANCE ─────────────────────────────────────────────────────────

function HIPAAContent() {
  return (
    <>
      <DocHeader
        title="HIPAA Compliance Statement"
        subtitle="Health Insurance Portability and Accountability Act — Compliance Program"
        tag="My Memoria Ally"
      />

      <InfoBox color="blue">
        <strong>Overview:</strong> {COMPANY} operates as a HIPAA Business Associate. We implement the Privacy Rule, Security Rule, and Breach Notification Rule in full. All organizations using My Memoria Ally for patient care must execute a Business Associate Agreement with us before processing PHI.
      </InfoBox>

      <div className="my-6" />

      <Sec title="1. Our Role Under HIPAA">
        <p>{COMPANY}, as the operator of My Memoria Ally, recognizes that we function as a <strong>Business Associate</strong> under HIPAA (45 CFR §160.103) when we create, receive, maintain, or transmit Protected Health Information (PHI) on behalf of Covered Entities — specifically the healthcare providers, facilities, and care organizations that use our platform to manage patient care.</p>
        <p>This document describes our HIPAA compliance program in detail, including our obligations under the HIPAA Privacy Rule (45 CFR Part 164, Subpart E), Security Rule (45 CFR Part 164, Subpart C), and Breach Notification Rule (45 CFR Part 164, Subpart D).</p>
      </Sec>

      <Sec title="2. Covered Entities and Business Associate Relationships">
        <p>The following entities are Covered Entities under HIPAA that may use My Memoria Ally:</p>
        <Ul items={[
          "Memory care facilities and nursing homes",
          "Home health agencies",
          "Assisted living organizations",
          "Hospitals and health systems with dementia care programs",
          "Individual licensed healthcare providers (physicians, neurologists, psychiatrists)",
          "Licensed therapists providing cognitive rehabilitation services",
        ]} />
        <p>Prior to receiving access to My Memoria Ally for any use involving PHI, each Covered Entity must execute a signed Business Associate Agreement (BAA) with {COMPANY}. Our BAA template is available for review under the Business Associate Agreement tab.</p>
      </Sec>

      <Sec title="3. Categories of PHI We Process">
        <p>Through the App, we may create, receive, maintain, or transmit the following categories of PHI as defined under 45 CFR §160.103:</p>
        <Ul items={[
          "Patient identifiers: name, date of birth, home address, email address, phone number",
          "Diagnosis information: dementia type, disease stage, cognitive assessment results",
          "Medication information: medication names, dosages, schedules, and adherence records",
          "Behavioral data: behavioral and psychological symptoms, incident reports, wandering documentation",
          "Functional data: activities of daily living (ADL) assessments, mobility status, continence records",
          "Mental health data: mood entries, emotional wellbeing records, anxiety and depression observations",
          "Nutritional data: meal intake records, appetite observations, swallowing difficulties",
          "Sleep data: sleep pattern observations",
          "Care plan data: therapy goals, care plans, clinical notes, discharge planning",
          "Media: photographs, video recordings, voice recordings uploaded to the patient's account",
          "Documents: medical records, power of attorney documents, care-related documents uploaded by patients or staff",
        ]} />
      </Sec>

      <Sec title="4. HIPAA Privacy Rule Compliance (45 CFR Part 164, Subpart E)">
        <Sub title="4.1 Minimum Necessary Standard">
          <p>We implement the Minimum Necessary standard (45 CFR §164.502(b)) throughout the App. Every user role is constrained to access only the PHI necessary for their specific function:</p>
          <Ul items={[
            "Patients — read and write access only to their own records",
            "Patient Care Coordinators — full access to records of patients explicitly assigned to them; no access to unassigned patients",
            "Therapists — read and write access to clinical records of patients assigned to them; no access to unassigned patients",
            "Facility Administrators — administrative access to records within their organization only; cannot access records of other organizations",
            "Salahuddeen Enterprises SuperAdmins — platform-level technical access for maintenance only; governed by internal access controls and audit logging",
          ]} />
        </Sub>
        <Sub title="4.2 Permitted Uses and Disclosures">
          <p>We use and disclose PHI only as permitted or required by our Business Associate Agreement and HIPAA (45 CFR §164.504(e)), including:</p>
          <Ul items={[
            "For the specific care coordination and clinical purposes for which it was collected",
            "For the proper management and administration of our services",
            "As required by law (legal process, public health reporting, regulatory compliance)",
            "To report violations of law to appropriate government authorities",
          ]} />
          <p className="font-semibold text-charcoal">We do NOT disclose PHI for marketing, advertising, or commercial data purposes under any circumstances.</p>
        </Sub>
        <Sub title="4.3 Individual Rights Support">
          <p>We support Covered Entities in fulfilling patients' HIPAA rights by maintaining technical capabilities to:</p>
          <Ul items={[
            "Provide patients with access to their PHI (Right of Access — 45 CFR §164.524)",
            "Amend PHI upon request from the patient or Covered Entity (45 CFR §164.526)",
            "Provide an accounting of disclosures of PHI (45 CFR §164.528)",
            "Restrict use and disclosure of PHI per patient request (45 CFR §164.522)",
            "Transmit PHI to a designated third party upon patient request",
          ]} />
        </Sub>
      </Sec>

      <Sec title="5. HIPAA Security Rule Compliance (45 CFR Part 164, Subpart C)">
        <Sub title="5.1 Administrative Safeguards">
          <Ul items={[
            "Designated Privacy and Security Officer responsible for HIPAA compliance oversight",
            "Workforce training on HIPAA requirements and App security procedures",
            "Access authorization procedures — each user account provisioned with least-privilege role",
            "Workforce clearance and sanction policies for security violations",
            "Regular security incident response testing and review",
            "Annual risk analysis and risk management program per 45 CFR §164.308(a)(1)",
            "Contingency plan for data backup, disaster recovery, and emergency access procedures",
          ]} />
        </Sub>
        <Sub title="5.2 Physical Safeguards">
          <Ul items={[
            "App infrastructure hosted on Supabase (AWS) data centers with physical access controls, 24/7 security monitoring, and environmental controls",
            "Vercel CDN infrastructure with physical security standards meeting SOC 2 Type II requirements",
            "No on-premises servers — all infrastructure is managed by certified cloud providers",
            "Workstation use policies for Salahuddeen Enterprises staff accessing systems",
          ]} />
        </Sub>
        <Sub title="5.3 Technical Safeguards">
          <Ul items={[
            "AES-256 encryption for all PHI at rest in the Supabase PostgreSQL database",
            "TLS 1.3 encryption for all PHI in transit between client and server",
            "Database-level Row Level Security (RLS) policies enforced on all PHI-containing tables — cannot be bypassed by application code or API calls",
            "JWT-based authentication with tokens stored in sessionStorage (not localStorage) — expire on browser tab close",
            "Automatic session termination after 15 minutes of inactivity",
            "Forced password change on first login for all new staff accounts",
            "Email-verified password reset with secure, time-limited tokens",
            "Private Supabase storage buckets for all media and documents — access via time-limited signed URLs only",
            "Audit logging of all authentication events, PHI access, modifications, and administrative actions",
          ]} />
        </Sub>
      </Sec>

      <Sec title="6. HIPAA Breach Notification Rule (45 CFR Part 164, Subpart D)">
        <p>In the event of a breach of unsecured PHI, {COMPANY} will:</p>
        <Ul items={[
          "Notify the affected Covered Entity without unreasonable delay and no later than 60 days after discovery of the breach (45 CFR §164.410)",
          "Provide notification to the media if the breach affects more than 500 residents of a state, as required by 45 CFR §164.406",
          "Report to the Secretary of HHS as required by 45 CFR §164.408",
          "Include in all breach notifications: description of the breach, types of PHI involved, steps individuals should take, steps we are taking to investigate and prevent future breaches, and contact information",
        ]} />
        <p>Our breach response procedures include: immediate containment and assessment, forensic analysis to determine scope, notification within required timelines, remediation of the root cause, and post-incident policy review.</p>
      </Sec>

      <Sec title="7. Subcontractors and Third-Party Compliance">
        <p>All subcontractors of {COMPANY} that create, receive, maintain, or transmit PHI on our behalf are required to enter into appropriate Business Associate Agreements and comply with HIPAA requirements.</p>
        <p>Current subcontractors with access to infrastructure containing PHI:</p>
        <Ul items={[
          "Supabase, Inc. — database and storage infrastructure. Supabase is SOC 2 Type II compliant and maintains HIPAA compliance capabilities on AWS infrastructure.",
          "Amazon Web Services (AWS) — underlying cloud infrastructure for Supabase. AWS maintains a BAA and is HIPAA-eligible.",
        ]} />
        <p>Vercel (application hosting) does not have access to PHI and is not a Business Associate.</p>
      </Sec>

      <Sec title="8. Contact for HIPAA Matters">
        <p>To request a Business Associate Agreement, report a suspected breach, or raise HIPAA compliance concerns:</p>
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong> — HIPAA Privacy and Security Officer</p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>Website: <a href={"https://" + APP_URL} className="text-warm-bronze underline">{APP_URL}</a></p>
        </div>
      </Sec>
    </>
  );
}

// ─── BAA ──────────────────────────────────────────────────────────────────────

function BAAContent() {
  return (
    <>
      <DocHeader
        title="Business Associate Agreement"
        subtitle="HIPAA-Compliant Data Processing Agreement Template"
        tag="My Memoria Ally"
      />

      <InfoBox color="amber">
        <strong>Note for Healthcare Organizations:</strong> This page displays the standard terms of our Business Associate Agreement. To execute a legally binding, signed BAA with {COMPANY} for your organization, please contact us at <a href={"mailto:" + EMAIL} className="underline font-medium">{EMAIL}</a>. A BAA must be in place before your organization processes any Protected Health Information through My Memoria Ally.
      </InfoBox>

      <div className="my-6" />

      <Sec title="Recitals">
        <p>THIS BUSINESS ASSOCIATE AGREEMENT ("Agreement") is entered into by and between <strong>{COMPANY}</strong> ("Business Associate") and the healthcare provider, facility, or organization executing this Agreement ("Covered Entity"), each a "Party" and collectively the "Parties."</p>
        <p><strong>WHEREAS,</strong> Business Associate provides care coordination technology services through the My Memoria Ally application;</p>
        <p><strong>WHEREAS,</strong> in the course of providing such services, Business Associate may create, receive, maintain, or transmit Protected Health Information (PHI) on behalf of Covered Entity;</p>
        <p><strong>WHEREAS,</strong> HIPAA, HITECH, and their implementing regulations require Covered Entity to enter into a Business Associate Agreement with Business Associate prior to the disclosure of PHI;</p>
        <p><strong>NOW THEREFORE,</strong> in consideration of the mutual promises set forth herein, the Parties agree as follows:</p>
      </Sec>

      <Sec title="1. Definitions">
        <p>All capitalized terms in this Agreement shall have the meanings given under HIPAA and its implementing regulations (45 CFR Parts 160 and 164), unless otherwise defined herein.</p>
        <Ul items={[
          '"Breach" means the acquisition, access, use, or disclosure of PHI in a manner not permitted by the HIPAA Privacy Rule that compromises the security or privacy of the PHI (45 CFR §164.402)',
          '"Business Associate" means Salahuddeen Enterprises LLC, the entity providing care coordination technology services through the My Memoria Ally application',
          '"Covered Entity" means the healthcare provider, facility, or organization entering into this Agreement',
          '"Electronic Protected Health Information" or "ePHI" means PHI that is created, received, maintained, or transmitted in electronic form',
          '"HIPAA Rules" means the Privacy, Security, Breach Notification, and Enforcement Rules at 45 CFR Parts 160 and 164',
          '"Protected Health Information" or "PHI" has the meaning given under 45 CFR §160.103',
          '"Services" means the care coordination technology services provided through the My Memoria Ally application',
          '"Subcontractor" means a person to whom a Business Associate delegates a function, activity, or service',
          '"Unsecured PHI" means PHI that is not rendered unusable, unreadable, or indecipherable to unauthorized persons through a technology or methodology specified by the Secretary of HHS',
        ]} />
      </Sec>

      <Sec title="2. Obligations of Business Associate">
        <Sub title="2.1 Permitted Uses and Disclosures">
          <p>Business Associate agrees to use or disclose PHI only as permitted or required by this Agreement or as required by law. Specifically, Business Associate may:</p>
          <Ul items={[
            "Use PHI for the proper management and administration of Business Associate's services",
            "Disclose PHI for the proper management and administration of Business Associate's services, provided that disclosures are required by law, or Business Associate obtains reasonable assurances of confidentiality",
            "Use PHI to provide data aggregation services relating to the healthcare operations of Covered Entity",
            "Use PHI to report violations of law to appropriate federal and state authorities",
          ]} />
          <p>Business Associate shall not use or disclose PHI in a manner that would violate the HIPAA Privacy Rule if done by Covered Entity.</p>
        </Sub>
        <Sub title="2.2 Technical Safeguards">
          <p>Business Associate agrees to implement and maintain the following technical safeguards to protect the confidentiality, integrity, and availability of ePHI as required by the HIPAA Security Rule (45 CFR Part 164, Subpart C):</p>
          <Ul items={[
            "AES-256 encryption for all ePHI stored at rest in the database and file storage systems",
            "TLS 1.3 encryption for all ePHI transmitted between systems",
            "Database-level Row Level Security (RLS) policies enforcing role-based access to all PHI tables",
            "JWT authentication with session-only storage and automatic expiration",
            "15-minute automatic session timeout for inactive users",
            "Private storage buckets with time-limited signed URLs for media access",
            "Audit logging of all access to, modification of, and disclosure of PHI",
          ]} />
        </Sub>
        <Sub title="2.3 Administrative Safeguards">
          <Ul items={[
            "Maintain written policies and procedures for HIPAA compliance",
            "Designate a Privacy and Security Officer responsible for compliance oversight",
            "Train workforce on HIPAA requirements and applicable security policies",
            "Implement sanction policies for workforce members who violate HIPAA policies",
            "Conduct regular risk analyses per 45 CFR §164.308(a)(1)",
          ]} />
        </Sub>
        <Sub title="2.4 Subcontractors">
          <p>Business Associate will ensure that any Subcontractor that creates, receives, maintains, or transmits PHI on behalf of Business Associate agrees to the same restrictions, conditions, and requirements that apply to Business Associate under this Agreement by entering into a written subcontractor business associate agreement.</p>
        </Sub>
        <Sub title="2.5 Breach Notification">
          <p>Business Associate agrees to:</p>
          <Ul items={[
            "Report any use or disclosure of PHI not provided for by this Agreement to Covered Entity without unreasonable delay and no later than 60 days after discovery",
            "Report any Breach of Unsecured PHI to Covered Entity without unreasonable delay and no later than 60 days after discovery, in accordance with 45 CFR §164.410",
            "Include in breach notification reports: identification of individuals whose PHI was breached, description of the breach, types of PHI involved, and steps taken to mitigate harm",
            "Cooperate with Covered Entity in any required notifications to individuals, HHS, or the media",
          ]} />
        </Sub>
        <Sub title="2.6 Access and Amendment Rights">
          <p>Business Associate agrees to:</p>
          <Ul items={[
            "Maintain PHI in a designated record set in a way that allows Covered Entity to respond to individual requests for access (45 CFR §164.524)",
            "Amend PHI in a designated record set upon direction from Covered Entity per 45 CFR §164.526",
            "Provide an accounting of disclosures of PHI as required by 45 CFR §164.528",
            "Make its internal practices, books, and records available to the Secretary of HHS upon request",
          ]} />
        </Sub>
      </Sec>

      <Sec title="3. Obligations of Covered Entity">
        <p>Covered Entity agrees to:</p>
        <Ul items={[
          "Notify Business Associate of any restriction on the use or disclosure of PHI that Covered Entity has agreed to with individuals",
          "Not request that Business Associate use or disclose PHI in any manner that would not be permissible under the HIPAA Privacy Rule if done by Covered Entity",
          "Provide any necessary notices of privacy practices to individuals that may affect Business Associate's use of PHI",
          "Obtain any consents, authorizations, or other legal permissions necessary for Business Associate to perform the Services",
          "Train its workforce on the proper use of the App and compliance with this Agreement",
        ]} />
      </Sec>

      <Sec title="4. Term and Termination">
        <Sub title="4.1 Term">
          <p>This Agreement is effective from the date of execution by both Parties and continues until terminated as set forth herein.</p>
        </Sub>
        <Sub title="4.2 Termination for Cause">
          <p>Either Party may terminate this Agreement upon 30 days written notice if the other Party materially breaches any provision of this Agreement and fails to cure such breach within the notice period. If cure is not possible, the non-breaching Party may terminate immediately.</p>
        </Sub>
        <Sub title="4.3 Obligations Upon Termination">
          <p>Upon termination of this Agreement for any reason, Business Associate shall, at the direction of Covered Entity, either return or destroy all PHI received from, or created or received on behalf of, Covered Entity. If return or destruction is not feasible, Business Associate shall extend the protections of this Agreement to such PHI and limit further use or disclosure.</p>
        </Sub>
      </Sec>

      <Sec title="5. Miscellaneous Provisions">
        <Ul items={[
          "Governing Law — this Agreement is governed by federal law and, to the extent not preempted, the laws of the State of North Carolina",
          "Amendment — this Agreement may be amended only by a written instrument signed by authorized representatives of both Parties",
          "Entire Agreement — this Agreement, together with any executed service agreement, constitutes the entire agreement of the Parties with respect to the subject matter hereof",
          "Severability — if any provision of this Agreement is held invalid, the remaining provisions shall continue in full force",
          "No Third-Party Beneficiaries — this Agreement is for the benefit of the Parties only",
        ]} />
      </Sec>

      <Sec title="Contact to Execute a BAA">
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong></p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>Website: <a href={"https://" + APP_URL} className="text-warm-bronze underline">{APP_URL}</a></p>
        </div>
      </Sec>
    </>
  );
}

// ─── DATA CONSENT ─────────────────────────────────────────────────────────────

function DataConsentContent() {
  return (
    <>
      <DocHeader
        title="Data Consent and Authorization"
        subtitle="Informed Consent for Collection and Processing of Personal and Health Information"
        tag="My Memoria Ally"
      />

      <InfoBox color="green">
        <strong>Plain Language Summary:</strong> By using My Memoria Ally, you consent to us collecting and using the information described below to provide your care support services. We will never sell your information or use it for advertising. You can withdraw your consent and request deletion of your data at any time.
      </InfoBox>

      <div className="my-6" />

      <Sec title="1. Purpose of This Document">
        <p>This Data Consent and Authorization ("Consent") is provided by {COMPANY}, operator of the My Memoria Ally application at {APP_URL}. This document explains, in plain language, what personal and health information we collect, how we use it, who has access to it, and what rights you have.</p>
        <p>This Consent is required for all users of My Memoria Ally. By creating an account or using the App, you confirm that you have read and understood this document and consent to the data practices described herein.</p>
        <p>For patients who lack legal capacity to consent for themselves, this Consent must be given by the patient's legal guardian, healthcare proxy, or authorized representative.</p>
      </Sec>

      <Sec title="2. Who Is Collecting Your Data">
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong></p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>Website: <a href={"https://" + APP_URL} className="text-warm-bronze underline">{APP_URL}</a></p>
        </div>
      </Sec>

      <Sec title="3. What Information We Collect and Why">
        <Sub title="3.1 Account and Identity Information">
          <p>We collect: full name, preferred name, email address, phone number, date of birth (patients), profile photo (optional), and professional credentials (staff).</p>
          <p><strong>Why:</strong> To create and manage your account, verify your identity, and enable you to use the App.</p>
        </Sub>
        <Sub title="3.2 Health and Medical Information (Protected Health Information)">
          <p>For patient accounts, we collect health information including:</p>
          <Ul items={[
            "Diagnosis: dementia type, disease stage, cognitive assessment results",
            "Medications: names, dosages, schedules, administration records, and adherence logs",
            "Daily observations: mood, emotional state, behavioral symptoms, agitation, wandering",
            "Functional assessments: activities of daily living (dressing, bathing, eating, mobility, toileting)",
            "Nutritional records: meal intake percentages, appetite changes, swallowing concerns",
            "Sleep observations: quality, duration, day-night reversal",
            "Care plans, therapy goals, and clinical notes",
            "Incident reports and safety observations",
            "Emergency contact information",
            "Documents and media you choose to upload (photos, voice recordings, files)",
          ]} />
          <p><strong>Why:</strong> This information is used exclusively to support your care, coordinate your care team, and maintain accurate health records. It is never used for commercial purposes.</p>
        </Sub>
        <Sub title="3.3 Technical Usage Information">
          <p>We collect: session authentication tokens (stored temporarily in your browser — not persistent), app usage patterns (which features you use, not what you enter), device type and browser, and error logs.</p>
          <p><strong>Why:</strong> To keep the App secure, diagnose problems, and improve the service. No PHI is included in technical logs.</p>
        </Sub>
      </Sec>

      <Sec title="4. How Your Information Is Used">
        <p>We use your information only for the following purposes:</p>
        <Ul items={[
          "Providing all features of the care coordination platform to you and your care team",
          "Authenticating your identity and maintaining the security of your account",
          "Enabling authorized care team members to view and update your care records",
          "Sending account notifications: password resets, security alerts, subscription reminders",
          "Maintaining HIPAA-required audit logs of all access to your health records",
          "Complying with legal, regulatory, and contractual obligations",
          "Responding to law enforcement or court orders where legally required",
          "Diagnosing and resolving technical problems in the App",
        ]} />
        <InfoBox color="red">
          <strong>We will NEVER:</strong> sell your information to any third party · use your data for marketing or advertising · use your health data to train AI or machine learning models · share your data with insurance companies · use your data for any commercial purpose outside of providing this service.
        </InfoBox>
      </Sec>

      <Sec title="5. Who Has Access to Your Information">
        <p>Access to your information is strictly limited to:</p>
        <Ul items={[
          "You — full access to your own records at all times",
          "Your assigned Patient Care Coordinator — full access to your care record to support your daily care needs",
          "Your assigned Therapist — access to your clinical records relevant to their therapeutic work with you",
          "Your facility or organization's Master Administrator — administrative access for operational and compliance purposes within their facility",
          "Salahuddeen Enterprises technical staff — limited platform-level access strictly for technical operations, maintenance, and security purposes only, subject to internal access controls and audit logging",
          "Supabase, Inc. — our database infrastructure provider stores your data but has no right to independently access, use, or disclose it; governed by a Data Processing Agreement",
        ]} />
        <p><strong>No one else</strong> — including other patients, other facilities, insurance companies, pharmaceutical companies, advertising networks, or government agencies (unless legally required) — has access to your information.</p>
      </Sec>

      <Sec title="6. How Long We Keep Your Information">
        <Ul items={[
          "Active account data: retained throughout your subscription",
          "Health records and PHI: minimum 6 years as required by HIPAA (45 CFR §164.530(j))",
          "Audit logs: minimum 7 years per HIPAA requirements",
          "After account deletion: personal data deleted or anonymized within 30 days; health records retained for legally required periods",
          "Media files (photos, videos): deleted within 30 days of account deletion unless required for legal holds",
        ]} />
      </Sec>

      <Sec title="7. Your Rights Over Your Information">
        <Ul items={[
          "Right to Access — request and receive a copy of all personal and health information we hold about you",
          "Right to Correction — request that we correct any inaccurate or incomplete information",
          "Right to Deletion — request that we delete your personal information (subject to legal retention requirements)",
          "Right to Restrict Processing — ask us to limit how we use your data in certain circumstances",
          "Right to Data Portability — receive your data in a structured, machine-readable format",
          "Right to Withdraw Consent — withdraw your consent to data processing at any time by contacting us",
          "Right to Lodge a Complaint — file a complaint with the Federal Trade Commission (FTC), HHS Office for Civil Rights (for HIPAA matters), or your state Attorney General",
          "HIPAA Access Right — obtain a copy of your health records within 30 days of request",
        ]} />
        <p>To exercise any of these rights: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
      </Sec>

      <Sec title="8. Consent for Minors">
        <p>If you are creating a patient account for a person under 18 years of age, you confirm that you are their parent, legal guardian, or authorized healthcare representative, and that you are providing consent on their behalf. You accept full responsibility for ensuring that the minor's use of the App complies with these terms.</p>
      </Sec>

      <Sec title="9. Withdrawing Consent">
        <p>You may withdraw your consent to data processing at any time by contacting us at <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a>. Please be aware that:</p>
        <Ul items={[
          "Withdrawal of consent will result in the deactivation of your account and loss of access to the App",
          "Withdrawal does not affect the lawfulness of any processing that occurred before the withdrawal",
          "Certain health records may be retained for legally required periods even after consent is withdrawn",
          "We will confirm receipt of your withdrawal request within 5 business days",
          "Account deactivation and data deletion will be completed within 30 days of your confirmed request",
        ]} />
      </Sec>

      <Sec title="10. Changes to This Consent">
        <p>If we make material changes to how we collect or use your information, we will notify you by email and by displaying a prominent notice in the App. Continued use of the App after notification constitutes acceptance of the updated terms.</p>
      </Sec>

      <Sec title="11. Contact Us">
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong></p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>Website: <a href={"https://" + APP_URL} className="text-warm-bronze underline">{APP_URL}</a></p>
        </div>
      </Sec>
    </>
  );
}

// ─── SECURITY PRACTICES ───────────────────────────────────────────────────────

function SecurityContent() {
  return (
    <>
      <DocHeader
        title="Security Practices"
        subtitle="Technical and Organizational Security Measures for My Memoria Ally"
        tag="My Memoria Ally"
      />

      <InfoBox color="green">
        <strong>Security Overview:</strong> My Memoria Ally implements enterprise-grade security controls meeting HIPAA Security Rule requirements. All health data is encrypted at rest and in transit, access is strictly controlled by role, and every action affecting patient records is permanently logged.
      </InfoBox>

      <div className="my-6" />

      <Sec title="1. Overview and Commitment">
        <p>{COMPANY} is committed to protecting the security, integrity, and confidentiality of all information processed through the My Memoria Ally application. The App handles Protected Health Information (PHI) for vulnerable individuals living with cognitive conditions, and we take this responsibility with the utmost seriousness.</p>
        <p>Our security program is designed to meet or exceed the requirements of the HIPAA Security Rule (45 CFR Part 164, Subparts A and C), and draws upon industry frameworks including NIST Cybersecurity Framework and SOC 2 Type II controls.</p>
      </Sec>

      <Sec title="2. Infrastructure Security">
        <Sub title="2.1 Database and Backend (Supabase / AWS)">
          <p>The App's entire backend infrastructure runs on Supabase, which is hosted on Amazon Web Services (AWS). This provides:</p>
          <Ul items={[
            "PostgreSQL relational database with AES-256 encryption at rest for all data",
            "TLS 1.2/1.3 encryption for all database connections in transit",
            "SOC 2 Type II certified infrastructure (Supabase and AWS)",
            "AWS physical data center security: biometric access controls, 24/7 on-site security, redundant power, and environmental monitoring",
            "Automated daily database backups with point-in-time recovery (PITR) for minimum 7 days",
            "Multi-region availability with automated failover",
            "DDoS protection at the infrastructure layer",
            "AWS is HIPAA-eligible and maintains a BAA with {COMPANY}",
          ]} />
        </Sub>
        <Sub title="2.2 Application Hosting (Vercel)">
          <p>The App frontend is deployed on Vercel's edge network:</p>
          <Ul items={[
            "Global CDN across 100+ edge locations for performance and availability",
            "Automatic DDoS protection and rate limiting",
            "HTTPS enforcement on all endpoints — no unencrypted HTTP connections accepted",
            "Automatic TLS certificate provisioning and renewal",
            "Deployment isolation: each deployment is immutable and independently rollbackable",
            "Preview deployments are access-controlled and not publicly reachable",
          ]} />
        </Sub>
        <Sub title="2.3 File and Media Storage">
          <p>All patient-uploaded files (photos, videos, voice recordings, documents) are stored in private Supabase Storage buckets:</p>
          <Ul items={[
            "Buckets are not publicly accessible under any circumstances",
            "Access is gated exclusively through time-limited, cryptographically signed URLs generated server-side",
            "Signed URLs expire after 1 hour by default — they cannot be reused after expiration",
            "Files are organized in per-patient folder paths: videos/{patientId}/, images/{patientId}/",
            "Storage policies enforce that patients can only access files within their own folder path",
            "Files are encrypted at rest with AES-256 within AWS S3",
          ]} />
        </Sub>
      </Sec>

      <Sec title="3. Access Controls">
        <Sub title="3.1 Role-Based Access Control (RBAC)">
          <p>Every user of My Memoria Ally operates within a strictly defined role. The roles and their data access scopes are:</p>
          <Ul items={[
            "Patient — read/write access to their own records only; cannot access any other patient's data",
            "Patient Care Coordinator — full access to the records of patients explicitly assigned to them by an administrator; cannot access unassigned patients",
            "Therapist — read/write access to clinical records of assigned patients; cannot access patients not assigned to them",
            "Master Administrator — administrative access to all records within their organization; cannot access records of other organizations",
            "SuperAdmin (Salahuddeen Enterprises staff) — platform-level access for technical operations; all access is audit-logged and subject to internal access control policies",
          ]} />
        </Sub>
        <Sub title="3.2 Row-Level Security (RLS) at the Database Layer">
          <p>All tables in the database containing PHI are protected by PostgreSQL Row Level Security policies. These policies are defined at the database level and:</p>
          <Ul items={[
            "Are evaluated for every query regardless of the application layer",
            "Cannot be bypassed by the application code, REST API calls, or any client-side manipulation",
            "Enforce that each user can only SELECT, INSERT, UPDATE, or DELETE rows that belong to their authorized scope",
            "Are version-controlled and tested as part of every deployment",
            "Include policies scoped to patient_id, organization_id, and user role",
          ]} />
        </Sub>
        <Sub title="3.3 Authentication Security">
          <Ul items={[
            "All passwords are stored as bcrypt hashes — plaintext passwords are never stored anywhere in the system",
            "Session tokens (JWTs) are stored exclusively in sessionStorage — not localStorage — so they expire automatically when the browser tab is closed",
            "Automatic session termination after 15 minutes of user inactivity (implemented both client-side and validated server-side)",
            "All new staff accounts are provisioned with a temporary password and must complete a forced password change on first login",
            "Password reset is email-verified using secure, time-limited, single-use tokens",
            "TOTP-based Multi-Factor Authentication (MFA) is supported for staff accounts via Google Authenticator, Authy, or compatible apps",
            "Concurrent session limits prevent account sharing",
          ]} />
        </Sub>
      </Sec>

      <Sec title="4. Data Encryption">
        <Sub title="4.1 Encryption at Rest">
          <Ul items={[
            "All database records containing PHI: AES-256 encryption via Supabase / AWS RDS encryption",
            "All file storage (photos, videos, documents): AES-256 encryption via AWS S3 server-side encryption",
            "Encryption keys are managed by AWS Key Management Service (KMS) with automatic annual rotation",
          ]} />
        </Sub>
        <Sub title="4.2 Encryption in Transit">
          <Ul items={[
            "All client-to-server communication: TLS 1.3 with forward secrecy",
            "TLS 1.2 is accepted as a minimum for legacy compatibility; TLS 1.0 and 1.1 are disabled",
            "HTTP Strict Transport Security (HSTS) is enforced on all endpoints",
            "All API calls between application and database: encrypted via Supabase client library over TLS",
            "Certificate pinning is implemented in the mobile app builds",
          ]} />
        </Sub>
      </Sec>

      <Sec title="5. Audit Logging and Monitoring">
        <p>My Memoria Ally maintains comprehensive, immutable audit logs of all significant system events:</p>
        <Ul items={[
          "Authentication events: login successes, login failures, password resets, session timeouts, logouts",
          "Patient record access: every view, creation, update, and deletion of patient records",
          "Medication log entries: dose recordings, late markings, and undos",
          "Document and media access: file uploads, downloads, and deletions",
          "Administrative actions: user provisioning, role changes, account deactivation",
          "Security events: failed access attempts, privilege escalation attempts",
        ]} />
        <p>All audit logs are:</p>
        <Ul items={[
          "Immutable — implemented via database triggers that prevent modification or deletion of log entries",
          "Timestamped with UTC timezone",
          "Associated with the authenticated user ID performing the action",
          "Retained for a minimum of 7 years in compliance with HIPAA audit log requirements",
          "Accessible to facility administrators for their own organization's activity",
          "Accessible to Salahuddeen Enterprises SuperAdmins for platform-level security monitoring",
        ]} />
      </Sec>

      <Sec title="6. Vulnerability Management and Security Testing">
        <Ul items={[
          "All dependencies are monitored for known vulnerabilities using automated dependency scanning",
          "Security patches are applied within 30 days of public disclosure for non-critical vulnerabilities, and within 72 hours for critical vulnerabilities",
          "Code changes undergo peer review before deployment",
          "The application is tested against OWASP Top 10 vulnerability categories",
          "Annual penetration testing is conducted by independent security researchers",
          "Security incidents are documented, reviewed, and used to improve security controls",
        ]} />
      </Sec>

      <Sec title="7. Business Continuity and Disaster Recovery">
        <Ul items={[
          "Automated database backups run daily with point-in-time recovery capability",
          "Recovery Point Objective (RPO): maximum 24 hours of data loss in a catastrophic failure scenario",
          "Recovery Time Objective (RTO): App restoration within 4 hours of major infrastructure failure",
          "Redundant application deployment across multiple edge regions via Vercel CDN",
          "Database failover handled automatically by Supabase / AWS infrastructure",
          "Backup restoration is tested quarterly",
        ]} />
      </Sec>

      <Sec title="8. Workforce Security">
        <Ul items={[
          "All Salahuddeen Enterprises staff with access to production systems undergo security awareness training",
          "Access to production infrastructure is granted on a least-privilege basis",
          "All staff access to patient data is logged in the audit trail",
          "Offboarding procedures immediately revoke all system access for departing personnel",
          "Internal security incidents are reported to the Privacy and Security Officer within 24 hours",
        ]} />
      </Sec>

      <Sec title="9. Reporting Security Concerns">
        <p>If you discover a security vulnerability or believe your account has been compromised, contact us immediately:</p>
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong> — Security Team</p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>We will acknowledge security reports within 24 hours and provide updates throughout the resolution process.</p>
        </div>
      </Sec>
    </>
  );
}

// ─── TERMS OF SERVICE ─────────────────────────────────────────────────────────

function TermsContent() {
  return (
    <>
      <DocHeader
        title="Terms of Service"
        subtitle="User Agreement Governing Access to and Use of My Memoria Ally"
        tag="My Memoria Ally"
      />

      <InfoBox color="amber">
        <strong>Important:</strong> Please read these Terms of Service carefully before using My Memoria Ally. By creating an account or using the App in any way, you agree to be legally bound by these Terms. If you do not agree, you must not use the App.
      </InfoBox>

      <div className="my-6" />

      <Sec title="1. Acceptance of Terms">
        <p>These Terms of Service ("Terms") constitute a legally binding agreement between you ("User," "you," or "your") and {COMPANY} ("Company," "we," "us," or "our"), governing your access to and use of the My Memoria Ally application ("App") available at {APP_URL} and via the iOS and Android mobile apps.</p>
        <p>By creating an account, clicking "I Agree," accessing, or using the App in any manner — including accessing any feature or content — you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy, which is incorporated herein by reference. If you do not agree, you must immediately cease all use of the App.</p>
      </Sec>

      <Sec title="2. Description of Service">
        <p>My Memoria Ally is a dementia and cognitive care coordination platform designed to support:</p>
        <Ul items={[
          "Patients living with dementia, Alzheimer's disease, mild cognitive impairment, ADHD, autism, traumatic brain injury (TBI), anxiety disorders, or other cognitive conditions",
          "Patient Care Coordinators including family caregivers, professional caregivers, and designated support persons",
          "Licensed clinical therapists including occupational therapists, speech-language pathologists, neuropsychologists, and social workers",
          "Healthcare facility administrators and organizational managers",
        ]} />
        <p>The App provides tools and features including: daily orientation and routine support, medication tracking and reminders, mood monitoring and behavioral logging, therapy notes and goal tracking, care plan management, activities of daily living (ADL) documentation, family connection features, memory activities, brain training games, secure care team communication, and care partner check-in tools.</p>
        <InfoBox color="red">
          <strong>Medical Disclaimer:</strong> My Memoria Ally is intended as a care support and coordination tool ONLY. The App does NOT constitute medical advice, medical diagnosis, or medical treatment. The App is not a substitute for professional medical judgment, care, or supervision. Always consult a qualified and licensed healthcare professional for all medical decisions, diagnoses, and treatment plans. In a medical emergency, call 911 immediately.
        </InfoBox>
      </Sec>

      <Sec title="3. Eligibility Requirements">
        <p>To use My Memoria Ally, you must meet the following eligibility requirements:</p>
        <Ul items={[
          "You must be at least 18 years of age to create an account as a care coordinator, therapist, or administrator",
          "Patient accounts may be created on behalf of individuals under 18 by a parent, legal guardian, or authorized healthcare representative who accepts these Terms on the minor's behalf",
          "You must have the legal authority to enter into this agreement — if you are acting on behalf of an organization, you represent that you have the authority to bind that organization to these Terms",
          "You must provide accurate, truthful, and current registration information",
          "You must not be prohibited by law from using health information technology services",
          "Healthcare professionals must hold current, valid licensure in their jurisdiction for their represented role",
        ]} />
      </Sec>

      <Sec title="4. Account Registration, Credentials, and Security">
        <Sub title="4.1 Account Creation">
          <p>Patient accounts may be self-registered through the public registration flow. Staff accounts (Care Coordinators, Therapists, Administrators) are provisioned by an authorized Master Administrator within their organization — staff may not create accounts independently.</p>
        </Sub>
        <Sub title="4.2 Credential Security Obligations">
          <p>You are responsible for:</p>
          <Ul items={[
            "Maintaining the strict confidentiality of your username, password, and any multi-factor authentication credentials",
            "Not disclosing your login credentials to any other person under any circumstances",
            "Logging out of the App when using shared or public devices",
            "Immediately notifying us at " + EMAIL + " if you know or suspect your account has been accessed without your authorization",
            "All activities that occur under your account, whether or not you authorized them",
          ]} />
        </Sub>
        <Sub title="4.3 Account Accuracy">
          <p>You agree to provide accurate, current, and complete information during registration and to update your information to keep it accurate. Providing false or misleading information, particularly regarding professional credentials, is grounds for immediate account termination.</p>
        </Sub>
      </Sec>

      <Sec title="5. Subscription, Fees, and Payment">
        <Sub title="5.1 Subscription Requirement">
          <p>Access to My Memoria Ally requires a paid subscription. The App offers monthly subscription plans at rates published at {APP_URL}/pricing. All plan pricing is inclusive of applicable taxes where required.</p>
        </Sub>
        <Sub title="5.2 Automatic Renewal">
          <p>All subscriptions automatically renew at the end of each billing period unless you cancel before the renewal date. You authorize us to charge your payment method for each renewal. Renewal charges will be at the then-current rate for your plan.</p>
        </Sub>
        <Sub title="5.3 Refund Policy">
          <p>All subscription fees are non-refundable except as required by applicable law or as expressly stated in a written agreement with {COMPANY}. If you cancel your subscription, you will retain access through the end of your current paid billing period.</p>
        </Sub>
        <Sub title="5.4 Price Changes">
          <p>We reserve the right to change subscription pricing at any time with at least 30 days advance notice provided by email. Continued use of the App after the price change takes effect constitutes acceptance of the new pricing.</p>
        </Sub>
        <Sub title="5.5 Failed Payments">
          <p>If a subscription payment fails, we will retry the charge and notify you by email. If payment cannot be collected after reasonable attempts, your account will be suspended and you will lose access to the App until payment is resolved.</p>
        </Sub>
      </Sec>

      <Sec title="6. Permitted Use of the App">
        <p>You may use the App only for lawful purposes and strictly in accordance with these Terms. Permitted uses include:</p>
        <Ul items={[
          "Managing and coordinating care for patients with cognitive conditions within your authorized role",
          "Accessing clinical tools, care records, and documentation features within your assigned scope",
          "Communicating with authorized members of a patient's care team using the App's built-in communication features",
          "Documenting care activities, clinical observations, therapy notes, and care plans",
          "Using patient-facing features including medication reminders, mood tracking, games, and routine support",
        ]} />
      </Sec>

      <Sec title="7. Prohibited Conduct">
        <p>You agree not to engage in any of the following conduct:</p>
        <Ul items={[
          "Access, view, modify, or download records of patients not explicitly assigned to you within your authorized role",
          "Share your login credentials with any other person or allow anyone else to use your account",
          "Attempt to bypass, defeat, or circumvent any role-based access controls, authentication mechanisms, or security measures",
          "Access or attempt to access any part of the App or its infrastructure beyond your authorized scope",
          "Upload or transmit malicious code, viruses, worms, trojans, or any harmful software",
          "Use the App to harass, abuse, threaten, intimidate, or harm any person",
          "Use the App to violate any individual's privacy, dignity, or HIPAA rights",
          "Reverse engineer, decompile, disassemble, or attempt to extract source code, trade secrets, or proprietary algorithms from the App",
          "Reproduce, copy, sell, resell, or exploit any portion of the App without express written permission",
          "Use automated scripts, bots, or scrapers to access or extract data from the App",
          "Impersonate any person or entity, or misrepresent your credentials or role",
          "Use the App in any way that violates any applicable local, state, federal, national, or international law or regulation",
          "Interfere with or disrupt the integrity, performance, or security of the App or its infrastructure",
          "Transmit unsolicited communications through the App's messaging features",
        ]} />
        <p>Violation of these prohibitions may result in immediate account suspension or termination and, where applicable, referral to law enforcement.</p>
      </Sec>

      <Sec title="8. Health Information, HIPAA, and Compliance Obligations">
        <p>You agree to use the App in full compliance with HIPAA, the HITECH Act, and all other applicable federal and state laws governing the privacy and security of health information.</p>
        <p>Healthcare organizations using My Memoria Ally must execute a Business Associate Agreement with {COMPANY} before any PHI is transmitted through the App. Organizations that use the App without an executed BAA are in violation of HIPAA.</p>
        <p>You are responsible for ensuring that your organization's use of the App complies with all regulatory requirements applicable to your jurisdiction and practice area, including but not limited to state privacy laws, professional licensing requirements, and facility accreditation standards.</p>
      </Sec>

      <Sec title="9. Content You Submit">
        <p>You retain ownership of all content you submit to the App, including patient records, clinical notes, photographs, voice recordings, and documents. By submitting content, you grant {COMPANY} a limited, non-exclusive, worldwide license to store, process, and transmit your content solely as necessary to provide the App services and comply with legal obligations.</p>
        <p>You represent and warrant that you have all rights, permissions, and consents necessary to submit any content to the App, including any required patient authorizations for photographs or recordings.</p>
        <p>You are solely responsible for the accuracy, completeness, and legality of all content you submit. {COMPANY} does not review or validate clinical content for medical accuracy.</p>
      </Sec>

      <Sec title="10. Intellectual Property">
        <Sub title="10.1 Our Intellectual Property">
          <p>The App, including its software, design, user interface, graphics, text, algorithms, features, functionality, and all other content, is owned by {COMPANY} and is protected by copyright, trademark, patent, trade secret, and other intellectual property laws. All rights not expressly granted in these Terms are reserved.</p>
        </Sub>
        <Sub title="10.2 License to You">
          <p>Subject to your compliance with these Terms and maintenance of an active subscription, {COMPANY} grants you a limited, non-exclusive, non-transferable, revocable license to access and use the App solely for your authorized care coordination purposes. This license does not include any right to resell, sublicense, or make derivative works from the App.</p>
        </Sub>
        <Sub title="10.3 Feedback">
          <p>If you provide us with feedback, suggestions, or ideas about the App ("Feedback"), you grant us an unlimited, irrevocable, royalty-free license to use, incorporate, and commercialize such Feedback without any obligation to you.</p>
        </Sub>
      </Sec>

      <Sec title="11. Third-Party Services">
        <p>The App integrates with or links to third-party services including Supabase (database infrastructure), Vercel (hosting), and Stripe (payment processing). Your use of these third-party services is subject to their respective terms of service and privacy policies. {COMPANY} is not responsible for the practices of third-party service providers.</p>
      </Sec>

      <Sec title="12. Disclaimers and Limitation of Liability">
        <Sub title="12.1 Disclaimer of Warranties">
          <p>THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. TO THE FULLEST EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO: IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT; WARRANTIES THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, VIRUS-FREE, OR COMPLETELY SECURE; AND WARRANTIES REGARDING THE ACCURACY OR RELIABILITY OF ANY CONTENT OR INFORMATION OBTAINED THROUGH THE APP.</p>
        </Sub>
        <Sub title="12.2 Limitation of Liability">
          <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL {COMPANY.toUpperCase()}, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO: LOSS OF PROFITS, DATA, GOODWILL, OR USE; COSTS OF PROCUREMENT OF SUBSTITUTE SERVICES; OR ANY OTHER INTANGIBLE LOSSES — ARISING OUT OF OR RELATED TO YOUR ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE APP, EVEN IF {COMPANY.toUpperCase()} HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
          <p>In jurisdictions that do not allow the exclusion or limitation of certain damages, our liability is limited to the maximum extent permitted by law. In no event shall our total aggregate liability to you exceed the total subscription fees paid by you to {COMPANY} in the twelve (12) months immediately preceding the event giving rise to the claim.</p>
        </Sub>
        <Sub title="12.3 Indemnification">
          <p>You agree to indemnify, defend, and hold harmless {COMPANY} and its officers, directors, employees, agents, and licensors from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, and attorney's fees arising out of or relating to: your violation of these Terms; your use of the App; your violation of any third-party right; or your violation of any applicable law.</p>
        </Sub>
      </Sec>

      <Sec title="13. Account Suspension and Termination">
        <Sub title="13.1 Termination by You">
          <p>You may terminate your account at any time by contacting us at <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a>. Upon termination, your access to the App will cease at the end of your current paid billing period, and your data will be handled in accordance with our Privacy Policy.</p>
        </Sub>
        <Sub title="13.2 Termination by Us">
          <p>We may suspend or terminate your account and access to the App, with or without notice and at our sole discretion, for any of the following reasons:</p>
          <Ul items={[
            "Violation of any provision of these Terms",
            "Failure to maintain an active, paid subscription",
            "Fraudulent, abusive, or illegal activity",
            "Actions that endanger patient safety or violate HIPAA",
            "Misrepresentation of professional credentials",
            "At the direction of your organization's administrator (for staff accounts)",
          ]} />
        </Sub>
        <Sub title="13.3 Effect of Termination">
          <p>Upon termination, all licenses granted to you under these Terms immediately terminate. Provisions that by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnification, and limitations of liability.</p>
        </Sub>
      </Sec>

      <Sec title="14. Governing Law and Dispute Resolution">
        <p>These Terms are governed by and construed in accordance with the laws of the State of North Carolina, without regard to its conflict of law principles. Any legal action or proceeding arising under these Terms shall be brought exclusively in the state or federal courts located in Wake County, North Carolina, and you hereby consent to personal jurisdiction and venue in those courts.</p>
        <p>Before initiating any formal dispute, both parties agree to attempt good-faith negotiation for a period of 30 days following written notice of the dispute. Nothing in this section prevents either party from seeking emergency injunctive relief from a court of competent jurisdiction to protect intellectual property or confidential information.</p>
      </Sec>

      <Sec title="15. Changes to Terms">
        <p>We reserve the right to modify these Terms at any time. When we make changes, we will:</p>
        <Ul items={[
          "Post the updated Terms on this page with a new effective date",
          "Send email notification to registered users for material changes",
          "Display a prominent notice in the App for material changes",
          "Where required by applicable law, obtain your affirmative consent before applying material changes",
        ]} />
        <p>Your continued use of the App after changes take effect constitutes acceptance of the revised Terms. If you do not agree to the revised Terms, you must discontinue use of the App.</p>
      </Sec>

      <Sec title="16. Miscellaneous">
        <Ul items={[
          "Entire Agreement — these Terms, together with our Privacy Policy and any executed BAA, constitute the entire agreement between you and {COMPANY} with respect to the App",
          "Severability — if any provision of these Terms is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect",
          "Waiver — our failure to enforce any right or provision of these Terms shall not be considered a waiver of those rights",
          "Assignment — you may not assign or transfer your rights under these Terms without our prior written consent; we may assign our rights without restriction",
          "Force Majeure — we are not liable for any delay or failure in performance caused by circumstances beyond our reasonable control",
          "Notices — notices to us should be sent to " + EMAIL + "; notices to you will be sent to the email address registered with your account",
        ]} />
      </Sec>

      <Sec title="17. Contact Information">
        <div className="bg-stone-50 rounded-xl p-4 text-sm space-y-1">
          <p><strong>{COMPANY}</strong></p>
          <p>Email: <a href={"mailto:" + EMAIL} className="text-warm-bronze underline">{EMAIL}</a></p>
          <p>Website: <a href={"https://" + APP_URL} className="text-warm-bronze underline">{APP_URL}</a></p>
        </div>
      </Sec>
    </>
  );
}

// ─── Content map ──────────────────────────────────────────────────────────────

const CONTENT_MAP: Record<DocId, React.ReactNode> = {
  privacy:  <PrivacyPolicyContent />,
  hipaa:    <HIPAAContent />,
  baa:      <BAAContent />,
  consent:  <DataConsentContent />,
  security: <SecurityContent />,
  terms:    <TermsContent />,
};

// ─── Main layout ──────────────────────────────────────────────────────────────

export default function PrivacyPage({ initialDoc }: { initialDoc?: DocId } = {}) {
  const [activeDoc, setActiveDoc] = useState<DocId>(initialDoc || 'privacy');

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
            <div>
              <p className="font-bold text-charcoal leading-tight">My Memoria Ally</p>
              <p className="text-xs text-charcoal/50 leading-tight">Privacy & Legal Documents</p>
            </div>
          </div>
          <a
            href={"https://" + APP_URL}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm text-warm-bronze hover:underline font-medium"
          >
            ← Back to App
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Mobile tab selector */}
        <div className="md:hidden mb-6">
          <label className="block text-xs font-bold text-charcoal/50 uppercase tracking-widest mb-2">Select Document</label>
          <select
            value={activeDoc}
            onChange={e => setActiveDoc(e.target.value as DocId)}
            className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-charcoal shadow-sm"
          >
            {DOCS.map(doc => (
              <option key={doc.id} value={doc.id}>{doc.emoji} {doc.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-60 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-stone-200 p-2 sticky top-20 shadow-sm">
              <p className="text-xs font-bold text-charcoal/40 uppercase tracking-widest px-3 pt-2 pb-1">Legal Documents</p>
              {DOCS.map(doc => {
                const isActive = activeDoc === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setActiveDoc(doc.id)}
                    className={"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all " + (
                      isActive
                        ? 'bg-warm-bronze text-white font-semibold shadow-sm'
                        : 'text-charcoal/60 hover:bg-stone-50 hover:text-charcoal'
                    )}
                  >
                    <span className="text-lg leading-none flex-shrink-0">{doc.emoji}</span>
                    <span className="text-sm leading-snug">{doc.label}</span>
                  </button>
                );
              })}
              <div className="mt-3 pt-3 border-t border-stone-100 px-3 pb-2">
                <p className="text-xs text-charcoal/40 leading-relaxed">
                  Last updated: {EFFECTIVE_DATE}<br />
                  <a href={"mailto:" + EMAIL} className="text-warm-bronze hover:underline">{EMAIL}</a>
                </p>
              </div>
            </div>
          </aside>

          {/* Document content */}
          <main className="flex-1 bg-white rounded-2xl border border-stone-200 p-6 md:p-10 min-w-0 shadow-sm">
            {CONTENT_MAP[activeDoc]}
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-stone-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-charcoal/40">
          <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
          <p>
            <a href={"https://" + APP_URL} className="hover:text-warm-bronze transition-colors">{APP_URL}</a>
            {' · '}
            <a href={"mailto:" + EMAIL} className="hover:text-warm-bronze transition-colors">{EMAIL}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}