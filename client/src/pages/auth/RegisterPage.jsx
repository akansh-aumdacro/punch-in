import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { dashboardPathForRole } from '../../utils/roleRedirect';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

export default function RegisterPage() {
  const { register: registerOrg } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { timezone: 'Asia/Kolkata' },
  });

  const onSubmit = async (values) => {
    try {
      const user = await registerOrg(values);
      toast.success('Organization created');
      navigate(dashboardPathForRole(user.role), { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Registration failed';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-8">
        <h1 className="text-2xl font-bold text-slate-800">Create your organization</h1>
        <p className="mt-1 text-sm text-slate-500">
          You'll be set up as the superadmin for this organization.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <Field
            label="Organization name"
            error={errors.orgName?.message}
            input={
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                {...register('orgName', { required: 'Organization name is required', minLength: 2 })}
              />
            }
          />
          <Field
            label="Your name"
            error={errors.name?.message}
            input={
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                {...register('name', { required: 'Your name is required', minLength: 2 })}
              />
            }
          />
          <Field
            label="Work email"
            error={errors.email?.message}
            input={
              <input
                type="email"
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                {...register('email', { required: 'Email is required' })}
              />
            }
          />
          <Field
            label="Password"
            hint="Minimum 8 characters."
            error={errors.password?.message}
            input={
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'At least 8 characters' },
                })}
              />
            }
          />
          <Field
            label="Timezone"
            error={errors.timezone?.message}
            input={
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 bg-white focus:border-slate-500 focus:outline-none"
                {...register('timezone', { required: true })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            }
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 text-white py-2 rounded-md font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {isSubmitting ? 'Creating…' : 'Create organization'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-slate-900 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, error, input }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {input}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
