import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

// Lazy load pages to keep initial bundle lean
const HomePage = lazy(() => import('./pages/HomePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const PatternDetail = lazy(() => import('./pages/PatternDetail'));
const PatternModal = lazy(() => import('./pages/PatternModal'));
const OldApp = lazy(() => import('./OldApp'));

// ---------------------------------------------------------------------------
// Navigation bar -- only shows on new routes (hidden on /studio)
// ---------------------------------------------------------------------------

function Nav() {
  const location = useLocation();

  // Don't render nav on the studio route -- OldApp has its own nav
  if (location.pathname.startsWith('/studio')) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50
                    bg-[var(--t-charcoal)]/90 backdrop-blur-md
                    border-b border-[var(--t-wool-border)]">
      <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link
          to="/"
          className="text-sm font-bold text-[var(--t-cream)] tracking-wide"
        >
          Tartanism
        </Link>

        <div className="flex items-center gap-1">
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/studio">Studio</NavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                  ${
                    isActive
                      ? 'bg-[var(--t-wool)] text-[var(--t-cream)]'
                      : 'text-[var(--t-cream-muted)] hover:text-[var(--t-cream)] hover:bg-[var(--t-wool)]/50'
                  }`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[var(--t-parchment)]/30 border-t-[var(--t-parchment)]
                      rounded-full animate-spin" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Router outlet -- handles background-location modal pattern
// ---------------------------------------------------------------------------

function RouterOutlet() {
  const location = useLocation();
  // background is set by LibraryPage when navigating to a pattern
  const background = (location.state as { background?: Location } | null)?.background;

  // Lock body scroll when modal is open
  useEffect(() => {
    if (background) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [background]);

  return (
    <>
      {/* Primary routes -- when background exists, render the background location */}
      <Suspense fallback={<LoadingFallback />}>
        <Routes location={background || location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/pattern/:id" element={<PatternDetail />} />
          <Route path="/studio" element={<OldApp />} />
        </Routes>
      </Suspense>

      {/* Overlay modal -- only rendered when background-location is active */}
      {background && (
        <Suspense fallback={null}>
          <Routes>
            <Route path="/pattern/:id" element={<PatternModal />} />
          </Routes>
        </Suspense>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// App Shell -- the root layout with routing
// ---------------------------------------------------------------------------

export default function AppShell() {
  return (
    <BrowserRouter basename="/tartanism">
      <div className="dark min-h-screen bg-[var(--t-charcoal)] text-[var(--t-cream)]">
        <Nav />
        <RouterOutlet />
      </div>
    </BrowserRouter>
  );
}
