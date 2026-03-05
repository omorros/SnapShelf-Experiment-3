# SnapShelf — Experiment 3: Artefact Integration

**Module:** MOD002691 · Computing Project
**Focus:** Mobile App Integration · GPT-5.2 Vision Pipeline · Full-Stack Production System
**Recognition model:** OpenAI GPT-5.2 Vision (Pipeline A winner from Experiment 2)
**Backend:** FastAPI + PostgreSQL · **Mobile:** React Native + Expo SDK 54
**Test suite:** 48 tests, all passing

---

## Overview

SnapShelf is a photo-to-inventory recognition system for produce. The end-to-end goal — detailed across three experiments — is to take a shelf photograph and automatically generate an inventory list. Experiment 3 answers the final question: **can the best pipeline from Experiment 2 be integrated into a working mobile application, and does it perform reliably in a real user workflow?**

This repository is a full-stack production system: a FastAPI backend that wraps the GPT-5.2 Vision recognition pipeline behind a REST API, and a React Native mobile client that provides the camera-to-inventory user flow. The system enforces a deliberate architectural boundary between AI-generated suggestions (untrusted) and user-confirmed inventory data (trusted), ensuring that no AI output is persisted without human validation.

Every decision in this experiment — the two-tier data model, the rule-based expiry prediction, the pluggable service architecture, and the mobile interaction design — was made deliberately and is justified here.

---

## Contents

