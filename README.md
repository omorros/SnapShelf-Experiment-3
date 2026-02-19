# SnapShelf — Experiment 3: Artefact Integration

> Demonstrating the best recognition pipeline from Experiment 2 inside a working mobile app.

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.129-009688.svg)
![React Native](https://img.shields.io/badge/React_Native-Expo_SDK_54-black.svg)

## Context

This repository is **Experiment 3** of a three-part final major project evaluating photo-to-inventory recognition pipelines for 14 fruit/vegetable classes.

| Experiment | Goal |
|---|---|
| **1 — Classification Benchmark** | Pick the best crop-classifier (Custom CNN, EfficientNet, ResNet) |
| **2 — Pipeline Comparison** | Compare LLM-only, YOLO end-to-end, and YOLO+CNN pipelines |
| **3 — Artefact Integration (this repo)** | Plug the best pipeline into a working app and measure real-world performance |

## What This Experiment Demonstrates

1. **Recognition engine interface** — pluggable service layer for the image recognition pipeline
2. **Best pipeline integration** — GPT-4o Vision (LLM-only pipeline) as the recognition engine
3. **Full app flow** — take photo → AI suggests items → user confirms/edits → saved to inventory
4. **Measured outcomes** — recognition time, correction rate, screenshots, architecture diagram

## Architecture

```mermaid
graph TD
    A[Mobile Client<br/>React Native + Expo] -->|JWT Auth + REST| B[FastAPI Backend]
    B --> C[(PostgreSQL)]
    B --> D[OpenAI API<br/>GPT-4o Vision]
```

### Core Design Principle: AI as Assistant, Not Authority

All AI outputs land as **DraftItems** (untrusted, nullable fields, confidence scores). The user must explicitly confirm before they become **InventoryItems** (trusted, all fields required). This separation is central to the system.

### Data Flow

```mermaid
flowchart LR
    A[Photo] --> B[GPT-4o Vision]
    B --> C[Detected Items<br/>+ confidence scores]
    C --> D[Draft Items<br/>user reviews]
    D --> E{User confirms<br/>or edits}
    E --> F[Inventory Items<br/>saved]
    F --> G[Rule-based<br/>expiry prediction]
```

## Project Structure

```
SnapShelf-Experiment-3/
├── app/                              # FastAPI backend
│   ├── core/
│   │   ├── config.py                 # Environment config
│   │   ├── database.py               # PostgreSQL + SQLAlchemy
│   │   └── security.py               # JWT auth + bcrypt
│   ├── models/
│   │   ├── user.py                   # User model
│   │   ├── draft_item.py             # AI-generated draft (untrusted)
│   │   └── inventory_item.py         # Confirmed item (trusted)
│   ├── schemas/                      # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py                   # Register / Login / Me
│   │   ├── draft_items.py            # CRUD + confirm draft → inventory
│   │   ├── inventory_items.py        # Inventory CRUD
│   │   └── ingestion.py              # POST /ingest/image (GPT-4o)
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── gpt4o_vision.py       # GPT-4o Vision API client
│   │   │   └── image_ingestion.py    # Orchestrator: detect + predict
│   │   └── expiry_prediction/
│   │       ├── service.py            # Prediction service
│   │       └── strategies/
│   │           ├── base.py           # Strategy interface
│   │           └── rule_based.py     # Lookup-table strategy
│   └── main.py                       # App entry point
├── mobile/                            # React Native (Expo)
│   ├── app/
│   │   ├── (auth)/                   # Login + Register screens
│   │   ├── (tabs)/                   # Inventory + Settings tabs
│   │   ├── add-item.tsx              # Scan image or manual entry
│   │   └── edit-item.tsx             # Edit inventory item
│   ├── components/                   # UI + domain components
│   ├── services/
│   │   ├── api.ts                    # REST client
│   │   └── auth.tsx                  # Auth context + JWT storage
│   ├── theme/                        # Design tokens
│   ├── types/                        # TypeScript interfaces
│   └── utils/                        # Merge + unit conversion helpers
├── tests/                             # Backend unit tests
│   ├── test_expiry_prediction.py
│   └── test_image_ingestion.py
└── requirements.txt                   # Python dependencies
```

## API Endpoints

```
POST   /auth/register              # Create account → JWT
POST   /auth/login                 # Login → JWT
GET    /auth/me                    # Current user profile

POST   /api/ingest/image           # Upload photo → GPT-4o → draft items

GET    /api/draft-items            # List drafts
POST   /api/draft-items            # Create draft manually
PATCH  /api/draft-items/{id}       # Edit draft
DELETE /api/draft-items/{id}       # Discard draft
POST   /api/draft-items/{id}/confirm   # Promote draft → inventory

GET    /api/inventory              # List inventory (sorted by expiry)
GET    /api/inventory/{id}         # Get item
PUT    /api/inventory/{id}         # Update item
PATCH  /api/inventory/{id}/quantity    # Update quantity
DELETE /api/inventory/{id}         # Delete item
```

## Setup & Running

### Prerequisites

- Python 3.10+
- PostgreSQL
- Node.js 18+ and npm
- OpenAI API key

### 1. Backend

```bash
# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file at project root with:
#   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/SnapShelf-Experiment-3
#   OPENAI_API_KEY=sk-...
#   JWT_SECRET_KEY=your-random-secret
#   JWT_ALGORITHM=HS256
#   ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Start server (0.0.0.0 so mobile device can connect over network)
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Tables are auto-created on first startup. API docs available at `http://localhost:8001/docs`.

### 2. Mobile

```bash
cd mobile
npm install

# Update API IP if needed (mobile/services/api.ts line 7)
# Set it to your machine's local IP (e.g. 192.168.x.x or hotspot IP)

npx expo start
```

Scan the QR code with Expo Go on your phone. Both devices must be on the same network.

### Finding Your IP

```bash
python -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()"
```

## Running Tests

```bash
pytest tests/ -v
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| Auth | JWT (HS256) + bcrypt |
| Recognition | OpenAI GPT-4o Vision API |
| Expiry prediction | Rule-based lookup tables |
| Mobile | React Native, Expo SDK 54, Expo Router |
| Storage | expo-secure-store (JWT tokens) |

## Acknowledgements

- OpenAI GPT-4o Vision API for image recognition
- FastAPI for the backend framework
- Expo for React Native development
