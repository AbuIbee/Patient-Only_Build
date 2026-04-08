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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PricingPage from './PricingPage';

export default function LandingPage() {
  const { dispatch } = useApp();

  const [showPricing, setShowPricing]     = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);

  const handleGetStarted = () => setShowPricing(true);

  const handleGoToLogin = () => {
    setShowPricing(false);
    dispatch({ type: 'SET_VIEW', payload: 'login' });
  };

  const features = [
    { icon: Brain,    title: 'Daily Orientation', description: 'Gentle reminders of time, place, and important details' },
    { icon: Clock,    title: 'Routine Support',   description: 'Simple step-by-step guidance for daily activities' },
    { icon: BookOpen, title: 'Memory Support',    description: 'Keep important people, moments, and memories close' },
    { icon: Activity, title: 'Mental Engagement', description: 'Activities designed to keep the mind active' },
    { icon: Heart,    title: 'Emotional Check-ins', description: 'Track feelings and maintain emotional balance' },
    { icon: Shield,   title: 'Peace of Mind',     description: 'A calm, structured experience for daily living' },
  ];

  return (
    <div className="min-h-screen bg-warm-ivory">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-soft-taupe">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold text-charcoal">My Memoria Ally</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGoToLogin}
              className="text-sm text-medium-gray hover:text-charcoal transition-colors font-medium px-3 py-2"
            >
              Sign In
            </button>
            <Button
              onClick={handleGetStarted}
              className="bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl px-6 h-10"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="pt-20 lg:pt-20 pb-10 lg:pb-16">
        <div className="max-w-6xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl lg:text-6xl font-bold text-charcoal mb-6">
              Stay on track, feel supported,
              <span className="text-warm-bronze block">every single day</span>
            </h1>
            <p className="text-medium-gray leading-relaxed">
              My Memoria Ally helps families, individuals and care partners provide daily structure, reminders, and support
              for and their loved ones with gentle medication reminders, mood tracking, to benefit from a calmer, more guided routine. Calmer days start here.
             </p>
             <br/>

            <div className="flex gap-4">
              <Button
                size="lg"
                onClick={handleGetStarted}
                className="bg-warm-bronze text-white rounded-xl px-8"
              >
                Get Started Free
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowLearnMore(true)}
                className="border-warm-bronze text-warm-bronze rounded-xl px-8"
              >
                Learn More
              </Button>
            </div>

            <p className="mt-5 text-sm text-medium-gray">
              Already have an account?{' '}
              <button
                onClick={handleGoToLogin}
                className="text-warm-bronze hover:text-deep-bronze font-medium underline"
              >
                Sign in here
              </button>
            </p>
          </motion.div>

          {/* Brand story card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-warm-bronze/10 to-calm-blue/10 rounded-3xl p-8 space-y-5"
          >
            {/* Opening line */}
            <p className="text-lg font-semibold text-charcoal leading-snug">
              My Memoria Ally was created for the{' '}
              <span className="text-warm-bronze">quiet heroes</span> — the daughters, sons,
              husbands, and wives who wake up every day ready to care for an aging loved one.
            </p>

            <p className="text-medium-gray leading-relaxed">
              We know you're not a doctor or a nurse. You're just someone who loves deeply
              and wants to do right by them. That's where we come in.
            </p>

            {/* Feature pills */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '💊', text: 'Medication reminders' },
                { icon: '🩺', text: 'Doctor visit tracking' },
                { icon: '💛', text: 'Mood & symptom log' },
                { icon: '💬', text: 'Message your care team' },
              ].map(item => (
                <div key={item.text} className="bg-white rounded-xl px-4 py-3 flex items-center gap-2 shadow-sm">
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="text-sm font-medium text-charcoal">{item.text}</span>
                </div>
              ))}
            </div>

            {/* Closer */}
            <div className="bg-warm-bronze/10 rounded-2xl px-5 py-4 border border-warm-bronze/20">
              <p className="text-sm text-charcoal leading-relaxed">
                For <strong>senior living facilities</strong>, My Memoria Ally extends your care
                outside your walls. Families feel supported. Nurses spend less time on repeat
                questions. Your brand becomes the one families trust for life.
              </p>
            </div>

            <p className="text-sm text-warm-bronze font-semibold text-center italic">
              "Because memory is precious. And so are you."
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center mb-12">
          <h2 className="text-3xl font-bold text-charcoal">Built for everyday support</h2>
          <p className="text-medium-gray mt-2">Everything you need to stay organized, calm, and supported</p>
        </div>
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-warm-ivory p-6 rounded-2xl"
            >
              <f.icon className="w-6 h-6 text-warm-bronze mb-3" />
              <h3 className="font-semibold text-charcoal">{f.title}</h3>
              <p className="text-sm text-medium-gray">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>


      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-warm-ivory overflow-hidden">
        <div className="max-w-6xl mx-auto px-4">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-block bg-warm-bronze/10 text-warm-bronze text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
              Real Stories
            </span>
            <h2 className="text-3xl lg:text-4xl font-bold text-charcoal">
              Families who found their footing
            </h2>
            <p className="text-medium-gray mt-3 max-w-xl mx-auto">
              From early mornings to quiet evenings, My Memoria Ally is there — and so are the people whose lives it's touched.
            </p>
          </motion.div>

          {/* Cards grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                quote: "Mom used to wake up confused and frightened every morning. Now she opens the app, sees her name, the date, and a kind message — and her whole face relaxes. That small thing changed everything for us.",
                name: "Sandra M.",
                role: "Daughter & Primary Caregiver",
                location: "Austin, TX",
                emoji: "👩‍👧",
                tag: "Caregiver",
                tagColor: "bg-calm-blue/20 text-calm-blue",
                stars: 5,
              },
              {
                quote: "I was losing track of my medications and feeling embarrassed to ask for help. This app just quietly reminds me — no fuss, no judgment. I feel like myself again.",
                name: "Walter B.",
                role: "Patient, 78 years young",
                location: "Charleston, SC",
                emoji: "👴",
                tag: "Patient",
                tagColor: "bg-soft-sage/20 text-soft-sage",
                stars: 5,
              },
              {
                quote: "Our nursing staff used to spend hours fielding calls from worried family members. Since partnering with My Memoria Ally, those calls have dropped dramatically and families feel genuinely supported.",
                name: "Rebecca T.",
                role: "Director of Care, Sunrise Living",
                location: "Denver, CO",
                emoji: "👩‍⚕️",
                tag: "Care Facility",
                tagColor: "bg-warm-bronze/15 text-warm-bronze",
                stars: 5,
              },
              {
                quote: "My husband has Alzheimer's and every day used to feel like a battle. Now I log his mood, his meals, how he slept — and I actually feel in control. I can breathe again.",
                name: "Darlene H.",
                role: "Wife & Full-time Caregiver",
                location: "Nashville, TN",
                emoji: "❤️",
                tag: "Caregiver",
                tagColor: "bg-calm-blue/20 text-calm-blue",
                stars: 5,
              },
              {
                quote: "I told my daughter I didn't want some complicated computer thing. But this is so simple — big buttons, kind words, and it always knows my name. I actually look forward to checking in.",
                name: "Evelyn R.",
                role: "Patient, 82",
                location: "Savannah, GA",
                emoji: "🌸",
                tag: "Patient",
                tagColor: "bg-soft-sage/20 text-soft-sage",
                stars: 5,
              },
              {
                quote: "I work two jobs and live three hours away. I used to lie awake worrying about Dad. Now I get a little update and I know he's on track. I sleep better. He's happier. We're closer.",
                name: "Marcus J.",
                role: "Son & Long-distance Caregiver",
                location: "Philadelphia, PA",
                emoji: "👨‍👦",
                tag: "Caregiver",
                tagColor: "bg-calm-blue/20 text-calm-blue",
                stars: 5,
              },
            ].map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-soft-taupe/40 flex flex-col gap-4"
              >
                {/* Stars */}
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, si) => (
                    <svg key={si} className="w-4 h-4 text-warm-amber fill-warm-amber" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118L10 15.347l-3.95 2.678c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.064 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69L9.049 2.927z" />
                    </svg>
                  ))}
                </div>

                {/* Quote */}
                <p className="text-charcoal leading-relaxed text-sm flex-1">
                  <span className="text-warm-bronze text-2xl leading-none font-serif mr-1">"</span>
                  {t.quote}
                  <span className="text-warm-bronze text-2xl leading-none font-serif ml-1">"</span>
                </p>

                {/* Attribution */}
                <div className="flex items-center gap-3 pt-3 border-t border-soft-taupe/30">
                  <div className="w-11 h-11 rounded-full bg-warm-bronze/10 flex items-center justify-center text-2xl flex-shrink-0">
                    {t.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-charcoal text-sm">{t.name}</p>
                    <p className="text-xs text-medium-gray truncate">{t.role}</p>
                    <p className="text-xs text-soft-taupe">{t.location}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${t.tagColor}`}>
                    {t.tag}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom trust bar */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-14 flex flex-wrap justify-center gap-8 text-center"
          >
            {[
              { value: "98%", label: "of caregivers feel less anxious after 2 weeks" },
              { value: "4.9★", label: "average rating from families and patients" },
              { value: "10 min", label: "average daily time — gentle, never overwhelming" },
            ].map(stat => (
              <div key={stat.label} className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-warm-bronze">{stat.value}</span>
                <span className="text-sm text-medium-gray max-w-[160px] leading-snug">{stat.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA strip ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-charcoal text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Start your daily support system today
        </h2>
        <Button
          size="lg"
          onClick={handleGetStarted}
          className="bg-warm-bronze text-white px-8 rounded-xl"
        >
          See Plans &amp; Pricing
        </Button>
      </section>

      {/* ── Pricing modal ──────────────────────────────────────────────────── */}
      {showPricing && (
        <PricingPage
          modal
          onClose={() => setShowPricing(false)}
          onGoToLogin={handleGoToLogin}
        />
      )}

      {/* ── Learn More modal ───────────────────────────────────────────────── */}
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
              className="bg-white rounded-2xl p-6 max-w-xl w-full"
            >
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-bold">About My Memoria Ally</h2>
                <button onClick={() => setShowLearnMore(false)} className="text-medium-gray hover:text-charcoal">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-medium-gray">
                My Memoria Ally is a daily support system designed to help individuals maintain
                structure, stay on track with routines, and feel reassured throughout the day.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
