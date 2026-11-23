import type { SizeBand, Species } from "./types";

/*
 * A curated list of breeds people commonly bring in India. It does not cover
 * every breed: "Mixed Breed / Indie" and "Other / Not listed" are always there.
 * typicalSize and coat are hints for the form only: the pet's weight decides
 * the price band, and the groomer confirms coat on the call.
 */

export type Coat = "short" | "medium" | "long" | "double" | "wire" | "curly";

export interface Breed {
  id: string;
  name: string;
  species: Species;
  aliases: string[];
  origin: "indian" | "international";
  /** Lower = shown higher in the "popular" list. */
  popularRank?: number;
  typicalSize?: SizeBand | "varies";
  coat?: Coat;
}

export const OTHER_BREED_ID = "other";
export const MIXED_DOG_ID = "mixed-breed";
export const MIXED_CAT_ID = "cat-indie";

type Row = [id: string, name: string, origin: Breed["origin"], size: Breed["typicalSize"], coat: Coat | undefined, aliases?: string[], rank?: number];

const DOGS: Row[] = [
  // Popular in India: pinned at the top, in this order.
  ["labrador", "Labrador Retriever", "international", "large", "short", ["lab", "labra", "labrador"], 1],
  ["golden-retriever", "Golden Retriever", "international", "large", "double", ["golden", "goldie"], 2],
  ["german-shepherd", "German Shepherd", "international", "large", "double", ["gsd", "alsatian", "german shepherd dog"], 3],
  ["shih-tzu", "Shih Tzu", "international", "small", "long", ["shihtzu", "shitzu", "shih tsu"], 4],
  ["pomeranian", "Pomeranian", "international", "small", "double", ["pom", "pomm"], 5],
  ["beagle", "Beagle", "international", "medium", "short", [], 6],
  ["pug", "Pug", "international", "small", "short", [], 7],
  ["french-bulldog", "French Bulldog", "international", "small", "short", ["frenchie"], 8],
  ["rottweiler", "Rottweiler", "international", "large", "short", ["rottie", "rott"], 9],
  ["siberian-husky", "Siberian Husky", "international", "medium", "double", ["husky"], 10],
  ["dachshund", "Dachshund", "international", "small", "short", ["sausage dog", "doxie", "wiener"], 11],
  ["cocker-spaniel", "Cocker Spaniel", "international", "medium", "long", ["cocker", "english cocker"], 12],
  ["indian-pariah", "Indian Pariah / Indie", "indian", "medium", "short", ["indie", "desi", "pariah", "inod", "street dog", "community dog"], 13],
  ["lhasa-apso", "Lhasa Apso", "international", "small", "long", ["lhasa"], 14],
  ["doberman", "Doberman", "international", "large", "short", ["dobermann", "dobie", "doberman pinscher"], 15],
  ["boxer", "Boxer", "international", "large", "short", [], 16],
  ["great-dane", "Great Dane", "international", "giant", "short", ["dane"], 17],
  ["saint-bernard", "Saint Bernard", "international", "giant", "double", ["st bernard", "st. bernard"], 18],
  ["chihuahua", "Chihuahua", "international", "small", "short", [], 19],
  ["rajapalayam", "Rajapalayam", "indian", "large", "short", ["poligar hound"], 20],
  ["mudhol-hound", "Mudhol Hound", "indian", "large", "short", ["mudhol", "caravan hound"], 21],
  ["kombai", "Kombai", "indian", "medium", "short", [], 22],
  ["chippiparai", "Chippiparai", "indian", "medium", "short", [], 23],
  [MIXED_DOG_ID, "Mixed Breed", "international", "varies", undefined, ["mixed", "cross", "crossbreed", "mongrel", "mix"], 24],
  // Indian breeds
  ["indian-spitz", "Indian Spitz", "indian", "small", "double", ["spitz"]],
  ["rampur-hound", "Rampur Hound", "indian", "large", "short", ["rampur greyhound"]],
  ["kanni", "Kanni", "indian", "medium", "short", []],
  ["gaddi-kutta", "Gaddi Kutta", "indian", "large", "double", ["gaddi", "himalayan mastiff"]],
  ["bakharwal", "Bakharwal Dog", "indian", "large", "double", ["kashmiri sheepdog"]],
  ["bully-kutta", "Bully Kutta", "indian", "giant", "short", ["indian mastiff", "pakistani mastiff"]],
  ["himalayan-sheepdog", "Himalayan Sheepdog", "indian", "large", "double", ["bhotia"]],
  ["jonangi", "Jonangi", "indian", "medium", "short", []],
  ["pandikona", "Pandikona", "indian", "medium", "short", []],
  // International breeds
  ["maltese", "Maltese", "international", "small", "long", []],
  ["poodle-toy", "Poodle (Toy)", "international", "small", "curly", ["toy poodle"]],
  ["poodle-miniature", "Poodle (Miniature)", "international", "small", "curly", ["mini poodle", "miniature poodle"]],
  ["poodle-standard", "Poodle (Standard)", "international", "medium", "curly", ["standard poodle"]],
  ["yorkshire-terrier", "Yorkshire Terrier", "international", "small", "long", ["yorkie"]],
  ["bichon-frise", "Bichon Frise", "international", "small", "curly", ["bichon"]],
  ["cavalier-kcs", "Cavalier King Charles Spaniel", "international", "small", "long", ["cavalier", "king charles"]],
  ["border-collie", "Border Collie", "international", "medium", "double", ["collie"]],
  ["samoyed", "Samoyed", "international", "medium", "double", ["sammy"]],
  ["alaskan-malamute", "Alaskan Malamute", "international", "large", "double", ["malamute"]],
  ["chow-chow", "Chow Chow", "international", "medium", "double", ["chow"]],
  ["akita", "Akita", "international", "large", "double", ["akita inu"]],
  ["shiba-inu", "Shiba Inu", "international", "small", "double", ["shiba"]],
  ["corgi", "Corgi", "international", "small", "double", ["pembroke welsh corgi", "welsh corgi"]],
  ["english-bulldog", "English Bulldog", "international", "medium", "short", ["bulldog", "british bulldog"]],
  ["dalmatian", "Dalmatian", "international", "large", "short", []],
  ["bernese-mountain-dog", "Bernese Mountain Dog", "international", "large", "double", ["bernese", "berner"]],
  ["miniature-schnauzer", "Miniature Schnauzer", "international", "small", "wire", ["schnauzer"]],
  ["jack-russell", "Jack Russell Terrier", "international", "small", "short", ["jack russell", "jrt"]],
  ["havanese", "Havanese", "international", "small", "long", []],
  ["boston-terrier", "Boston Terrier", "international", "small", "short", []],
  ["pekingese", "Pekingese", "international", "small", "long", ["peke"]],
  ["japanese-spitz", "Japanese Spitz", "international", "small", "double", []],
  ["belgian-malinois", "Belgian Malinois", "international", "large", "short", ["malinois", "mal"]],
  ["american-bully", "American Bully", "international", "large", "short", ["bully", "pitbull", "pit bull"]],
  ["cane-corso", "Cane Corso", "international", "giant", "short", ["corso"]],
  ["tibetan-mastiff", "Tibetan Mastiff", "international", "giant", "double", []],
  ["old-english-sheepdog", "Old English Sheepdog", "international", "large", "long", ["oes", "bobtail"]],
  ["afghan-hound", "Afghan Hound", "international", "large", "long", ["afghan"]],
  ["bull-terrier", "Bull Terrier", "international", "medium", "short", []],
  ["labradoodle", "Labradoodle", "international", "medium", "curly", ["doodle"]],
  ["goldendoodle", "Goldendoodle", "international", "medium", "curly", ["golden doodle", "doodle"]],
  ["maltipoo", "Maltipoo", "international", "small", "curly", []],
];

