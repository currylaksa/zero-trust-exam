// Shared UI primitives — UTM Maroon theme

export const PageWrapper = ({ children, className = '' }) => (
  <div className={`min-h-screen bg-stone-50 flex flex-col font-sans ${className}`}>
    {children}
  </div>
);

export const PageMain = ({ children, className = '' }) => (
  <main className={`flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 ${className}`}>
    {children}
  </main>
);

export const PageHeading = ({ children, className = '' }) => (
  <h1 className={`text-2xl font-bold text-gray-900 mb-6 ${className}`}>
    {children}
  </h1>
);

export const MetricCard = ({ label, value,
  accentColor = 'border-[#7A1F2E]',
  valueColor  = 'text-[#7A1F2E]' }) => (
  <div className={`bg-white rounded-xl shadow-md p-6 border-l-4 ${accentColor}`}>
    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{label}</h3>
    <p className={`mt-2 text-3xl font-bold ${valueColor}`}>{value}</p>
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
