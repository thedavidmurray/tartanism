import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';

// GitHub Pages SPA redirect handler - reads _p query param and redirects to the correct route
function SPARedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirectPath = params.get('_p');

  if (redirectPath) {
    // Clean up the URL by removing the _p param and navigating to the actual path
    const cleanPath = decodeURIComponent(redirectPath);
    return <Navigate to={cleanPath} replace />;
  }
  return null;
}

// Lazy load pages
const HomePage = lazy(() => import('./pages/HomePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const PatternDetail = lazy(() => import('./pages/PatternDetail'));
const GeneratePage = lazy(() => import('./pages/GeneratePage'));
const OldApp = lazy(() => import('./OldApp'));

// ---------------------------------------------------------------------------
// Navigation -- minimal top bar, premium ecommerce style
// ---------------------------------------------------------------------------

function Nav() {
  const location = useLocation();

  // Don't render nav on the legacy studio route
  if (location.pathname.startsWith('/studio')) return null;

  return (
    <nav
      className="sticky top-0 z-50 bg-[var(--bg)]/95 backdrop-blur-md"
      style={{ boxShadow: '0 1px 0 0 rgba(0,0,0,0.06)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link
          to="/library"
          className="text-lg font-serif tracking-tight text-[var(--text)]"
        >
          Tartanism
        </Link>

        <div className="flex items-center gap-6">
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/generate">Studio</NavLink>
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
      className={`text-sm ${isActive
        ? 'text-[var(--text)] font-medium'
        : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
      }`}
      style={{
        transitionProperty: 'color',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease-out',
      }}
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
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-5 h-5 rounded-full animate-spin"
        style={{
          border: '2px solid var(--border)',
          borderTopColor: 'var(--text-tertiary)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Shell
// ---------------------------------------------------------------------------

export default function AppShell() {
  return (
    <BrowserRouter basename="/tartanism/app">
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <Nav />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<><SPARedirect /><HomePage /></>} />
            <Route path="/library" element={<><SPARedirect /><LibraryPage /></>} />
            <Route path="/pattern/:id" element={<><SPARedirect /><PatternDetail /></>} />
            <Route path="/generate" element={<><SPARedirect /><GeneratePage /></>} />
            <Route path="/studio" element={<><SPARedirect /><OldApp /></>} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
