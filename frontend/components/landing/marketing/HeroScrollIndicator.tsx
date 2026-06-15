'use client';

export function HeroScrollIndicator() {
  const scrollDown = () => {
    document.getElementById('intro')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className="m-scroll-indicator"
      onClick={scrollDown}
      aria-label="Nach unten scrollen"
    >
      <span className="m-scroll-indicator-pill">
        <span className="m-scroll-indicator-chevron" />
      </span>
    </button>
  );
}
