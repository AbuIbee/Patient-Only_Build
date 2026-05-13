import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/button';
import {
  Heart,
  Brain,
  Clock,
  BookOpen,
  Activity,
  Shield,
  X,
  ArrowRight,
  Check,
  Star,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PricingPage from './PricingPage';

export default function LandingPage() {
  const { dispatch } = useApp();
  const [showPricing, setShowPricing] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleGetStarted = () => setShowPricing(true);
  const handleGoToLogin = () => {
    setShowPricing(false);
    dispatch({ type: 'SET_VIEW', payload: 'login' });
  };

  const features = [
    { icon: Brain,    title: 'Daily Orientation',    description: 'Gentle reminders of the time, date, and what matters today' },
    { icon: Clock,    title: 'Routine Support',       description: 'Step-by-step guidance for daily activities and habits' },
    { icon: BookOpen, title: 'Memory Vault',          description: 'Keep cherished people, moments, and memories close at hand' },
    { icon: Activity, title: 'Mood Tracking',         description: 'Log feelings over time and spot patterns that matter' },
    { icon: Heart,    title: 'Medication Reminders',  description: 'Never miss a dose with gentle, reliable medication alerts' },
    { icon: Shield,   title: 'Care Team Connect',     description: 'Keep family and care partners in the loop effortlessly' },
  ];

  const faqs = [
    { q: 'Who is My Memoria Ally designed for?', a: 'It supports people living with  Alzheimer\s, Dementia, Parkinson\s, MS, ALS, Huntington\s, PSP, or MSA, Traumatic Brain Injury, ADHD, Autism or other cognitive needs — and the families who care for them.' },
    { q: 'Do I need technical experience to use it?', a: 'Not at all. The interface is designed to be large, clear, and intuitive. If you can tap a button, you can use My Memoria Ally.' },
    { q: 'Can family members see what\'s happening?', a: 'Yes. Care partners get updates, can log check-ins, and stay connected — all without disrupting the patient\'s experience.' },
    { q: 'Is my health data kept private?', a: 'Absolutely. All data is stored securely and never sold. We follow strict privacy standards to protect you and your loved one.' },
  ];

  return (
    <div className="min-h-screen bg-warm-ivory font-sans">

      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-soft-taupe">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-9 h-9 rounded-xl object-cover shadow-sm" />
            <span className="text-lg font-bold text-charcoal tracking-tight">My Memoria Ally</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-medium-gray">
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-charcoal transition-colors">Features</button>
            <button onClick={() => document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-charcoal transition-colors">Stories</button>
            <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-charcoal transition-colors">FAQ</button>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={handleGoToLogin} className="text-sm text-medium-gray hover:text-charcoal font-medium transition-colors hidden sm:block">
              Sign In
            </button>
            <button onClick={handleGetStarted} className="bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm">
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="pt-16 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left: Copy */}
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="inline-flex items-center gap-2 bg-warm-bronze/10 text-warm-bronze text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6">
                <span className="w-1.5 h-1.5 bg-warm-bronze rounded-full animate-pulse" />
                Compassionate Care, Every Day
              </span>

              <h1 className="text-5xl lg:text-6xl font-bold text-charcoal leading-[1.1] mb-3">
                Stay oriented,<br />
                stay supported,<br />
                <span className="text-warm-bronze">every single day.</span>
              </h1>

              <p className="text-base text-charcoal font-semibold mb-5">
                Built for anyone living with a long-term or terminal illness that affects memory, mental health, and daily independence.
              </p>

              {/* WHO THIS APP IS FOR — scannable in 5-10 seconds */}
              <div className="mb-8 max-w-lg space-y-3">

              <p className="text-medium text-medium-gray leading-relaxed">
                  Whether the diagnosis is <span className="text-charcoal font-medium">Alzheimer's, Dementia, Parkinson's, MS </span> (Multiple Sclerosis), <span className="text-charcoal font-medium"> ALS </span> (Amyotrophic Lateral Sclerosis), <span className="text-charcoal font-medium"> Huntington's, PSP </span> (Progressive Supranuclear Palsy), <span className="text-charcoal font-medium"> MSA </span> (Multiple System Atrophy), <span className="text-charcoal font-medium"> Muscular Dystrophy, Hospice Care, ADHD, Autism, TBI </span> (Traumatic Brain Injury) <span className="text-charcoal font-medium"> or other cognitive needs </span> — if someone takes multiple medications, faces cognitive or physical decline, and relies on a caregiver, My Memoria Ally was built for you to lend a helping hand.  Because a diagnosis changes everything — but it doesn't have to take everything.
              </p>
              <p className="text-medium text-medium-gray leading-relaxed">
                It becomes more than support—it becomes a reliable record. Symptoms, mood changes, medications, and daily patterns are all captured in one place, so nothing important slips through the cracks. When it’s time to speak with a doctor or specialist, you’re not guessing—you’re prepared, informed, and able to clearly show what’s been happening over time.
              </p>
              </div>



              {/* Topic 2 — 3-part value strip */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { emoji: '🧠', who: 'For Patients',    benefit: 'Calm daily guidance' },
                  { emoji: '❤️', who: 'For Families',    benefit: 'Visibility & reassurance' },
                  { emoji: '🩺', who: 'For Care Teams',  benefit: 'Structured updates' },
                ].map(item => (
                  <div key={item.who} className="bg-white border border-soft-taupe rounded-2xl px-3 py-3 text-center shadow-sm">
                    <span className="text-xl block mb-1">{item.emoji}</span>
                    <p className="text-[11px] font-bold text-charcoal leading-tight">{item.who}</p>
                    <p className="text-[10px] text-medium-gray leading-tight mt-0.5">{item.benefit}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">

                <button
                  onClick={() => setShowLearnMore(true)}
                  className="flex items-center gap-2 bg-warm-bronze hover:bg-deep-bronze text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-md text-base"
                >
                  Choose Your Plan <ArrowRight className="w-4 h-4" />
                </button>

              <p className="mt-5 text-medium text-medium-gray">
                Already have an account?{' '}
                <button onClick={handleGoToLogin} className="text-warm-bronze hover:text-deep-bronze font-semibold underline underline-offset-2">
                  Sign in here
                </button>
              </p>

              </div>
            </motion.div>

            {/* Right: Story card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="space-y-5"
            >
              {/* Main card */}
            <div className="bg-white rounded-3xl p-8 border border-soft-taupe shadow-lg">
              
                {/* Topic 9 — 3 pillars */}
                <p className="text-lg font-bold text-charcoal leading-snug mb-3">
                  Built for the{' '} <span className="text-warm-bronze">quiet heroes</span></p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { emoji: '🧭', label: 'Orientation' },
                    { emoji: '🔁', label: 'Routine' },
                    { emoji: '💛', label: 'Reassurance' },
                  ].map(p => (
                    <div key={p.label} className="bg-warm-bronze/10 rounded-xl px-2 py-3 text-center">
                      <span className="text-xl block mb-1">{p.emoji}</span>
                      <p className="text-xs font-bold text-charcoal">{p.label}</p>
                    </div>
                  ))}
                </div>
              
                <div className="mt-8 pt-8 border-t border-soft-taupe"></div>
              <p className="text-medium font-bold text-charcoal leading-snug mb-3">
                The daughters, sons, husbands, and wives who show up every single day!
                </p>
                
                <p className="text-medium text-medium-gray leading-relaxed">
                  You're not a doctor or a nurse. You're someone who loves deeply and wants
                  to do right by them. My Memoria Ally gives you the tools to make every
                  day a little calmer — for both of you.
                </p>
                <br/>
                {/* Quote */}
              <p className="text-center text-sm text-warm-bronze font-semibold italic">
                "Because memory is precious. And so are you."
              </p>
                <div className="mt-5 pt-5 border-t border-soft-taupe">
                  <p className="text-xs text-medium-gray uppercase tracking-widest font-semibold mb-3">Hard utility built in</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { emoji: '💊', label: 'Multiple medications' },
                    { emoji: '💛', label: 'Mental health support' },
                    { emoji: '🦽', label: 'Physical assistance' },
                    { emoji: '👐', label: 'Caregiver coordination' },
                    { emoji: '⏰', label: 'Daily orientat­ion' },
                    { emoji: '👨‍👩‍👧', label: 'Family & Caregiver support' },
                  ].map(tag => (
                    <span key={tag.label} className="inline-flex items-justified gap-1 text-sm font-semibold bg-warm-bronze/10 text-warm-bronze border border-warm-bronze/20 px-3 py-1.5 rounded-full">
                      {tag.emoji} {tag.label}
                    </span>
                  ))}
                </div>
                </div>





                <div className="mt-5 pt-5 border-t border-soft-taupe">
                  <div className="bg-charcoal rounded-2xl px-5 py-4">
                    <p className="text-[14px] text-white/50 uppercase tracking-widest font-semibold mb-3">Primary: physical & mental decline</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Alzheimer\'s & Dementia', 'Parkinson\'s', 'Multiple Sclerosis (MS)', 'ALS', 'Huntington\'s Disease', 'other care provided needs'].map(tag => (
                        <span key={tag} className="text-xs font-semibold text-white bg-white/10 px-3 py-1.5 rounded-lg">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed">
                      And the <span className="text-white font-semibold">Families & Care Partners</span> who support them every day.
                    </p>
                  </div>
                </div>
              </div>


              
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <section className="bg-warm-bronze py-10 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { value: '98%', label: 'of caregivers feel less anxious after 2 weeks' },
            { value: '4.9★', label: 'average rating from families and patients' },
            { value: '10 min', label: 'average daily time — gentle, never overwhelming' },
          ].map(stat => (
            <motion.div
              key={stat.value}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-white/80 leading-snug max-w-[140px] mx-auto">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-block bg-warm-bronze/10 text-warm-bronze text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
              Everything You Need
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-charcoal">Orientation. Routine. Reassurance.</h2>
            <p className="text-medium-gray mt-3 max-w-md mx-auto">Unlike generic reminder or care apps, My Memoria Ally combines daily orientation, emotional reassurance, and caregiver visibility in one calm experience.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group bg-warm-ivory hover:bg-warm-bronze/5 border border-transparent hover:border-warm-bronze/20 rounded-2xl p-6 transition-all"
              >
                <div className="w-11 h-11 bg-warm-bronze/10 group-hover:bg-warm-bronze/20 rounded-xl flex items-center justify-center mb-4 transition-colors">
                  <f.icon className="w-5 h-5 text-warm-bronze" />
                </div>
                <h3 className="font-bold text-charcoal mb-1.5">{f.title}</h3>
                <p className="text-sm text-medium-gray leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────── */}
      <section id="testimonials" className="py-20 px-6 bg-warm-ivory">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-block bg-warm-bronze/10 text-warm-bronze text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
              Real Stories
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-charcoal">Families who found their footing</h2>
            <p className="text-medium-gray mt-3 max-w-lg mx-auto">
              From early mornings to quiet evenings, My Memoria Ally is there.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { quote: "Mom used to wake up confused and frightened every morning. Now she opens the app, sees her name, the date, and a kind message — and her whole face relaxes. That small thing changed everything for us.", name: "Sandra M.", role: "Daughter & Primary Caregiver", location: "Austin, TX", emoji: "👩‍👧", tag: "Caregiver", tagColor: "bg-calm-blue/15 text-calm-blue" },
              { quote: "I was losing track of my medications and feeling embarrassed to ask for help. This app just quietly reminds me — no fuss, no judgment. I feel like myself again.", name: "Walter B.", role: "Patient, 78 years young", location: "Charleston, SC", emoji: "👴", tag: "Patient", tagColor: "bg-soft-sage/20 text-soft-sage" },
              { quote: "Our nursing staff used to spend hours fielding calls from worried family members. Since partnering with My Memoria Ally, those calls have dropped dramatically and families feel genuinely supported.", name: "Rebecca T.", role: "Director of Care, Sunrise Living", location: "Denver, CO", emoji: "👩‍⚕️", tag: "Care Facility", tagColor: "bg-warm-bronze/15 text-warm-bronze" },
              { quote: "My husband has Alzheimer's and every day used to feel like a battle. Now I log his mood, his meals, how he slept — and I actually feel in control. I can breathe again.", name: "Darlene H.", role: "Wife & Full-time Caregiver", location: "Nashville, TN", emoji: "❤️", tag: "Caregiver", tagColor: "bg-calm-blue/15 text-calm-blue" },
              { quote: "I told my daughter I didn't want some complicated computer thing. But this is so simple — big buttons, kind words, and it always knows my name. I actually look forward to checking in.", name: "Evelyn R.", role: "Patient, 82", location: "Savannah, GA", emoji: "🌸", tag: "Patient", tagColor: "bg-soft-sage/20 text-soft-sage" },
              { quote: "I work two jobs and live three hours away. I used to lie awake worrying about Dad. Now I get a little update and I know he's on track. I sleep better. He's happier. We're closer.", name: "Marcus J.", role: "Son & Long-distance Caregiver", location: "Philadelphia, PA", emoji: "👨‍👦", tag: "Caregiver", tagColor: "bg-calm-blue/15 text-calm-blue" },
            ].map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="bg-white rounded-2xl p-6 border border-soft-taupe shadow-sm flex flex-col"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star key={si} className="w-4 h-4 text-warm-amber fill-warm-amber" />
                  ))}
                </div>
                <p className="text-sm text-charcoal leading-relaxed flex-1 mb-5">
                  <span className="text-warm-bronze text-xl font-serif">"</span>
                  {t.quote}
                  <span className="text-warm-bronze text-xl font-serif">"</span>
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-soft-taupe/40">
                  <div className="w-10 h-10 rounded-full bg-warm-bronze/10 flex items-center justify-center text-xl flex-shrink-0">
                    {t.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-charcoal">{t.name}</p>
                    <p className="text-xs text-medium-gray truncate">{t.role}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${t.tagColor}`}>
                    {t.tag}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block bg-warm-bronze/10 text-warm-bronze text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
              FAQ
            </span>
            <h2 className="text-3xl font-bold text-charcoal">Common questions</h2>
          </motion.div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="border border-soft-taupe rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left bg-white hover:bg-warm-ivory transition-colors"
                >
                  <span className="font-semibold text-charcoal text-sm pr-4">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-medium-gray flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 text-sm text-medium-gray leading-relaxed border-t border-soft-taupe/40 pt-4">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-charcoal">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Start your daily support system today
          </h2>
          <p className="text-white/60 mb-8 text-lg">Plans from $2.99/month. Simple, honest pricing.</p>
          <button
            onClick={handleGetStarted}
            className="bg-warm-bronze hover:bg-deep-bronze text-white font-bold px-10 py-4 rounded-xl text-base transition-colors shadow-lg inline-flex items-center gap-2"
          >
            See Plans &amp; Pricing <ArrowRight className="w-4 h-4" />
          </button>
          <p className="mt-4 text-sm text-white/40">Immediate access after checkout.</p>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-charcoal border-t border-white/10 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-semibold text-white/60">My Memoria Ally</span>
          </div>
            <span className="font-semibold text-white/60">
            <a href="/privacy" className="hover:underline">
              Privacy
            </a></span>
            <span className="font-semibold text-white/60">
            <a href="/about-us" className="hover:underline">
              About Us
            </a></span>
          <p>© 2025 My Memoria Ally. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Pricing modal ─────────────────────────────────────────────────── */}
      {showPricing && (
        <PricingPage
          modal
          onClose={() => setShowPricing(false)}
          onGoToLogin={handleGoToLogin}
        />
      )}

      {/* ── Learn More modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLearnMore && (
          <motion.div
            className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLearnMore(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-charcoal">About My Memoria Ally</h2>
                <button onClick={() => setShowLearnMore(false)} className="text-medium-gray hover:text-charcoal p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-medium-gray text-sm leading-relaxed">
                My Memoria Ally is a daily support system designed to help individuals maintain
                structure, stay on track with routines, and feel reassured throughout the day.
                Designed for people living with cognitive challenges and the families who love them.
              </p>
              <button
                onClick={() => { setShowLearnMore(false); handleGetStarted(); }}
                className="mt-5 w-full bg-warm-bronze hover:bg-deep-bronze text-white font-semibold py-3 rounded-xl transition-colors"
              >
                See Plans & Pricing
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}