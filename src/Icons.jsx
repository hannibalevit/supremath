// The icons of the interface, drawn as one set on a 24 x 24 grid: a 2 px line with
// square ends and sharp corners, or a flat filled form (a square, a bar, a
// triangle), like the forms of the compositions themselves. The line and the fill
// come from the CSS (`.icon`), so every icon is the same weight and takes the
// colour of its button.

function Icon({ children }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// a square and a bar: the letter i
export const AboutIcon = () => (
  <Icon>
    <rect className="fill" x="10.5" y="4" width="3" height="3.2" />
    <rect className="fill" x="10.5" y="9.5" width="3" height="10.5" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <rect className="fill" x="6" y="5" width="4" height="14" />
    <rect className="fill" x="14" y="5" width="4" height="14" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <polygon className="fill" points="7,4.5 19,12 7,19.5" />
  </Icon>
);

// four arrows gathering towards the centre
export const RestoreIcon = () => (
  <Icon>
    <path d="M3.5 3.5l6.5 6.5M10 4.5V10H4.5M20.5 3.5L14 10M14 4.5V10h5.5M3.5 20.5L10 14M10 19.5V14H4.5M20.5 20.5L14 14M14 19.5V14h5.5" />
  </Icon>
);

// two arrows chasing each other
export const RegenerateIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </Icon>
);

// an arrow leaving a square
export const ShareIcon = () => (
  <Icon>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
);

export const FacebookIcon = () => (
  <Icon>
    <path d="M16 3.5h-3A4 4 0 0 0 9 7.5V21M5.5 12.5h10" />
  </Icon>
);

// a square, a circle and a dot
export const InstagramIcon = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="17" height="17" />
    <circle cx="12" cy="12" r="4" />
    <rect className="fill" x="16.2" y="6.3" width="1.8" height="1.8" />
  </Icon>
);

export const SiteIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 2.6 3 15.4 0 18c-3-2.6-3-15.4 0-18" />
  </Icon>
);
