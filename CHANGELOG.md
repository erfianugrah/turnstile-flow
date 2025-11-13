# Changelog

All notable changes to Forminator will be documented in this file.

## [2024-11-13] - UI Fixes & SVG Flags

### Fixed
- Transparent dropdowns in analytics dashboard (MultiSelect country filter, DateRangePicker)
- Bot score range slider values misaligned (now centered side-by-side)
- GlobalControlsBar layout issues with poor responsive behavior
- View and Export dropdown menus not closing on outside click
- Dark mode submit button text visibility
- Country flag emojis not rendering in Chrome on Windows

### Changed
- Replaced emoji flags with SVG flags using flag-icons library
- GlobalControlsBar now uses responsive column/row layout (mobile-first)
- Dropdown backgrounds changed from bg-popover to bg-card for consistency
- Added click-outside event handlers to all dropdown menus
- Button component ensures child elements inherit text colors in dark mode

### Added
- flag-icons@7.5.0 package for cross-browser compatible country flags
- Click-outside handlers in GlobalControlsBar dropdowns
- React refs for dropdown menu management

## [2024-11-13] - Visual Flow & Custom Phone Input

### Added
- **Visual Submission Flow**: Real-time progress indicator showing 4 stages:
  1. Form Validation
  2. Turnstile Verification (with interactive mode detection)
  3. Server Validation (token + fraud check)
  4. Complete
  - Animated step indicators with pulsing active state
  - Error state visualization with inline messages
  - Success state with auto-reset after 3 seconds

- **All Turnstile Callbacks**: Complete callback implementation:
  - `before-interactive-callback` - Entering interactive mode
  - `after-interactive-callback` - Leaving interactive mode
  - `expired-callback` - Token expired
  - `timeout-callback` - Challenge timeout
  - `unsupported-callback` - Browser not supported
  - All callbacks integrated with visual flow

- **Custom Phone Input Library**:
  - Replaced react-international-phone (~50KB) with custom implementation (~15KB)
  - 70% bundle size reduction
  - 200+ countries with Unicode emoji flags
  - Searchable dropdown with keyboard navigation
  - Native dark mode support
  - No external dependencies or CDN issues

### Changed
- **Branding**: Renamed to "Forminator" with tagline "I'm collecting all your data"
- **Button Styling**: Added shadow for better visibility in dark mode
- **Phone Dropdown**: Fixed transparent background issue with proper card styling
- **Dark Mode**: Enhanced accent colors (221 70% 50%) and shadows across all components

### Improved
- **Documentation**: Updated all docs to reflect custom phone input
- **Type Safety**: Enhanced TypeScript types for all new components
- **Accessibility**: Full keyboard navigation in phone dropdown

### Removed
- `react-international-phone` dependency
- `frontend/src/styles/phone-input.css` (no longer needed)
- `docs/PHONE-IMPLEMENTATION-PLAN.md` (implemented, plan obsolete)

### Fixed
- Button not visible in dark mode (added shadow-sm)
- Phone dropdown transparent against container (changed to bg-card)
- Missing Turnstile callbacks implementation
- Visual flow state management edge cases

## [2024-11-12] - Dark Mode Enhancements

### Changed
- Enhanced dark mode accent colors from muted gray to vibrant blue
- Improved card backgrounds for better distinction
- Better border visibility (14.9% → 18% lightness)
- Increased destructive color visibility (30.6% → 40% lightness)

### Added
- Enhanced shadows for cards and dialogs in dark mode
- Darker backdrop overlays for better modal contrast

## [2024-11-12] - Initial Release

### Features
- Full-stack Cloudflare Turnstile integration
- Astro frontend with React components (shadcn/ui)
- Cloudflare Workers backend (Hono framework)
- D1 SQLite database with 42-field submissions table
- Comprehensive fraud detection with ephemeral IDs
- 40+ metadata fields from Cloudflare Bot Management
- Real-time analytics dashboard
- International phone input with auto-detection
- Dark mode support
- Complete documentation suite (11 docs, 180KB+)

### Security
- Single-step atomic validation (no replay window)
- SHA256 token hashing with unique constraint
- SQL injection prevention via parameterized queries
- Input sanitization (HTML stripping)
- CORS restrictions
- Content Security Policy headers
- Ephemeral ID fraud detection (7-day window)
- IP-based fraud fallback
