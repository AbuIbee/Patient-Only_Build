import { useApp } from '@/store/AppContext';
import CarePartnerCheckinSummary from '@/pages/caregiver/CarePartnerCheckinSummary';
import { useSelectedPatient } from '@/hooks/useSelectedPatient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Users,
  TrendingUp,
  Activity,
  Calendar,
  AlertCircle,
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  Moon,
  Utensils,
  Heart,
  Mail,
  Phone,
  Clock,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { SafetyAlert, ADLAssessment } from '@/types';

// Mock cognitive and ADL trend data
const mockCognitiveData = [
  { week: 'W1', mmse: 24, adl: 28 },
  { week: 'W2', mmse: 23, adl: 27 },
  { week: 'W3', mmse: 23, adl: 26 },
  { week: 'W4', mmse: 22, adl: 25 },
  { week: 'W5', mmse: 22, adl: 24 },
  { week: 'W6', mmse: 21, adl: 23 },
];

// Sleep quality data
const mockSleepData = [
  { day: 'Mon', hours: 6.5, quality: 3 },
  { day: 'Tue', hours: 5.0, quality: 2 },
  { day: 'Wed', hours: 7.0, quality: 4 },
  { day: 'Thu', hours: 4.5, quality: 2 },
  { day: 'Fri', hours: 6.0, quality: 3 },
  { day: 'Sat', hours: 7.5, quality: 4 },
  { day: 'Sun', hours: 6.0, quality: 3 },
];

