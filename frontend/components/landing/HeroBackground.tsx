'use client';

type HeroBackgroundProps = {
  variant?: 'hero' | 'banner';
};

export function HeroBackground({ variant = 'hero' }: HeroBackgroundProps) {
  const isHero = variant === 'hero';

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#002B5C] bg-cover bg-center"
      style={{ backgroundImage: "url('/hero-fleet.jpg')" }}
      aria-hidden
    >
      {isHero ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-[#002B5C]/92 via-[#002B5C]/75 to-[#002B5C]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#002B5C]/60 via-transparent to-[#002B5C]/20" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[#002B5C]/85" />
      )}
    </div>
  );
}
