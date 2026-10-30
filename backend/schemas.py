from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    name: str = ""

    @field_validator("email")
    @classmethod
    def valid_email(cls, v):
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(ORM):
    id: int
    email: str
    name: str
    preferences: dict
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = None
    preferences: dict | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class NetworkIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class NetworkUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None


class NetworkOut(ORM):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    node_count: int = 0
    edge_count: int = 0


class NodeIn(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    attributes: dict = {}


class NodeUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=255)
    attributes: dict | None = None


class NodeOut(ORM):
    id: int
    label: str
    attributes: dict


class EdgeIn(BaseModel):
    source_id: int
    target_id: int
    weight: float = Field(1.0, gt=0)


class EdgeOut(ORM):
    id: int
    source_id: int
    target_id: int
    weight: float


class GraphOut(BaseModel):
    nodes: list[NodeOut]
    edges: list[EdgeOut]


class SampleIn(BaseModel):
    dataset: str


class RobustnessIn(BaseModel):
    strategies: list[str] = ["random", "degree", "betweenness", "pagerank"]
    adaptive: bool = False
