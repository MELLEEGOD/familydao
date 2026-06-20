from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import random
import shutil
import string
import time
import traceback
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DB_PATH = ROOT / "db.json"
PORT = int(os.environ.get("PORT", "3000"))
INTEREST_RATE_DEFAULT = 10
PASSWORD_SALT = "family-dao-local-prototype"
SESSION_COOKIE = "family_credits_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
GOOGLE_MODEL = os.environ.get("GOOGLE_MODEL", "gemini-2.0-flash")
SESSIONS: dict[str, dict] = {}


class AppError(Exception):
    def __init__(self, message: str, status: int = 400):
      super().__init__(message)
      self.status = status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def clone(value):
    return json.loads(json.dumps(value))


def hash_password(password: str) -> str:
    return hashlib.sha256(f"{PASSWORD_SALT}:{password}".encode("utf-8")).hexdigest()


def default_password_for(user: dict) -> str:
    if user.get("role") == "ADMIN":
        return "parent123"
    name = "".join(ch for ch in str(user.get("name") or "child").lower() if ch.isalnum())
    return f"{name}123"


def default_state() -> dict:
    return {
        "users": [
            {
                "id": "u_parent",
                "name": "Mom & Dad",
                "role": "ADMIN",
                "balance": 0,
                "savings_balance": 0,
                "loan_balance": 0,
                "password_hash": hash_password("parent123"),
            },
            {
                "id": "u_alice",
                "name": "Alice",
                "role": "USER",
                "balance": 45,
                "savings_balance": 120,
                "loan_balance": 0,
                "monthly_allowance": 100,
                "last_allowance_month": None,
                "password_hash": hash_password("alice123"),
            },
            {
                "id": "u_bob",
                "name": "Bob",
                "role": "USER",
                "balance": 30,
                "savings_balance": 75,
                "loan_balance": 0,
                "monthly_allowance": 100,
                "last_allowance_month": None,
                "password_hash": hash_password("bob123"),
            },
        ],
        "chores": [
            {
                "id": "chore_1",
                "title": "Load the dishwasher",
                "description": "Clear dinner plates, load the dishwasher, and wipe the counter.",
                "bounty": 15,
                "status": "AVAILABLE",
                "assigned_to": None,
            },
            {
                "id": "chore_2",
                "title": "Fold laundry",
                "description": "Fold one basket and put every pile in the right room.",
                "bounty": 20,
                "status": "AVAILABLE",
                "assigned_to": None,
            },
            {
                "id": "chore_3",
                "title": "Water balcony plants",
                "description": "Water each planter and check the soil is damp.",
                "bounty": 10,
                "status": "PENDING_APPROVAL",
                "assigned_to": "u_alice",
            },
        ],
        "dailyChorePresets": [
            {
                "id": "preset_morning_reset",
                "title": "Morning reset",
                "description": "Make the bed and reset the room before school.",
                "bounty": 8,
                "category": "DAILY_ROUTINE",
            },
            {
                "id": "preset_medicine_check",
                "title": "Medicine check",
                "description": "Take scheduled medicine and mark it done.",
                "bounty": 10,
                "category": "MEDICINE",
            },
            {
                "id": "preset_kitchen_helper",
                "title": "Kitchen helper",
                "description": "Help clear plates or set the table.",
                "bounty": 8,
                "category": "EXTRA_HELP",
            },
            {
                "id": "preset_evening_tidy",
                "title": "Evening tidy",
                "description": "Put away school items and prepare tomorrow's bag.",
                "bounty": 8,
                "category": "DAILY_ROUTINE",
            },
        ],
        "shopItems": [
            {
                "id": "item_1",
                "title": "Extra screen time",
                "description": "Thirty minutes of bonus screen time after homework.",
                "cost": 35,
                "stock": 999,
            },
            {
                "id": "item_2",
                "title": "Movie night pick",
                "description": "Choose the next family movie and snack theme.",
                "cost": 60,
                "stock": 3,
            },
            {
                "id": "item_3",
                "title": "Dessert architect",
                "description": "Design the weekend dessert menu.",
                "cost": 45,
                "stock": 4,
            },
        ],
        "reminders": [],
        "creditRequests": [],
        "appreciationCheckpoints": [],
        "familyFund": {
            "title": "Family Vacation Fund",
            "balance": 0,
            "target": 5000,
        },
        "transactions": [
            {
                "id": "tx_1",
                "userId": "u_alice",
                "userName": "Alice",
                "amount": 120,
                "tx_type": "SAVINGS_DEPOSIT",
                "description": "Opening savings vault balance",
                "date": now_iso(),
            },
            {
                "id": "tx_2",
                "userId": "u_bob",
                "userName": "Bob",
                "amount": 75,
                "tx_type": "SAVINGS_DEPOSIT",
                "description": "Opening savings vault balance",
                "date": now_iso(),
            },
        ],
    }


def money_round(value) -> float:
    return round(float(value), 2)


