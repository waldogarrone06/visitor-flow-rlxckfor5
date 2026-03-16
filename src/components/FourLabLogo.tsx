export function FourLabLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 250 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="FourLab Nutrition Logo"
    >
      <text
        x="0"
        y="45"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="44"
        fill="currentColor"
        letterSpacing="-0.02em"
      >
        FourLab
      </text>
      <text
        x="2"
        y="68"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="400"
        fontSize="16"
        fill="currentColor"
        letterSpacing="0.45em"
      >
        nutrition
      </text>
      <g transform="translate(180, 25)">
        <rect x="0" y="-8" width="32" height="10" rx="5" fill="#FFB800" transform="rotate(-45)" />
        <rect x="12" y="4" width="32" height="10" rx="5" fill="#E10050" transform="rotate(-45)" />
      </g>
    </svg>
  )
}
