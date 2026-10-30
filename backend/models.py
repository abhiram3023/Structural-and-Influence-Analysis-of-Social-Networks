"""PostgreSQL tables: users, networks, nodes, edges, analysis_results, activity."""
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    networks: Mapped[list["Network"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Network(Base):
    __tablename__ = "networks"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    owner: Mapped[User] = relationship(back_populates="networks")
    nodes: Mapped[list["Node"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    edges: Mapped[list["Edge"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    analyses: Mapped[list["AnalysisResult"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class Node(Base):
    __tablename__ = "nodes"
    __table_args__ = (UniqueConstraint("network_id", "label"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(255))
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)


class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = (UniqueConstraint("network_id", "source_id", "target_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id", ondelete="CASCADE"), index=True)
    # undirected: always stored with source_id < target_id
    source_id: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    target_id: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    weight: Mapped[float] = mapped_column(Float, default=1.0)


class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    summary: Mapped[dict] = mapped_column(JSON)
    metrics: Mapped[dict] = mapped_column(JSON)       # node_id -> {degree, betweenness, ...}
    communities: Mapped[dict] = mapped_column(JSON)   # algorithms, partition, profiles, bridges
    comparison: Mapped[dict] = mapped_column(JSON)    # correlation, overlap
    robustness: Mapped[dict] = mapped_column(JSON)
    insights: Mapped[list] = mapped_column(JSON)


class Activity(Base):
    __tablename__ = "activity"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    network_id: Mapped[int | None] = mapped_column(ForeignKey("networks.id", ondelete="SET NULL"), nullable=True)
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
