from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.draft_item import DraftItem
from app.schemas.draft_item import DraftItemResponse
from app.services.ingestion.image_ingestion import image_ingestion_service


router = APIRouter(prefix="/ingest", tags=["ingestion"])


@router.post("/image", response_model=List[DraftItemResponse], status_code=201)
async def ingest_image(
    image: UploadFile = File(..., description="Image of fridge or groceries"),
    storage_location: str = Form("fridge", description="Where items will be stored"),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user)
):
    """
    Detect food items from image and create draft items.

    Uses GPT-4o Vision to analyze the image and identify food items.
    Creates a DraftItem for each detected item with predicted expiry dates.

    Workflow:
    1. Send image to GPT-4o Vision API
    2. Detect food items and their categories
    3. Predict expiry dates for each item
    4. Create DraftItems for user review/confirmation

    Returns a list of DraftItems (one per detected food item).
    User must confirm each draft to promote to inventory.
    """
    # Validate file type
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image (JPEG, PNG, etc.)"
        )

    # Read image bytes
    try:
        image_bytes = await image.read()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read image file: {str(e)}"
        )

    # Process image
    result = image_ingestion_service.ingest_from_image(
        image_bytes=image_bytes,
        storage_location=storage_location
    )

    if not result.success:
        raise HTTPException(
            status_code=400,
            detail=result.error_message or "Failed to process image"
        )

    # Create a DraftItem for each detected food item
    created_drafts = []
    for item in result.detected_items:
        draft_data = {
            "name": item.name,
            "category": item.category,
            "location": storage_location,
            "source": "image",
            "confidence_score": item.confidence_score,
        }

        # Add quantity and unit if available
        if item.quantity is not None:
            draft_data["quantity"] = item.quantity
        if item.unit is not None:
            draft_data["unit"] = item.unit

        # Add expiry prediction if available
        if item.predicted_expiry:
            draft_data["expiration_date"] = item.predicted_expiry

        # Build notes with detection info
        notes_parts = ["[Image detection - GPT-4o]"]
        if item.reasoning:
            notes_parts.append(f"[{item.reasoning}]")
        if item.quantity_confidence is not None:
            confidence_pct = int(item.quantity_confidence * 100)
            notes_parts.append(f"[Quantity confidence: {confidence_pct}%]")
        draft_data["notes"] = "\n".join(notes_parts)

        # Save to database
        db_draft = DraftItem(
            user_id=user_id,
            **draft_data
        )
        db.add(db_draft)
        db.commit()
        db.refresh(db_draft)
        created_drafts.append(db_draft)

    return created_drafts
