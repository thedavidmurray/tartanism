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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
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
// Footer -- storefront style
// ---------------------------------------------------------------------------

function Footer() {
  const location = useLocation();
  if (location.pathname.startsWith('/studio')) return null;

  return (
    <footer className="mt-16" style={{ boxShadow: '0 -1px 0 0 var(--border)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row sm:items-start justify-between gap-8">
        <div className="max-w-xs">
          <p className="text-lg font-serif text-[var(--text)]">Tartanism</p>
          <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed" style={{ textWrap: 'pretty' } as React.CSSProperties}>
            Authentic Scottish tartans and a design studio for weaving your own.
            Export patterns for printing, looms, or custom fabric.
          </p>
        </div>
        <div className="flex gap-12">
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Shop</p>
            <Link to="/library" className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">Library</Link>
            <Link to="/generate" className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">Design Studio</Link>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Tools</p>
            <Link to="/studio" className="block text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">Legacy Studio</Link>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6">
        <p className="text-xs text-[var(--text-tertiary)]">
          Tartanism — an Edgeless Lab project
        </p>
      </div>
    </footer>
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
        <Footer />
      </div>
    </BrowserRouter>
  );
}
