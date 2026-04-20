const documents = [
  {
    title: 'Privacy Policy',
    description: 'How personal, health-related, and account data is collected, used, protected, and disclosed.',
    href: '/docs/privacy/PrivacyPolicy.docx',
  },
  {
    title: 'HIPAA Compliance',
    description: 'HIPAA privacy and compliance documentation for the patient app.',
    href: '/docs/privacy/HIPAACompliance.docx',
  },
  {
    title: 'Business Associate Agreement',
    description: 'Business associate agreement template and supporting legal documentation.',
    href: '/docs/privacy/BusinessAssociateAgreement.docx',
  },
  {
    title: 'Data Consent',
    description: 'Consent and authorization language for patient and authorized caregiver data access.',
    href: '/docs/privacy/DataConsent.docx',
  },
  {
    title: 'Security Practices',
    description: 'Administrative, technical, and operational safeguards for protecting information.',
    href: '/docs/privacy/SecurityPractices.docx',
  },
  {
    title: 'Terms of Service',
    description: 'Terms governing use of My Memoria Ally and user responsibilities.',
    href: '/docs/privacy/TermsOfService.docx',
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-warm-ivory px-6 py-12">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-sm border border-stone-200 p-8 md:p-12">
        <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
          Privacy & Legal Documents
        </h1>

        <p className="text-charcoal/80 text-base md:text-lg leading-7 mb-10">
          This page provides access to the privacy, legal, HIPAA, and data protection
          documents for My Memoria Ally.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {documents.map((doc) => (
            <section
              key={doc.title}
              className="border border-stone-200 rounded-2xl p-6 bg-stone-50/50"
            >
              <h2 className="text-xl font-semibold text-charcoal mb-2">{doc.title}</h2>
              <p className="text-charcoal/75 leading-6 mb-5">{doc.description}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl bg-warm-bronze px-4 py-2 text-white font-medium hover:opacity-90 transition"
                >
                  Open document
                </a>
                <a
                  href={doc.href}
                  download
                  className="inline-flex items-center rounded-xl border border-stone-300 px-4 py-2 text-charcoal font-medium hover:bg-stone-100 transition"
                >
                  Download
                </a>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
