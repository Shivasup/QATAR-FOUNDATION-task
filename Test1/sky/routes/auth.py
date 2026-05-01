from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import secrets

from sky.extensions import db
from sky.models import Admin, PasswordReset

auth_bp = Blueprint("auth", __name__)


# ================= SIGNUP =================
@auth_bp.route("/signup", methods=["POST", "OPTIONS"])
def signup():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json()

    full_name = data.get("full_name")
    email = data.get("email")
    password = data.get("password")

    if not full_name or not email or not password:
        return jsonify({"message": "All fields required"}), 400

    if Admin.query.filter_by(email=email).first():
        return jsonify({"message": "Email already exists"}), 400

    admin = Admin(
        full_name=full_name,
        email=email
    )
    admin.set_password(password)

    db.session.add(admin)
    db.session.commit()

    return jsonify({"message": "Account created successfully"}), 201


# ================= LOGIN =================
@auth_bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    admin = Admin.query.filter_by(email=email).first()

    if not admin or not admin.check_password(password):
        return jsonify({"message": "Invalid email or password"}), 401

    return jsonify({
        "message": "Login successful",
        "access_token": "dummy-token",
        "admin": admin.to_dict()
    }), 200


# ================= FORGOT PASSWORD =================
@auth_bp.route("/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json()
    email = data.get("email")

    if not email:
        return jsonify({"message": "Email required"}), 400

    admin = Admin.query.filter_by(email=email).first()

    if admin:
        token = secrets.token_hex(16)

        reset = PasswordReset(
            admin_id=admin.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(hours=1)
        )

        db.session.add(reset)
        db.session.commit()

        # ✅ CREATE RESET LINK
        reset_link = f"http://127.0.0.1:5500/reset.html?token={token}"

        # 🔥 FOR NOW: PRINT LINK IN TERMINAL
        print("\n================ RESET LINK ================")
        print(reset_link)
        print("===========================================\n")

    return jsonify({"message": "If email exists, reset link sent"}), 200


# ================= RESET PASSWORD =================
@auth_bp.route("/reset-password", methods=["POST", "OPTIONS"])
def reset_password():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json()

    token = data.get("token")
    new_password = data.get("password")

    if not token or not new_password:
        return jsonify({"message": "Token and password required"}), 400

    reset = PasswordReset.query.filter_by(token=token, used=False).first()

    if not reset:
        return jsonify({"message": "Invalid or expired token"}), 400

    if reset.expires_at < datetime.utcnow():
        return jsonify({"message": "Token expired"}), 400

    admin = Admin.query.get(reset.admin_id)

    admin.set_password(new_password)

    reset.used = True

    db.session.commit()

    return jsonify({"message": "Password reset successful"}), 200


# ================= GET USER =================
@auth_bp.route("/me", methods=["GET", "OPTIONS"])
def get_me():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    return jsonify({
        "admin": {
            "email": "demo@example.com",
            "full_name": "Demo User"
        }
    }), 200