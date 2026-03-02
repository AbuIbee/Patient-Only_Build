import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { createAndProvisionPatient } from '@/services/patientIntakeService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, UserPlus, Loader2, Stethoscope, Pill, Phone, MapPin, User } from 'lucide-react';
import { toast } from 'sonner';
import type { PatientIntakeFormData, DementiaStage } from '@/types/patientIntake';

interface AddPatientPageProps {
  onBack: () => void;
  onPatientAdded: (patientProfileId: string) => void;
}

// US States for dropdown
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP'
];

export default function AddPatientPage({ onBack, onPatientAdded }: AddPatientPageProps) {
  const { state } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
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
    
    // Doctor/Therapist Information
    preferredHospital: '',
    doctorTherapistName: '',
    doctorTherapistPhone: '',
    
    // Caregiver Information (snapshot)
    caregiverName: state.currentUser ? `${state.currentUser.firstName} ${state.currentUser.lastName}` : '',
    caregiverRelationship: '',
    caregiverPhone: state.currentUser?.phone || '',
    
    // Medications
    medicationsAndDosage: '',
    
    // Emergency Contact
    emergencyContactFullName: '',
    emergencyContactPhone: '',
    emergencyContactEmail: '',
    emergencyContactRelationship: '',
  });

const handleInputChange = <K extends keyof PatientIntakeFormData>(
  field: K,
  value: PatientIntakeFormData[K]
) => {
  setFormData(prev => ({ ...prev, [field]: value }));
};

  const validateStep = (step: number): boolean => {
    const errors: string[] = [];
    
    if (step === 1) {
      if (!formData.patientFirstName.trim()) errors.push('First name is required');
      if (!formData.patientLastName.trim()) errors.push('Last name is required');
      if (!formData.patientEmail.trim()) errors.push('Email is required');
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
     if (!state.currentUser?.id) {
      toast.error('You must be logged in to add a patient');
      return;
    }

    if (!validateStep(1)) return;

    setIsLoading(true);

    try {
      // Step 1 & 2 combined: Create intake and provision patient
      const { patientProfileId, error } = await createAndProvisionPatient(
        formData,
        state.currentUser.id
      );

      if (error) {
        toast.error(error.message || 'Failed to create patient');
        return;
      }

      if (patientProfileId) {
        toast.success('Patient added successfully!');
        onPatientAdded(patientProfileId);
      }
    } catch (error) {
      console.error('Error adding patient:', error);
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
                  <Label htmlFor="patientDiagnosisDate">Diagnosis Date</Label>
                  <Input
                    id="patientDiagnosisDate"
                    type="date"
                    value={formData.patientDiagnosisDate}
                    onChange={(e) => handleInputChange('patientDiagnosisDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patientDementiaStage">Dementia Stage</Label>
                <Select
                  value={formData.patientDementiaStage ?? ''}
                  onValueChange={(value) => handleInputChange('patientDementiaStage', value as DementiaStage)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="early">Early Stage</SelectItem>
                    <SelectItem value="middle">Middle Stage</SelectItem>
                    <SelectItem value="late">Late Stage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patientStreetAddress" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Street Address
                </Label>
                <Input
                  id="patientStreetAddress"
                  value={formData.patientStreetAddress}
                  onChange={(e) => handleInputChange('patientStreetAddress', e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="patientCity">City</Label>
                  <Input
                    id="patientCity"
                    value={formData.patientCity}
                    onChange={(e) => handleInputChange('patientCity', e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patientState">State</Label>
                  <Select
                    value={formData.patientState}
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
                <div className="space-y-2">
                  <Label htmlFor="patientZipCode">Zip Code</Label>
                  <Input
                    id="patientZipCode"
                    value={formData.patientZipCode}
                    onChange={(e) => handleInputChange('patientZipCode', e.target.value)}
                    placeholder="12345"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patientPhone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Contact Number
                </Label>
                <Input
                  id="patientPhone"
                  type="tel"
                  value={formData.patientPhone}
                  onChange={(e) => handleInputChange('patientPhone', e.target.value)}
                  placeholder="(555) 123-4567"
                />
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
                <Label htmlFor="preferredHospital">Preferred Hospital</Label>
                <Input
                  id="preferredHospital"
                  value={formData.preferredHospital}
                  onChange={(e) => handleInputChange('preferredHospital', e.target.value)}
                  placeholder="Hospital or clinic name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="doctorTherapistName">Doctor / Therapist Name</Label>
                  <Input
                    id="doctorTherapistName"
                    value={formData.doctorTherapistName}
                    onChange={(e) => handleInputChange('doctorTherapistName', e.target.value)}
                    placeholder="Dr. Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doctorTherapistPhone">Doctor / Therapist Phone</Label>
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
                Emergency Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emergencyContactFullName">Contact Full Name</Label>
                <Input
                  id="emergencyContactFullName"
                  value={formData.emergencyContactFullName}
                  onChange={(e) => handleInputChange('emergencyContactFullName', e.target.value)}
                  placeholder="Emergency contact name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactPhone">Contact Phone Number</Label>
                  <Input
                    id="emergencyContactPhone"
                    type="tel"
                    value={formData.emergencyContactPhone}
                    onChange={(e) => handleInputChange('emergencyContactPhone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactEmail">Contact Email Address</Label>
                  <Input
                    id="emergencyContactEmail"
                    type="email"
                    value={formData.emergencyContactEmail}
                    onChange={(e) => handleInputChange('emergencyContactEmail', e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergencyContactRelationship">Relationship</Label>
                <Input
                  id="emergencyContactRelationship"
                  value={formData.emergencyContactRelationship}
                  onChange={(e) => handleInputChange('emergencyContactRelationship', e.target.value)}
                  placeholder="e.g., Family friend, Neighbor"
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
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="rounded-full"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Add New Patient</h1>
          <p className="text-medium-gray">Enter patient information to get started</p>
        </div>
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
          onClick={currentStep === 1 ? onBack : handleBack}
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
                Adding Patient...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Patient
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
