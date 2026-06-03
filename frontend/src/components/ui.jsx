// Shared UI primitives — UTM Maroon theme

export const PageWrapper = ({ children, className = '' }) => (
  <div className={`min-h-screen bg-stone-50 flex flex-col font-sans ${className}`}>
    {children}
  </div>
);

export const PageMain = ({ children, className = '' }) => (
  <main className={`flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-in ${className}`}>
    {children}
  </main>
);

export const PageHeading = ({ children, className = '' }) => (
  <h1 className={`text-2xl font-bold tracking-tight text-gray-900 mb-6 ${className}`}>
    {children}
  </h1>
);

// MetricCard — accentColor/valueColor props unchanged. `icon` and `hint`
// are optional and backward-compatible (existing callers omit them).
export const MetricCard = ({ label, value, icon = null, hint = null,
  accentColor = 'border-[#7A1F2E]',
  valueColor  = 'text-[#7A1F2E]' }) => (
  <div className={`lift bg-white rounded-xl shadow-md hover:shadow-lg p-6 border-l-4 ${accentColor}`}>
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{label}</h3>
        <p className={`mt-2 text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      </div>
      {icon && <div className="shrink-0 text-gray-300">{icon}</div>}
    </div>
  </div>
);

export const ErrorAlert = ({ message, className = '' }) => {
  if (!message) return null;
  return (
    <div className={`bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md ${className}`}>
      {message}
    </div>
  );
};

export const SuccessAlert = ({ message, className = '' }) => {
  if (!message) return null;
  return (
    <div className={`bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md ${className}`}>
      {message}
    </div>
  );
};

// ── Opt-in presentational primitives (Phase 1) ──

export const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-md border border-gray-100 ${className}`}>
    {children}
  </div>
);

export const Badge = ({ children, color = 'gray', className = '' }) => {
  const palette = {
    gray:   'bg-gray-100 text-gray-700 border-gray-200',
    maroon: 'bg-[#FFF1F2] text-[#7A1F2E] border-[#7A1F2E]/20',
    green:  'bg-green-100 text-green-800 border-green-200',
    amber:  'bg-amber-100 text-amber-800 border-amber-200',
    red:    'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${palette[color] || palette.gray} ${className}`}>
      {children}
    </span>
  );
};

export const EmptyState = ({ title, subtitle, className = '' }) => (
  <div className={`text-center py-12 px-6 bg-white rounded-xl border border-dashed border-gray-200 ${className}`}>
    <p className="text-gray-700 font-medium">{title}</p>
    {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
  </div>
);
