from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut, UserUpdate
from ..services import auth_service as auth
from ..services.network_service import log

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    user = auth.register(db, body.email, body.password, body.name)
    log(db, user.id, "Account created")
    db.commit()
    return {"access_token": auth.create_token(user.id), "user": user}


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = auth.authenticate(db, body.email, body.password)
    return {"access_token": auth.create_token(user.id), "user": user}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(auth.current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    if body.name is not None:
        user.name = body.name
    if body.preferences is not None:
        user.preferences = {**(user.preferences or {}), **body.preferences}
    db.add(user)
    db.commit()
    return user
