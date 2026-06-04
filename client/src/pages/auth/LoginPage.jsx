import { useForm } from 'react-hook-form';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Mail, Lock, ArrowRight, Loader2, ScanFace } from 'lucide-react';

import { useAuth } from '../../context/AuthContext.jsx';
import { dashboardPathForRole } from '../../utils/roleRedirect';
import AuthBackground from './AuthBackground.jsx';
import BrandHero from './BrandHero.jsx';
import FloatingField from './FloatingField.jsx';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched' });

  const onSubmit = async (values) => {
    try {
      const user = await login(values);
      const fallback = dashboardPathForRole(user.role);
      const redirectTo = location.state?.from?.pathname || fallback;
      toast.success(`Welcome back, ${user.name}`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Login failed';
      toast.error(msg);
    }
  };

  const notReady = () =>
    toast('SSO is coming soon — sign in with your email for now.', { icon: '🔒' });

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans text-white antialiased">
      <AuthBackground />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <BrandHero />

        {/* Right: login card */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10"
          >
            {/* Logo (visible on all sizes; doubles as mobile branding) */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg shadow-indigo-900/40">
                <ScanFace size={22} className="text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">PunchIn</span>
            </div>

            <h2 className="mt-7 text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-300">
              Sign in to your workspace to manage attendance &amp; time.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
              <FloatingField
                id="email"
                label="Email address"
                type="email"
                icon={Mail}
                autoComplete="email"
                error={errors.email?.message}
                registration={register('email', {
                  required: 'Email is required',
                  pattern: { value: EMAIL_RE, message: 'Enter a valid email address' },
                })}
              />

              <FloatingField
                id="password"
                label="Password"
                type="password"
                icon={Lock}
                autoComplete="current-password"
                error={errors.password?.message}
                registration={register('password', {
                  required: 'Password is required',
                  minLength: { value: 6, message: 'Password is too short' },
                })}
              />

              <div className="flex items-center justify-between pt-0.5 text-sm">
                <label className="flex cursor-pointer select-none items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    {...register('remember')}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-indigo-500 accent-indigo-500 focus:ring-indigo-400/60"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() =>
                    toast('Contact your administrator to reset your password.', { icon: '✉️' })
                  }
                  className="font-medium text-indigo-300 transition hover:text-indigo-200"
                >
                  Forgot password?
                </button>
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
                whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
                className="group relative mt-2 w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-900/40 outline-none transition-shadow hover:shadow-[0_0_32px_-6px_rgba(139,92,246,0.7)] focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {/* Sheen sweep on hover */}
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative flex items-center justify-center gap-2">
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </motion.button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-white/10" />
              or continue with
              <span className="h-px flex-1 bg-white/10" />
            </div>

            {/* Social (optional / placeholder) */}
            <div className="grid grid-cols-2 gap-3">
              <SocialButton onClick={notReady} label="Google">
                <GoogleIcon />
              </SocialButton>
              <SocialButton onClick={notReady} label="Microsoft">
                <MicrosoftIcon />
              </SocialButton>
            </div>

            <p className="mt-7 text-center text-sm text-slate-300">
              Need an organization account?{' '}
              <Link to="/register" className="font-semibold text-indigo-300 transition hover:text-indigo-200">
                Register
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SocialButton({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
    >
      {children}
      {label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.8 0 5.4 1.1 7.3 2.8l5.7-5.7C33.6 6.1 29.1 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.9 26.7 36 24 36c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C39.9 35.9 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}
