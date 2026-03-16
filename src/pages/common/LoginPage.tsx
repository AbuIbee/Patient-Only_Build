import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, ArrowLeft, User, UserCircle, Stethoscope, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { UserRole } from '@/types';

type AuthMode = 'select-role' | 'login' | 'signup';

export default function LoginPage() {
  const { dispatch } = useApp();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('select-role');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleBack = () => {
    if (authMode !== 'select-role') {
      setAuthMode('select-role');
      setSelectedRole(null);
    } else {
      dispatch({ type: 'SET_VIEW', payload: 'landing' });
    }
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setAuthMode('login');
  };

  // Mock login for demo purposes
  const handleMockLogin = () => {
    if (!selectedRole) return;
    const mockUser = {
      id: 'u1',
      email: 'demo@memoriahelps.com',
      firstName: selectedRole === 'patient' ? 'Eleanor'
               : selectedRole === 'caregiver' ? 'Mary'
               : selectedRole === 'admin' ? 'Admin'
               : 'Dr. Sarah',
      lastName: selectedRole === 'patient' ? 'Thompson'
              : selectedRole === 'caregiver' ? 'Thompson'
              : selectedRole === 'admin' ? 'User'
              : 'Johnson',
      role: selectedRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'SET_USER', payload: mockUser });
    dispatch({ type: 'SET_ROLE', payload: selectedRole });
    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
  };

  // Real Supabase login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    if (!email && !password) {
      handleMockLogin();
      return;
    }

    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast.error(error.message || 'Login failed. Please check your credentials.');
        return;
      }
      if (!data.user) {
        toast.error('Login failed. Please try again.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        // Profile missing — create it automatically and continue
        const { error: insertError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          first_name: data.user.user_metadata?.first_name || email.split('@')[0],
          last_name: data.user.user_metadata?.last_name || '',
          role: selectedRole,
          must_change_password: false,
        });

        if (insertError) {
          toast.error('Could not load your profile. Please contact support.');
          await supabase.auth.signOut();
          return;
        }

        // Use what we know
        dispatch({
          type: 'SET_USER',
          payload: {
            id: data.user.id,
            email: data.user.email || email,
            firstName: data.user.user_metadata?.first_name || email.split('@')[0],
            lastName: data.user.user_metadata?.last_name || '',
            role: selectedRole,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        dispatch({
          type: 'SET_USER',
          payload: {
            id: profile.id,
            email: profile.email,
            firstName: profile.first_name,
            lastName: profile.last_name,
            role: profile.role as UserRole,
            phone: profile.phone || undefined,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          },
        });
      }

      dispatch({ type: 'SET_ROLE', payload: selectedRole });
      dispatch({ type: 'SET_AUTHENTICATED', payload: true });

    } catch (err) {
      console.error('Login error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Sign up new users
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Please enter your first and last name');
      return;
    }
    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role: selectedRole,
          },
        },
      });

      if (error) {
        toast.error(error.message || 'Sign up failed. Please try again.');
        return;
      }

      if (data.user) {
        // Insert profile row immediately
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role: selectedRole,
          must_change_password: false,
        });

        toast.success('Account created! You can now sign in.');
        setAuthMode('login');
        setPassword('');
        setFirstName('');
        setLastName('');
      }
    } catch (err) {
      console.error('Sign up error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const roles = [
    { id: 'patient'   as UserRole, label: 'I am a Patient',   icon: User,        description: 'Access your daily routine and memories', color: 'bg-soft-sage' },
    { id: 'caregiver' as UserRole, label: 'I am a Caregiver', icon: UserCircle,   description: 'Manage care and monitor wellbeing',       color: 'bg-warm-bronze' },
    { id: 'therapist' as UserRole, label: 'I am a Therapist', icon: Stethoscope,  description: 'Clinical tools and patient insights',     color: 'bg-calm-blue' },
    { id: 'admin'     as UserRole, label: 'Admin',             icon: ShieldCheck,  description: 'System administration and oversight',    color: 'bg-deep-bronze' },
  ];

  const roleLabel = selectedRole === 'patient' ? 'Patient'
    : selectedRole === 'caregiver' ? 'Caregiver'
    : selectedRole === 'therapist' ? 'Therapist'
    : 'Admin';

  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col">
      <header className="bg-white border-b border-soft-taupe px-4 py-4">
        <div className="max-w-md mx-auto flex items-center">
          <Button variant="ghost" size="icon" onClick={handleBack} className="mr-4">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-warm-bronze rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-charcoal">MemoriaHelps</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <AnimatePresence mode="wait">

            {/* Role Selection */}
            {authMode === 'select-role' && (
              <motion.div key="role-selection" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                <Card className="border-0 shadow-card">
                  <CardHeader className="text-center pb-8">
                    <CardTitle className="text-2xl font-bold text-charcoal">Welcome back</CardTitle>
                    <CardDescription className="text-medium-gray">Select your role to continue</CardDescription>
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
            )}

            {/* Login Form */}
            {authMode === 'login' && (
              <motion.div key="login-form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <Card className="border-0 shadow-card">
                  <CardHeader className="text-center pb-6">
                    <div className="flex justify-center mb-4">
                      <button onClick={() => setAuthMode('select-role')} className="flex items-center gap-2 text-medium-gray hover:text-charcoal transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Change role
                      </button>
                    </div>
                    <CardTitle className="text-2xl font-bold text-charcoal">Sign in as {roleLabel}</CardTitle>
                    <CardDescription className="text-medium-gray">Enter your credentials to continue</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleLogin} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-medium"
                      >
                        {isLoading
                          ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : 'Sign In'
                        }
                      </Button>
                    </form>

                    {/* Demo shortcut */}
                    <div className="mt-4 p-3 bg-soft-taupe/30 rounded-xl text-center">
                      <p className="text-xs text-medium-gray mb-2">Just exploring? Use demo mode:</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMockLogin}
                        className="text-warm-bronze border-warm-bronze hover:bg-warm-bronze/5"
                      >
                        Enter Demo as {roleLabel}
                      </Button>
                    </div>

                    <div className="mt-4 text-center">
                      <p className="text-sm text-medium-gray">
                        Don't have an account?{' '}
                        <button
                          onClick={() => setAuthMode('signup')}
                          className="text-warm-bronze hover:text-deep-bronze font-medium"
                        >
                          Create one
                        </button>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Sign Up Form */}
            {authMode === 'signup' && (
              <motion.div key="signup-form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <Card className="border-0 shadow-card">
                  <CardHeader className="text-center pb-6">
                    <div className="flex justify-center mb-4">
                      <button onClick={() => setAuthMode('login')} className="flex items-center gap-2 text-medium-gray hover:text-charcoal transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Back to sign in
                      </button>
                    </div>
                    <CardTitle className="text-2xl font-bold text-charcoal">Create Account</CardTitle>
                    <CardDescription className="text-medium-gray">Sign up as {roleLabel}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSignUp} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            placeholder="Jane"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            placeholder="Smith"
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signupEmail">Email</Label>
                        <Input
                          id="signupEmail"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signupPassword">Password</Label>
                        <Input
                          id="signupPassword"
                          type="password"
                          placeholder="Min 6 characters"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="h-12 rounded-xl border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze/20"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-medium"
                      >
                        {isLoading
                          ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : 'Create Account'
                        }
                      </Button>
                    </form>
                    <div className="mt-4 text-center">
                      <p className="text-sm text-medium-gray">
                        Already have an account?{' '}
                        <button
                          onClick={() => setAuthMode('login')}
                          className="text-warm-bronze hover:text-deep-bronze font-medium"
                        >
                          Sign in
                        </button>
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