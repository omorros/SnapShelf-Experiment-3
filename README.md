# SnapShelf — Experiment 3: Artefact Integration

> Demonstrating the best recognition pipeline from Experiment 2 inside a production-quality mobile application.

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.129-009688.svg)
![React Native](https://img.shields.io/badge/React_Native-0.81.5-61DAFB.svg)
![Expo](https://img.shields.io/badge/Expo_SDK-54-000020.svg)
![GPT-5.2](https://img.shields.io/badge/OpenAI-GPT--5.2-412991.svg)
![Tests](https://img.shields.io/badge/tests-48_passed-brightgreen.svg)

---

## Context

This repository is **Experiment 3** of a three-part dissertation evaluating photo-to-inventory recognition pipelines for 14 produce classes.

| Experiment | Objective | Outcome |
|---|---|---|
| **1 — Classification Benchmark** | Train and compare three CNNs (Custom, EfficientNet-B0, ResNet-50) on the same crop dataset | Best classifier selected with accuracy, macro-F1, and confusion matrix analysis |
| **2 — Pipeline Comparison** | Compare three end-to-end pipelines (LLM-only, YOLO, YOLO+CNN) on identical test set and metrics | Best pipeline selected by item precision, recall, F1, per-class F1, and latency |
| **3 — Artefact Integration** *(this repo)* | Integrate the winning pipeline into a working mobile app and evaluate in a real-world workflow | Recognition time, user correction rate, and full system architecture documented |

---

## What This Experiment Demonstrates

1. **Recognition engine interface** — a pluggable, modular service layer that decouples the recognition model from the rest of the application, enabling future pipeline swaps without code changes to the API or mobile client.
2. **Best pipeline integration** — the GPT-5.2 Vision model (Pipeline A: LLM-only, the winner from Experiment 2) is deployed as the recognition engine.
3. **Full app workflow** — the user takes a photo, the AI suggests detected items with quantities and categories, the user reviews and confirms or edits each item, and confirmed items are saved to their personal inventory with predicted expiry dates.
4. **Measurable outcomes** — recognition latency, user correction rate, and architectural transparency are reported, providing quantitative evidence for the dissertation evaluation.

---

## System Architecture

```
+-------------------+         HTTPS/REST (JWT)         +-------------------+
|                   | ----------------------------------> |                   |
|   Mobile Client   |                                    |  FastAPI Backend  |
|   React Native    | <---------------------------------- |  Python 3.10+    |
|   Expo SDK 54     |          JSON responses            |                   |
+-------------------+                                    +--------+----------+
                                                                  |
                                                    +-------------+-------------+
                                                    |                           |
                                            +-------v--------+       +---------v---------+
                                            |   PostgreSQL    |       |   OpenAI API      |
                                            |   Database      |       |   GPT-5.2 Vision  |
                                            +----------------+       +-------------------+
```

### Core Design Principle: AI as Assistant, Not Authority

All AI outputs are treated as **suggestions**, never as trusted data. This is enforced architecturally through a two-tier data model:

| Tier | Model | Trust Level | Fields | Lifecycle |
|---|---|---|---|---|
| **Draft** | `DraftItem` | Untrusted | All nullable, includes `confidence_score` and `source` | Created by AI or manual entry; user reviews |
| **Inventory** | `InventoryItem` | Trusted | All required, user-confirmed values | Created only via explicit draft confirmation |

This separation ensures the system never persists AI-generated data without human validation — a deliberate design decision that prioritises data integrity over automation convenience.

### Recognition Pipeline (Data Flow)

```
  Photo (camera/gallery)
        |
        v
  [GPT-5.2 Vision API]
    - Encodes image to base64
    - Sends structured prompt requesting JSON output
    - Returns: {name, category, quantity, unit, quantity_confidence}
        |
        v
  [Category Normalisation]
    - Maps GPT output categories to internal taxonomy
    - 15 supported categories (Fruits, Vegetables, Dairy, Meat, Fish, etc.)
        |
        v
  [Unit Normalisation]
    - Validates against accepted units: Pieces, Grams, Kilograms, Milliliters, Liters
    - Maps abbreviations (g -> Grams, ml -> Milliliters, etc.)
        |
        v
  [Expiry Prediction Service]
    - Rule-based lookup: (category, storage_location) -> (shelf_life_days, confidence)
    - 40+ rules covering all category-storage combinations
    - Graceful fallback chain: exact match -> storage-only -> absolute default
    - Deterministic: same inputs always produce same outputs
        |
        v
  [DraftItems created]
    - One DraftItem per detected food item
    - Includes: predicted expiry, detection confidence, quantity estimate
    - Notes field records provenance: "[Image detection - GPT-5.2]"
        |
        v
  [User Review Screen]
    - User can confirm, edit, or skip each item
    - Must set expiry date before confirming
    - "Add All" for batch confirmation
        |
        v
  [InventoryItems persisted]
    - Confirmed items stored with all required fields
    - Sorted by expiry date for at-a-glance waste tracking
```

---

## Project Structure

```
SnapShelf-Experiment-3/
├── app/                                  # FastAPI backend (Python)
│   ├── core/
│   │   ├── config.py                     # Environment variable loading
│   │   ├── database.py                   # PostgreSQL connection + SQLAlchemy setup
│   │   └── security.py                   # JWT auth (HS256) + bcrypt password hashing
│   ├── models/
│   │   ├── user.py                       # User model (UUID pk, email, hashed_password)
│   │   ├── draft_item.py                 # Untrusted AI-generated item (nullable fields)
│   │   └── inventory_item.py             # Trusted user-confirmed item (all required)
│   ├── schemas/
│   │   ├── auth.py                       # UserRegister, UserLogin, Token, UserResponse
│   │   ├── draft_item.py                 # DraftItemCreate, DraftItemUpdate, DraftItemResponse
│   │   └── inventory_item.py             # InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse
│   ├── routers/
│   │   ├── auth.py                       # POST /register, /login, GET /me
│   │   ├── draft_items.py                # CRUD + POST /{id}/confirm (draft -> inventory)
│   │   ├── inventory_items.py            # CRUD + PATCH /{id}/quantity
│   │   └── ingestion.py                  # POST /ingest/image (GPT-5.2 Vision pipeline)
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── gpt4o_vision.py           # GPT-5.2 Vision API client (base64, prompt, JSON parse)
│   │   │   └── image_ingestion.py        # Orchestrator: detect -> normalise -> predict -> result
│   │   └── expiry_prediction/
│   │       ├── __init__.py               # Service singleton export
│   │       ├── service.py                # ExpiryPredictionService (multi-strategy orchestrator)
│   │       └── strategies/
│   │           ├── base.py               # Abstract strategy interface + ExpiryPrediction dataclass
│   │           └── rule_based.py         # Lookup-table strategy (40+ category-storage rules)
│   └── main.py                           # FastAPI app entry point, router registration
│
├── mobile/                               # React Native + Expo (TypeScript)
│   ├── app/
│   │   ├── _layout.tsx                   # Root layout with AuthProvider
│   │   ├── index.tsx                     # Entry redirect
│   │   ├── (auth)/
│   │   │   ├── _layout.tsx              # Auth stack navigator
│   │   │   ├── login.tsx                # Login screen
│   │   │   └── register.tsx             # Registration with password strength indicator
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx              # Bottom tab bar (Inventory + Settings)
│   │   │   ├── inventory.tsx            # Main inventory screen (search, filter, swipe actions)
│   │   │   └── settings.tsx             # Account info, preferences, logout
│   │   ├── add-item.tsx                 # Scan image or manual entry modal
│   │   └── edit-item.tsx                # Edit/consume item bottom sheet
│   ├── components/
│   │   ├── ui/                          # Design system primitives
│   │   │   ├── Button.tsx               # 5 variants, 3 sizes, icon support, loading state
│   │   │   ├── Card.tsx                 # Elevated/outlined container
│   │   │   ├── Input.tsx                # Labeled text input with error states
│   │   │   ├── Screen.tsx               # SafeAreaView wrapper
│   │   │   ├── Badge.tsx                # Status pill (expiry indicators)
│   │   │   ├── Typography.tsx           # 8 text variants (display, heading, body, caption)
│   │   │   └── BottomSheet.tsx          # Animated draggable bottom sheet
│   │   ├── add-item/
│   │   │   ├── DetectedList.tsx         # AI detection results with confirm/edit/skip per item
│   │   │   ├── ManualForm.tsx           # Manual entry form with calendar picker
│   │   │   └── EditItemModal.tsx        # Edit detected item before confirming
│   │   └── inventory/
│   │       ├── InventoryItemCard.tsx     # Swipeable card (left=edit, right=delete)
│   │       ├── InventoryHeader.tsx       # Status summary pills (expired, expiring, total)
│   │       └── InventoryFilters.tsx      # Search bar + category/status/sort filters
│   ├── services/
│   │   ├── api.ts                       # REST client with JWT Bearer auth
│   │   └── auth.tsx                     # AuthContext + SecureStore token management
│   ├── theme/
│   │   └── index.ts                     # Colour palette, typography, spacing, shadows
│   ├── types/
│   │   └── index.ts                     # TypeScript interfaces for all API types
│   └── utils/
│       ├── unitConversion.ts            # Base unit conversion (g<->kg, ml<->L)
│       └── inventoryMerge.ts            # Merge items by name + expiry + unit group
│
├── tests/                                # Backend test suite (pytest)
│   ├── conftest.py                       # SQLite test DB, TestClient, auth fixtures
│   ├── test_api.py                       # Integration tests: auth flow, draft->inventory, ingestion
│   ├── test_image_ingestion.py           # GPT-5.2 client, category/unit normalisation, pipeline
│   └── test_expiry_prediction.py         # Rule-based strategy, determinism, service orchestrator
│
├── requirements.txt                      # Python dependencies
└── .env                                  # Environment variables (not committed)
```

---

## API Reference

All endpoints except `/auth/register`, `/auth/login`, and `/health` require a valid JWT in the `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/auth/register` | Create account, returns JWT | No |
| `POST` | `/auth/login` | Authenticate, returns JWT | No |
| `GET` | `/auth/me` | Current user profile | Yes |

### Image Ingestion (Recognition Pipeline)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/ingest/image` | Upload photo -> GPT-5.2 analysis -> DraftItems created | Yes |

**Request:** `multipart/form-data` with `image` (file) and `storage_location` (string, default: `"fridge"`).
**Response:** Array of `DraftItem` objects, one per detected food item.

### Draft Items (AI Suggestions)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/draft-items` | List all drafts for current user | Yes |
| `POST` | `/api/draft-items` | Create draft manually | Yes |
| `GET` | `/api/draft-items/{id}` | Get specific draft | Yes |
| `PATCH` | `/api/draft-items/{id}` | Update draft fields | Yes |
| `DELETE` | `/api/draft-items/{id}` | Discard draft | Yes |
| `POST` | `/api/draft-items/{id}/confirm` | Promote draft to inventory item | Yes |

### Inventory Items (Confirmed Data)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/inventory` | List all items (sorted by expiry date) | Yes |
| `GET` | `/api/inventory/{id}` | Get specific item | Yes |
| `PUT` | `/api/inventory/{id}` | Update item fields | Yes |
| `PATCH` | `/api/inventory/{id}/quantity` | Update quantity only | Yes |
| `DELETE` | `/api/inventory/{id}` | Delete item | Yes |

### Health

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Returns `{"status": "ok"}` | No |

---

## Mobile Application

### Screens and User Flows

**Authentication:**
- **Login** — Email/password form with show/hide toggle and animated logo.
- **Register** — Email, password with real-time strength indicator, confirm password with mismatch warning. Minimum 8 characters enforced.

**Inventory (main screen):**
- Status summary pills at the top (expired count, expiring soon count, total items).
- Search bar with clear button.
- Expandable filter panel: filter by category (11 options), expiry status (all / expiring / expired), and sort order (expiry date / name / category).
- Virtualised `FlatList` of inventory cards.
- Each card supports swipe gestures: left swipe to edit (sage), right swipe to delete (red).
- Pull-to-refresh.
- Floating action button to add new items.

**Add Item (modal):**
- Two entry modes: "Scan from Image" (camera or photo library) and "Add Manually".
- **Scan mode:** image is sent to `/api/ingest/image`; a loading spinner shows during processing. Results appear as a list of detected items, each with name, quantity, unit, category, and expiry date. The user can edit, skip, or confirm each item individually, or use "Add All" / "Discard All" for batch operations. Expiry date is required and highlighted in red if missing.
- **Manual mode:** product name input, category dropdown, quantity with unit selector (chip-based), and calendar widget for expiry date.

**Edit Item (bottom sheet modal):**
- Three sub-modes: Actions (edit / mark consumed / delete), Edit (all fields editable), and Consume (percentage buttons: 25%, 50%, 75%, 100%, or custom amount). If consumed quantity equals total, the item is deleted entirely.

**Settings:**
- Account section: email and member-since date.
- Preferences: default storage location (fridge / pantry / freezer / cupboard).
- App version info (1.0.0, Build 2026.01).
- Logout button.

### Design System

| Token | Value |
|---|---|
| Primary colour | Sage `#7C9A82` |
| Accent colour | Terracotta `#D4846B` |
| Background | Cream `#FAF8F5` |
| Text | Charcoal `#2D3436` |
| Display font | Georgia (iOS) / serif (Android) |
| Body font | System default (San Francisco / Roboto) |
| Button height | 52px |
| Border radius | 6–16px (component-dependent) |

Category-specific colours are assigned to all 16 food types for consistent visual identification across the app.

Expiry status badges use a four-tier colour system:
- **Expired** (red) — past expiry date
- **Expiring soon** (amber) — within 3 days
- **Caution** (yellow) — within 7 days
- **Safe** (green) — more than 7 days

### Interaction Design

- **Haptic feedback:** light impact on FAB press, warning vibration on swipe-to-delete trigger, success vibration on deletion confirmation.
- **Gestures:** swipe-to-reveal actions on inventory cards, drag-to-dismiss on bottom sheets, pull-to-refresh on inventory list.
- **Animations:** spring-based modal transitions, scale-in logo on login, opacity fades for filter panel expand/collapse.

### Client-Side Logic

- **Unit conversion:** weights are stored in grams (base), volumes in millilitres. Display uses smart formatting (e.g., 1500g displays as 1.5 kg).
- **Inventory merging:** items with the same name, expiry date, and unit group are merged into a single card showing the combined quantity. All underlying item IDs are tracked for batch update/delete operations.

---

## Expiry Prediction Engine

The prediction service uses a **Strategy pattern** to allow multiple prediction algorithms to coexist. Currently, a single rule-based strategy is implemented; the architecture supports adding ML-based strategies without modifying existing code.

### Rule-Based Strategy

Deterministic lookup tables mapping `(category, storage_location)` pairs to `(shelf_life_days, confidence)`:

| Category | Fridge | Freezer | Pantry |
|---|---|---|---|
| Dairy | 7 days (0.85) | 60 days (0.80) | 1 day (0.60) |
| Meat | 3 days (0.85) | 90 days (0.90) | 1 day (0.30) |
| Poultry | 2 days (0.85) | 90 days (0.90) | 1 day (0.30) |
| Fish | 2 days (0.80) | 60 days (0.85) | 1 day (0.20) |
| Vegetables | 7 days (0.75) | 240 days (0.80) | 5 days (0.70) |
| Fruits | 10 days (0.70) | 180 days (0.75) | 5 days (0.65) |
| Bakery | 7 days (0.75) | 90 days (0.85) | 5 days (0.80) |
| Eggs | 21 days (0.90) | 180 days (0.70) | 7 days (0.60) |
| Condiments | 90 days (0.75) | 365 days (0.70) | 180 days (0.80) |
| Canned | 730 days (0.85) | 730 days (0.70) | 730 days (0.90) |
| Frozen | 3 days (0.70) | 180 days (0.85) | 1 day (0.30) |

**Fallback chain:** if no exact `(category, storage)` match is found, the system falls back to storage-only defaults (fridge: 7d, freezer: 90d, pantry: 30d), then to an absolute default of 7 days at 0.30 confidence.

Each prediction includes a human-readable reasoning string (e.g., *"Based on category 'dairy' stored in 'fridge': typical shelf life is 7 days"*) for full transparency.

---

## Testing

The test suite validates the application's core logic across three layers:

```
pytest tests/ -v
```

| Test File | Tests | Layer | What It Covers |
|---|---|---|---|
| `test_image_ingestion.py` | 25 | Service | GPT-5.2 Vision client (image type detection, API mocking, response parsing, error handling), category normalisation (15 mappings), unit normalisation (abbreviations, case handling), full ingestion pipeline orchestration |
| `test_expiry_prediction.py` | 11 | Service | Rule-based shelf-life predictions, fallback behaviour for missing data, determinism validation (same inputs = same outputs), custom purchase dates, case-insensitive matching, multi-strategy orchestrator |
| `test_api.py` | 8 | Integration | Full HTTP auth flow (register + login), JWT rejection for unauthenticated requests, draft creation with auto-predicted expiry, draft-to-inventory promotion and draft cleanup, inventory deletion, image ingestion endpoint with mocked GPT-5.2, file type validation, health check |
| `conftest.py` | — | Fixtures | SQLite in-memory test database, FastAPI TestClient with dependency override, pre-created test user and JWT token fixtures |

**Total: 48 tests, all passing.**

Tests use SQLite for the test database (no PostgreSQL dependency required to run tests) and `unittest.mock` to isolate the GPT-5.2 API calls, ensuring tests are fast, deterministic, and free from external service dependencies.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | FastAPI + Uvicorn | Async REST API with automatic OpenAPI docs |
| ORM | SQLAlchemy 2.0 | Declarative models, session management |
| Database | PostgreSQL | Production data persistence |
| Authentication | JWT (HS256) + bcrypt | Stateless auth with secure password storage |
| Recognition model | OpenAI GPT-5.2 Vision | Image analysis and food item detection |
| Expiry prediction | Rule-based lookup tables | Deterministic, transparent shelf-life estimation |
| Mobile framework | React Native 0.81 + Expo SDK 54 | Cross-platform iOS/Android from single codebase |
| Navigation | Expo Router 6 | File-based routing with tab and modal navigation |
| Secure storage | expo-secure-store | Encrypted JWT token persistence on device |
| Camera/image | expo-camera + expo-image-picker | Photo capture and gallery selection |
| Haptics | expo-haptics | Tactile feedback for user interactions |
| UI interactions | react-native-gesture-handler | Swipe-to-reveal actions on inventory cards |
| Calendar | react-native-calendars | Expiry date selection widget |
| Testing | pytest + httpx | Unit and integration tests with SQLite test DB |

---

## Setup and Running

### Prerequisites

- Python 3.10+
- PostgreSQL (running instance with a database created)
- Node.js 18+ and npm
- OpenAI API key with GPT-5.2 access

### 1. Backend

```bash
# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file at project root:
#   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/snapshelf
#   OPENAI_API_KEY=sk-...
#   JWT_SECRET_KEY=your-random-secret-key
#   JWT_ALGORITHM=HS256
#   ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Start server (0.0.0.0 so mobile device can connect over local network)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Tables are auto-created on first startup via `Base.metadata.create_all()`.
Interactive API documentation is available at `http://localhost:8000/docs`.

### 2. Mobile

```bash
cd mobile
npm install

# Update the API base URL in mobile/services/api.ts (line 7)
# Set it to your machine's local network IP (e.g., 192.168.x.x)

npx expo start
```

Scan the QR code with Expo Go on your phone. Both devices must be on the same network.

**Finding your local IP:**
```bash
# Windows
ipconfig

# macOS/Linux
python -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()"
```

### 3. Running Tests

```bash
pytest tests/ -v
```

No PostgreSQL or OpenAI API key required for tests — they use an in-memory SQLite database and mock all external API calls.
