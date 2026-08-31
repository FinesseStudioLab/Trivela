"""Tests for CampaignsResource."""

import json
from unittest.mock import MagicMock, patch

import pytest

from trivela import TrivelaClient
from trivela.models import Campaign, CampaignCreate, CampaignListResponse, CampaignUpdate


CAMPAIGN_FIXTURE = {
    "id": "c1",
    "name": "Test Campaign",
    "slug": "test-campaign",
    "description": "A test campaign",
    "active": True,
    "featured": False,
    "rewardPerAction": 10.0,
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "tags": ["stellar"],
}

PAGINATION_FIXTURE = {
    "total": 1,
    "count": 1,
    "page": 1,
    "limit": 20,
    "offset": 0,
    "totalPages": 1,
    "hasPreviousPage": False,
    "hasNextPage": False,
}

LIST_FIXTURE = {"data": [CAMPAIGN_FIXTURE], "pagination": PAGINATION_FIXTURE}


def _make_client(mock_get_return=None, mock_post_return=None):
    client = TrivelaClient(api_key="tvl_test")
    client._http.get = MagicMock(return_value=mock_get_return)
    client._http.post = MagicMock(return_value=mock_post_return)
    client._http.put = MagicMock(return_value=mock_post_return)
    client._http.delete = MagicMock(return_value=None)
    return client


def test_campaigns_list_returns_typed_response():
    client = _make_client(mock_get_return=LIST_FIXTURE)
    result = client.campaigns.list()
    assert isinstance(result, CampaignListResponse)
    assert len(result.data) == 1
    assert result.data[0].name == "Test Campaign"
    assert result.pagination.total == 1


def test_campaigns_get_returns_campaign():
    client = _make_client(mock_get_return=CAMPAIGN_FIXTURE)
    c = client.campaigns.get("c1")
    assert isinstance(c, Campaign)
    assert c.id == "c1"
    assert c.status == "active"
    assert c.tags == ["stellar"]


def test_campaigns_get_by_slug():
    client = _make_client(mock_get_return=CAMPAIGN_FIXTURE)
    c = client.campaigns.get_by_slug("test-campaign")
    assert c.slug == "test-campaign"
    client._http.get.assert_called_once_with("/api/v1/campaigns/by-slug/test-campaign")


def test_campaigns_create():
    client = _make_client(mock_post_return=CAMPAIGN_FIXTURE)
    payload = CampaignCreate(name="Test Campaign", rewardPerAction=10.0)
    c = client.campaigns.create(payload)
    assert isinstance(c, Campaign)
    client._http.post.assert_called_once()
    call_kwargs = client._http.post.call_args
    assert call_kwargs.kwargs["json"]["name"] == "Test Campaign"


def test_campaigns_update():
    updated = {**CAMPAIGN_FIXTURE, "name": "Updated"}
    client = _make_client(mock_post_return=updated)
    client._http.put = MagicMock(return_value=updated)
    c = client.campaigns.update("c1", CampaignUpdate(name="Updated"))
    assert c.name == "Updated"


def test_campaigns_delete():
    client = _make_client()
    client.campaigns.delete("c1")
    client._http.delete.assert_called_once_with("/api/v1/campaigns/c1")


def test_campaigns_iter_all_single_page():
    client = _make_client(mock_get_return=LIST_FIXTURE)
    results = list(client.campaigns.iter_all())
    assert len(results) == 1
    assert results[0].id == "c1"
