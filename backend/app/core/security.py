from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union
import bcrypt
import jwt
from app.core.config import settings


def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(
    subject: Union[str, Any],
    org_id: Optional[str] = None,
    role: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "iat": datetime.now(timezone.utc),
    }
    if org_id:
        to_encode["org_id"] = str(org_id)
    if role:
        to_encode["role"] = str(role)

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_password_reset_token(
    email: str,
    user_id: str,
    password_hash_sig: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # 15 minutes validity for reset tokens
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)

    to_encode = {
        "exp": expire,
        "sub": str(user_id),
        "email": str(email),
        "type": "password_reset",
        "sig": password_hash_sig,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)



def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except jwt.PyJWTError:
        return {}