const CATS: Row[] = [
  [MIXED_CAT_ID, "Indian / Indie Cat (Domestic Shorthair)", "indian", undefined, "short", ["indie", "desi", "domestic shorthair", "dsh", "mixed", "billi"], 1],
  ["persian", "Persian", "international", undefined, "long", ["persian cat"], 2],
  ["domestic-longhair", "Domestic Longhair", "international", undefined, "long", ["dlh", "longhair"], 3],
  ["himalayan", "Himalayan", "international", undefined, "long", ["himmy"], 4],
  ["siamese", "Siamese", "international", undefined, "short", [], 5],
  ["maine-coon", "Maine Coon", "international", undefined, "long", ["coon"], 6],
  ["british-shorthair", "British Shorthair", "international", undefined, "short", ["bsh"]],
  ["ragdoll", "Ragdoll", "international", undefined, "long", []],
  ["bengal", "Bengal", "international", undefined, "short", []],
  ["exotic-shorthair", "Exotic Shorthair", "international", undefined, "short", ["exotic"]],
  ["scottish-fold", "Scottish Fold", "international", undefined, "short", []],
  ["sphynx", "Sphynx", "international", undefined, "short", ["hairless"]],
  ["russian-blue", "Russian Blue", "international", undefined, "short", []],
  ["bombay", "Bombay", "international", undefined, "short", []],
  ["turkish-angora", "Turkish Angora", "international", undefined, "long", ["angora"]],
];

