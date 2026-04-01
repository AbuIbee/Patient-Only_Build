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
      <section className="py-20 lg:py-32">
        <div className="max-w-6xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl lg:text-6xl font-bold text-charcoal mb-6">
              Stay on track, feel supported,
              <span className="text-warm-bronze block">every single day</span>
            </h1>

            <p className="text-lg text-medium-gray mb-8">
              My Memoria Ally provides daily structure, reminders, and support
              for individuals who benefit from a calmer, more guided routine.
            </p>

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

          {/* Visual card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-warm-bronze/20 to-calm-blue/20 rounded-3xl p-8"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-xl">
                <p className="text-xl font-bold">10:30 AM</p>
                <p className="text-sm text-medium-gray">Monday</p>
              </div>
              <div className="bg-white p-6 rounded-xl">
                <p className="text-xl font-bold">✔ On Track</p>
                <p className="text-sm text-medium-gray">Daily progress</p>
              </div>
              <div className="bg-white p-6 rounded-xl col-span-2">
                <p className="text-charcoal font-semibold">"You are safe. You are at home."</p>
              </div>
            </div>
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
