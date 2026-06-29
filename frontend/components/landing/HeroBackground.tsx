'use client';

type HeroBackgroundProps = {
  variant?: 'hero' | 'banner';
};

export function HeroBackground({ variant = 'hero' }: HeroBackgroundProps) {
  const isHero = variant === 'hero';

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-brand-primary bg-cover bg-center"
      style={{ backgroundImage: "url('/hero-fleet.jpg')" }}
      aria-hidden
    >
      {isHero ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-brand-primary/92 via-brand-primary/75 to-brand-primary/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-primary/60 via-transparent to-brand-primary/20" />
        </>
      ) : (
        <div className="absolute inset-0 bg-brand-primary/85" />
      )}
    </div>
  );
}
