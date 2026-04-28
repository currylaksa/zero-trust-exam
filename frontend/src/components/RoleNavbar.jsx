import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const formatRole = (role) => {
  if (!role) return 'User';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const resolveDisplayName = (user) => {
  if (!user) return 'User';
  if (user.username) return user.username;
  if (user.email) return user.email.split('@')[0];
  return 'User';
};

const isRegulationsLink = (item) => {
  const label = (item?.label || '').toLowerCase();
  return item?.to === '/regulations' || label === 'regulations';
};

const RoleNavbar = ({ user, role, links = [], homePath = '/dashboard', onLogout }) => {
  const displayName = resolveDisplayName(user);
  const roleLabel   = formatRole(role || user?.role);
  const regIdx      = links.findIndex(isRegulationsLink);
  const regLink     = regIdx >= 0 ? links[regIdx] : null;
  const roleLinks   = links.filter((_, i) => i !== regIdx);

  const renderNavLink = (item, variant = 'default') => {
    const key = item.key || `${item.label}-${item.to || 'action'}`;
    if (variant === 'regulations') {
      const cls = 'inline-flex items-center rounded border border-amber-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-sm font-semibold hover:bg-amber-100 transition';
      if (item.to) return <NavLink key={key} to={item.to} className={cls}>{item.label}</NavLink>;
      return <button key={key} onClick={item.onClick} className={cls}>{item.label}</button>;
    }
    // default — white text on maroon bar
    const activeCls = 'inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded bg-white/20 text-white';
    const inactiveCls = 'inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded text-white/80 hover:bg-white/10 hover:text-white transition';
    if (item.to) {
      return (
        <NavLink key={key} to={item.to}
          className={({ isActive }) => isActive ? activeCls : inactiveCls}>
          {item.label}
        </NavLink>
      );
    }
    return <button key={key} onClick={item.onClick} className={inactiveCls}>{item.label}</button>;
  };

  return (
    <nav className="w-full shadow-sm">
      {/* ── Tier 1: light top bar ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
          <Link to={homePath} className="flex items-center gap-3">
            <img src="/LOGO-UTM.png" alt="UTM"
              className="h-10 w-auto object-contain"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-lg font-bold text-[#7A1F2E] whitespace-nowrap hidden sm:block">
              SecureExam UTM
            </span>
          </Link>
          <span className="text-sm text-gray-500">
            {displayName} &nbsp;<span className="text-gray-400">·</span>&nbsp;
            <span className="font-medium text-gray-700">{roleLabel}</span>
          </span>
        </div>
      </div>

      {/* ── Tier 2: maroon nav bar ── */}
      <div className="bg-[#7A1F2E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {roleLinks.map(item => renderNavLink(item, 'default'))}
            {regLink && renderNavLink(regLink, 'regulations')}
          </div>
          <button onClick={onLogout}
            className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded border border-white/40 text-white hover:bg-white/10 transition">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default RoleNavbar;
