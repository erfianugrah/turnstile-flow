import * as React from 'react';
import { cn } from '../../lib/utils';
import { countries, type Country } from './countries';
import { Input } from '../ui/input';

interface CountrySelectProps {
  value: string; // ISO code
  onChange: (code: string, dialCode: string) => void;
  disabled?: boolean;
}

export function CountrySelect({ value, onChange, disabled }: CountrySelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const selectedCountry = countries.find(c => c.code === value) || countries[0];

  // Filter countries based on search
  const filteredCountries = search
    ? countries.filter(
        c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial.includes(search) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      )
    : countries;

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleSelect = (country: Country) => {
    onChange(country.code, country.dial);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="relative">
      {/* Country selector button */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-11 items-center gap-1.5 rounded-l-md border border-r-0 border-input bg-background px-3 text-sm transition-colors',
          'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isOpen && 'ring-2 ring-ring'
        )}
      >
        <span className={`fi fi-${selectedCountry.code.toLowerCase()} text-xl`}></span>
        <span className="font-medium">{selectedCountry.dial}</span>
        <svg
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute left-0 top-full z-50 mt-1 w-80 rounded-md border-2',
            'bg-white dark:bg-[hsl(0,0%,15%)] text-card-foreground',
            'border-border dark:border-[hsl(0,0%,30%)]',
            'shadow-xl dark:shadow-[0_20px_40px_rgba(0,0,0,0.6)]'
          )}
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="p-2 border-b">
            <Input
              type="text"
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>

          {/* Country list */}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filteredCountries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No countries found
              </div>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:bg-accent focus:text-accent-foreground focus:outline-none',
                    country.code === value && 'bg-accent text-accent-foreground font-medium'
                  )}
                >
                  <span className={`fi fi-${country.code.toLowerCase()} text-xl`}></span>
                  <span className="flex-1">{country.name}</span>
                  <span className="text-muted-foreground">{country.dial}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