def positive_number(value, field_name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float("nan")
    if not (number > 0):
        raise AppError(f"{field_name} must be a positive number.", 400)
    return money_round(number)


def non_negative_number(value, field_name: str) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = float("nan")
    if not (number >= 0):
        raise AppError(f"{field_name} must be a non-negative number.", 400)
    return money_round(number)


def non_negative_integer(value, field_name: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise AppError(f"{field_name} must be a non-negative integer.", 400)
    if number < 0 or str(value).strip() not in {str(number), f"{number}.0"}:
        raise AppError(f"{field_name} must be a non-negative integer.", 400)
    return number


def required_text(value, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise AppError(f"{field_name} is required.", 400)
    return text


def optional_date(value, field_name: str = "Date") -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        raise AppError(f"{field_name} must use YYYY-MM-DD.", 400)
    return text


def normalize_state(state: dict) -> dict:
    defaults = default_state()
    users = state.get("users") if isinstance(state.get("users"), list) else clone(defaults["users"])
    normalized_users = []
    for user in users:
        role = user.get("role")
        normalized_users.append(
            {
                **user,
                "password_hash": user.get("password_hash") or hash_password(default_password_for(user)),
                "loan_balance": non_negative_number(user.get("loan_balance", 0), "Loan balance") if role == "USER" else 0,
                "monthly_allowance": non_negative_number(user.get("monthly_allowance", 100), "Monthly allowance") if role == "USER" else 0,
                "last_allowance_month": user.get("last_allowance_month") or None,
            }
        )

    family_fund = state.get("familyFund")
    if isinstance(family_fund, dict):
        normalized_fund = {
            "title": family_fund.get("title") or defaults["familyFund"]["title"],
            "balance": non_negative_number(family_fund.get("balance", 0), "Family fund balance"),
            "target": non_negative_number(family_fund.get("target", defaults["familyFund"]["target"]), "Family fund target"),
        }
    else:
        normalized_fund = clone(defaults["familyFund"])

    return {
        "users": normalized_users,
        "chores": state.get("chores") if isinstance(state.get("chores"), list) else clone(defaults["chores"]),
        "dailyChorePresets": state.get("dailyChorePresets") if isinstance(state.get("dailyChorePresets"), list) else clone(defaults["dailyChorePresets"]),
        "shopItems": state.get("shopItems") if isinstance(state.get("shopItems"), list) else clone(defaults["shopItems"]),
        "reminders": state.get("reminders") if isinstance(state.get("reminders"), list) else [],
        "creditRequests": state.get("creditRequests") if isinstance(state.get("creditRequests"), list) else [],
        "appreciationCheckpoints": state.get("appreciationCheckpoints") if isinstance(state.get("appreciationCheckpoints"), list) else [],
        "familyFund": normalized_fund,
        "transactions": state.get("transactions") if isinstance(state.get("transactions"), list) else clone(defaults["transactions"]),
    }


def read_state() -> dict:
    return json.loads(DB_PATH.read_text(encoding="utf-8"))


def write_state(state: dict) -> None:
    DB_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def ensure_database() -> None:
    if not DB_PATH.exists():
        write_state(clone(default_state()))
        return
    try:
        state = read_state()
        normalized = normalize_state(state)
        if normalized != state:
            write_state(normalized)
    except Exception:
        backup_path = DB_PATH.with_suffix(f".json.{int(time.time() * 1000)}.broken")
        shutil.move(DB_PATH, backup_path)
        write_state(clone(default_state()))
        print(f"Invalid db.json was backed up to {backup_path}. A fresh database was created.")


def public_state(state: dict) -> dict:
    return {
        **state,
        "users": [{key: value for key, value in user.items() if key != "password_hash"} for user in state["users"]],
    }


def public_login_state(state: dict) -> dict:
    return {
        "users": [{"id": user["id"], "name": user["name"], "role": user["role"]} for user in state["users"]]
    }


def create_id(prefix: str) -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"{prefix}_{int(time.time() * 1000):x}_{suffix}"


def get_user(state: dict, user_id: str | None) -> dict | None:
    return next((user for user in state["users"] if user.get("id") == user_id), None)


def get_session(token: str | None) -> dict | None:
    if not token:
        return None
    session = SESSIONS.get(token)
    if not session:
        return None
    if time.time() - session["createdAt"] > SESSION_MAX_AGE_SECONDS:
        SESSIONS.pop(token, None)
        return None
    return session


def require_session(state: dict, user_id: str | None, auth_token: str | None) -> None:
    session = get_session(auth_token)
    if not session or session.get("userId") != user_id or not get_user(state, session.get("userId")):
        raise AppError("Please log in again.", 401)


def require_admin(state: dict, user_id: str | None, auth_token: str | None = None) -> dict:
    if auth_token is not None:
        require_session(state, user_id, auth_token)
    user = get_user(state, user_id)
    if not user:
        raise AppError("User not found.", 404)
    if user.get("role") != "ADMIN":
        raise AppError("Admin permissions are required for this action.", 403)
    return user


def require_child(state: dict, user_id: str | None, auth_token: str | None = None) -> dict:
    if auth_token is not None:
        require_session(state, user_id, auth_token)
    user = get_user(state, user_id)
    if not user:
        raise AppError("User not found.", 404)
    if user.get("role") != "USER":
        raise AppError("Only child users can perform this action.", 403)
    return user


def current_allowance_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def add_transaction(state: dict, *, user: dict, amount, tx_type: str, description: str) -> dict:
    transaction = {
        "id": create_id("tx"),
        "userId": user["id"],
        "userName": user["name"],
        "amount": money_round(amount),
        "tx_type": tx_type,
        "description": description,
        "date": now_iso(),
    }
    state["transactions"].append(transaction)
    return transaction


class FamilyDAOHandler(BaseHTTPRequestHandler):
    server_version = "FamilyDAO-Python/1.0"

    def do_GET(self):
        self.handle_request("GET")

    def do_POST(self):
        self.handle_request("POST")

    def do_PATCH(self):
        self.handle_request("PATCH")

    def do_DELETE(self):
        self.handle_request("DELETE")

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")

    def handle_request(self, method: str) -> None:
        try:
            parsed = urlparse(self.path)
            path = unquote(parsed.path)
            if path != "/" and path.endswith("/"):
                path = path[:-1]

            if method == "GET":
                if path in {"", "/", "/login"}:
                    return self.send_file(PUBLIC_DIR / "login.html")
                if path in {"/index", "/index.html"}:
                    return self.redirect("/login")
                if path == "/parent":
                    return self.serve_portal("ADMIN")
                if path == "/child":
                    return self.serve_portal("USER")
                if path == "/api/login-state":
                    return self.send_json(public_login_state(read_state()))
                if path == "/api/state":
                    state = read_state()
                    session = get_session(self.parse_cookie(SESSION_COOKIE))
                    if not session or not get_user(state, session.get("userId")):
                        raise AppError("Please log in again.", 401)
                    return self.send_json(public_state(state))
                return self.serve_static(path)

            body = self.read_json_body()
            response = self.route_api(method, path, body)
            if response is not None:
                return response
            raise AppError("Not found.", 404)
        except AppError as error:
            self.send_json({"error": str(error)}, error.status)
        except Exception:
            traceback.print_exc()
            self.send_json({"error": "Something went wrong."}, 500)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw or "{}")
        except json.JSONDecodeError:
            raise AppError("Request body must be valid JSON.", 400)

    def route_api(self, method: str, path: str, body: dict):
        if method == "POST" and path == "/api/login":
            return self.login(body)
        auth_cookie = self.parse_cookie(SESSION_COOKIE)
        if not path.startswith("/api/"):
            raise AppError("Not found.", 404)

        parts = path.strip("/").split("/")

        if method == "POST" and path == "/api/users":
            return self.create_user(body)
        if len(parts) == 3 and parts[:2] == ["api", "users"] and method == "PATCH":
            return self.update_user(parts[2], body)
        if len(parts) == 3 and parts[:2] == ["api", "users"] and method == "DELETE":
            return self.delete_user(parts[2], body)
        if method == "POST" and path == "/api/allowance/run":
            return self.run_allowance(body)
        if method == "POST" and path == "/api/credits/adjust":
            return self.adjust_credits(body)
        if method == "POST" and path == "/api/credit-requests":
            return self.create_credit_request(body)
        if len(parts) == 4 and parts[:2] == ["api", "credit-requests"] and method == "POST":
            if parts[3] == "approve":
                return self.approve_credit_request(parts[2], body)
            if parts[3] == "reject":
                return self.reject_credit_request(parts[2], body)
        if method == "POST" and path == "/api/loans/repay":
            return self.repay_loan(body)
        if method == "POST" and path == "/api/checkpoints":
            return self.create_checkpoint(body)
        if method == "POST" and path == "/api/ai/suggest":
            return self.ai_suggest(body)
        if method == "POST" and path == "/api/tasks/generate-daily":
            return self.generate_daily_tasks(body)
        if method == "POST" and path == "/api/daily-chores/presets":
            return self.create_daily_chore_preset(body)
        if len(parts) == 4 and parts[:3] == ["api", "daily-chores", "presets"] and method == "DELETE":
            return self.delete_daily_chore_preset(parts[3], body)
        if method == "POST" and path == "/api/daily-chores/today":
            return self.add_daily_chore_today(body)
        if method == "POST" and path == "/api/reminders":
            return self.create_reminder(body)
        if len(parts) == 4 and parts[:2] == ["api", "reminders"] and parts[3] == "complete" and method == "POST":
            return self.complete_reminder(parts[2], body)
        if method == "POST" and path == "/api/family-fund/contribute":
            return self.contribute_family_fund(body)
        if method == "POST" and path == "/api/chores":
            return self.create_chore(body)
        if len(parts) == 3 and parts[:2] == ["api", "chores"] and method == "PATCH":
            return self.update_chore(parts[2], body)
        if len(parts) == 4 and parts[:2] == ["api", "chores"] and method == "POST":
            if parts[3] == "complete":
                return self.complete_chore(parts[2], body)
            if parts[3] == "approve":
                return self.approve_chore(parts[2], body)
        if len(parts) == 3 and parts[:2] == ["api", "chores"] and method == "DELETE":
            return self.delete_chore(parts[2], body)
        if method == "POST" and path == "/api/shop":
            return self.create_shop_item(body)
        if len(parts) == 4 and parts[:2] == ["api", "shop"] and parts[3] == "purchase" and method == "POST":
            return self.purchase_shop_item(parts[2], body)
        if len(parts) == 3 and parts[:2] == ["api", "shop"] and method == "DELETE":
            return self.delete_shop_item(parts[2], body)
        if method == "POST" and path == "/api/savings/deposit":
            return self.deposit_savings(body)
        if method == "POST" and path == "/api/savings/withdraw":
            return self.withdraw_savings(body)
        if method == "POST" and path == "/api/savings/pay-interest":
            return self.pay_interest(body)
        return None

    def send_json(self, payload: dict, status: int = 200, headers: dict | None = None) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def send_state(self, state: dict, status: int = 200) -> None:
        write_state(state)
        self.send_json(public_state(state), status)

    def ai_suggest(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        provider = str(body.get("provider") or "openai").strip().lower()
        provider_labels = {
            "openai": "OpenAI",
            "openrouter": "OpenRouter",
            "google": "Google",
        }
        if provider not in provider_labels:
            return self.send_json({"error": "AI provider must be OpenAI, OpenRouter, or Google."}, 400)
        provider_env_keys = {
            "openai": ("OPENAI_API_KEY",),
            "openrouter": ("OPENROUTER_API_KEY",),
            "google": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
        }
        api_key = str(body.get("apiKey") or "").strip()
        if not api_key:
            api_key = next(
                (str(os.environ.get(name) or "").strip() for name in provider_env_keys[provider] if os.environ.get(name)),
                "",
            )
        if not api_key:
            label = provider_labels[provider]
            article = "An" if label[0].lower() in "aeiou" else "A"
            return self.send_json({"error": f"{article} {label} API key is required for AI suggestions."}, 400)

        default_models = {
            "openai": OPENAI_MODEL,
            "openrouter": OPENROUTER_MODEL,
            "google": GOOGLE_MODEL,
        }
        model = str(body.get("model") or default_models[provider]).strip()
        use_case = required_text(body.get("useCase") or "CHORE", "Suggestion type")
        description = required_text(body.get("description"), "Description")
        system_prompt = (
            "You are the Family Credits AI helper. Suggest fair Family Credit amounts for a household ledger. "
            "Use practical, age-appropriate values. Do not approve transactions; only advise a parent."
        )
        user_prompt = (
            f"Use case: {use_case}\n"
            f"Details: {description}\n\n"
            "Reference scale: tiny daily habit 3-8 FC, normal chore 8-20 FC, harder chore 20-45 FC, "
            "medicine adherence 5-15 FC, extra help 10-35 FC, strong school achievement 25-100 FC, "
            "minor penalty 5-15 FC, serious penalty 20-60 FC. Return a concise suggestion."
        )
        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ]
        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "suggested_amount": {"type": "number"},
                "category": {"type": "string"},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                "reasoning": {"type": "string"},
                "parent_note": {"type": "string"},
            },
            "required": ["suggested_amount", "category", "confidence", "reasoning", "parent_note"],
        }

        if provider == "openrouter":
            payload = {
                "model": model,
                "messages": messages,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "family_dao_fc_suggestion",
                        "strict": True,
                        "schema": schema,
                    },
                },
            }
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Family Credits",
            }
        elif provider == "google":
            google_schema = {
                "type": "OBJECT",
                "properties": {
                    "suggested_amount": {"type": "NUMBER"},
                    "category": {"type": "STRING"},
                    "confidence": {"type": "STRING", "enum": ["low", "medium", "high"]},
                    "reasoning": {"type": "STRING"},
                    "parent_note": {"type": "STRING"},
                },
                "required": ["suggested_amount", "category", "confidence", "reasoning", "parent_note"],
            }
            payload = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": google_schema,
                },
            }
            model_path = model if model.startswith("models/") else f"models/{model}"
            url = (
                "https://generativelanguage.googleapis.com/v1beta/"
                f"{quote(model_path, safe='/')}:generateContent?key={quote(api_key, safe='')}"
            )
            headers = {
                "Content-Type": "application/json",
            }
        else:
            payload = {
                "model": model,
                "input": messages,
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "family_dao_fc_suggestion",
                        "strict": True,
                        "schema": schema,
                    }
                },
            }
            url = "https://api.openai.com/v1/responses"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }

        request = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")

        try:
            with urlopen(request, timeout=25) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raw_error = exc.read().decode("utf-8", errors="replace")
            try:
                error_payload = json.loads(raw_error)
                message = error_payload.get("error", {}).get("message") or raw_error
            except json.JSONDecodeError:
                message = raw_error or str(exc)
            return self.send_json({"error": f"API request failed: {message}"}, 502)
        except URLError as exc:
            return self.send_json({"error": f"API connection failed: {exc.reason}"}, 502)
        except Exception as exc:
            return self.send_json({"error": f"AI suggestion failed: {exc}"}, 502)

        if provider == "openrouter":
            text = result.get("choices", [{}])[0].get("message", {}).get("content") or ""
        elif provider == "google":
            text = ""
            for candidate in result.get("candidates", []):
                for part in candidate.get("content", {}).get("parts", []):
                    if isinstance(part, dict) and part.get("text"):
                        text += part["text"]
            text = text.strip()
        else:
            text = result.get("output_text") or ""
        if not text and provider == "openai":
            chunks = []
            for output in result.get("output", []):
                for content in output.get("content", []):
                    if isinstance(content, dict) and content.get("text"):
                        chunks.append(content["text"])
            text = "".join(chunks)

        cleaned_text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            suggestion = json.loads(cleaned_text)
        except json.JSONDecodeError:
            return self.send_json({"error": "AI returned an unreadable suggestion."}, 502)

        suggestion["suggested_amount"] = money_round(suggestion.get("suggested_amount", 0))
        suggestion["model"] = model
        suggestion["provider"] = provider_labels[provider]
        self.send_json({"suggestion": suggestion})

    def redirect(self, location: str) -> None:
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()

    def send_file(self, file_path: Path) -> None:
        if not file_path.exists() or not file_path.is_file():
            raise AppError("Not found.", 404)
        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def serve_static(self, path: str) -> None:
        relative = path.lstrip("/")
        file_path = (PUBLIC_DIR / relative).resolve()
        if not str(file_path).startswith(str(PUBLIC_DIR.resolve())):
            raise AppError("Not found.", 404)
        self.send_file(file_path)

    def parse_cookie(self, name: str) -> str | None:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get(name)
        return morsel.value if morsel else None

    def serve_portal(self, required_role: str) -> None:
        token = self.parse_cookie(SESSION_COOKIE)
        session = get_session(token)
        if not session or session.get("role") != required_role:
            return self.redirect("/login")

        state = read_state()
        user = get_user(state, session.get("userId"))
        if not user or user.get("role") != required_role:
            SESSIONS.pop(token, None)
            self.send_response(302)
            self.send_header("Location", "/login")
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Max-Age=0; Path=/")
            self.end_headers()
            return

        self.send_file(PUBLIC_DIR / "index.html")

    def login(self, body: dict):
        state = read_state()
        role = str(body.get("role") or "").upper()
        password = str(body.get("password") or "")
        user = get_user(state, body.get("userId"))

        if not user or role not in {"ADMIN", "USER"} or user.get("role") != role:
            return self.send_json({"error": "Invalid login details."}, 401)
        if user.get("password_hash") != hash_password(password):
            return self.send_json({"error": "Invalid login details."}, 401)

        token = str(uuid.uuid4())
        SESSIONS[token] = {"userId": user["id"], "role": user["role"], "createdAt": time.time()}
        cookie = f"{SESSION_COOKIE}={token}; HttpOnly; SameSite=Strict; Max-Age={SESSION_MAX_AGE_SECONDS}; Path=/"
        self.send_json(
            {"authToken": token, "user": public_state({**state, "users": [user]})["users"][0]},
            200,
            {"Set-Cookie": cookie},
        )

    def create_user(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        name = required_text(body.get("name"), "Name")
        role = str(body.get("role") or "USER").strip().upper()
        if role not in {"ADMIN", "USER"}:
            return self.send_json({"error": "Role must be ADMIN or USER."}, 400)
        if any(user["name"].lower() == name.lower() for user in state["users"]):
            return self.send_json({"error": "A user with that name already exists."}, 409)

        user = {
            "id": create_id("user"),
            "name": name,
            "role": role,
            "balance": non_negative_number(body.get("balance"), "Liquid balance"),
            "savings_balance": non_negative_number(body.get("savings_balance"), "Savings balance"),
            "loan_balance": 0,
            "monthly_allowance": non_negative_number(body.get("monthly_allowance", 100), "Monthly allowance") if role == "USER" else 0,
            "last_allowance_month": None,
            "password_hash": hash_password(body.get("password") or default_password_for({"name": name, "role": role})),
        }
        state["users"].append(user)
        self.send_state(state, 201)

    def update_user(self, target_id: str, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        target_user = get_user(state, target_id)
        if not target_user:
            return self.send_json({"error": "User not found."}, 404)
        name = required_text(body.get("name"), "Name")
        if any(user["id"] != target_user["id"] and user["name"].lower() == name.lower() for user in state["users"]):
            return self.send_json({"error": "A user with that name already exists."}, 409)
        target_user["name"] = name
        if target_user.get("role") == "USER" and "monthly_allowance" in body:
            target_user["monthly_allowance"] = non_negative_number(body.get("monthly_allowance"), "Monthly allowance")
        self.send_state(state)

    def delete_user(self, target_id: str, body: dict):
        state = read_state()
        admin = require_admin(state, body.get("userId"), auth_cookie)
        target_user = get_user(state, target_id)
        if not target_user:
            return self.send_json({"error": "User not found."}, 404)
        if target_user["id"] == admin["id"]:
            return self.send_json({"error": "You cannot remove the active parent account."}, 409)
        if target_user.get("role") == "ADMIN" and sum(1 for user in state["users"] if user.get("role") == "ADMIN") <= 1:
            return self.send_json({"error": "At least one parent account must remain."}, 409)
        for chore in state["chores"]:
            if chore.get("assigned_to") == target_user["id"] and chore.get("status") != "COMPLETED":
                chore["status"] = "AVAILABLE"
                chore["assigned_to"] = None
        state["users"] = [user for user in state["users"] if user["id"] != target_user["id"]]
        self.send_state(state)

    def run_allowance(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        allowance_month = body.get("month") or current_allowance_month()
        for user in state["users"]:
            if user.get("role") == "USER" and user.get("monthly_allowance", 0) > 0 and user.get("last_allowance_month") != allowance_month:
                user["balance"] = money_round(user.get("balance", 0) + user.get("monthly_allowance", 0))
                user["last_allowance_month"] = allowance_month
                add_transaction(state, user=user, amount=user["monthly_allowance"], tx_type="MONTHLY_CREDIT", description=f"{allowance_month} monthly Family Credits")
        self.send_state(state)

    def adjust_credits(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        target_user = require_child(state, body.get("targetUserId"))
        amount = positive_number(body.get("amount"), "Amount")
        direction = str(body.get("direction") or "add").lower()
        reason = required_text(body.get("reason"), "Reason")
        tx_type = required_text(body.get("tx_type") or ("BEHAVIOR_DEDUCTION" if direction == "remove" else "EXTRA_CREDIT"), "Transaction type").upper().replace(" ", "_")
        if tx_type in {"BAD_BEHAVIOR", "GROUNDED", "BEHAVIOR_DEDUCTION", "SHOP_PURCHASE"}:
            direction = "remove"
        if direction not in {"add", "remove"}:
            return self.send_json({"error": "Direction must be add or remove."}, 400)
        previous_balance = money_round(target_user.get("balance", 0))
        applied_amount = min(amount, previous_balance) if direction == "remove" else amount
        signed_amount = -applied_amount if direction == "remove" else applied_amount
        target_user["balance"] = money_round(previous_balance + signed_amount)
        description = reason
        if direction == "remove" and applied_amount < amount:
            description = f"{reason} (only {applied_amount:g} FC available to remove)"
        add_transaction(state, user=target_user, amount=signed_amount, tx_type=tx_type, description=description)
        self.send_state(state)

    def create_credit_request(self, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        request_type = str(body.get("request_type") or "EXTRA_CREDIT").upper()
        amount = positive_number(body.get("amount"), "Amount")
        reason = required_text(body.get("reason"), "Reason")
        if request_type not in {"EXTRA_CREDIT", "LOAN"}:
            return self.send_json({"error": "Request type must be EXTRA_CREDIT or LOAN."}, 400)

        approved_now = request_type == "LOAN"
        request = {
            "id": create_id("request"),
            "userId": child["id"],
            "userName": child["name"],
            "amount": amount,
            "request_type": request_type,
            "reason": reason,
            "status": "APPROVED" if approved_now else "PENDING",
            "date": now_iso(),
            "reviewed_by": "SELF_SERVICE_LOAN" if approved_now else None,
            "reviewed_at": now_iso() if approved_now else None,
        }
        state["creditRequests"].append(request)
        if approved_now:
            child["balance"] = money_round(child.get("balance", 0) + amount)
            child["loan_balance"] = money_round(child.get("loan_balance", 0) + amount)
            add_transaction(state, user=child, amount=amount, tx_type="LOAN_DISBURSEMENT", description=f"Self-service loan: {reason}")
        self.send_state(state, 201)

    def approve_credit_request(self, request_id: str, body: dict):
        state = read_state()
        admin = require_admin(state, body.get("userId"), auth_cookie)
        request = next((entry for entry in state["creditRequests"] if entry["id"] == request_id), None)
        if not request:
            return self.send_json({"error": "Credit request not found."}, 404)
        if request.get("status") != "PENDING":
            return self.send_json({"error": "Only pending requests can be reviewed."}, 409)
        child = require_child(state, request.get("userId"))
        child["balance"] = money_round(child.get("balance", 0) + request["amount"])
        request["status"] = "APPROVED"
        request["reviewed_by"] = admin["id"]
        request["reviewed_at"] = now_iso()
        add_transaction(state, user=child, amount=request["amount"], tx_type="CREDIT_REQUEST_APPROVAL", description=f"Extra credits approved: {request['reason']}")
        self.send_state(state)

    def reject_credit_request(self, request_id: str, body: dict):
        state = read_state()
        admin = require_admin(state, body.get("userId"), auth_cookie)
        request = next((entry for entry in state["creditRequests"] if entry["id"] == request_id), None)
        if not request:
            return self.send_json({"error": "Credit request not found."}, 404)
        if request.get("status") != "PENDING":
            return self.send_json({"error": "Only pending requests can be reviewed."}, 409)
        request["status"] = "REJECTED"
        request["reviewed_by"] = admin["id"]
        request["reviewed_at"] = now_iso()
        self.send_state(state)

    def repay_loan(self, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        amount = positive_number(body.get("amount"), "Amount")
        current_loan = non_negative_number(child.get("loan_balance", 0), "Loan balance")
        if current_loan <= 0:
            return self.send_json({"error": "No active loan balance to repay."}, 409)
        if amount > current_loan:
            return self.send_json({"error": "Repayment is higher than the loan balance."}, 409)
        if child.get("balance", 0) < amount:
            return self.send_json({"error": "Insufficient liquid Family Credits."}, 409)
        child["balance"] = money_round(child.get("balance", 0) - amount)
        child["loan_balance"] = money_round(current_loan - amount)
        add_transaction(state, user=child, amount=-amount, tx_type="LOAN_REPAYMENT", description="Repaid Family Credit loan")
        self.send_state(state)

    def create_checkpoint(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        target_user = require_child(state, body.get("targetUserId"))
        title = required_text(body.get("title"), "Title")
        amount = positive_number(body.get("amount"), "Amount")
        target_user["balance"] = money_round(target_user.get("balance", 0) + amount)
        checkpoint = {"id": create_id("checkpoint"), "userId": target_user["id"], "userName": target_user["name"], "title": title, "amount": amount, "date": now_iso()}
        state["appreciationCheckpoints"].append(checkpoint)
        add_transaction(state, user=target_user, amount=amount, tx_type="APPRECIATION_CHECKPOINT", description=title)
        self.send_state(state)

    def daily_chore_exists(self, state: dict, user: dict, preset: dict, due_date: str) -> bool:
        return any(
            chore.get("assigned_to") == user["id"]
            and chore.get("due_date") == due_date
            and (
                chore.get("preset_id") == preset["id"]
                or (not chore.get("preset_id") and chore.get("title") == preset["title"] and chore.get("category") == preset["category"])
            )
            for chore in state["chores"]
        )

    def add_daily_chore_from_preset(self, state: dict, user: dict, preset: dict, due_date: str) -> bool:
        if self.daily_chore_exists(state, user, preset, due_date):
            return False
        state["chores"].append({
            "id": create_id("chore"),
            "title": preset["title"],
            "description": preset["description"],
            "bounty": preset["bounty"],
            "status": "AVAILABLE",
            "assigned_to": user["id"],
            "category": preset["category"],
            "preset_id": preset["id"],
            "due_date": due_date,
            "source": "DAILY_SYSTEM",
        })
        return True

    def generate_daily_tasks(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        today = today_key()
        templates = state.get("dailyChorePresets", [])
        if not templates:
            return self.send_json({"error": "Add at least one daily chore preset first."}, 409)
        children = [user for user in state["users"] if user.get("role") == "USER"]
        for index, user in enumerate(children):
            template = templates[index % len(templates)]
            self.add_daily_chore_from_preset(state, user, template, today)
        self.send_state(state)

    def create_daily_chore_preset(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        preset = {
            "id": create_id("preset"),
            "title": required_text(body.get("title"), "Title"),
            "description": required_text(body.get("description"), "Description"),
            "bounty": positive_number(body.get("bounty"), "Bounty"),
            "category": required_text(body.get("category") or "DAILY_ROUTINE", "Category").upper().replace(" ", "_"),
        }
        state["dailyChorePresets"].append(preset)
        self.send_state(state, 201)

    def delete_daily_chore_preset(self, preset_id: str, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        original_count = len(state["dailyChorePresets"])
        state["dailyChorePresets"] = [entry for entry in state["dailyChorePresets"] if entry["id"] != preset_id]
        if len(state["dailyChorePresets"]) == original_count:
            return self.send_json({"error": "Daily chore preset not found."}, 404)
        self.send_state(state)

    def add_daily_chore_today(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        preset = next((entry for entry in state["dailyChorePresets"] if entry["id"] == body.get("presetId")), None)
        if not preset:
            return self.send_json({"error": "Daily chore preset not found."}, 404)
        today = today_key()
        target_user_id = body.get("targetUserId")
        target_users = [user for user in state["users"] if user.get("role") == "USER"] if target_user_id == "__all" else [require_child(state, target_user_id)]
        added_count = sum(1 for target_user in target_users if self.add_daily_chore_from_preset(state, target_user, preset, today))
        if added_count == 0:
            message = "That daily chore is already on every child's list today." if target_user_id == "__all" else "That daily chore is already on this child's list today."
            return self.send_json({"error": message}, 409)
        self.send_state(state, 201)

    def create_reminder(self, body: dict):
        state = read_state()
        actor = get_user(state, body.get("userId"))
        if not actor:
            return self.send_json({"error": "User not found."}, 404)
        require_session(state, actor["id"], auth_cookie)
        target_user_id = body.get("targetUserId") if actor.get("role") == "ADMIN" else actor["id"]
        target_user = require_child(state, target_user_id)
        title = required_text(body.get("title"), "Title")
        description = required_text(body.get("description") or "Personal reminder", "Description")
        state["reminders"].append({
            "id": create_id("reminder"),
            "userId": target_user["id"],
            "userName": target_user["name"],
            "title": title,
            "description": description,
            "bounty": 0,
            "suggested_bounty": 0,
            "status": "OPEN",
            "due_date": body.get("due_date") or None,
            "created_by": actor["id"],
            "date": now_iso(),
        })
        self.send_state(state, 201)

    def complete_reminder(self, reminder_id: str, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        reminder = next((entry for entry in state["reminders"] if entry["id"] == reminder_id), None)
        if not reminder:
            return self.send_json({"error": "Reminder not found."}, 404)
        if reminder.get("userId") != child["id"]:
            return self.send_json({"error": "This reminder belongs to another child."}, 403)
        if reminder.get("status") == "COMPLETED":
            return self.send_json({"error": "Reminder is already completed."}, 409)
        reminder["status"] = "COMPLETED"
        reminder["completed_at"] = now_iso()
        self.send_state(state)

    def contribute_family_fund(self, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        amount = positive_number(body.get("amount"), "Amount")
        source = str(body.get("source") or "savings").lower()
        if source not in {"savings", "liquid"}:
            return self.send_json({"error": "Source must be savings or liquid."}, 400)
        if source == "savings":
            if child.get("savings_balance", 0) < amount:
                return self.send_json({"error": "Insufficient savings balance."}, 409)
            child["savings_balance"] = money_round(child.get("savings_balance", 0) - amount)
        else:
            if child.get("balance", 0) < amount:
                return self.send_json({"error": "Insufficient liquid Family Credits."}, 409)
            child["balance"] = money_round(child.get("balance", 0) - amount)
        state["familyFund"]["balance"] = money_round(state["familyFund"].get("balance", 0) + amount)
        add_transaction(state, user=child, amount=-amount, tx_type="FAMILY_FUND_CONTRIBUTION", description=f"Contributed to {state['familyFund']['title']} from {source}")
        self.send_state(state)

    def create_chore(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        state["chores"].append({
            "id": create_id("chore"),
            "title": required_text(body.get("title"), "Title"),
            "description": required_text(body.get("description"), "Description"),
            "bounty": positive_number(body.get("bounty"), "Bounty"),
            "status": "AVAILABLE",
            "assigned_to": None,
            "due_date": optional_date(body.get("due_date"), "Deadline"),
        })
        self.send_state(state, 201)

    def update_chore(self, chore_id: str, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        chore = next((entry for entry in state["chores"] if entry["id"] == chore_id), None)
        if not chore:
            return self.send_json({"error": "Chore not found."}, 404)
        if chore.get("status") == "COMPLETED":
            return self.send_json({"error": "Completed chores stay in the ledger history."}, 409)
        chore["due_date"] = optional_date(body.get("due_date"), "Deadline")
        self.send_state(state)

    def complete_chore(self, chore_id: str, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        chore = next((entry for entry in state["chores"] if entry["id"] == chore_id), None)
        if not chore:
            return self.send_json({"error": "Chore not found."}, 404)
        if chore.get("status") != "AVAILABLE":
            return self.send_json({"error": "Only available chores can be completed."}, 409)
        if chore.get("assigned_to") and chore.get("assigned_to") != child["id"]:
            return self.send_json({"error": "This chore is assigned to another child."}, 403)
        chore["status"] = "PENDING_APPROVAL"
        chore["assigned_to"] = child["id"]
        self.send_state(state)

    def approve_chore(self, chore_id: str, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        chore = next((entry for entry in state["chores"] if entry["id"] == chore_id), None)
        if not chore:
            return self.send_json({"error": "Chore not found."}, 404)
        if chore.get("status") != "PENDING_APPROVAL" or not chore.get("assigned_to"):
            return self.send_json({"error": "Only pending chores with an assignee can be approved."}, 409)
        child = get_user(state, chore.get("assigned_to"))
        if not child:
            return self.send_json({"error": "Assigned child no longer exists."}, 409)
        child["balance"] = money_round(child.get("balance", 0) + chore.get("bounty", 0))
        chore["status"] = "COMPLETED"
        add_transaction(state, user=child, amount=chore.get("bounty", 0), tx_type="CHORE_COMPLETION", description=f"Approved chore: {chore['title']}")
        self.send_state(state)

    def delete_chore(self, chore_id: str, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        chore = next((entry for entry in state["chores"] if entry["id"] == chore_id), None)
        if not chore:
            return self.send_json({"error": "Chore not found."}, 404)
        if chore.get("status") == "COMPLETED":
            return self.send_json({"error": "Completed chores stay in the ledger history."}, 409)
        state["chores"] = [entry for entry in state["chores"] if entry["id"] != chore_id]
        self.send_state(state)

    def create_shop_item(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        state["shopItems"].append({
            "id": create_id("item"),
            "title": required_text(body.get("title"), "Title"),
            "description": required_text(body.get("description"), "Description"),
            "cost": positive_number(body.get("cost"), "Cost"),
            "stock": non_negative_integer(body.get("stock"), "Stock"),
        })
        self.send_state(state, 201)

    def purchase_shop_item(self, item_id: str, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        item = next((entry for entry in state["shopItems"] if entry["id"] == item_id), None)
        if not item:
            return self.send_json({"error": "Shop item not found."}, 404)
        if item.get("stock", 0) <= 0:
            return self.send_json({"error": "This reward is out of stock."}, 409)
        if child.get("balance", 0) < item.get("cost", 0):
            return self.send_json({"error": "Insufficient liquid Family Credits."}, 409)
        child["balance"] = money_round(child.get("balance", 0) - item["cost"])
        if item.get("stock") != 999:
            item["stock"] -= 1
        add_transaction(state, user=child, amount=-item["cost"], tx_type="SHOP_PURCHASE", description=f"Purchased reward: {item['title']}")
        self.send_state(state)

    def delete_shop_item(self, item_id: str, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        original_count = len(state["shopItems"])
        state["shopItems"] = [entry for entry in state["shopItems"] if entry["id"] != item_id]
        if len(state["shopItems"]) == original_count:
            return self.send_json({"error": "Shop item not found."}, 404)
        self.send_state(state)

    def deposit_savings(self, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        amount = positive_number(body.get("amount"), "Amount")
        if child.get("balance", 0) < amount:
            return self.send_json({"error": "Insufficient liquid Family Credits."}, 409)
        child["balance"] = money_round(child.get("balance", 0) - amount)
        child["savings_balance"] = money_round(child.get("savings_balance", 0) + amount)
        add_transaction(state, user=child, amount=amount, tx_type="SAVINGS_DEPOSIT", description="Deposited Family Credits into savings")
        self.send_state(state)

    def withdraw_savings(self, body: dict):
        state = read_state()
        child = require_child(state, body.get("userId"), auth_cookie)
        amount = positive_number(body.get("amount"), "Amount")
        if child.get("savings_balance", 0) < amount:
            return self.send_json({"error": "Insufficient savings balance."}, 409)
        child["savings_balance"] = money_round(child.get("savings_balance", 0) - amount)
        child["balance"] = money_round(child.get("balance", 0) + amount)
        add_transaction(state, user=child, amount=-amount, tx_type="SAVINGS_WITHDRAWAL", description="Withdrew Family Credits from savings")
        self.send_state(state)

    def pay_interest(self, body: dict):
        state = read_state()
        require_admin(state, body.get("userId"), auth_cookie)
        interest_rate = positive_number(body.get("interestRate") or INTEREST_RATE_DEFAULT, "Interest rate")
        for user in state["users"]:
            if user.get("role") == "USER" and user.get("savings_balance", 0) > 0:
                payout = money_round(user["savings_balance"] * (interest_rate / 100))
                if payout > 0:
                    user["savings_balance"] = money_round(user["savings_balance"] + payout)
                    add_transaction(state, user=user, amount=payout, tx_type="INTEREST_PAYOUT", description=f"{interest_rate}% savings yield payout")
        self.send_state(state)


def main() -> None:
    ensure_database()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), FamilyDAOHandler)
    print(f"Family Credits Python server is running at http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
