# replit.md

## Overview

This is a restaurant reservation management system built as a full-stack TypeScript application. The system allows restaurant staff to manage reservations, track guest information, handle seating, and monitor server assignments. The application features a sidebar navigation for accessing different management areas including reservations, guest lists, servers, and inventory.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (supports light/dark modes)
- **Build Tool**: Vite with hot module replacement

The frontend follows a component-based architecture with:
- Reusable UI components in `client/src/components/ui/`
- Page components in `client/src/pages/`
- Custom hooks in `client/src/hooks/`
- Utility functions in `client/src/lib/`

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **Runtime**: Node.js with tsx for TypeScript execution
- **API Pattern**: RESTful API with `/api` prefix for all routes
- **Development**: Vite dev server integration for HMR during development

The backend uses a clean separation:
- `server/index.ts` - Express app setup and middleware
- `server/routes.ts` - API route definitions
- `server/storage.ts` - Data access layer with pluggable storage interface
- `server/vite.ts` - Development server integration
- `server/static.ts` - Production static file serving

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` using Drizzle's schema builder
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Current Implementation**: PostgreSQL via `DatabaseStorage` class using Drizzle ORM
- **Connection**: `server/db.ts` creates a connection pool using `DATABASE_URL`

The storage layer uses an interface pattern (`IStorage`) backed by PostgreSQL for persistent data storage.

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- Database schema definitions
- TypeScript types derived from schemas
- Validation schemas (Zod)

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- **Drizzle Kit**: Database migration management (`npm run db:push`)

### UI Framework Dependencies
- **Radix UI**: Headless component primitives for accessibility
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel/slider functionality
- **React Day Picker**: Calendar component
- **cmdk**: Command palette component
- **Vaul**: Drawer component
- **Recharts**: Chart library

### Session Management
- **connect-pg-simple**: PostgreSQL session store (available but not yet configured)
- **express-session**: Session middleware

### Build & Development
- **Vite**: Frontend build tool with React plugin
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development

### Google Sheets Integration
- **googleapis**: Google Sheets API client for exporting reservation data
- Each reservation date gets its own tab (e.g., "Jan 12, 2026") — no Date column in rows since the tab name is the date
- Columns per tab: #, Name, Phone, Time, Party Size, Table, Comments, Status, Created At, ID
- **server/googleSheets.ts**: Helper module for Replit Google Sheets connector authentication and spreadsheet operations
- Auto-syncs new reservations to a "PAOLA's Reservations" Google Sheet on creation
- Manual export available via "Export to Sheets" button on reservations page
- Uses Replit connector for OAuth token management (no manual API keys needed)

### Order System
- **Order tab**: Separate section in sidebar after General, accessible at `/orders`
- **Flow**: Select table → browse menu by category → add items with quantities → complete order
- **Database tables**: `orders` (id, tableId, tableName, status, createdAt) and `order_items` (id, orderId, category, itemName, quantity)
- **Menu data**: Defined in `shared/menuData.ts` with 25+ categories and 200+ items
- **API routes**: CRUD for orders (`/api/orders`) and order items (`/api/orders/:id/items`, `/api/order-items/:id`)
- **Features**: Category sidebar navigation, search across all menu items, quantity +/- controls, order summary panel, open/closed order management

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development banner