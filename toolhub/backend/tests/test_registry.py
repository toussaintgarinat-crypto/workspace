"""Tests du registry auto-discovery."""
from __future__ import annotations

import pytest
from registry.base import BaseToolHandler, ToolAction
from registry.communication.gmail import GmailHandler
from registry.development.github import GitHubHandler
from registry.mcp.mcp_handler import GenericMCPHandler


def test_gmail_handler_class_attributes():
    assert GmailHandler.CATEGORY == "communication"
    assert GmailHandler.NAME == "gmail"
    assert GmailHandler.INTEGRATION_TYPE == "api"
    assert "access_token" in GmailHandler.CONFIG_SCHEMA["properties"]


def test_gmail_handler_list_actions():
    handler = GmailHandler()
    actions = handler.list_actions()
    names = [a.name for a in actions]
    assert "send_email" in names
    assert "list_emails" in names


def test_gmail_handler_send_email_cache_ttl_zero():
    handler = GmailHandler()
    send_action = next(a for a in handler.list_actions() if a.name == "send_email")
    assert send_action.cache_ttl == 0


def test_github_handler_class_attributes():
    assert GitHubHandler.CATEGORY == "development"
    assert GitHubHandler.NAME == "github"
    assert GitHubHandler.CACHE_TTL == 120


def test_github_to_mcp_tools():
    handler = GitHubHandler()
    mcp_tools = handler.to_mcp_tools()
    names = [t["name"] for t in mcp_tools]
    assert "github_create_issue" in names
    assert "github_list_repos" in names


def test_mcp_handler_attributes():
    handler = GenericMCPHandler()
    assert handler.INTEGRATION_TYPE == "mcp"
    assert "url" in handler.CONFIG_SCHEMA["properties"]


def test_all_handlers_are_concrete():
    from registry.loader import _discover_handler_classes
    classes = _discover_handler_classes()
    assert len(classes) >= 2  # au moins gmail et github
    for cls in classes:
        assert not getattr(cls, "__abstractmethods__", None), f"{cls} is abstract"