- [Research Context](#research-context)
- [What This Experiment Demonstrates](#what-this-experiment-demonstrates)
- [System Architecture](#system-architecture)
- [Recognition Pipeline](#recognition-pipeline)
- [The Draft-to-Inventory Trust Model](#the-draft-to-inventory-trust-model)
- [Expiry Prediction Engine](#expiry-prediction-engine)
- [Mobile Application](#mobile-application)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Tech Stack](#tech-stack)
- [Setup and Running](#setup-and-running)

---

## Research Context

### Problem Statement

Experiment 1 identified the best CNN architecture for single-crop classification (EfficientNet-B0, 99.75% accuracy). Experiment 2 compared three end-to-end pipelines and selected GPT-5.2 Vision (Pipeline A: VLM-only) as the winner, with F1 = 0.8995 on clean images and a maximum F1 drop of just 0.033 under image degradation — outperforming both YOLO-14 (F1 = 0.6031) and YOLO+CNN (F1 = 0.5470).

Experiment 3 asks: **does this pipeline work in practice?** Specifically:

1. Can the GPT-5.2 Vision pipeline be wrapped behind a service interface that decouples the recognition model from the rest of the application?
2. Does the full workflow — photo capture, AI detection, user review, inventory persistence — function end-to-end on a real mobile device?
3. What is the recognition latency and user correction rate in a real-world setting?
4. Can the system architecture be documented clearly enough to support future pipeline swaps without rewriting the app?

### Experiment Thread

| Experiment | Question | Outcome |
|---|---|---|
| **1 — CNN Benchmark** | Which CNN best classifies 14 produce classes? | EfficientNet-B0 (99.75%, 40 MB, 4.07M params) |
| **2 — Pipeline Comparison** | Which end-to-end pipeline best builds an inventory from a photo? | GPT-5.2 Vision (F1 = 0.90, 10x more robust than YOLO) |
| **3 — Artefact Integration** *(this repo)* | Does the winning pipeline work in a real mobile app? | Full-stack system with measurable outcomes |

---

## What This Experiment Demonstrates

1. **Recognition engine interface** — a pluggable, modular service layer that decouples the recognition model from the rest of the application. The GPT-5.2 Vision client (`gpt4o_vision.py`) implements a clean interface that could be swapped for any alternative pipeline (YOLO, a future VLM, a local model) without changing the API routes or mobile client.
2. **Best pipeline integration** — GPT-5.2 Vision, the winner from Experiment 2, is deployed as the recognition engine. The model receives a base64-encoded image and a structured prompt constraining output to the expected categories and units.
3. **Full app workflow** — the user takes a photo (or selects from gallery), the AI suggests detected items with quantities and categories, the user reviews and confirms or edits each item, and confirmed items are saved to their personal inventory with predicted expiry dates.
4. **Measured outcomes** — recognition latency, user correction rate, and architectural transparency are reportable via the system's provenance tracking (each draft item records its source, confidence score, and prediction reasoning).

---

## System Architecture

```mermaid
graph TD
    subgraph Mobile["Mobile Client — React Native + Expo SDK 54"]
        CAM[Camera / Gallery]
        REVIEW[Draft Review Screen]
        INV[Inventory Screen]
    end

    subgraph Backend["FastAPI Backend — Python 3.10+"]
        AUTH[Auth Router<br/>JWT + bcrypt]
        ING[Ingestion Router<br/>POST /ingest/image]
        DRAFT[Draft Items Router<br/>CRUD + Confirm]
        INVR[Inventory Router<br/>CRUD]
        VIS[GPT-5.2 Vision Client<br/>gpt4o_vision.py]
        NORM[Category & Unit<br/>Normalisation]
        EXP[Expiry Prediction<br/>Rule-based Strategy]
    end

    DB[(PostgreSQL)]
    API[OpenAI API<br/>GPT-5.2 Vision]

    CAM -->|"image + JWT"| ING
    ING --> VIS
    VIS -->|"base64 + prompt"| API
    API -->|"JSON: items[]"| VIS
    VIS --> NORM
    NORM --> EXP
    EXP -->|"DraftItems"| DRAFT
    DRAFT -->|"JSON response"| REVIEW
    REVIEW -->|"POST /confirm"| DRAFT
    DRAFT -->|"InventoryItem"| INVR
    INVR -->|"JSON response"| INV
    AUTH --> DB
    DRAFT --> DB
    INVR --> DB
```

### Core Design Principle: AI as Assistant, Not Authority

All AI outputs land as **DraftItems** (untrusted, nullable fields, confidence scores). The user must explicitly confirm before they become **InventoryItems** (trusted, all fields required). This separation is central to the system and is enforced at the database level — there is no code path that bypasses user confirmation.

---

## Recognition Pipeline

```mermaid
flowchart LR
    A["Photo<br/>(camera/gallery)"] --> B["GPT-5.2 Vision API<br/>base64 + structured prompt"]
    B --> C["Raw Detection<br/>name, category,<br/>quantity, unit,<br/>confidence"]
    C --> D["Category<br/>Normalisation<br/>15 categories"]
    D --> E["Unit<br/>Normalisation<br/>5 valid units"]
    E --> F["Expiry<br/>Prediction<br/>rule-based lookup"]
    F --> G["DraftItems<br/>created in DB"]
    G --> H["User Review<br/>confirm / edit / skip"]
    H --> I["InventoryItems<br/>persisted"]
```

### Step 1: Image Encoding and API Call

The `GPT4oVisionClient` encodes the raw image bytes to base64, detects the image type from magic bytes (JPEG, PNG, GIF, WebP), and sends a single request to the GPT-5.2 Vision API with `response_format=json_object`. The prompt is frozen and explicitly lists all valid categories and units.

### Step 2: Category Normalisation

GPT-5.2's raw category output (e.g., `"Dairy"`, `"bread"`, `"MEAT"`) is normalised to the internal taxonomy used by the expiry prediction rules. The mapping handles 15 categories including edge cases (`bread` → `bakery`, `other` → `None` for fallback prediction).

### Step 3: Unit Normalisation

The five valid units (`Pieces`, `Grams`, `Kilograms`, `Milliliters`, `Liters`) are enforced. Common abbreviations (`g`, `kg`, `ml`, `l`, `pcs`) and case variations are mapped. Invalid units are set to `None` rather than silently accepted.

### Step 4: Expiry Prediction

Each detected item is passed to the `ExpiryPredictionService`, which uses a rule-based strategy to predict shelf life from the `(category, storage_location)` pair. The prediction includes a human-readable reasoning string for full transparency.

### Step 5: Draft Creation

One `DraftItem` is created per detected food item. Each draft records its provenance: `source="image"`, `confidence_score=0.75` (fixed default for GPT-5.2 detections), and a notes field containing `[Image detection - GPT-5.2]` with the prediction reasoning and quantity confidence percentage.

---

## The Draft-to-Inventory Trust Model

```mermaid
flowchart TD
    subgraph Untrusted["DraftItem — Untrusted"]
        D1[name ✓]
        D2[category — nullable]
        D3[quantity — nullable]
        D4[unit — nullable]
        D5[expiration_date — nullable]
        D6[confidence_score — 0.0–1.0]
        D7[source — 'image' / 'manual']
    end

    subgraph Trusted["InventoryItem — Trusted"]
        I1[name ✓]
        I2[category ✓]
        I3[quantity ✓]
        I4[unit ✓]
        I5[expiry_date ✓]
        I6[storage_location ✓]
    end

    Untrusted -->|"User confirms<br/>POST /confirm<br/>all fields required"| Trusted
    Untrusted -->|"User discards<br/>DELETE"| X["Deleted"]
```

| Property | DraftItem | InventoryItem |
|---|---|---|
| Trust level | Untrusted (AI-generated) | Trusted (user-confirmed) |
| Required fields | Only `name` | All fields required |
| Nullable fields | category, quantity, unit, expiry, confidence | None |
| Provenance | `source`, `confidence_score`, `notes` | None (provenance is implicit: user confirmed) |
| Lifecycle | Created by AI or manual entry → user reviews | Created only via explicit draft confirmation |
| Database table | `draft_items` | `inventory_items` |

This two-tier model ensures data integrity: the system never persists AI-generated data without human validation.

---

## Expiry Prediction Engine

The prediction service uses a **Strategy pattern** (`ExpiryPredictionStrategy` abstract base class) to allow multiple prediction algorithms. Currently, a single rule-based strategy is implemented; the architecture supports adding ML-based strategies without modifying existing code.

### Rule-Based Strategy

Deterministic lookup tables mapping `(category, storage_location)` → `(shelf_life_days, confidence)`. The strategy is designed to be transparent and reproducible — the same inputs always produce the same output, and every prediction includes a human-readable reasoning string.

```mermaid
flowchart TD
    INPUT["Input: name, category, storage_location"] --> EXACT{"Exact match?<br/>(category, storage)"}
    EXACT -->|"Yes"| R1["Use matched rule<br/>e.g. (dairy, fridge) → 7 days, 0.85"]
    EXACT -->|"No"| STORAGE{"Storage-only<br/>fallback?"}
    STORAGE -->|"Yes"| R2["Use storage default<br/>e.g. fridge → 7 days, 0.50"]
    STORAGE -->|"No"| R3["Absolute default<br/>7 days, 0.30 confidence"]
    R1 --> OUT["ExpiryPrediction<br/>expiry_date + confidence + reasoning"]
    R2 --> OUT
    R3 --> OUT
```

### Shelf-Life Rules (subset)

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

40+ rules in total, covering all category-storage combinations. Each prediction includes a reasoning string, e.g., *"Based on category 'dairy' stored in 'fridge': typical shelf life is 7 days"*.

---

## Mobile Application

### Navigation Structure

```mermaid
flowchart TD
    ROOT["App Launch"] --> CHECK{"Token in<br/>SecureStore?"}
    CHECK -->|"No"| AUTH["(auth) Stack"]
    CHECK -->|"Yes"| TABS["(tabs) Tab Bar"]

    AUTH --> LOGIN["Login Screen"]
    AUTH --> REG["Register Screen"]
    LOGIN -->|"Success"| TABS
    REG -->|"Success"| TABS

    TABS --> INVENTORY["Inventory Tab<br/>main screen"]
    TABS --> SETTINGS["Settings Tab"]

    INVENTORY -->|"FAB press"| ADD["Add Item<br/>(modal)"]
    INVENTORY -->|"Tap / swipe"| EDIT["Edit Item<br/>(bottom sheet)"]

    ADD --> SCAN["Scan from Image"]
    ADD --> MANUAL["Add Manually"]
    SCAN -->|"camera / gallery"| API_CALL["POST /ingest/image"]
    API_CALL --> DETECTED["Detected Items List<br/>confirm / edit / skip"]
    DETECTED -->|"confirm"| INVENTORY
    MANUAL -->|"submit"| INVENTORY
```

### Screens

**Login** — Email/password form with show/hide toggle and animated logo scale-in.

**Register** — Email, password with real-time strength indicator, confirm password with mismatch warning. Minimum 8 characters enforced by Pydantic schema validation.

**Inventory (main screen)** — Status summary pills at the top showing expired count, expiring-soon count, and total items. Search bar with clear button. Expandable filter panel: filter by category (11 options), expiry status (all / expiring / expired), and sort order (expiry date / name / category). Virtualised `FlatList` of inventory cards. Each card supports swipe gestures: left swipe to edit (sage), right swipe to delete (red). Pull-to-refresh. Floating action button (FAB) to add new items.

**Add Item (modal)** — Two entry modes: "Scan from Image" and "Add Manually". Scan mode sends the image to `/api/ingest/image` and shows a loading spinner during processing. Results appear as a list of detected items — each with name, quantity, unit, category, and expiry date. The user can edit, skip, or confirm each item individually, or use "Add All" / "Discard All" for batch operations. Expiry date is required and highlighted in red if missing. Manual mode provides a product name input, category dropdown, quantity with unit selector (chip-based), and calendar widget for expiry date.

**Edit Item (bottom sheet)** — Three sub-modes: Actions (edit / mark consumed / delete), Edit (all fields editable), and Consume (percentage buttons: 25%, 50%, 75%, 100%, or custom amount with remaining quantity display). If consumed quantity equals total, the item is deleted entirely.

**Settings** — Account section (email, member-since date), default storage location preference (fridge / pantry / freezer / cupboard), app version (1.0.0, Build 2026.01), and logout button.

### Design System

The "Fresh Pantry" design system uses warm, organic tones:

| Token | Value | Purpose |
|---|---|---|
| Primary | Sage `#7C9A82` | Brand colour, action buttons, focus states |
| Accent | Terracotta `#D4846B` | Warm accent, secondary actions |
| Background | Cream `#FAF8F5` | App background |
| Text | Charcoal `#2D3436` | Primary text |
| Display font | Georgia (iOS) / serif (Android) | Headings |
| Body font | System default | Body text |

Expiry status uses a four-tier colour system: **Expired** (red `#DC2626`), **Expiring soon** (amber `#F59E0B`), **Caution** (yellow `#EAB308`), **Safe** (green `#10B981`). Category-specific colours are assigned to all 16 food types for consistent visual identification.

### Interaction Design

- **Haptic feedback:** light impact on FAB press, warning vibration on swipe-to-delete trigger, success vibration on deletion confirmation.
- **Gestures:** swipe-to-reveal actions on inventory cards (react-native-gesture-handler), drag-to-dismiss on bottom sheets (PanResponder), pull-to-refresh on inventory list.
- **Animations:** spring-based modal transitions, scale-in logo on login, opacity fades for filter panel expand/collapse.

### Client-Side Logic

- **Unit conversion:** weights are stored in grams (base unit), volumes in millilitres. Display uses smart formatting (e.g., 1500 g displays as 1.5 kg). Conversion functions: `convertToBaseUnit()`, `formatQuantityWithUnit()`.
- **Inventory merging:** items with the same name, expiry date, and unit group are merged into a single card showing the combined quantity. All underlying item IDs are tracked in a `mergedIds` array for batch update/delete operations.

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
| `POST` | `/api/ingest/image` | Upload photo → GPT-5.2 → DraftItems created | Yes |

Request: `multipart/form-data` with `image` (file) and `storage_location` (string, default: `"fridge"`).
Response: Array of `DraftItem` objects, one per detected food item.

### Draft Items (AI Suggestions)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/draft-items` | List all drafts for current user | Yes |
| `POST` | `/api/draft-items` | Create draft manually | Yes |
| `GET` | `/api/draft-items/{id}` | Get specific draft | Yes |
| `PATCH` | `/api/draft-items/{id}` | Update draft fields | Yes |
| `DELETE` | `/api/draft-items/{id}` | Discard draft | Yes |
| `POST` | `/api/draft-items/{id}/confirm` | Promote draft → inventory item | Yes |

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

## Project Structure

```
SnapShelf-Experiment-3/
├── app/                                  # FastAPI backend (Python)
│   ├── core/
│   │   ├── config.py                     # Environment variable loading
│   │   ├── database.py                   # PostgreSQL connection + SQLAlchemy setup
│   │   └── security.py                   # JWT auth (HS256) + bcrypt password hashing
│   ├── models/
│   │   ├── user.py                       # User (UUID pk, email, hashed_password, is_active)
│   │   ├── draft_item.py                 # Untrusted AI-generated item (nullable fields)
│   │   └── inventory_item.py             # Trusted user-confirmed item (all fields required)
│   ├── schemas/
│   │   ├── auth.py                       # UserRegister, UserLogin, Token, UserResponse
│   │   ├── draft_item.py                 # DraftItemCreate, DraftItemUpdate, DraftItemResponse
│   │   └── inventory_item.py             # InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse
│   ├── routers/
│   │   ├── auth.py                       # POST /register, /login — GET /me
│   │   ├── draft_items.py                # CRUD + POST /{id}/confirm (draft → inventory)
│   │   ├── inventory_items.py            # CRUD + PATCH /{id}/quantity
│   │   └── ingestion.py                  # POST /ingest/image (GPT-5.2 Vision pipeline)
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── gpt4o_vision.py           # GPT-5.2 Vision API client
│   │   │   └── image_ingestion.py        # Orchestrator: detect → normalise → predict
│   │   └── expiry_prediction/
│   │       ├── __init__.py               # Service singleton export
│   │       ├── service.py                # Multi-strategy orchestrator
│   │       └── strategies/
│   │           ├── base.py               # Abstract strategy + ExpiryPrediction dataclass
│   │           └── rule_based.py         # Lookup-table strategy (40+ rules)
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
│   │   │   ├── inventory.tsx            # Main screen (search, filter, swipe actions)
│   │   │   └── settings.tsx             # Account info, preferences, logout
│   │   ├── add-item.tsx                 # Scan image or manual entry (modal)
│   │   └── edit-item.tsx                # Edit / consume item (bottom sheet)
│   ├── components/
│   │   ├── ui/                          # Design system: Button, Card, Input, Screen,
│   │   │                                #   Badge, Typography, BottomSheet
│   │   ├── add-item/                    # DetectedList, ManualForm, EditItemModal
│   │   └── inventory/                   # InventoryItemCard, InventoryHeader, InventoryFilters
│   ├── services/
│   │   ├── api.ts                       # REST client with JWT Bearer auth
│   │   └── auth.tsx                     # AuthContext + SecureStore token management
│   ├── theme/
│   │   └── index.ts                     # Colours, typography, spacing, shadows
│   ├── types/
│   │   └── index.ts                     # TypeScript interfaces for all API types
│   └── utils/
│       ├── unitConversion.ts            # Base unit conversion (g↔kg, ml↔L)
│       └── inventoryMerge.ts            # Merge items by name + expiry + unit group
│
├── tests/                                # Backend test suite (pytest)
│   ├── conftest.py                       # SQLite test DB, TestClient, auth fixtures
│   ├── test_api.py                       # Integration: auth, draft→inventory, ingestion
│   ├── test_image_ingestion.py           # GPT-5.2 client, normalisation, pipeline
│   └── test_expiry_prediction.py         # Rule-based strategy, determinism, orchestrator
│
├── requirements.txt                      # Python dependencies
└── .env                                  # Environment variables (not committed)
```

---

## Testing

The test suite validates the application's core logic across two layers: **service-level unit tests** (recognition pipeline and expiry prediction) and **API-level integration tests** (full HTTP request/response cycle through FastAPI's TestClient).

```bash
pytest tests/ -v
```

| Test File | Tests | Layer | What It Covers |
|---|---|---|---|
| `test_image_ingestion.py` | 25 | Service | GPT-5.2 Vision client (image type detection, API call mocking, JSON response parsing, error handling), category normalisation (15 mappings including edge cases), unit normalisation (abbreviations, case handling, invalid unit rejection), full ingestion pipeline orchestration with mocked dependencies |
| `test_expiry_prediction.py` | 11 | Service | Rule-based shelf-life predictions for multiple category-storage combinations, fallback behaviour for missing category or storage data, determinism validation (same inputs = same outputs), custom purchase date support, case-insensitive matching, multi-strategy orchestrator and best-prediction selection |
| `test_api.py` | 8 | Integration | Full auth flow (register → login → token validation), JWT rejection for unauthenticated requests across all protected routes, draft creation with auto-predicted expiry dates, draft-to-inventory promotion with draft cleanup verification, inventory item deletion, image ingestion endpoint with mocked GPT-5.2 response, file type validation (non-image rejection), health check |
| `conftest.py` | — | Fixtures | SQLite in-memory test database (no PostgreSQL required), FastAPI TestClient with database dependency override, pre-created test user with hashed password, JWT token and auth header fixtures |

**Total: 48 tests, all passing.**

Tests use SQLite in-memory for the database and `unittest.mock` to isolate GPT-5.2 API calls, ensuring the suite is fast, deterministic, and free from external service dependencies. No API key or PostgreSQL instance is required to run tests.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | FastAPI + Uvicorn | Async REST API with automatic OpenAPI documentation |
| ORM | SQLAlchemy 2.0 | Declarative models, session management, PostgreSQL dialect |
| Database | PostgreSQL | Production data persistence (users, drafts, inventory) |
| Authentication | JWT (HS256) + bcrypt via passlib | Stateless auth with secure password hashing |
| Recognition model | OpenAI GPT-5.2 Vision | Image analysis and food item detection |
| Expiry prediction | Rule-based lookup tables (Strategy pattern) | Deterministic, transparent shelf-life estimation |
| Mobile framework | React Native 0.81.5 + Expo SDK 54 | Cross-platform iOS/Android from a single TypeScript codebase |
| Navigation | Expo Router 6 | File-based routing with tab and modal navigation |
| Secure storage | expo-secure-store | Encrypted JWT token persistence on device |
| Camera / image | expo-camera + expo-image-picker | Photo capture and gallery selection |
| Haptics | expo-haptics | Tactile feedback for user interactions |
| Gestures | react-native-gesture-handler | Swipe-to-reveal actions on inventory cards |
| Calendar | react-native-calendars | Expiry date selection widget |
| Testing | pytest + httpx + unittest.mock | Unit and integration tests with SQLite test database |

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

Tables are auto-created on first startup via `Base.metadata.create_all()`. Interactive API documentation is available at `http://localhost:8000/docs`.

### 2. Mobile

```bash
cd mobile
npm install

# Update the API base URL in mobile/services/api.ts (line 7)
# Set it to your machine's local network IP (e.g., 192.168.x.x)

npx expo start
```

Scan the QR code with Expo Go on your phone. Both devices must be on the same network.

### 3. Running Tests

```bash
pytest tests/ -v
```

No PostgreSQL or OpenAI API key required — tests use an in-memory SQLite database and mock all external API calls.

---

*Part of the SnapShelf project — MOD002691 Computing Project.*
