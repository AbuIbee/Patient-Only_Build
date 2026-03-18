import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/button';
import { Heart, Brain, Shield, Users, Clock, BookOpen, Activity, Phone } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LandingPage() {
  const { dispatch } = useApp();

  const handleGetStarted = () => {
    dispatch({ type: 'SET_VIEW', payload: 'login' });
  };

  const features = [
    { icon: Brain, title: 'Daily Orientation', description: 'Gentle reminders of time, place, and loved ones' },
    { icon: Clock, title: 'Routine Support', description: 'Visual schedules with step-by-step guidance' },
    { icon: BookOpen, title: 'Memory Book', description: 'Preserve precious moments with photos and stories' },
    { icon: Activity, title: 'Brain Activities', description: 'AI-powered exercises to engage the mind' },
    { icon: Heart, title: 'Mood Tracking', description: 'Monitor emotional wellbeing with calming tools' },
    { icon: Shield, title: 'Safety Features', description: 'Emergency support and location reassurance' },
  ];

  return (
    <div className="min-h-screen bg-warm-ivory">
      {/* Hero Section */}
      <header className="bg-white border-b border-soft-taupe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold text-charcoal">MemoriaHelps</span>
          </div>
          <Button
            onClick={handleGetStarted}
            className="bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl px-6"
          >
            Get Started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl lg:text-6xl font-bold text-charcoal leading-tight mb-6">
                Compassionate care for{' '}
                <span className="text-warm-bronze">every moment</span>
              </h1>
              <p className="text-lg text-medium-gray mb-8 max-w-lg">
                A comprehensive dementia care platform supporting patients, caregivers, 
                and therapists with dignity, connection, and peace of mind.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={handleGetStarted}
                  size="lg"
                  className="bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl px-8"
                >
                  Start Your Journey
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-2 border-warm-bronze text-warm-bronze hover:bg-warm-bronze hover:text-white rounded-xl px-8"
                >
                  Learn More
                </Button>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-gradient-to-br from-warm-bronze/20 to-calm-blue/20 rounded-3xl p-8 lg:p-12">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl p-6 shadow-card">
                    <Clock className="w-8 h-8 text-warm-bronze mb-3" />
                    <p className="text-2xl font-bold text-charcoal">10:30 AM</p>
                    <p className="text-sm text-medium-gray">Monday, February 10</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-card">
                    <Heart className="w-8 h-8 text-gentle-coral mb-3" />
                    <p className="text-2xl font-bold text-charcoal">85%</p>
                    <p className="text-sm text-medium-gray">Medication adherence</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-card col-span-2">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-soft-sage rounded-full flex items-center justify-center">
                        <span className="text-2xl">😊</span>
                      </div>
                      <div>
                        <p className="font-semibold text-charcoal">Feeling calm today</p>
                        <p className="text-sm text-medium-gray">Last check-in: 2 hours ago</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-charcoal mb-4">
              Everything you need for comprehensive care
            </h2>
            <p className="text-lg text-medium-gray max-w-2xl mx-auto">
              Three interconnected portals designed to support every aspect of dementia care
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-warm-ivory rounded-2xl p-6 hover:shadow-card transition-shadow"
              >
                <div className="w-12 h-12 bg-warm-bronze/10 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-warm-bronze" />
                </div>
                <h3 className="text-lg font-semibold text-charcoal mb-2">{feature.title}</h3>
                <p className="text-medium-gray">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Portals */}
      <section className="py-20 bg-warm-ivory">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {[
              {
                title: 'Patient Portal',
                description: 'Ultra-simplified interface designed for comfort and clarity',
                features: ['Daily orientation', 'Visual routine', 'Memory book', 'Calming activities'],
                color: 'bg-soft-sage',
              },
              {
                title: 'Caregiver Portal',
                description: 'Comprehensive tools for managing care with confidence',
                features: ['Medication tracking', 'Health monitoring', 'Mood analysis', 'Care team'],
                color: 'bg-warm-bronze',
              },
              {
                title: 'Therapist Portal',
                description: 'Clinical insights and therapy tools for professionals',
                features: ['Patient metrics', 'Therapy tools', 'Goal tracking', 'Behavioral analysis'],
                color: 'bg-calm-blue',
              },
            ].map((portal, index) => (
              <motion.div
                key={portal.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-3xl p-8 shadow-card"
              >
                <div className={`w-14 h-14 ${portal.color} rounded-2xl flex items-center justify-center mb-6`}>
                  <Users className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-charcoal mb-3">{portal.title}</h3>
                <p className="text-medium-gray mb-6">{portal.description}</p>
                <ul className="space-y-3">
                  {portal.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-charcoal">
                      <div className="w-2 h-2 bg-warm-bronze rounded-full" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-charcoal">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
              Begin your care journey today
            </h2>
            <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
              Join thousands of families using MemoriaHelps to provide better care 
              and maintain meaningful connections.
            </p>
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl px-8"
            >
              Get Started Free
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-soft-taupe py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-semibold text-charcoal">MemoriaHelps</span>
            </div>
            <div className="flex items-center gap-6 text-medium-gray">
              <a href="#" className="hover:text-charcoal transition-colors">Privacy</a>
              <a href="#" className="hover:text-charcoal transition-colors">Terms</a>
              <a href="#" className="hover:text-charcoal transition-colors">Support</a>
              <a href="#" className="hover:text-charcoal transition-colors flex items-center gap-2">
                <Phone className="w-4 h-4" />
                1-800-CARE
              </a>
            </div>
            <p className="text-sm text-light-gray">
              © 2025 MemoriaHelps. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}