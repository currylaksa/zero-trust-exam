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

  const initial = displayName.charAt(0).toUpperCase();

  const renderNavLink = (item, variant = 'default') => {
    const key = item.key || `${item.label}-${item.to || 'action'}`;
    if (variant === 'regulations') {
      const cls = 'inline-flex items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 text-amber-800 px-3 py-1.5 text-sm font-semibold hover:bg-amber-100 transition';
      if (item.to) return <NavLink key={key} to={item.to} className={cls}>{item.label}</NavLink>;
      return <button key={key} onClick={item.onClick} className={cls}>{item.label}</button>;
    }
    // default — white text on maroon bar; active = crisp white pill
    const activeCls = 'inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-md bg-white text-[#7A1F2E] shadow-sm';
    const inactiveCls = 'inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-white/80 hover:bg-white/10 hover:text-white transition';
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
    <nav className="sticky top-0 z-40 w-full shadow-md">
      {/* ── Tier 1: light top bar ── */}
      <div className="bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <Link to={homePath} className="flex items-center gap-3 group">
            <img src="/LOGO-UTM.png" alt="UTM"
              className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-lg font-bold text-[#7A1F2E] whitespace-nowrap hidden sm:block tracking-tight">
              SecureExam <span className="font-medium text-gray-400">UTM</span>
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-semibold text-gray-800">{displayName}</div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#7A1F2E]">{roleLabel}</div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#7A1F2E] to-[#601826] text-sm font-bold text-white shadow-inner ring-1 ring-[#7A1F2E]/20">
              {initial}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tier 2: maroon nav bar with orange accent ── */}
      <div className="bg-gradient-to-r from-[#7A1F2E] to-[#601826] border-b-2 border-[#D4500A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {roleLinks.map(item => renderNavLink(item, 'default'))}
            {regLink && renderNavLink(regLink, 'regulations')}
          </div>
          <button onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md border border-white/40 text-white hover:bg-white/10 hover:border-white/60 transition">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default RoleNavbar;
