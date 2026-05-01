import os
from flask import Flask
from flask_cors import CORS
from datetime import timedelta

# ✅ shared extensions
from sky.extensions import db, jwt


def create_app():
    app = Flask(__name__)

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    # ================= CONFIG =================
    app.config["SECRET_KEY"] = os.environ.get(
        "SECRET_KEY", "dev-secret-key"
    )

    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(BASE_DIR, "admin_portal.db"),
    )

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    app.config["JWT_SECRET_KEY"] = os.environ.get(
        "JWT_SECRET_KEY", "jwt-secret"
    )

    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)

    # ================= INIT EXTENSIONS =================
    db.init_app(app)
    jwt.init_app(app)

    # ================= CORS FIX (IMPORTANT) =================
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    )

    # ================= HANDLE PREFLIGHT =================
    @app.after_request
    def handle_options(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response

    # ================= BLUEPRINTS =================
    from sky.routes.auth import auth_bp
    from sky.routes.opportunities import opp_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(opp_bp, url_prefix="/api/opportunities")

    # ================= CREATE DB =================
    with app.app_context():
        db.create_all()

    return app


# ================= RUN =================
if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)