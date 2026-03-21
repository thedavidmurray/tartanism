import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <h1 className="text-5xl sm:text-6xl font-bold text-[var(--t-cream)]">
          Tartanism
        </h1>
        <p className="text-lg text-[var(--t-cream-muted)] max-w-md mx-auto leading-relaxed">
          The best plaid maker on the internet. Explore 123+ authentic tartans
          or design your own.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link
            to="/library"
            className="px-8 py-3.5 rounded-xl font-semibold text-[var(--t-charcoal)]
                       bg-[var(--t-parchment)] hover:bg-[var(--t-cream)]
                       transition-all duration-300 text-sm tracking-wide"
          >
            Browse Library
          </Link>
          <Link
            to="/studio"
            className="px-8 py-3.5 rounded-xl font-semibold
                       border border-[var(--t-wool-border)] text-[var(--t-cream)]
                       hover:bg-[var(--t-wool)] hover:border-[var(--t-wool-hover)]
                       transition-all duration-300 text-sm tracking-wide"
          >
            Design Studio
          </Link>
        </div>

        <div className="pt-8 text-xs text-[var(--t-cream-dim)] tracking-wider uppercase">
          Scottish Register conventions -- Built for plaid
        </div>
      </div>
    </div>
  );
}
