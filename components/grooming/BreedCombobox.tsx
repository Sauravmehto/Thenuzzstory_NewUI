"use client";

import { useId, useMemo, useRef, useState } from "react";
import { browseBreeds, findBreed, searchBreeds, type Breed } from "@/lib/grooming/breeds";
import type { Species } from "@/lib/grooming/types";

/**
 * Searchable breed picker (ARIA combobox + listbox, no library).
 * Empty box: popular breeds first. Typing matches names and aliases
 * ("gsd", "desi", "lab"). "Other / Not listed" is always the last option.
 */
export default function BreedCombobox({
  species,
  value,
  onChange,
  error,
  inputId,
}: {
  species: Species;
  value: string;
  onChange: (breed: Breed) => void;
  error?: string;
  inputId: string;
}) {
  const listId = useId();
  const selected = value ? findBreed(species, value) : undefined;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const showingSelected = selected && query === selected.name;
  const results = useMemo(() => {
    if (!query.trim() || showingSelected) {
      const { popular, all } = browseBreeds(species);
      const rest = all.filter((b) => !popular.includes(b));
      return [...popular, ...rest];
    }
    return searchBreeds(species, query);
  }, [query, species, showingSelected]);
  const popularCount = !query.trim() || showingSelected ? browseBreeds(species).popular.length : 0;

  const choose = (b: Breed) => {
    onChange(b);
    setQuery(b.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, open ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const pick = results[active];
      if (pick) choose(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="gr-combo" data-open={open || undefined}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? optionId(active) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
        autoComplete="off"
        spellCheck={false}
        placeholder="Start typing, e.g. Shih Tzu"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <span className="gr-combo__chevron" aria-hidden="true" />
      {open && (
        <ul id={listId} role="listbox" className="gr-combo__list" aria-label="Breeds">
          {results.map((b, i) => (
            <li
              key={`${b.id}-${i}`}
              id={optionId(i)}
              role="option"
              aria-selected={b.id === value}
              data-active={i === active || undefined}
              data-group-start={(popularCount > 0 && (i === 0 || i === popularCount)) || undefined}
              data-group-label={popularCount > 0 ? (i === 0 ? "Popular" : i === popularCount ? "All breeds A–Z" : undefined) : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(b)}
            >
              <span>{b.name}</span>
              {b.origin === "indian" && b.id !== "other" && <span className="gr-combo__tag">Indian</span>}
            </li>
          ))}
        </ul>
      )}
      <p id={`${inputId}-hint`} className="gr-hint">
        Our list covers common breeds, not every breed. Can&apos;t find yours? Pick “Other / Not listed”.
      </p>
    </div>
  );
}
