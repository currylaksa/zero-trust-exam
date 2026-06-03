import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/**
 * LandingPage
 *
 * Public marketing entry point for SecureExam UTM (DIGITEX 2026).
 * Reachable without authentication. Routes visitors to /login, and
 * offers authenticated users a "Go to Dashboard" path (/dashboard
 * resolves the correct role dashboard).
 *
 * The hero embeds a live, simulated AI risk-scoring monitor — the same
 * concept the Isolation Forest engine runs in production — so judges see
 * the product's core innovation in motion on first sight.
 */

const DEMO_URL = 'https://youtu.be/nyrsI8Op4BY';

const STATS = [
  { value: 26, label: 'Zero-Trust controls', count: true },
  { value: 40, label: 'REST endpoints', count: true },
  { value: 'Real-time', label: 'AI risk scoring' },
  { value: 'Production', label: 'Live deployment' },
];

const FEATURES = [
  {
    title: 'Zero-Trust Architecture',
    body:
      'Never trust, always verify. Every request is authenticated, authorised and ' +
      'logged across 26 layered controls — MFA enrollment, JWT sessions, role-based ' +
      'access, and a tamper-evident audit trail.',
    highlight: false,
    icon: (
      <path d="M12 3l7 4v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V7l7-4z" />
    ),
  },
  {
    title: 'AI Behavioral Detection',
    body:
      'An Isolation Forest model scores active exam sessions in real time, flagging ' +
      'anomalous behaviour the moment it appears. No human can watch every candidate — ' +
      'so the AI watches all of them at once.',
    highlight: true,
    icon: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  },
  {
    title: 'Built & Deployed at UTM',
    body:
      'A production system, not a prototype. React 19 + Vite, Node.js/Express, MySQL 8 ' +
      'and a Python risk-scoring microservice — running live at secureexam-cqy.tech for ' +
      'the Faculty of Computing.',
    highlight: false,
    icon: (
      <>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </>
    ),
  },
];

const LAYERS = [
  {
    tag: 'Client',
    title: 'Exam Room · React 19 + Vite',
    body:
      'Lockdown exam interface and invigilator dashboards. Captures behavioral signals ' +
      'and enforces client-side integrity checks.',
  },
  {
    tag: 'Application',
    title: 'Express API · 40 REST endpoints',
    body:
      'Zero-Trust gateway: authentication, MFA, role-based authorization and the audit ' +
      'log. Every action verified, every event recorded.',
  },
  {
    tag: 'Data + AI',
    title: 'MySQL 8 · Python Risk Service',
    body:
      'Encrypted persistent store plus an Isolation Forest microservice that scores live ' +
      'sessions and streams anomaly risk back to invigilators.',
  },
];

/* ---------- Live monitor simulation ---------- */

const MONITOR_SEED = [
  { id: '0123', course: 'SECJ3553', base: 12 },
  { id: '0456', course: 'SECR2043', base: 26 },
  { id: '0789', course: 'SECJ3553', base: 9 },
  { id: '0934', course: 'SECV2113', base: 44 },
  { id: '1077', course: 'SECR2043', base: 19 },
];

const ANOMALY_REASONS = [
  'Multiple tab switches',
  'Face not detected',
  'Second face in frame',
  'Clipboard paste burst',
  'Unusual typing cadence',
  'Off-screen gaze pattern',
  'DevTools open attempt',
  'Window focus lost',
];

const riskLevel = (s) => (s >= 70 ? 'anomaly' : s >= 40 ? 'watch' : 'normal');

