"""Small helper to verify environment variables are configured safely.

Run:
    python src/check_env.py

It loads `.env` and reports whether OPENAI_API_KEY and OPENAI_MODEL are set.
The API key is NEVER printed in full — only its first 8 characters followed by
"..." so you can confirm it loaded without exposing the secret.
"""

import os

from dotenv import load_dotenv

# Values that mean "not filled in yet".
API_KEY_PLACEHOLDER = "your_api_key_here"
MODEL_PLACEHOLDER = "your_model_name_here"


def main() -> None:
    # Load values from qa-agents/.env into the environment.
    load_dotenv()

    api_key = os.environ.get("OPENAI_API_KEY")
    model = os.environ.get("OPENAI_MODEL")

    # Report the API key safely (never the full value).
    if not api_key or api_key == API_KEY_PLACEHOLDER:
        print("OPENAI_API_KEY: missing or placeholder")
    else:
        print(f"OPENAI_API_KEY: {api_key[:8]}...")

    # Report the model name (safe to show fully).
    if not model or model == MODEL_PLACEHOLDER:
        print("OPENAI_MODEL: missing")
    else:
        print(f"OPENAI_MODEL: {model}")


if __name__ == "__main__":
    main()
