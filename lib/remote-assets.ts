/**
 * Site images, served locally from public/assets/.
 * (They used to be hot-linked from Figma and Unsplash, which made the site
 * depend on hosts that can move, rate-limit or disappear.)
 */
export const REMOTE_ASSETS = {
  logo: "/assets/brand/nuzzstorylogo.png",
  avatar: "/assets/hero/avatar.avif",
  heroBottomLeft: "/assets/hero/dog-left-blue.avif",
  heroBottomCenter: "/assets/hero/dog-center-blue.avif",
  heroBottomRight: "/assets/hero/dog-right-blue.avif",
  aboutHero: "/assets/about/happy-dogs.avif",
  superfoodKibble: "/assets/products/superfood-kibble.avif",
  dentalChewPack: "/assets/products/dental-chew-pack.avif",
  adventureHarness: "/assets/products/adventure-harness.avif",
  pawBalmDuo: "/assets/products/paw-balm-duo.avif",
} as const;
