import { useState } from 'react';
import { createPublicPatientIntake } from '@/services/publicPatientIntakeService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2, Stethoscope, Pill, Phone, MapPin, User, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { PatientIntakeFormData, DementiaStage } from '@/types/patientIntake';

// Public patient intake page mirrors the caregiver intake UI,
// but only saves to patient_intake and does not provision an auth account.
// US States for dropdown
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP'
];

export default function PublicPatientIntakePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showTempPass, setShowTempPass] = useState(false);

  const [formData, setFormData] = useState<PatientIntakeFormData>({
    // Patient Information (required)
    patientFirstName: '',
    patientLastName: '',
    patientPreferredName: '',
    patientDateOfBirth: '',
    patientDiagnosisDate: '',
    patientDementiaStage: undefined,
    patientStreetAddress: '',
    patientCity: '',
    patientState: '',
    patientZipCode: '',
    patientPhone: '',
    patientEmail: '',
    patientTempPassword: '',

    // Doctor/Therapist Information
    preferredHospital: '',
    doctorTherapistName: '',
    doctorTherapistPhone: '',

    // Caregiver Information (snapshot)
    caregiverName: '',
    caregiverRelationship: '',
    caregiverPhone: '',

    // Medications
    medicationsAndDosage: '',

    // Closest Relative
    closestRelativeFullName: '',
    closestRelativePhone: '',
    closestRelativeEmail: '',
    closestRelativeRelationship: '',
  });

  const handleInputChange = (field: keyof PatientIntakeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (step: number): boolean => {
    const errors: string[] = [];

    if (step === 1) {
      if (!formData.patientFirstName.trim()) errors.push('First name is required');
      if (!formData.patientLastName.trim()) errors.push('Last name is required');
      if (!formData.patientEmail.trim()) errors.push('Email is required');
      if (formData.patientTempPassword && formData.patientTempPassword.length < 6) errors.push('Temporary password must be at least 6 characters');
      if (formData.patientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.patientEmail)) {
        errors.push('Please enter a valid email address');
      }
    }

    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(1)) return;

    setIsLoading(true);

    try {
      const { intakeId, error } = await createPublicPatientIntake(formData);

      if (error) {
        toast.error(error.message || 'Failed to submit intake form');
        return;
      }

      toast.success('Patient intake submitted successfully!');
      setCurrentStep(1);
      setFormData({
        patientFirstName: '',
        patientLastName: '',
        patientPreferredName: '',
        patientDateOfBirth: '',
        patientDiagnosisDate: '',
        patientDementiaStage: undefined,
        patientStreetAddress: '',
        patientCity: '',
        patientState: '',
        patientZipCode: '',
        patientPhone: '',
        patientEmail: '',
        patientTempPassword: '',
        preferredHospital: '',
        doctorTherapistName: '',
        doctorTherapistPhone: '',
        caregiverName: '',
        caregiverRelationship: '',
        caregiverPhone: '',
        medicationsAndDosage: '',
        closestRelativeFullName: '',
        closestRelativePhone: '',
        closestRelativeEmail: '',
        closestRelativeRelationship: '',
      });

      console.log('Public intake submitted:', intakeId);
    } catch (error) {
      console.error('Error submitting public intake:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3, 4].map((step) => (
        <div
          key={step}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
            step === currentStep
              ? 'bg-warm-bronze text-white'
              : step < currentStep
              ? 'bg-warm-bronze/30 text-warm-bronze'
              : 'bg-soft-taupe text-medium-gray'
          }`}
        >
          {step}
        </div>
      ))}
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-warm-bronze" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="patientFirstName">First Name *</Label>
                  <Input
                    id="patientFirstName"
                    value={formData.patientFirstName}
                    onChange={(e) => handleInputChange('patientFirstName', e.target.value)}
                    placeholder="Enter first name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientLastName">Last Name *</Label>
                  <Input
                    id="patientLastName"
                    value={formData.patientLastName}
                    onChange={(e) => handleInputChange('patientLastName', e.target.value)}
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="patientPreferredName">Preferred Name</Label>
                  <Input
                    id="patientPreferredName"
                    value={formData.patientPreferredName}
                    onChange={(e) => handleInputChange('patientPreferredName', e.target.value)}
                    placeholder="What they like to be called"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientEmail">Email Address *</Label>
                  <Input
                    id="patientEmail"
                    type="email"
                    value={formData.patientEmail}
                    onChange={(e) => handleInputChange('patientEmail', e.target.value)}
                    placeholder="patient@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientTempPassword">
                    Temporary Password
                    <span className="text-medium-gray text-xs font-normal ml-2">(optional — patient will set their own on first login)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="patientTempPassword"
                      type={showTempPass ? 'text' : 'password'}
                      value={formData.patientTempPassword || ''}
                      onChange={(e) => handleInputChange('patientTempPassword', e.target.value)}
                      placeholder="Leave blank to auto-generate"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTempPass(!showTempPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal"
                    >
                      {showTempPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-medium-gray">
                    Patient will receive an email to set or change their password on first login.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="patientDateOfBirth">Date of Birth</Label>
                  <Input
                    id="patientDateOfBirth"
                    type="date"
                    value={formData.patientDateOfBirth}
                    onChange={(e) => handleInputChange('patientDateOfBirth', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientPhone">Contact Number</Label>
                  <Input
                    id="patientPhone"
                    type="tel"
                    value={formData.patientPhone}
                    onChange={(e) => handleInputChange('patientPhone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="patientDiagnosisDate">Diagnosis Date</Label>
                  <Input
                    id="patientDiagnosisDate"
                    type="date"
                    value={formData.patientDiagnosisDate}
                    onChange={(e) => handleInputChange('patientDiagnosisDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientDementiaStage">Dementia Stage</Label>
                  <Select
                    value={formData.patientDementiaStage || ''}
                    onValueChange={(value) => handleInputChange('patientDementiaStage', value as DementiaStage)}
                  >
                    <SelectTrigger id="patientDementiaStage">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="early">Early Stage</SelectItem>
                      <SelectItem value="middle">Middle Stage</SelectItem>
                      <SelectItem value="late">Late Stage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-warm-bronze" />
                  Address
                </Label>
                <Input
                  id="patientStreetAddress"
                  value={formData.patientStreetAddress}
                  onChange={(e) => handleInputChange('patientStreetAddress', e.target.value)}
                  placeholder="Street address"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="col-span-2">
                    <Input
                      id="patientCity"
                      value={formData.patientCity}
                      onChange={(e) => handleInputChange('patientCity', e.target.value)}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <Select
                      value={formData.patientState || ''}
                      onValueChange={(value) => handleInputChange('patientState', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Input
                      id="patientZipCode"
                      value={formData.patientZipCode}
                      onChange={(e) => handleInputChange('patientZipCode', e.target.value)}
                      placeholder="ZIP"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-warm-bronze" />
                Doctor / Therapist Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preferredHospital">Preferred Hospital / Clinic</Label>
                <Input
                  id="preferredHospital"
                  value={formData.preferredHospital}
                  onChange={(e) => handleInputChange('preferredHospital', e.target.value)}
                  placeholder="e.g., Raleigh Medical Center"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="doctorTherapistName">Doctor / Therapist Name</Label>
                  <Input
                    id="doctorTherapistName"
                    value={formData.doctorTherapistName}
                    onChange={(e) => handleInputChange('doctorTherapistName', e.target.value)}
                    placeholder="Dr. Jane Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doctorTherapistPhone">Doctor / Therapist Phone Number</Label>
                  <Input
                    id="doctorTherapistPhone"
                    type="tel"
                    value={formData.doctorTherapistPhone}
                    onChange={(e) => handleInputChange('doctorTherapistPhone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <>
            <Card className="border-0 shadow-soft">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-warm-bronze" />
                  Caregiver Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="caregiverName">Caregiver&apos;s Name</Label>
                    <Input
                      id="caregiverName"
                      value={formData.caregiverName}
                      onChange={(e) => handleInputChange('caregiverName', e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="caregiverRelationship">Relation to Patient</Label>
                    <Input
                      id="caregiverRelationship"
                      value={formData.caregiverRelationship}
                      onChange={(e) => handleInputChange('caregiverRelationship', e.target.value)}
                      placeholder="e.g., Daughter, Son, Spouse"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="caregiverPhone">Caregiver&apos;s Phone Number</Label>
                  <Input
                    id="caregiverPhone"
                    type="tel"
                    value={formData.caregiverPhone}
                    onChange={(e) => handleInputChange('caregiverPhone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-soft mt-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Pill className="w-5 h-5 text-warm-bronze" />
                  Current Medications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="medicationsAndDosage">Medications Taking & Dosage</Label>
                  <Textarea
                    id="medicationsAndDosage"
                    value={formData.medicationsAndDosage}
                    onChange={(e) => handleInputChange('medicationsAndDosage', e.target.value)}
                    placeholder="List all medications and dosages (e.g., Donepezil 10mg daily, Memantine 5mg twice daily...)"
                    rows={4}
                  />
                  <p className="text-sm text-medium-gray">
                    Enter all medications in a single field. No need to parse into separate entries.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        );

      case 4:
        return (
          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5 text-warm-bronze" />
                Closest Relative Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="closestRelativeFullName">Contact Full Name</Label>
                <Input
                  id="closestRelativeFullName"
                  value={formData.closestRelativeFullName}
                  onChange={(e) => handleInputChange('closestRelativeFullName', e.target.value)}
                  placeholder="Closest Relative contact name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="closestRelativePhone">Contact Phone Number</Label>
                  <Input
                    id="closestRelativePhone"
                    type="tel"
                    value={formData.closestRelativePhone}
                    onChange={(e) => handleInputChange('closestRelativePhone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closestRelativeEmail">Contact Email Address</Label>
                  <Input
                    id="closestRelativeEmail"
                    type="email"
                    value={formData.closestRelativeEmail}
                    onChange={(e) => handleInputChange('closestRelativeEmail', e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="closestRelativeRelationship">Relationship</Label>
                <Input
                  id="closestRelativeRelationship"
                  value={formData.closestRelativeRelationship}
                  onChange={(e) => handleInputChange('closestRelativeRelationship', e.target.value)}
                  placeholder="e.g., Son, Daughter, Parent"
                />
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Patient Intake Form</h1>
        <p className="text-medium-gray">Complete the same intake workflow without requiring a login.</p>
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Labels */}
      <div className="text-center text-sm text-medium-gray mb-4">
        {currentStep === 1 && 'Patient Information'}
        {currentStep === 2 && 'Doctor / Therapist'}
        {currentStep === 3 && 'Caregiver & Medications'}
        {currentStep === 4 && 'Emergency Contact'}
      </div>

      {/* Form Content */}
      {renderStepContent()}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={currentStep === 1 ? () => window.history.back() : handleBack}
          disabled={isLoading}
        >
          {currentStep === 1 ? 'Cancel' : 'Back'}
        </Button>

        {currentStep < 4 ? (
          <Button
            type="button"
            onClick={handleNext}
            className="bg-warm-bronze hover:bg-deep-bronze text-white"
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            className="bg-warm-bronze hover:bg-deep-bronze text-white"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting Intake...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Submit Intake
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}