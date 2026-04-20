export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-warm-ivory px-6 py-12">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-sm border border-stone-200 p-8 md:p-12">
        <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">About Us</h1>

        <p className="text-charcoal/80 text-base md:text-lg leading-7 mb-6">
          My Memoria Ally is designed to support patients and the people who care for them
          through a calm, accessible, and structured digital care experience.
        </p>

        <div className="space-y-6 text-charcoal/80 leading-7">
          <section>
            <h2 className="text-xl font-semibold text-charcoal mb-2">Our Mission</h2>
            <p>
              Our mission is to make day-to-day support easier for patients, families,
              and care teams by organizing important health, routine, and communication
              information in one place.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-charcoal mb-2">What We Provide</h2>
            <p>
              My Memoria Ally focuses on patient-centered support through medication
              tracking, care coordination, reminders, mood and wellness information,
              and a more reassuring daily experience.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-charcoal mb-2">Our Commitment</h2>
            <p>
              We are committed to thoughtful design, data protection, and a respectful
              user experience for patients and their authorized support network.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
