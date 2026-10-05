from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserRead, UserUpdate

router = APIRouter()


@router.get("/profile", response_model=UserRead)
async def get_profile(user: User = Depends(get_current_user)):
    return user


@router.put("/profile", response_model=UserRead)
async def update_profile(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.locale is not None:
        user.locale = data.locale
    await db.commit()
    await db.refresh(user)
    return user