const RISK_META = {
  normal: {
    label: 'Normal',
    text: 'text-emerald-300',
    bar: 'bg-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  },
  watch: {
    label: 'Watching',
    text: 'text-amber-300',
    bar: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  },
  anomaly: {
    label: 'Anomaly',
    text: 'text-red-300',
    bar: 'bg-red-400',
    chip: 'bg-red-500/20 text-red-300 ring-red-400/40',
  },
};

const clockStr = () =>
  new Date().toLocaleTimeString('en-GB', { hour12: false });

const LiveMonitor = () => {
  const [rows, setRows] = useState(() =>
    MONITOR_SEED.map((s) => ({ ...s, score: s.base }))
  );
  const [events, setEvents] = useState([
    { t: clockStr(), text: 'Risk engine online · 5 sessions scored', level: 'normal' },
  ]);
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const id = setInterval(() => {
      const prev = rowsRef.current;
      const spikeIdx =
        Math.random() < 0.4 ? Math.floor(Math.random() * prev.length) : -1;
      const newEvents = [];

      const next = prev.map((r, i) => {
        let delta = (Math.random() - 0.5) * 16;
        if (i === spikeIdx) delta += 34;
        // random walk, gently pulled back toward the session's baseline
        let score = Math.round((r.score + delta) * 0.9 + r.base * 0.1);
        score = Math.max(2, Math.min(99, score));

        if (riskLevel(r.score) !== 'anomaly' && riskLevel(score) === 'anomaly') {
          const reason =
            ANOMALY_REASONS[Math.floor(Math.random() * ANOMALY_REASONS.length)];
          newEvents.push({
            t: clockStr(),
            text: `Candidate ${r.id} · ${reason}`,
            level: 'anomaly',
          });
        }
        return { ...r, score };
      });

      setRows(next);
      if (newEvents.length) {
        setEvents((e) => [...newEvents, ...e].slice(0, 4));
      }
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const flagged = rows.filter((r) => riskLevel(r.score) === 'anomaly').length;

  return (
    <div
      aria-label="Live AI risk-scoring demonstration"
      className="lp-glow relative overflow-hidden rounded-2xl bg-[#1a0509]/80 ring-1
        ring-white/10 backdrop-blur-sm shadow-2xl"
    >
      {/* scanning line */}
      <div className="lp-scan pointer-events-none absolute inset-x-0 top-0 h-24
        bg-gradient-to-b from-[#D4500A]/25 to-transparent" />

      {/* header */}
      <div className="relative flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-white">Live Session Monitor</h3>
          <p className="text-[11px] text-white/40">Isolation Forest · risk engine</p>
        </div>
        <div className="flex items-center gap-3">
          {flagged > 0 && (
            <span className="text-[11px] font-semibold text-red-300">
              {flagged} flagged
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15
            px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
            <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE
          </span>
        </div>
      </div>

      {/* rows */}
      <div className="relative px-5 py-3 divide-y divide-white/5">
        {rows.map((r) => {
          const m = RISK_META[riskLevel(r.score)];
          return (
            <div key={r.id} className="flex items-center gap-3 py-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full
                bg-white/10 ring-1 ring-white/15 text-[10px] font-semibold text-white/70">
                {r.id.slice(-2)}
              </div>
              <div className="w-20 sm:w-28 shrink-0">
                <div className="truncate text-sm text-white">Cand. {r.id}</div>
                <div className="text-[11px] text-white/40">{r.course}</div>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${m.bar} transition-all duration-700 ease-out`}
                  style={{ width: `${r.score}%` }}
                />
              </div>
              <div className={`w-7 text-right font-mono text-sm tabular-nums ${m.text}`}>
                {r.score}
              </div>
              <span
                className={`hidden sm:inline-flex w-[74px] justify-center rounded-full px-2
                  py-0.5 text-[10px] font-semibold ring-1 ${m.chip}`}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* event log */}
      <div className="relative border-t border-white/10 bg-black/20 px-5 py-3 space-y-1.5">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="font-mono text-white/30">{e.t}</span>
            <span className={e.level === 'anomaly' ? 'text-red-300' : 'text-white/50'}>
              {e.level === 'anomaly' ? '⚠ ' : '• '}
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- Animated counter ---------- */

const Counter = ({ to }) => {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !done.current) {
          done.current = true;
          const start = performance.now();
          const dur = 1400;
          const tick = (now) => {
            const p = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(eased * to));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return <span ref={ref}>{n}</span>;
};

/* ---------- Scroll reveal ---------- */

const useReveal = () => {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
};

/* ---------- Page ---------- */

const LandingPage = () => {
  const { isAuthenticated } = useAuth();
  useReveal();

  const primaryTo = isAuthenticated ? '/dashboard' : '/login';
  const primaryLabel = isAuthenticated ? 'Go to Dashboard' : 'Log In';

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ===== Nav ===== */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#2a0a10]/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src="/LOGO-UTM.png" alt="UTM logo" className="h-9 w-auto" />
            <span className="text-lg font-bold tracking-tight text-white">
              SecureExam <span className="font-normal text-white/50">UTM</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-5">
            <a
              href="#how-it-works"
              className="hidden text-sm font-medium text-white/70 transition hover:text-white sm:inline"
            >
              How it works
            </a>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium text-white/70 transition hover:text-white sm:inline"
            >
              Demo
            </a>
            <Link
              to={primaryTo}
              className="rounded-lg bg-[#D4500A] px-4 py-2 text-sm font-semibold text-white
                shadow-lg shadow-[#D4500A]/30 transition hover:bg-[#b8430a]
                focus:outline-none focus:ring-2 focus:ring-[#D4500A] focus:ring-offset-2 focus:ring-offset-[#2a0a10]"
            >
              {primaryLabel}
            </Link>
          </div>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#3d0f18] via-[#2a0a10] to-[#14040a] text-white">
        {/* animated grid + glow orbs */}
        <div className="lp-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[#7A1F2E]/40 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-96 w-96 rounded-full bg-[#D4500A]/20 blur-3xl" />
        <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full border-[34px] border-white/5" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          {/* Left: copy */}
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#D4500A]/20 px-3 py-1
              text-xs font-semibold text-orange-200 ring-1 ring-[#D4500A]/40">
              <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-[#D4500A]" />
              DIGITEX 2026 Grand Finalist
            </span>

            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Every online exam.
              <br />
              Watched by AI.
              <br />
              <span className="bg-gradient-to-r from-orange-300 to-red-400 bg-clip-text text-transparent">
                Trusted by no one.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg text-white/75">
              A Zero-Trust online examination platform with 26 security controls,
              including AI-powered behavioral anomaly detection.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                to={primaryTo}
                className="inline-flex items-center justify-center rounded-lg bg-white px-7 py-3.5
                  text-base font-semibold text-[#7A1F2E] transition hover:bg-orange-50
                  focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#2a0a10]"
              >
                {primaryLabel}
              </Link>
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-7 py-3.5
                  text-base font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/10
                  focus:outline-none focus:ring-2 focus:ring-white"
              >
                <span aria-hidden="true">▶</span>
                Watch Demo
              </a>
            </div>
          </div>

          {/* Right: live monitor */}
          <div className="lg:pl-4">
            <LiveMonitor />
          </div>
        </div>

        {/* ===== Stat strip ===== */}
        <div className="relative border-t border-white/10 bg-black/20">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-7 sm:px-6 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center sm:text-left">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-2xl font-bold text-orange-300 sm:text-3xl">
                    {s.count ? <Counter to={s.value} /> : s.value}
                  </span>
                  <span className="mt-0.5 block text-sm text-white/65">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ===== Feature cards ===== */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="reveal max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Security on every layer
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            Built on a Zero-Trust foundation and watched, end to end, by an anomaly-detection model.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              style={{ animationDelay: `${i * 90}ms` }}
              className={
                f.highlight
                  ? 'reveal lp-glow relative -translate-y-0 rounded-2xl bg-gradient-to-br from-[#7A1F2E] to-[#601826] p-7 text-white shadow-xl ring-1 ring-[#7A1F2E] md:-translate-y-3'
                  : 'reveal rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg'
              }
            >
              <div
                className={
                  f.highlight
                    ? 'mb-5 grid h-11 w-11 place-items-center rounded-xl bg-white/15'
                    : 'mb-5 grid h-11 w-11 place-items-center rounded-xl bg-[#FFF1F2]'
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={f.highlight ? '#ffffff' : '#7A1F2E'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  {f.icon}
                </svg>
              </div>
              {f.highlight && (
                <span className="mb-3 inline-block rounded-full bg-[#D4500A] px-2.5 py-0.5 text-xs font-semibold text-white">
                  Core innovation
                </span>
              )}
              <h3
                className={
                  f.highlight ? 'text-xl font-bold' : 'text-xl font-bold text-[#7A1F2E]'
                }
              >
                {f.title}
              </h3>
              <p
                className={
                  f.highlight
                    ? 'mt-3 text-sm leading-relaxed text-white/85'
                    : 'mt-3 text-sm leading-relaxed text-gray-600'
                }
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== How it works / architecture ===== */}
      <section id="how-it-works" className="border-y border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="reveal max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-3 text-lg text-gray-600">
              Three layers, one Zero-Trust pipeline — from the candidate&apos;s browser to the AI that scores them.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {LAYERS.map((l, i) => (
              <div
                key={l.tag}
                style={{ animationDelay: `${i * 90}ms` }}
                className="reveal relative rounded-2xl border border-gray-200 bg-white p-7 shadow-sm"
              >
                <span className="inline-block rounded-full bg-[#FFF1F2] px-2.5 py-0.5 text-xs font-semibold text-[#7A1F2E]">
                  {l.tag}
                </span>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{l.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{l.body}</p>
                {i < LAYERS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="lp-pulse absolute top-1/2 -right-3 hidden text-2xl text-[#D4500A] md:block"
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="reveal mt-12 text-center">
            <Link
              to={primaryTo}
              className="inline-flex items-center justify-center rounded-lg bg-[#7A1F2E] px-7 py-3.5
                text-base font-semibold text-white transition hover:bg-[#601826]
                focus:outline-none focus:ring-2 focus:ring-[#7A1F2E] focus:ring-offset-2"
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Log In to SecureExam'}
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="bg-[#14040a] text-white/80">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <img src="/LOGO-UTM.png" alt="UTM logo" className="h-9 w-auto" />
                <span className="text-lg font-bold text-white">
                  SecureExam <span className="font-normal text-white/60">UTM</span>
                </span>
              </div>
              <p className="mt-3 max-w-sm text-sm text-white/60">
                Zero-Trust online examination platform — DIGITEX 2026 Grand Finalist,
                Faculty of Computing, Universiti Teknologi Malaysia.
              </p>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-white/50">Developer:</dt>
                <dd className="text-white">Chan Qing Yee</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-white/50">Supervisor:</dt>
                <dd className="text-white">Prof. Madya Ts. Dr. Siti Hajar Binti Othman</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-white/50">Production:</dt>
                <dd className="text-white">secureexam-cqy.tech</dd>
              </div>
            </dl>
          </div>

          <div className="mt-10 border-t border-white/10 pt-6 text-xs text-white/40">
            © 2026 SecureExam UTM · DIGITEX 2026 Grand Finalist · All activities are monitored and logged.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
