from dotenv import load_dotenv
import os

load_dotenv()

class LLMConfig:
    base_url = os.getenv("LLM_BASE_URL")
    api_key  = os.getenv("LLM_API_KEY")
    model    = os.getenv("LLM_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
    temperature = 0.1
    max_tokens  = 2048

class DBConfig:
    host     = os.getenv("PG_HOST", "localhost")
    port     = int(os.getenv("PG_PORT", 5432))
    user     = os.getenv("PG_USER", "postgres")
    password = os.getenv("PG_PASSWORD")
    database = os.getenv("PG_DATABASE", "waggle_dev")

    @property
    def dsn(self) -> str:
        return (
            f"postgresql://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.database}"
        )