const toBreed = (species: Species) => ([id, name, origin, typicalSize, coat, aliases = [], popularRank]: Row): Breed => ({
  id,
  name,
  species,
  origin,
  aliases,
  ...(typicalSize ? { typicalSize } : {}),
  ...(coat ? { coat } : {}),
  ...(popularRank ? { popularRank } : {}),
});

export const BREEDS: readonly Breed[] = [...DOGS.map(toBreed("dog")), ...CATS.map(toBreed("cat"))];

export const OTHER_BREED = (species: Species): Breed => ({ id: OTHER_BREED_ID, name: "Other / Not listed", species, origin: "international", aliases: ["other", "not listed", "unknown"] });

const byKey = new Map(BREEDS.map((b) => [`${b.species}:${b.id}`, b]));

export function findBreed(species: Species, id: string): Breed | undefined {
  return id === OTHER_BREED_ID ? OTHER_BREED(species) : byKey.get(`${species}:${id}`);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Popular breeds first (in rank order), then A–Z. Other / Not listed last. */
export function browseBreeds(species: Species): { popular: Breed[]; all: Breed[] } {
  const list = BREEDS.filter((b) => b.species === species);
  const popular = list.filter((b) => b.popularRank).sort((a, b) => a.popularRank! - b.popularRank!);
  const all = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return { popular, all: [...all, OTHER_BREED(species)] };
}

/**
 * Search by name or alias ("gsd" → German Shepherd, "desi" → Indie).
 * Ranked: exact > name starts with > a word starts with > alias match > contains.
 * "Other / Not listed" is always offered last.
 */
export function searchBreeds(species: Species, query: string, limit = 12): Breed[] {
  const q = normalize(query);
  const list = BREEDS.filter((b) => b.species === species);
  if (!q) return [...browseBreeds(species).popular, OTHER_BREED(species)];
  const scored: { breed: Breed; score: number }[] = [];
  for (const breed of list) {
    const name = normalize(breed.name);
    const aliases = breed.aliases.map(normalize);
    let score = 0;
    if (name === q || aliases.includes(q)) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.split(" ").some((w) => w.startsWith(q))) score = 60;
    else if (aliases.some((a) => a.startsWith(q))) score = 50;
    else if (name.includes(q) || aliases.some((a) => a.includes(q))) score = 30;
    if (score) scored.push({ breed, score: score + (breed.popularRank ? 5 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.breed.name.localeCompare(b.breed.name));
  return [...scored.slice(0, limit).map((s) => s.breed), OTHER_BREED(species)];
}