export default function TherapistDashboard() {
  const { state } = useApp();
  const selectedPatient = useSelectedPatient();
  const patient = state.patient;
  const moodEntries = state.moodEntries;
  const behaviorLogs = state.behaviorLogs;
  const safetyAlerts = state.safetyAlerts;
  const adlAssessments = state.adlAssessments;
  const caregiverStatus = state.caregiverStatus;
  const nutritionLogs = state.nutritionLogs;

  const [selectedAlert, setSelectedAlert] = useState<SafetyAlert | null>(null);
  const [showADLReminder, setShowADLReminder] = useState(false);

  // Filter alerts by category
  const redAlerts = safetyAlerts.filter(a => a.category === 'red' && !a.isResolved);
  const yellowAlerts = safetyAlerts.filter(a => a.category === 'yellow' && !a.isResolved);
  const greenIndicators = safetyAlerts.filter(a => a.category === 'green');

  // Get latest ADL assessment
  const latestADL = adlAssessments[adlAssessments.length - 1];
  const previousADL = adlAssessments[adlAssessments.length - 2];

  // Calculate ADL total score (lower is better - more independent)
  const calculateADLTotal = (adl: ADLAssessment | undefined) => {
    if (!adl) return 0;
    return adl.dressing + adl.eating + adl.bathing + adl.toileting + adl.transferring + adl.continence;
  };

  const currentADLScore = calculateADLTotal(latestADL);
  const previousADLScore = calculateADLTotal(previousADL);
  const adlDecline = previousADL ? currentADLScore - previousADLScore : 0;

  // Get latest nutrition log
  const latestNutrition = nutritionLogs[nutritionLogs.length - 1];

  // Check if ADL assessment is due (decline detected)
  const isADLDue = adlDecline > 2;

  // Mood/Behavior frequency calculation
  const moodCounts = moodEntries.reduce((acc, entry) => {
    const negativeMoods = ['sad', 'anxious', 'angry', 'confused', 'scared', 'worried'];
    if (negativeMoods.includes(entry.mood)) {
      acc.negative++;
    } else {
      acc.positive++;
    }
    return acc;
  }, { positive: 0, negative: 0 });

  const sendSupportResources = () => {
    // In a real app, this would trigger an email
    alert('Support resources email sent to caregiver!');
  };

  return (
    <div className="space-y-6">
      {/* Care Partner Check-In Summary */}
      {selectedPatient && (
        <CarePartnerCheckinSummary
          patientId={selectedPatient.patient.id}
          patientName={`${selectedPatient.patient.firstName} ${selectedPatient.patient.lastName}`}
        />
      )}

      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-2xl font-bold text-charcoal mb-1">
          Patient Overview
        </h2>
        <p className="text-medium-gray">
          {patient?.firstName} {patient?.lastName} • {patient?.dementiaStage === 'early' ? 'Early Stage' : patient?.dementiaStage === 'middle' ? 'Middle Stage' : 'Late Stage'} Dementia
        </p>
      </motion.div>

      {/* A. RED FLAG SAFETY DASHBOARD */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-gentle-coral" />
            Safety Risk Assessment
          </h3>
          <Badge variant="outline" className="text-medium-gray">
            {redAlerts.length + yellowAlerts.length} Active Concerns
          </Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Red Alerts - Urgent */}
          <Card className="border-0 shadow-soft border-l-4 border-l-gentle-coral">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gentle-coral flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                RED - URGENT ({redAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {redAlerts.length === 0 ? (
                  <p className="text-sm text-medium-gray py-2">No urgent alerts</p>
                ) : (
                  redAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className="w-full text-left p-2 bg-gentle-coral/10 rounded-lg hover:bg-gentle-coral/20 transition-colors"
                    >
                      <p className="text-sm font-medium text-charcoal">{alert.title}</p>
                      <p className="text-xs text-medium-gray">{alert.count} incidents</p>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Yellow Alerts - Monitor */}
          <Card className="border-0 shadow-soft border-l-4 border-l-warm-amber">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-warm-amber flex items-center gap-2">
                <Info className="w-4 h-4" />
                YELLOW - MONITOR ({yellowAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {yellowAlerts.length === 0 ? (
                  <p className="text-sm text-medium-gray py-2">No monitoring alerts</p>
                ) : (
                  yellowAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className="w-full text-left p-2 bg-warm-amber/10 rounded-lg hover:bg-warm-amber/20 transition-colors"
                    >
                      <p className="text-sm font-medium text-charcoal">{alert.title}</p>
                      <p className="text-xs text-medium-gray">{alert.count} occurrences</p>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Green Indicators - Stable */}
          <Card className="border-0 shadow-soft border-l-4 border-l-soft-sage">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-soft-sage flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                GREEN - STABLE ({greenIndicators.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {greenIndicators.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-2 bg-soft-sage/10 rounded-lg"
                  >
                    <p className="text-sm font-medium text-charcoal">{alert.title}</p>
                    <p className="text-xs text-medium-gray">{alert.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* B. FUNCTIONAL DECLINE TRACKING */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <Activity className="w-5 h-5 text-calm-blue" />
            Functional Decline Tracking
          </h3>
          {isADLDue && (
            <Button
              onClick={() => setShowADLReminder(true)}
              variant="outline"
              className="border-gentle-coral text-gentle-coral hover:bg-gentle-coral hover:text-white"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Assessment Due
            </Button>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Cognitive & ADL Trend Chart */}
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-charcoal">
                Cognitive & Functional Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockCognitiveData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE5" />
                    <XAxis dataKey="week" stroke="#6B6B6B" />
                    <YAxis domain={[0, 30]} stroke="#6B6B6B" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="mmse" name="MMSE Score" stroke="#C9A87C" strokeWidth={3} dot={{ fill: '#C9A87C' }} />
                    <Line type="monotone" dataKey="adl" name="ADL Score" stroke="#5B9A8B" strokeWidth={3} dot={{ fill: '#5B9A8B' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-warm-ivory rounded-xl">
                  <p className="text-sm text-medium-gray">Current MMSE</p>
                  <p className="text-2xl font-bold text-charcoal">21/30</p>
                  <p className="text-xs text-gentle-coral">↓ 3 points (6 weeks)</p>
                </div>
                <div className="text-center p-3 bg-warm-ivory rounded-xl">
                  <p className="text-sm text-medium-gray">Current ADL</p>
                  <p className="text-2xl font-bold text-charcoal">{currentADLScore}/30</p>
                  <p className="text-xs text-gentle-coral">↓ {adlDecline} points</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ADL Breakdown */}
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-charcoal">
                Activities of Daily Living (ADL)
              </CardTitle>
              <p className="text-sm text-medium-gray">1 = Independent, 5 = Dependent</p>
            </CardHeader>
            <CardContent>
              {latestADL && (
                <div className="space-y-3">
                  {[
                    { label: 'Dressing', value: latestADL.dressing, prev: previousADL?.dressing },
                    { label: 'Eating', value: latestADL.eating, prev: previousADL?.eating },
                    { label: 'Bathing', value: latestADL.bathing, prev: previousADL?.bathing },
                    { label: 'Toileting', value: latestADL.toileting, prev: previousADL?.toileting },
                    { label: 'Transferring', value: latestADL.transferring, prev: previousADL?.transferring },
                    { label: 'Continence', value: latestADL.continence, prev: previousADL?.continence },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-sm text-medium-gray w-24">{item.label}</span>
                      <div className="flex-1 h-2 bg-soft-taupe/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            item.value <= 2 ? 'bg-soft-sage' :
                            item.value <= 3 ? 'bg-warm-amber' : 'bg-gentle-coral'
                          }`}
                          style={{ width: `${(item.value / 5) * 100}%` }}
                        />
                      </div>
                      <span className={`text-sm font-medium w-8 text-right ${
                        item.value <= 2 ? 'text-soft-sage' :
                        item.value <= 3 ? 'text-warm-amber' : 'text-gentle-coral'
                      }`}>
                        {item.value}
                      </span>
                      {item.prev && item.value > item.prev && (
                        <TrendingUp className="w-4 h-4 text-gentle-coral" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 p-3 bg-calm-blue/10 rounded-xl">
                <p className="text-sm text-calm-blue">
                  <Info className="w-4 h-4 inline mr-1" />
                  Last assessed: {latestADL ? new Date(latestADL.date).toLocaleDateString() : 'N/A'} by {latestADL?.assessedBy}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Metrics Row */}
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          {/* Mood/Behavior Scale */}
          <Card className="border-0 shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-charcoal flex items-center gap-2">
                <Heart className="w-4 h-4 text-gentle-coral" />
                Mood/Behavior (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <p className="text-2xl font-bold text-soft-sage">{moodCounts.positive}</p>
                  <p className="text-xs text-medium-gray">Positive</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gentle-coral">{moodCounts.negative}</p>
                  <p className="text-xs text-medium-gray">Negative</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-charcoal">{behaviorLogs.length}</p>
                  <p className="text-xs text-medium-gray">Incidents</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sleep Quality Tracker */}
          <Card className="border-0 shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-charcoal flex items-center gap-2">
                <Moon className="w-4 h-4 text-deep-slate" />
                Sleep Quality (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockSleepData}>
                    <Line type="monotone" dataKey="hours" stroke="#6B6B6B" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-xs text-medium-gray mt-1">
                <span>Avg: 6.1 hrs</span>
                <span className="text-gentle-coral">3-4 wake/night</span>
              </div>
            </CardContent>
          </Card>

          {/* Nutrition/Hydration */}
          <Card className="border-0 shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-charcoal flex items-center gap-2">
                <Utensils className="w-4 h-4 text-warm-bronze" />
                Nutrition Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latestNutrition ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-medium-gray">Meals eaten</span>
                    <span className="text-sm font-medium">{latestNutrition.mealsEaten}/{latestNutrition.mealsTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-medium-gray">Fluids</span>
                    <span className="text-sm font-medium">{latestNutrition.fluidIntakeOz} oz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-medium-gray">Appetite</span>
                    <Badge className={
                      latestNutrition.appetite === 'good' || latestNutrition.appetite === 'excellent'
                        ? 'bg-soft-sage'
                        : latestNutrition.appetite === 'fair'
                        ? 'bg-warm-amber'
                        : 'bg-gentle-coral'
                    }>
                      {latestNutrition.appetite}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-medium-gray">No nutrition data</p>
              )}
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* C. CAREGIVER STATUS INDICATOR */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <Users className="w-5 h-5 text-warm-bronze" />
            Caregiver Status
          </h3>
          <Button
            onClick={sendSupportResources}
            className="bg-soft-sage hover:bg-soft-sage/90 text-white rounded-xl"
          >
            <Mail className="w-4 h-4 mr-2" />
            Send Support Resources
          </Button>
        </div>

        {caregiverStatus && (
          <Card className={`border-0 shadow-soft border-l-4 ${
            caregiverStatus.burnoutRisk === 'high' ? 'border-l-gentle-coral' :
            caregiverStatus.burnoutRisk === 'moderate' ? 'border-l-warm-amber' : 'border-l-soft-sage'
          }`}>
            <CardContent className="p-6">
              <div className="grid md:grid-cols-4 gap-6">
                {/* Stress Level */}
                <div className="text-center">
                  <p className="text-sm text-medium-gray mb-1">Stress Level</p>
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                    caregiverStatus.stressLevel === 'high' ? 'bg-gentle-coral/20 text-gentle-coral' :
                    caregiverStatus.stressLevel === 'medium' ? 'bg-warm-amber/20 text-warm-amber' : 'bg-soft-sage/20 text-soft-sage'
                  }`}>
                    <Zap className="w-4 h-4" />
                    <span className="font-semibold capitalize">{caregiverStatus.stressLevel}</span>
                  </div>
                </div>

                {/* Last Respite */}
                <div className="text-center">
                  <p className="text-sm text-medium-gray mb-1">Last Respite Break</p>
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-medium-gray" />
                    <span className="font-semibold text-charcoal">
                      {Math.floor((Date.now() - new Date(caregiverStatus.lastRespiteBreak).getTime()) / (1000 * 60 * 60 * 24))} days ago
                    </span>
                  </div>
                </div>

                {/* Support System */}
                <div className="text-center">
                  <p className="text-sm text-medium-gray mb-1">Support System</p>
                  <span className={`font-semibold capitalize ${
                    caregiverStatus.supportSystemStrength === 'weak' ? 'text-gentle-coral' :
                    caregiverStatus.supportSystemStrength === 'moderate' ? 'text-warm-amber' : 'text-soft-sage'
                  }`}>
                    {caregiverStatus.supportSystemStrength}
                  </span>
                </div>

                {/* Burnout Risk */}
                <div className="text-center">
                  <p className="text-sm text-medium-gray mb-1">Burnout Risk</p>
                  <Badge className={
                    caregiverStatus.burnoutRisk === 'high' ? 'bg-gentle-coral' :
                    caregiverStatus.burnoutRisk === 'moderate' ? 'bg-warm-amber' : 'bg-soft-sage'
                  }>
                    {caregiverStatus.burnoutRisk}
                  </Badge>
                </div>
              </div>

              {/* Quick Indicators */}
              <div className="mt-6 pt-6 border-t border-soft-taupe grid md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-warm-ivory rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-warm-bronze" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-charcoal">{caregiverStatus.hoursOfCareThisWeek}</p>
                    <p className="text-xs text-medium-gray">Hours of care this week</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-warm-ivory rounded-xl flex items-center justify-center">
                    <Moon className="w-5 h-5 text-deep-slate" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-charcoal">{caregiverStatus.nightsInterruptedSleep}</p>
                    <p className="text-xs text-medium-gray">Nights with interrupted sleep</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-warm-ivory rounded-xl flex items-center justify-center">
                    <Phone className="w-5 h-5 text-gentle-coral" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-charcoal">{caregiverStatus.emergencyCallsMade}</p>
                    <p className="text-xs text-medium-gray">Emergency calls this month</p>
                  </div>
                </div>
              </div>

              {/* Recommended Actions */}
              {caregiverStatus.recommendedActions.length > 0 && (
                <div className="mt-6 p-4 bg-warm-ivory rounded-xl">
                  <p className="text-sm font-medium text-charcoal mb-2">Recommended Actions:</p>
                  <ul className="space-y-1">
                    {caregiverStatus.recommendedActions.map((action, index) => (
                      <li key={index} className="text-sm text-medium-gray flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-soft-sage" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Mood Entries */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-charcoal">Recent Mood Entries</h3>
            <Button variant="ghost" size="sm" className="text-calm-blue">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <Card className="border-0 shadow-soft">
            <CardContent className="p-4">
              <div className="space-y-3">
                {moodEntries.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 p-3 bg-soft-taupe/30 rounded-xl">
                    <span className="text-2xl">
                      {entry.mood === 'happy' && '😊'}
                      {entry.mood === 'calm' && '😌'}
                      {entry.mood === 'sad' && '😢'}
                      {entry.mood === 'anxious' && '😰'}
                      {entry.mood === 'angry' && '😠'}
                      {entry.mood === 'confused' && '😕'}
                      {entry.mood === 'scared' && '😨'}
                      {entry.mood === 'worried' && '😟'}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-charcoal capitalize">{entry.mood}</p>
                      <p className="text-sm text-medium-gray">{entry.note || 'No notes'}</p>
                    </div>
                    <span className="text-xs text-medium-gray">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Behavior Incidents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-charcoal">Behavior Incidents</h3>
            <Button variant="ghost" size="sm" className="text-calm-blue">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <Card className="border-0 shadow-soft">
            <CardContent className="p-4">
              <div className="space-y-3">
                {behaviorLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-medium-gray">No recent incidents</p>
                  </div>
                ) : (
                  behaviorLogs.slice(0, 3).map((log) => (
                    <div key={log.id} className="flex items-center gap-3 p-3 bg-soft-taupe/30 rounded-xl">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        log.severity === 'severe' ? 'bg-gentle-coral/20' :
                        log.severity === 'moderate' ? 'bg-warm-amber/20' : 'bg-calm-blue/20'
                      }`}>
                        <AlertCircle className={`w-5 h-5 ${
                          log.severity === 'severe' ? 'text-gentle-coral' :
                          log.severity === 'moderate' ? 'text-warm-amber' : 'text-calm-blue'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-charcoal">{log.behavior}</p>
                        <p className="text-sm text-medium-gray">{log.description}</p>
                      </div>
                      <Badge className={
                        log.severity === 'severe' ? 'bg-gentle-coral' :
                        log.severity === 'moderate' ? 'bg-warm-amber' : 'bg-calm-blue'
                      }>
                        {log.severity}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        <h3 className="text-lg font-semibold text-charcoal mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button className="bg-calm-blue hover:bg-blue-600 text-white rounded-xl">
            <FileText className="w-4 h-4 mr-2" />
            Add Clinical Note
          </Button>
          <Button variant="outline" className="border-calm-blue text-calm-blue hover:bg-calm-blue hover:text-white rounded-xl">
            <Activity className="w-4 h-4 mr-2" />
            Schedule Assessment
          </Button>
          <Button variant="outline" className="border-soft-taupe text-charcoal hover:bg-soft-taupe rounded-xl">
            <Users className="w-4 h-4 mr-2" />
            Contact Caregiver
          </Button>
          <Button variant="outline" className="border-warm-bronze text-warm-bronze hover:bg-warm-bronze hover:text-white rounded-xl">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule Care Conference
          </Button>
        </div>
      </motion.div>

      {/* Alert Detail Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAlert?.category === 'red' && <AlertCircle className="w-5 h-5 text-gentle-coral" />}
              {selectedAlert?.category === 'yellow' && <Info className="w-5 h-5 text-warm-amber" />}
              {selectedAlert?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedAlert?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-warm-ivory rounded-xl">
                  <p className="text-sm text-medium-gray">Count</p>
                  <p className="text-lg font-semibold text-charcoal">{selectedAlert.count} incidents</p>
                </div>
                <div className="p-3 bg-warm-ivory rounded-xl">
                  <p className="text-sm text-medium-gray">Last Occurred</p>
                  <p className="text-lg font-semibold text-charcoal">
                    {selectedAlert.lastOccurred ? new Date(selectedAlert.lastOccurred).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-soft-sage/10 rounded-xl">
                <p className="text-sm font-medium text-charcoal mb-1">Recommended Action:</p>
                <p className="text-sm text-medium-gray">{selectedAlert.recommendedAction}</p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedAlert(null)}
                  className="flex-1 rounded-xl"
                >
                  Close
                </Button>
                <Button
                  onClick={() => setSelectedAlert(null)}
                  className="flex-1 bg-calm-blue hover:bg-blue-600 text-white rounded-xl"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Document Intervention
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ADL Assessment Reminder Dialog */}
      <Dialog open={showADLReminder} onOpenChange={setShowADLReminder}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gentle-coral">
              <AlertCircle className="w-5 h-5" />
              Functional Assessment Due
            </DialogTitle>
            <DialogDescription>
              ADL decline detected. A new assessment is recommended.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-gentle-coral/10 rounded-xl">
              <p className="text-sm text-charcoal">
                <strong>Decline detected:</strong> ADL score decreased by {adlDecline} points since last assessment.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-charcoal">Areas of concern:</p>
              {latestADL && previousADL && (
                <ul className="space-y-1">
                  {latestADL.dressing > previousADL.dressing && (
                    <li className="text-sm text-medium-gray flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gentle-coral" />
                      Dressing: {previousADL.dressing} → {latestADL.dressing}
                    </li>
                  )}
                  {latestADL.toileting > previousADL.toileting && (
                    <li className="text-sm text-medium-gray flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gentle-coral" />
                      Toileting: {previousADL.toileting} → {latestADL.toileting}
                    </li>
                  )}
                  {latestADL.transferring > previousADL.transferring && (
                    <li className="text-sm text-medium-gray flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gentle-coral" />
                      Transferring: {previousADL.transferring} → {latestADL.transferring}
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowADLReminder(false)}
                className="flex-1 rounded-xl"
              >
                Remind Later
              </Button>
              <Button
                onClick={() => setShowADLReminder(false)}
                className="flex-1 bg-calm-blue hover:bg-blue-600 text-white rounded-xl"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}