import type { GalleryItem } from "./types";

/**
 * Placeholder gallery shown until the store uploads its own photos from
 * /admin/grooming/gallery. These are the site's existing stock pet photos
 * (Unsplash License, see README credits), every one marked `isSample`: the page
 * labels them "Sample photo" and gives them no pet names, so they are never
 * presented as real grooming customers.
 */
export const SAMPLE_GALLERY: GalleryItem[] = [
  { id: "sample-2", src: "/assets/pets/dog2.avif", alt: "A black pug in a denim jacket", isSample: true, active: true, order: 2 },
  { id: "sample-3", src: "/assets/about/happy-dogs.avif", alt: "A happy dog with a brown and white coat on a beach", isSample: true, active: true, order: 3 },
  { id: "sample-4", src: "/assets/hero/dog-left-blue.avif", alt: "A dachshund puppy peeking over a blue ledge", isSample: true, active: true, order: 4 },
  { id: "sample-5", src: "/assets/hero/dog-right-blue.avif", alt: "A ginger cat peeking over a blue ledge", isSample: true, active: true, order: 5 },
];
