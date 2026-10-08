import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  AlertCircle,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useLottie } from 'lottie-react';
import { useAuth } from '../context/AuthContext';
import transferAnimation from '../assets/lottie/isometric-transfer.json';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, register, forgotPassword, verifyResetToken, resetPassword, user } = useAuth();
  const { View: transferAnimationView } = useLottie({
    animationData: transferAnimation,
    loop: true,
  });

  const queryToken = searchParams.get('token') || '';
  const initialMode: AuthMode =
    location.pathname === '/reset-password' || queryToken
      ? 'reset'
      : location.pathname === '/forgot-password'
      ? 'forgot'
      : 'login';

  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Sign In / Register state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');

  // Password reset state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState(queryToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Synchronize route/query changes
  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setResetToken(tokenFromUrl);
      setMode('reset');
    } else if (location.pathname === '/reset-password') {
      setMode('reset');
    } else if (location.pathname === '/forgot-password') {
      setMode('forgot');
    }
  }, [location.pathname, searchParams]);

  // Verify token whenever mode is 'reset' and token is non-empty
  useEffect(() => {
    if (mode === 'reset' && resetToken.trim().length > 10) {
      let isCurrent = true;
      setVerifyingToken(true);
      setError(null);

      verifyResetToken(resetToken.trim())
        .then((res) => {
          if (!isCurrent) return;
          if (res.valid && res.email) {
            setVerifiedEmail(res.email);
          } else {
            setVerifiedEmail(null);
            setError(res.message || 'The password reset token is invalid or has expired.');
          }
        })
        .catch((err: any) => {
          if (!isCurrent) return;
          setVerifiedEmail(null);
          setError(err.message || 'Failed to verify reset token.');
        })
        .finally(() => {
          if (isCurrent) setVerifyingToken(false);
        });

      return () => {
        isCurrent = false;
      };
    } else {
      setVerifiedEmail(null);
    }
  }, [mode, resetToken]);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]|[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };
  const strengthScore = getPasswordStrength(newPassword);

  const getStrengthLabel = (score: number) => {
    switch (score) {
      case 0:
        return { text: 'Empty', color: 'text-slate-500', barColor: 'bg-slate-700' };
      case 1:
        return { text: 'Weak', color: 'text-red-400', barColor: 'bg-red-500' };
      case 2:
        return { text: 'Fair', color: 'text-amber-400', barColor: 'bg-amber-500' };
      case 3:
        return { text: 'Good', color: 'text-sky-400', barColor: 'bg-sky-500' };
      case 4:
        return { text: 'Strong', color: 'text-emerald-400', barColor: 'bg-emerald-500' };
      default:
        return { text: '', color: 'text-slate-500', barColor: 'bg-slate-700' };
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(email, password, fullName, orgName || 'My Tech Agency');
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotSuccess(null);
    setGeneratedToken(null);
    setLoading(true);

    try {
      const res = await forgotPassword(forgotEmail);
      setForgotSuccess(res.message);
      if (res.reset_token) {
        setGeneratedToken(res.reset_token);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      setResetSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  const copyResetLink = () => {
    if (!generatedToken) return;
    const link = `${window.location.origin}/reset-password?token=${generatedToken}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const fillDemoAccount = async (role: 'owner' | 'finance' | 'sales') => {
    setError(null);
    setLoading(true);
    try {
      const demoEmail =
        role === 'owner'
          ? 'alice@northwind.io'
          : role === 'finance'
          ? 'fiona@northwind.io'
          : 'sam@northwind.io';
      const demoPass = 'Northwind2026!';

      try {
        await login(demoEmail, demoPass);
      } catch {
        await register(demoEmail, demoPass, 'Alice Director (Northwind)', 'Northwind Digital');
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Demo sign-in error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,490px)] lg:gap-14 lg:px-8">
        {/* Left hero section */}
        <section className="mx-auto w-full max-w-xl text-center lg:text-left">
          <div className="inline-flex items-center justify-center gap-3 lg:justify-start">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              OpsPilot
            </h1>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            The AI-native operations OS for small IT services and dev shops
          </p>
          <div className="mx-auto mt-4 aspect-square w-full max-w-[260px] sm:max-w-[320px] lg:mt-0 lg:max-w-[460px]">
            <div aria-hidden="true" className="h-full w-full">
              {transferAnimationView}
            </div>
          </div>
        </section>

        {/* Right card container */}
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 px-6 py-8 shadow-2xl sm:px-10 lg:max-w-none">
          {/* Quick Demo Login Banner (only shown in Login/Register mode) */}
          {(mode === 'login' || mode === 'register') && (
            <div className="mb-6 p-3.5 rounded-xl bg-sky-950/40 border border-sky-800/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                  <Zap className="w-4 h-4 text-sky-400" />
                  <span>1-Click Demo Access</span>
                </div>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono font-medium">
                  Northwind Digital (25 FTE)
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoAccount('owner')}
                  disabled={loading}
                  className="w-full py-1.5 px-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  Owner Demo <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount('finance')}
                  disabled={loading}
                  className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-all border border-slate-700 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  Finance Role
                </button>
              </div>
            </div>
          )}

          {/* Form Tabs (Login / Register) */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex border-b border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 pb-3 text-sm font-semibold text-center transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'border-b-2 border-sky-500 text-sky-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 pb-3 text-sm font-semibold text-center transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'border-b-2 border-sky-500 text-sky-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Register Org
              </button>
            </div>
          )}

          {/* Forgot Password Header */}
          {mode === 'forgot' && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setForgotSuccess(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 transition-colors mb-3 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Forgot Password</h2>
                  <p className="text-xs text-slate-400">
                    Recover access to your OpsPilot workspace
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Reset Password Header */}
          {mode === 'reset' && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setResetSuccess(false);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 transition-colors mb-3 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Reset Password</h2>
                  <p className="text-xs text-slate-400">
                    Create a new secure password for your account
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ==================== 1. LOGIN / REGISTER VIEW ==================== */}
          {(mode === 'login' || mode === 'register') && (
            <form className="space-y-4" onSubmit={handleLoginSubmit}>
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Alice Director"
                      className="mt-1 block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Company / Organization Name
                    </label>
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. Northwind Digital Ltd"
                      className="mt-1 block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1 block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setForgotEmail(email);
                      }}
                      className="text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1 block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-sm font-semibold text-white shadow-md shadow-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Please wait...</span>
                  </>
                ) : mode === 'register' ? (
                  'Create Organization'
                ) : (
                  'Sign In to Workspace'
                )}
              </button>
            </form>
          )}

          {/* ==================== 2. FORGOT PASSWORD VIEW ==================== */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              {forgotSuccess ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-emerald-200">
                          Password Reset Link Ready
                        </p>
                        <p className="text-xs text-emerald-300/90 leading-relaxed">
                          {forgotSuccess}
                        </p>
                        <p className="text-[11px] text-emerald-400/80 font-mono">
                          Target: {forgotEmail}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dev / Demo direct reset shortcut */}
                  {generatedToken && (
                    <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          Direct Reset Access
                        </span>
                        <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                          Valid 15m
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        In development/demo mode, you can immediately proceed to set your new password or copy the verification link:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setResetToken(generatedToken);
                            setMode('reset');
                            setError(null);
                          }}
                          className="w-full py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-white shadow-md shadow-sky-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          Reset Now <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={copyResetLink}
                          className="w-full py-2 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-medium text-slate-200 border border-slate-600 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-300" />
                              <span>Copy Reset Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setForgotSuccess(null);
                      setGeneratedToken(null);
                      setError(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-all cursor-pointer"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleForgotPasswordSubmit}>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Registered Work Email
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="block w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  {/* 1-click test email fill */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Quick fill demo account:</span>
                    <button
                      type="button"
                      onClick={() => setForgotEmail('alice@northwind.io')}
                      className="text-xs text-sky-400 hover:text-sky-300 underline font-mono cursor-pointer"
                    >
                      alice@northwind.io
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !forgotEmail.trim()}
                    className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-sm font-semibold text-white shadow-md shadow-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending reset instructions...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Remember your password? <span className="text-sky-400">Sign in</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ==================== 3. RESET PASSWORD VIEW ==================== */}
          {mode === 'reset' && (
            <div className="space-y-4">
              {resetSuccess ? (
                <div className="space-y-4 text-center py-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Password Updated</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Your password has been securely reset. You can now log into your OpsPilot workspace with your new credentials.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setEmail(verifiedEmail || forgotEmail || '');
                      setPassword('');
                      setResetSuccess(false);
                      setError(null);
                    }}
                    className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-sm font-semibold text-white shadow-md shadow-sky-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Sign In with New Password <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleResetPasswordSubmit}>
                  {/* Verified user badge */}
                  {verifiedEmail && (
                    <div className="p-2.5 rounded-lg bg-sky-950/40 border border-sky-800/60 flex items-center justify-between text-xs">
                      <span className="text-slate-300">Account verified:</span>
                      <span className="font-semibold text-sky-400 font-mono">
                        {verifiedEmail}
                      </span>
                    </div>
                  )}

                  {verifyingToken && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                      <span>Verifying reset token...</span>
                    </div>
                  )}

                  {/* Token input (shown if not verified or if user wants to check/paste token) */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Reset Token
                    </label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste your reset token here..."
                      className="block w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* New Password input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="block w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Password strength meter */}
                    {newPassword.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Password strength:</span>
                          <span className={`font-semibold ${getStrengthLabel(strengthScore).color}`}>
                            {getStrengthLabel(strengthScore).text}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          {[1, 2, 3, 4].map((step) => (
                            <div
                              key={step}
                              className={`h-full transition-all duration-300 ${
                                strengthScore >= step
                                  ? getStrengthLabel(strengthScore).barColor
                                  : 'bg-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm New Password input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type new password"
                        className="block w-full px-3 py-2 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {confirmPassword.length > 0 && (
                      <p
                        className={`mt-1.5 text-[11px] font-medium flex items-center gap-1 ${
                          newPassword === confirmPassword ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {newPassword === confirmPassword ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Passwords match</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Passwords do not match</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !resetToken.trim() ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                    className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-sm font-semibold text-white shadow-md shadow-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating password...</span>
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Need a new reset link? <span className="text-sky-400">Request another</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Footer Security Badge */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Tenant isolation &amp; RBAC enforced</span>
          </div>
        </div>
      </div>
    </div>
  );
};
