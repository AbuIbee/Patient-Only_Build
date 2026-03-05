import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, ArrowLeft, User, UserCircle, Stethoscope } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserRole } from '@/types';

export default function LoginPage() {
  const { dispatch } = useApp();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleBack = () => {
    dispatch({ type: 'SET_VIEW', payload: 'landing' });
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    setIsLoading(true);
    
    // Simulate login
    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockUser = {
      id: 'u1',
      email: email || 'user@carecompanion.com',
      firstName: selectedRole === 'patient' ? 'Eleanor' : selectedRole === 'caregiver' ? 'Mary' : 'Dr. Sarah',
      lastName: selectedRole === 'patient' ? 'Thompson' : selectedRole === 'caregiver' ? 'Thompson' : 'Johnson',
      role: selectedRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dispatch({ type: 'SET_USER', payload: mockUser });
    dispatch({ type: 'SET_ROLE', payload: selectedRole });
    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
    setIsLoading(false);
  };

  const roles = [
    { id: 'patient' as UserRole, label: 'I am a Patient', icon: User, description: 'Access your daily routine and memories', color: 'bg-soft-sage' },
    { id: 'caregiver' as UserRole, label: 'I am a Caregiver', icon: UserCircle, description: 'Manage care and monitor wellbeing', color: 'bg-warm-bronze' },
    { id: 'therapist' as UserRole, label: 'I am a Therapist', icon: Stethoscope, description: 'Clinical tools and patient insights', color: 'bg-calm-blue' },
  ];

  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-soft-tauve px-4 py-4">
        <div className="max-w-md mx-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="mr-4"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-warm-bronze rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-charcoal">CareCompanion</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <AnimatePresence mode="wait">
            {!selectedRole ? (
              <motion.div
                key="role-selection"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="border-0 shadow-card">
                  <CardHeader className="text-center pb-8">
                    <CardTitle className="text-2xl font-bold text-charcoal">
                      Welcome back
                    </CardTitle>
                    <CardDescription className="text-medium-gray">
                      Select your role to continue
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => handleRoleSelect(role.id)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-soft-taupe hover:border-warm-bronze hover:bg-warm-bronze/5 transition-all text-left group"
                      >
                        <div className={`w-12 h-12 ${role.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                          <role.icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-charcoal">{role.label}</p>
                          <p className="text-sm text-medium-gray">{role.description}</p>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="login-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="border-0 shadow-card">
                  <CardHeader className="text-center pb-8">
                    <div className="flex justify-center mb-4">
                      <button
                        onClick={() => setSelectedRole(null)}
                        className="flex items-center gap-2 text-medium-gray hover:text-charcoal transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Change role
                      </button>
                    </div>
                    <CardTitle className="text-2xl font-bold text-charcoal">
                      Sign in as {selectedRole === 'patient' ? 'Patient' : selectedRole === 'caregiver' ? 'Caregiver' : 'Therapist'}
                    </CardTitle>
                    <CardDescription className="text-medium-gray">
                      Enter your credentials to access your portal
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleLogin} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-charcoal">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-charcoal">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded border-soft-taupe text-warm-bronze focus:ring-warm-bronze" />
                          <span className="text-medium-gray">Remember me</span>
                        </label>
                        <a href="#" className="text-warm-bronze hover:text-deep-bronze">
                          Forgot password?
                        </a>
                      </div>
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-medium"
                      >
                        {isLoading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          'Sign In'
                        )}
                      </Button>
                    </form>
                    <div className="mt-6 text-center">
                      <p className="text-sm text-medium-gray">
                        Don't have an account?{' '}
                        <a href="#" className="text-warm-bronze hover:text-deep-bronze font-medium">
                          Create one
                        </a>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}
