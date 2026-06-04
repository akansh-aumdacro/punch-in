import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Reusable glassmorphism input with a floating label, optional leading icon,
// show/hide toggle for passwords, and an animated inline error.
//
// `registration` is the object returned by react-hook-form's register(...).
// We compose its onChange/onBlur so we can also drive the float state.
export default function FloatingField({
  id,
  label,
  type = 'text',
  icon: Icon,
  error,
  autoComplete,
  registration,
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(false);

  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;
  const float = focused || filled;

  return (
    <div>
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            aria-hidden
            className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
              focused ? 'text-indigo-300' : 'text-slate-400'
            }`}
          />
        )}

        <input
          id={id}
          type={inputType}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...registration}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            registration?.onBlur?.(e);
          }}
          onChange={(e) => {
            setFilled(Boolean(e.target.value));
            registration?.onChange?.(e);
          }}
          className={`peer w-full rounded-xl border bg-white/5 px-4 pb-2 pt-5 text-sm text-white outline-none transition-all duration-200
            ${Icon ? 'pl-11' : ''} ${isPassword ? 'pr-11' : ''}
            placeholder-transparent
            ${
              error
                ? 'border-rose-400/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/30'
                : 'border-white/10 hover:border-white/20 focus:border-indigo-400 focus:bg-white/10 focus:ring-2 focus:ring-indigo-500/40'
            }`}
          placeholder={label}
        />

        <label
          htmlFor={id}
          className={`pointer-events-none absolute font-medium transition-all duration-200 ${
            Icon ? 'left-11' : 'left-4'
          } ${
            float
              ? 'top-2 text-[11px] ' + (error ? 'text-rose-300' : 'text-indigo-300')
              : 'top-1/2 -translate-y-1/2 text-sm text-slate-400'
          }`}
        >
          {label}
        </label>

        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="text-xs text-rose-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
