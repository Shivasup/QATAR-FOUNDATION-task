from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from sky.extensions import db
from sky.models import Opportunity

opp_bp = Blueprint("opportunities", __name__)

VALID_CATEGORIES = {"technology", "business", "design", "marketing", "data science", "other"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _bad(msg: str, code: int = 400):
    return jsonify({"success": False, "message": msg}), code


def _ok(data: dict, code: int = 200):
    return jsonify({"success": True, **data}), code


def _current_admin_id() -> int:
    return int(get_jwt_identity())


def _validate_opportunity_body(body: dict, require_all: bool = True):
    """
    Validate opportunity fields.
    Returns (errors: list[str], cleaned: dict).
    If require_all is False, only validate fields that are present (for partial updates).
    """
    errors = []
    cleaned = {}

    required_fields = [
        ("name", "Opportunity name"),
        ("duration", "Duration"),
        ("start_date", "Start date"),
        ("description", "Description"),
        ("skills", "Skills to gain"),
        ("category", "Category"),
        ("future_opportunities", "Future opportunities"),
    ]

    for field, label in required_fields:
        value = (body.get(field) or "").strip()
        if require_all and not value:
            errors.append(f"{label} is required.")
        elif value:
            cleaned[field] = value

    # Category validation (only if provided)
    if "category" in cleaned:
        if cleaned["category"].lower() not in VALID_CATEGORIES:
            errors.append(
                f"Category must be one of: {', '.join(sorted(VALID_CATEGORIES))}."
            )
        else:
            cleaned["category"] = cleaned["category"].lower()

    # Optional: max_applicants
    max_app = body.get("max_applicants")
    if max_app is not None and max_app != "":
        try:
            val = int(max_app)
            if val < 0:
                errors.append("Maximum applicants must be a non-negative number.")
            else:
                cleaned["max_applicants"] = val
        except (ValueError, TypeError):
            errors.append("Maximum applicants must be a valid number.")
    elif "max_applicants" in body:
        cleaned["max_applicants"] = None  # explicitly clearing

    return errors, cleaned


# ── US-2.1  View All Opportunities ───────────────────────────────────────────

@opp_bp.get("/")
@jwt_required()
def list_opportunities():
    admin_id = _current_admin_id()
    opps = Opportunity.query.filter_by(admin_id=admin_id).order_by(Opportunity.created_at.desc()).all()

    if not opps:
        return _ok({
            "opportunities": [],
            "message": "No opportunities created yet.",
        })

    return _ok({"opportunities": [o.to_dict() for o in opps]})


# ── US-2.2  Add a New Opportunity ────────────────────────────────────────────

@opp_bp.post("/")
@jwt_required()
def create_opportunity():
    admin_id = _current_admin_id()
    body = request.get_json(silent=True) or {}

    errors, cleaned = _validate_opportunity_body(body, require_all=True)
    if errors:
        return _bad(" ".join(errors), 422)

    opp = Opportunity(
        admin_id=admin_id,
        name=cleaned["name"],
        duration=cleaned["duration"],
        start_date=cleaned["start_date"],
        description=cleaned["description"],
        skills=cleaned["skills"],
        category=cleaned["category"],
        future_opportunities=cleaned["future_opportunities"],
        max_applicants=cleaned.get("max_applicants"),
    )
    db.session.add(opp)
    db.session.commit()

    return _ok({
        "message": "Opportunity created successfully.",
        "opportunity": opp.to_dict(),
    }, 201)


# ── US-2.4  View Opportunity Details ─────────────────────────────────────────

@opp_bp.get("/<int:opp_id>")
@jwt_required()
def get_opportunity(opp_id: int):
    admin_id = _current_admin_id()
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=admin_id).first()

    if not opp:
        return _bad("Opportunity not found.", 404)

    return _ok({"opportunity": opp.to_dict()})


# ── US-2.5  Edit an Opportunity ──────────────────────────────────────────────

@opp_bp.put("/<int:opp_id>")
@jwt_required()
def update_opportunity(opp_id: int):
    admin_id = _current_admin_id()
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=admin_id).first()

    if not opp:
        return _bad("Opportunity not found or you do not have permission to edit it.", 404)

    body = request.get_json(silent=True) or {}
    errors, cleaned = _validate_opportunity_body(body, require_all=True)
    if errors:
        return _bad(" ".join(errors), 422)

    # Apply updates
    opp.name = cleaned["name"]
    opp.duration = cleaned["duration"]
    opp.start_date = cleaned["start_date"]
    opp.description = cleaned["description"]
    opp.skills = cleaned["skills"]
    opp.category = cleaned["category"]
    opp.future_opportunities = cleaned["future_opportunities"]
    if "max_applicants" in cleaned:
        opp.max_applicants = cleaned["max_applicants"]

    db.session.commit()

    return _ok({
        "message": "Opportunity updated successfully.",
        "opportunity": opp.to_dict(),
    })


# ── US-2.6  Delete an Opportunity ────────────────────────────────────────────

@opp_bp.delete("/<int:opp_id>")
@jwt_required()
def delete_opportunity(opp_id: int):
    admin_id = _current_admin_id()
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=admin_id).first()

    if not opp:
        return _bad("Opportunity not found or you do not have permission to delete it.", 404)

    db.session.delete(opp)
    db.session.commit()

    return _ok({"message": "Opportunity deleted successfully."})