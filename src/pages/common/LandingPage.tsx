import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/button';
import { Heart, Brain, Shield, Users, Clock, BookOpen, Activity, Phone, X, ChevronLeft, ChevronRight, Home, Bell, Pill, Calendar, FileText, Film, UserCheck, Stethoscope, Target, BarChart3, AlertTriangle, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LandingPage() {
  const { dispatch } = useApp();

  const handleGetStarted = () => {
    dispatch({ type: 'SET_VIEW', payload: 'login' });
  };

  const [showLearnMore, setShowLearnMore] = useState(false);
  const [learnMorePage, setLearnMorePage] = useState(0); // 0=Patient, 1=Caregiver, 2=Therapist

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
                  onClick={() => { setShowLearnMore(true); setLearnMorePage(0); }}
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
      {/* ── Learn More Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLearnMore && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLearnMore(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-soft-taupe flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-warm-bronze rounded-xl flex items-center justify-center">
                    <Heart className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-charcoal text-lg">MemoriaHelps Platform Guide</span>
                </div>
                <button onClick={() => setShowLearnMore(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-soft-taupe transition-colors text-medium-gray">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Page indicator */}
              <div className="flex items-center justify-center gap-3 px-8 py-4 bg-soft-taupe/20 flex-shrink-0">
                {[
                  { label: 'Patient Portal',   color: 'bg-soft-sage'    },
                  { label: 'Caregiver Portal', color: 'bg-warm-bronze'  },
                  { label: 'Therapist Portal', color: 'bg-calm-blue'    },
                ].map((p, i) => (
                  <button key={i} onClick={() => setLearnMorePage(i)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      learnMorePage === i
                        ? `${p.color} text-white shadow-sm scale-105`
                        : 'bg-white text-medium-gray hover:bg-soft-taupe border border-soft-taupe'
                    }`}>
                    <span className="text-xs opacity-70">{i+1}/3</span>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={learnMorePage}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="p-8"
                  >

                    {/* ── PAGE 1: PATIENT PORTAL ──────────────────────────── */}
                    {learnMorePage === 0 && (
                      <div className="space-y-8">
                        <div className="text-center space-y-2">
                          <div className="w-16 h-16 bg-soft-sage/30 rounded-2xl flex items-center justify-center mx-auto">
                            <Heart className="w-8 h-8 text-green-700" />
                          </div>
                          <h2 className="text-3xl font-bold text-charcoal">Patient Portal</h2>
                          <p className="text-medium-gray max-w-xl mx-auto">
                            Every feature is built around one principle: <strong>reducing cognitive load while maximising dignity and independence.</strong>
                            Large fonts, simple icons, warm colours, and audio features serve patients with declining vision, reading ability, or technological familiarity.
                          </p>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          {[
                            { icon: Home,          title: 'Home',           color: 'bg-warm-bronze/10 text-warm-bronze',
                              why: 'Acts as an emotional anchor — grounding patients with calm affirmations, large clock/date display, and a "Tap to Hear" audio feature for low-vision users.',
                              what: 'Reassuring messages, current time, date, weather, upcoming reminders, and medication status.' },
                            { icon: Users,         title: 'Family',         color: 'bg-calm-blue/10 text-blue-700',
                              why: 'Memory loss causes patients to struggle recognising loved ones. This is a safe, private digital memory book — patients can look up who someone is without embarrassment.',
                              what: 'Photos, names, relationships, and stories of family members stored as a personal reference.' },
                            { icon: Heart,         title: 'How I Feel',     color: 'bg-gentle-coral/10 text-gentle-coral',
                              why: 'Patients with cognitive decline often cannot verbally communicate how they feel. This gives them a simple, dignified way to express emotions so caregivers can respond proactively.',
                              what: 'Emotional check-in tool to log current feelings — happy, sad, scared, or confused.' },
                            { icon: Bell,          title: 'Reminders',      color: 'bg-amber-100 text-amber-700',
                              why: 'Memory impairment makes self-managing a daily routine nearly impossible. Reminders serve as a gentle, non-judgmental external memory — reducing patient frustration and caregiver burden.',
                              what: 'Scheduled alerts for daily tasks, appointments, medications, and activities.' },
                            { icon: ClipboardList, title: 'Care Partner',   color: 'bg-soft-sage/20 text-green-700',
                              why: 'Patients benefit greatly from knowing exactly who is looking after them. Reduces anxiety by giving direct access to contact their care partner and feel less alone.',
                              what: 'Direct connection to the primary caregiver — contact info, check-in history, and care partner notes.' },
                            { icon: UserCheck,     title: 'My Care Team',   color: 'bg-warm-bronze/10 text-warm-bronze',
                              why: 'Knowing who to call and why can be the difference between getting help and suffering in silence. Consolidates the full support network with clear roles.',
                              what: 'Directory of all care professionals — doctors, nurses, therapists, social workers.' },
                            { icon: Pill,          title: 'Medications',    color: 'bg-calm-blue/10 text-blue-700',
                              why: 'Medication mismanagement is one of the most dangerous risks for dementia patients. Tracks whether doses were taken and provides clear, simple instructions.',
                              what: 'Log and schedule of all current medications, dosages, times, and adherence tracking.' },
                            { icon: Calendar,      title: 'My Day',         color: 'bg-soft-sage/20 text-green-700',
                              why: 'Structure and routine are clinically proven to reduce anxiety in dementia patients. A clear visual roadmap for the day helps patients feel oriented and purposeful.',
                              what: 'Personalised daily schedule showing planned activities, appointments, and routines.' },
                            { icon: FileText,      title: 'Papers',         color: 'bg-amber-100 text-amber-700',
                              why: 'Important documents are frequently lost or misplaced. Ensures critical documents are always accessible in medical emergencies or legal situations.',
                              what: 'Secure storage for legal papers, insurance cards, advance directives, and medical records.' },
                            { icon: Film,          title: 'Videos & Media', color: 'bg-gentle-coral/10 text-gentle-coral',
                              why: 'Familiar media triggers positive memories, reduces agitation, provides comfort, and stimulates cognitive engagement. Patients can self-soothe independently.',
                              what: 'Curated library of family videos, music, photos, and meaningful content.' },
                          ].map(({ icon: Icon, title, color, what, why }) => (
                            <div key={title} className="bg-soft-taupe/10 rounded-2xl p-5 space-y-2 border border-soft-taupe/50">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 ${color.split(' ')[0]} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                  <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
                                </div>
                                <h4 className="font-semibold text-charcoal">{title}</h4>
                              </div>
                              <p className="text-xs text-medium-gray"><span className="font-medium text-charcoal">What: </span>{what}</p>
                              <p className="text-xs text-medium-gray"><span className="font-medium text-warm-bronze">Why it matters: </span>{why}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── PAGE 2: CAREGIVER PORTAL ───────────────────────── */}
                    {learnMorePage === 1 && (
                      <div className="space-y-8">
                        <div className="text-center space-y-2">
                          <div className="w-16 h-16 bg-warm-bronze/10 rounded-2xl flex items-center justify-center mx-auto">
                            <Users className="w-8 h-8 text-warm-bronze" />
                          </div>
                          <h2 className="text-3xl font-bold text-charcoal">Caregiver Portal</h2>
                          <p className="text-medium-gray max-w-xl mx-auto">
                            Built around three principles: <strong>Remote Visibility</strong>, <strong>Proactive Care</strong>, and <strong>Team Coordination.</strong>
                            Transforms a caregiver from a reactive responder into an informed, empowered care manager.
                          </p>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          {[
                            { icon: Home,          title: 'Dashboard',        color: 'bg-warm-bronze/10 text-warm-bronze',
                              what: 'Real-time snapshot of patient\'s daily status — tasks, medications, mood, sleep, upcoming appointments, Care Partner check-ins, and Quick Actions.',
                              why: 'Caregivers can\'t be physically present 24/7. This gives an at-a-glance health summary the moment they log in, enabling faster response to issues without making phone calls.' },
                            { icon: Pill,          title: 'Medications',      color: 'bg-calm-blue/10 text-blue-700',
                              what: 'Complete medication management hub — prescriptions, dosages, schedules, and adherence tracking with percentage monitoring.',
                              why: 'Medication errors are among the leading causes of hospitalisation for dementia patients. The 0% adherence warning immediately signals when intervention is needed.' },
                            { icon: Calendar,      title: 'Routines',         color: 'bg-soft-sage/20 text-green-700',
                              what: 'Tool for building and managing daily structured routines — morning rituals, meals, activities, hygiene, bedtime.',
                              why: 'Routine is medically essential for dementia patients. Allows caregivers to design and monitor routines remotely so the patient\'s day follows a predictable, therapeutic pattern.' },
                            { icon: BookOpen,      title: 'Memories',         color: 'bg-amber-100 text-amber-700',
                              what: 'Digital memory book — upload photos, stories, life history, important people, and meaningful moments for the patient.',
                              why: 'Reminiscence therapy is a clinically recognised intervention that improves mood and reduces agitation. Helps new care team members quickly understand who the patient is as a person.' },
                            { icon: Activity,      title: 'Mood Tracker',     color: 'bg-gentle-coral/10 text-gentle-coral',
                              what: 'Longitudinal mood monitoring — logs emotional states over time, tracks trends, and flags concerning patterns.',
                              why: 'Behavioural symptoms affect the majority of dementia patients. Objective trend data enables proactive intervention before a crisis develops.' },
                            { icon: FileText,      title: 'Documents',        color: 'bg-warm-bronze/10 text-warm-bronze',
                              what: 'Secure repository for medical records, insurance cards, advance directives, legal documents, and care plans.',
                              why: 'The right document at the wrong time is useless. Eliminates the panic of searching for paperwork during emergencies and ensures continuity of care.' },
                            { icon: Bell,          title: 'Reminders',        color: 'bg-calm-blue/10 text-blue-700',
                              what: 'Scheduling and alert system for patient appointments, medications, and activities — plus caregiver task reminders.',
                              why: 'Caregiving involves managing massive time-sensitive responsibilities simultaneously. A shared organisational system ensures nothing falls through the cracks on either side.' },
                            { icon: AlertTriangle, title: 'Crisis Prevention', color: 'bg-gentle-coral/10 text-gentle-coral',
                              what: 'Safety planning tool with crisis protocols, emergency contacts, behavioural warning signs, and de-escalation strategies.',
                              why: 'Dementia can lead to sudden, unpredictable crises — wandering, severe agitation, falls. A proactive safety net ensures any caregiver or first responder knows the right steps immediately.' },
                            { icon: Clock,         title: 'Timeline',         color: 'bg-soft-sage/20 text-green-700',
                              what: 'Chronological activity log of everything in the patient\'s care — mood entries, medication logs, notes, check-ins, incidents, and milestones.',
                              why: 'Gives a complete, searchable care history — invaluable for doctor appointments, legal documentation, insurance purposes, and tracking disease progression.' },
                            { icon: Film,          title: 'Videos & Media',   color: 'bg-amber-100 text-amber-700',
                              what: 'Curated media library of videos, music, photos that can be shared with or accessed by the patient.',
                              why: 'Music and video therapy are evidence-based tools for improving quality of life. Caregivers can provide therapeutic comfort remotely — a familiar song can de-escalate anxiety.' },
                          ].map(({ icon: Icon, title, color, what, why }) => (
                            <div key={title} className="bg-soft-taupe/10 rounded-2xl p-5 space-y-2 border border-soft-taupe/50">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 ${color.split(' ')[0]} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                  <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
                                </div>
                                <h4 className="font-semibold text-charcoal">{title}</h4>
                              </div>
                              <p className="text-xs text-medium-gray"><span className="font-medium text-charcoal">What: </span>{what}</p>
                              <p className="text-xs text-medium-gray"><span className="font-medium text-warm-bronze">Why it matters: </span>{why}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── PAGE 3: THERAPIST PORTAL ───────────────────────── */}
                    {learnMorePage === 2 && (
                      <div className="space-y-8">
                        <div className="text-center space-y-2">
                          <div className="w-16 h-16 bg-calm-blue/10 rounded-2xl flex items-center justify-center mx-auto">
                            <Stethoscope className="w-8 h-8 text-blue-700" />
                          </div>
                          <h2 className="text-3xl font-bold text-charcoal">Therapist Portal</h2>
                          <p className="text-medium-gray max-w-xl mx-auto">
                            Built around <strong>Longitudinal Clinical Intelligence</strong>, <strong>Non-Pharmacological First</strong>, and <strong>Whole-System Integration.</strong>
                            Transforms the therapist from a periodic clinical visitor into a continuous, data-informed therapeutic presence.
                          </p>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          {[
                            { icon: Home,        title: 'Dashboard',            color: 'bg-calm-blue/10 text-blue-700',
                              what: 'Clinical command centre — Disease Stage, Safety Risk Assessment (RED/YELLOW/GREEN triage), 6-week MMSE and ADL Functional Decline graphs, and current clinical scores.',
                              why: 'The colour-coded Safety Risk Assessment eliminates the need to review lengthy notes to know if a patient is in crisis. Trend graphs show trajectory — the difference between reactive treatment and proactive clinical management.' },
                            { icon: Brain,       title: 'Therapy Tools',        color: 'bg-soft-sage/20 text-green-700',
                              what: 'Clinical toolkit of therapeutic resources — cognitive stimulation exercises, reminiscence therapy prompts, sensory activities, and communication strategies.',
                              why: 'Dementia therapy is highly individualised and stage-dependent. Integrating evidence-based tools into the platform ensures therapy extends beyond the clinical session into the patient\'s daily life.' },
                            { icon: Target,      title: 'Goal Tracking',        color: 'bg-warm-bronze/10 text-warm-bronze',
                              what: 'Structured goal management — set, monitor, and evaluate measurable clinical goals such as maintaining independent dressing, reducing agitation episodes, or improving verbal communication.',
                              why: 'Without measurable goals, therapy lacks direction and accountability. Essential documentation for insurance reimbursement, care plan reviews, and interdisciplinary team meetings.' },
                            { icon: BarChart3,   title: 'Behavioral Analysis',  color: 'bg-gentle-coral/10 text-gentle-coral',
                              what: 'Data analysis module aggregating behavioural patterns — agitation, wandering, sleep disruption, mood instability, refusal of care, and other BPSD episodes.',
                              why: 'Identifies triggers, patterns, and correlations — e.g. whether agitation spikes on certain days or after specific activities. Transforms behavioural management from guesswork into data-informed intervention.' },
                            { icon: Film,        title: 'Videos & Media',       color: 'bg-amber-100 text-amber-700',
                              what: 'Media management for uploading and assigning therapeutic content — guided relaxation, cognitive stimulation videos, music therapy playlists, and caregiver training materials.',
                              why: 'Music and reminiscence video therapy are among the most effective non-pharmacological interventions for dementia. Media can also train caregivers on communication and de-escalation techniques.' },
                            { icon: ClipboardList, title: 'Care Partner Reports', color: 'bg-soft-sage/20 text-green-700',
                              what: 'Live feed of Care Partner daily check-in reports — 7 clinical sections covering ADLs, nutrition, continence, safety events, behaviour, mood, and symptoms.',
                              why: 'Gives the therapist daily clinical-grade observations from the home environment — the most valuable data point in community-based dementia care, normally unavailable outside a facility.' },
                          ].map(({ icon: Icon, title, color, what, why }) => (
                            <div key={title} className="bg-soft-taupe/10 rounded-2xl p-5 space-y-2 border border-soft-taupe/50">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 ${color.split(' ')[0]} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                  <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
                                </div>
                                <h4 className="font-semibold text-charcoal">{title}</h4>
                              </div>
                              <p className="text-xs text-medium-gray"><span className="font-medium text-charcoal">What: </span>{what}</p>
                              <p className="text-xs text-medium-gray"><span className="font-medium text-warm-bronze">Why it matters: </span>{why}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer nav */}
              <div className="flex items-center justify-between px-8 py-5 border-t border-soft-taupe bg-soft-taupe/10 flex-shrink-0">
                <button
                  onClick={() => setLearnMorePage(p => Math.max(0, p - 1))}
                  disabled={learnMorePage === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />Previous
                </button>
                <div className="flex items-center gap-2">
                  {[0,1,2].map(i => (
                    <button key={i} onClick={() => setLearnMorePage(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${learnMorePage === i ? 'bg-warm-bronze scale-125' : 'bg-soft-taupe hover:bg-warm-bronze/50'}`} />
                  ))}
                </div>
                {learnMorePage < 2 ? (
                  <button
                    onClick={() => setLearnMorePage(p => p + 1)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors">
                    Next<ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleGetStarted}
                    className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors">
                    Get Started<ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}