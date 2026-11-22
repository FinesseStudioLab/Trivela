"""Data analytics and reporting examples using the Trivela Python SDK.

This demonstrates how data teams can use the Python SDK for analytics workflows.
"""

import csv
from datetime import datetime
from typing import List

from trivela import TrivelaClient
from trivela.models import Campaign


def export_campaigns_to_csv(client: TrivelaClient, filename: str) -> None:
    """Export all campaigns to CSV for analysis."""
    with open(filename, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=[
            'id', 'name', 'slug', 'status', 'rewardPerAction',
            'active', 'featured', 'category', 'createdAt', 'updatedAt'
        ])
        writer.writeheader()
        
        for campaign in client.campaigns.iter_all(page_size=100):
            writer.writerow({
                'id': campaign.id,
                'name': campaign.name,
                'slug': campaign.slug,
                'status': campaign.status,
                'rewardPerAction': campaign.rewardPerAction,
                'active': campaign.active,
                'featured': campaign.featured,
                'category': campaign.category or '',
                'createdAt': campaign.createdAt,
                'updatedAt': campaign.updatedAt,
            })
    
    print(f"Exported campaigns to {filename}")


def analyze_campaign_metrics(client: TrivelaClient) -> dict:
    """Compute aggregate metrics across all campaigns."""
    campaigns: List[Campaign] = []
    
    # Fetch all campaigns
    for campaign in client.campaigns.iter_all():
        campaigns.append(campaign)
    
    # Compute metrics
    total_campaigns = len(campaigns)
    active_campaigns = sum(1 for c in campaigns if c.active)
    featured_campaigns = sum(1 for c in campaigns if c.featured)
    
    rewards = [c.rewardPerAction for c in campaigns]
    avg_reward = sum(rewards) / len(rewards) if rewards else 0
    min_reward = min(rewards) if rewards else 0
    max_reward = max(rewards) if rewards else 0
    
    # Status breakdown
    status_counts = {}
    for c in campaigns:
        status_counts[c.status] = status_counts.get(c.status, 0) + 1
    
    # Category breakdown
    category_counts = {}
    for c in campaigns:
        cat = c.category or 'uncategorized'
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    return {
        'total_campaigns': total_campaigns,
        'active_campaigns': active_campaigns,
        'featured_campaigns': featured_campaigns,
        'avg_reward_per_action': avg_reward,
        'min_reward': min_reward,
        'max_reward': max_reward,
        'status_breakdown': status_counts,
        'category_breakdown': category_counts,
    }


def generate_markdown_report(client: TrivelaClient, output_file: str) -> None:
    """Generate a markdown report of campaign analytics."""
    metrics = analyze_campaign_metrics(client)
    
    report = f"""# Trivela Campaign Analytics Report
Generated: {datetime.now().isoformat()}

## Summary

- **Total Campaigns:** {metrics['total_campaigns']}
- **Active Campaigns:** {metrics['active_campaigns']}
- **Featured Campaigns:** {metrics['featured_campaigns']}

## Reward Distribution

- **Average Reward:** {metrics['avg_reward_per_action']:.2f} points/action
- **Min Reward:** {metrics['min_reward']:.2f}
- **Max Reward:** {metrics['max_reward']:.2f}

## Status Breakdown

"""
    
    for status, count in sorted(metrics['status_breakdown'].items()):
        pct = (count / metrics['total_campaigns']) * 100
        report += f"- **{status}:** {count} ({pct:.1f}%)\n"
    
    report += "\n## Category Breakdown\n\n"
    for category, count in sorted(
        metrics['category_breakdown'].items(),
        key=lambda x: x[1],
        reverse=True
    ):
        pct = (count / metrics['total_campaigns']) * 100
        report += f"- **{category}:** {count} ({pct:.1f}%)\n"
    
    with open(output_file, 'w') as f:
        f.write(report)
    
    print(f"Report saved to {output_file}")


def find_high_value_campaigns(
    client: TrivelaClient,
    min_reward: float = 100.0
) -> List[Campaign]:
    """Find campaigns with rewards above a threshold."""
    high_value = []
    
    for campaign in client.campaigns.iter_all():
        if campaign.rewardPerAction >= min_reward:
            high_value.append(campaign)
    
    return sorted(high_value, key=lambda c: c.rewardPerAction, reverse=True)


def monitor_recent_changes(client: TrivelaClient, hours: int = 24) -> None:
    """Monitor campaigns created or updated in the last N hours."""
    from datetime import datetime, timedelta
    
    cutoff = datetime.now() - timedelta(hours=hours)
    
    print(f"\n📊 Changes in the last {hours} hours:\n")
    
    for campaign in client.campaigns.iter_all():
        updated_at = datetime.fromisoformat(campaign.updatedAt.replace('Z', '+00:00'))
        
        if updated_at > cutoff:
            print(f"✏️  {campaign.name}")
            print(f"   Updated: {campaign.updatedAt}")
            print(f"   Status: {campaign.status}")
            print(f"   Reward: {campaign.rewardPerAction}")
            print()


if __name__ == "__main__":
    # Initialize client
    client = TrivelaClient()  # Uses TRIVELA_API_KEY env var
    
    print("🐍 Trivela Python SDK - Data Analytics Examples\n")
    
    # Export to CSV
    export_campaigns_to_csv(client, "campaigns_export.csv")
    
    # Generate report
    generate_markdown_report(client, "campaign_report.md")
    
    # Find high-value campaigns
    high_value = find_high_value_campaigns(client, min_reward=50.0)
    print(f"\n💎 High-value campaigns (≥50 points):")
    for c in high_value[:10]:
        print(f"  - {c.name}: {c.rewardPerAction} points")
    
    # Monitor recent changes
    monitor_recent_changes(client, hours=24)
    
    print("\n✅ Analytics complete!")
