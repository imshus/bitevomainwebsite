// The BiteVo logo, drawn `width` CSS pixels wide: a small WebP for most screens and a larger one for very sharp
// screens. (A plain <img>: with a <picture> PNG fallback, browsers fetched both files.) `lazy` waits until
// it's on screen (e.g. the footer's, or the header's on phones, where the menu page hides the header).
export default function Logo({ width, lazy = false }) {
  return (
    <img
      {...(lazy && { loading: 'lazy' })} decoding="async" sizes={`${width}px`}
      srcSet="/assets/logo-320.webp 320w, /assets/logo-480.webp 480w" src="/assets/logo-320.webp"
      alt="BiteVo — Good Food, Better Mood" width="480" height="175"
    />
  );
}
