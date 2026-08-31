# Demo Video & Interactive Demo Guide

## Overview

This guide provides instructions for creating and maintaining Trivela's demo video and interactive
demonstration for evaluators, grant reviewers, and potential users.

## Demo Video

### Purpose

A polished 3-5 minute walkthrough demonstrating Trivela's core value proposition and key features.

### Target Audience

- Grant reviewers (Stellar Development Foundation, ecosystem grants)
- Potential integrators (projects considering Trivela)
- New users (onboarding and feature discovery)
- Conference/pitch presentations

### Video Structure

**Duration**: 3-5 minutes (strict)

#### 1. Opening (15 seconds)

- Trivela logo + tagline
- "The Stellar-native campaign rewards platform"
- Quick visual hook showing the platform in action

#### 2. Problem Statement (30 seconds)

- Traditional loyalty programs: centralized, opaque, locked-in
- Web3 campaigns: complex, poor UX, no standardization
- Need: Easy, transparent, blockchain-native rewards

#### 3. Solution Overview (45 seconds)

- Trivela: Soroban-powered campaigns with on-chain points
- Key differentiators:
  - True asset ownership (SEP-41 compliant)
  - Transparent rules (smart contract logic)
  - Instant claiming (no custody delays)
  - Composable rewards (DeFi integration)

#### 4. Feature Walkthrough (2-3 minutes)

**Campaign Creation** (30 seconds):

- Show campaign creation form
- Configure rewards, caps, merkle allowlists
- Deploy to Soroban in one click
- Highlight: "No coding required"

**User Participation** (45 seconds):

- User discovers campaign
- Connects Freighter wallet
- Completes action (social media, on-chain activity)
- Points credited instantly
- Show transaction on explorer

**Points Management** (30 seconds):

- View balance dashboard
- Check vesting schedules
- Browse reward tiers
- Referral links

**Claiming Rewards** (45 seconds):

- Select claim amount
- Sign transaction
- Receive tokens to wallet
- Show balance update

**Optional: Admin Features** (30 seconds):

- Analytics dashboard
- Pause/unpause for emergencies
- Rate limiting configuration
- Snapshot for airdrops

#### 5. Technical Highlights (30 seconds)

- Built on Stellar/Soroban
- Open source (Apache 2.0)
- Audited smart contracts
- Production-ready

#### 6. Call to Action (15 seconds)

- "Try the live demo: demo.trivela.com"
- "View docs: docs.trivela.com"
- "GitHub: github.com/FinesseStudioLab/Trivela"
- Contact information

### Production Guidelines

**Technical Specs**:

- Resolution: 1920x1080 (1080p)
- Frame rate: 30 fps
- Format: MP4 (H.264 codec)
- Aspect ratio: 16:9
- File size: < 100MB for easy sharing

**Visual Style**:

- Clean, professional interface recordings
- Smooth cursor movements (no jittering)
- Highlight clicks with visual indicator
- Use zooms for small UI elements
- Consistent pacing (not too fast/slow)

**Audio**:

- Clear voiceover (professional microphone)
- Background music (subtle, non-distracting)
- Avoid copyrighted music (use royalty-free)
- Mix: -16 LUFS for comfortable listening

**Editing**:

- Smooth transitions between sections
- Text overlays for key points
- Callout boxes for important features
- B-roll footage when switching topics
- End screen with CTAs

### Recording Tools

**Screen Recording**:

- OBS Studio (free, cross-platform)
- Loom (quick recordings, hosted)
- Camtasia (professional editing)
- QuickTime (Mac, simple recordings)

**Voiceover**:

- Audacity (free audio editor)
- Adobe Audition (professional)
- Descript (AI-powered transcription + editing)

**Editing**:

- DaVinci Resolve (free, professional)
- Adobe Premiere Pro
- Final Cut Pro (Mac)
- iMovie (Mac, simple)

### Script Template

See `docs/DEMO_SCRIPT.md` for full voiceover script.

### Hosting

**Primary**: YouTube

- Upload to Trivela official channel
- Enable captions (auto-generate + manual review)
- Add chapters/timestamps in description
- Pin to channel homepage

**Secondary**:

- Vimeo (backup)
- GitHub README (embedded)
- Documentation site
- Twitter/X (short clips)

**Embedded Locations**:

- GitHub README.md (top section)
- docs.trivela.com homepage
- Grant applications
- Pitch decks

---

## Interactive Demo

### Purpose

A live, hosted demo environment where users can experience Trivela without setup.

### Requirements

**Frontend**:

- Hosted at: `https://demo.trivela.com`
- Pre-seeded with sample campaigns
- Connected to Stellar testnet
- Mock wallet for easy testing (no Freighter required)

**Backend**:

- Testnet API endpoint
- Pre-created demo account
- Sample data: 5+ campaigns, 20+ users
- Auto-reset daily (to prevent abuse)

**Contracts**:

- Deployed to testnet
- Pre-funded with test tokens
- Demo admin key (for showcasing features)

### Demo Environment Setup

#### 1. Deploy to Subdomain

```bash
# Build demo-specific frontend
cd frontend
VITE_NETWORK=testnet VITE_DEMO_MODE=true npm run build

# Deploy to demo.trivela.com
aws s3 sync dist/ s3://trivela-demo-frontend/
aws cloudfront create-invalidation --distribution-id E_DEMO --paths "/*"
```

#### 2. Seed Sample Data

```bash
# Run seeding script
node scripts/seed-demo-data.js

# Creates:
# - 5 campaigns (varied types)
# - 20 users with balances
# - Recent activity logs
# - Sample referral chains
```

#### 3. Configure Demo Mode

**frontend/.env.demo**:

```bash
VITE_API_URL=https://demo-api.trivela.com
VITE_NETWORK=testnet
VITE_DEMO_MODE=true
VITE_MOCK_WALLET=true
VITE_DEMO_ACCOUNT=GDEMO...
```

**Features enabled in demo mode**:

- Mock wallet (no Freighter needed)
- Auto-login as demo user
- Sample campaigns always visible
- Tooltips explaining features
- "Try it yourself" CTAs

#### 4. Add Demo Banner

```tsx
// src/components/DemoModeBanner.tsx
export function DemoModeBanner() {
  return (
    <div className="demo-banner">
      <p>
        🎮 You're in demo mode on Stellar testnet.
        <a href="/docs/getting-started">Start your own campaign →</a>
      </p>
    </div>
  );
}
```

### Demo User Guide

Create `/demo-guide` route with interactive tutorial:

**Step 1**: "Welcome to Trivela"

- Overview of the platform
- What you'll learn in the demo

**Step 2**: "Browse Campaigns"

- Explore sample campaigns
- View campaign details
- Highlight: Transparent rules, on-chain

**Step 3**: "Participate"

- Click "Join Campaign"
- Complete sample action
- Earn points instantly

**Step 4**: "View Your Balance"

- Check points dashboard
- See vesting schedules
- View transaction history

**Step 5**: "Claim Rewards"

- Select amount to claim
- Sign transaction (mock)
- Receive tokens

**Step 6**: "Try Features"

- Referral links
- Admin dashboard (if demo admin)
- Analytics

**Step 7**: "Next Steps"

- Link to docs
- Link to GitHub
- Contact form

### Monitoring & Maintenance

**Daily**:

- Auto-reset demo data (00:00 UTC)
- Check uptime (demo.trivela.com)
- Monitor error logs

**Weekly**:

- Review demo usage analytics
- Check for stuck transactions
- Update sample campaigns

**Monthly**:

- Refresh demo video if features changed
- Update tutorial copy
- Review user feedback

### Analytics

Track demo engagement:

```javascript
// Google Analytics events
gtag('event', 'demo_start', { step: 1 });
gtag('event', 'demo_complete', { duration_seconds: 120 });
gtag('event', 'demo_cta_click', { cta: 'docs' });
```

**Key Metrics**:

- Demo starts
- Completion rate
- Time to complete
- Drop-off points
- CTA click rates
- Conversion to real campaigns

---

## Grant Application Assets

### Required Materials

For Stellar Development Foundation (SDF) and other grants:

1. **Demo Video** (YouTube link)
2. **Interactive Demo** (https://demo.trivela.com)
3. **GitHub Repository** (public, well-documented)
4. **Technical Documentation** (architecture, API, contracts)
5. **Roadmap** (future features, milestones)
6. **Team Bios** (background, relevant experience)

### Pitch Deck Template

See `docs/PITCH_DECK.md` for slide templates.

**Suggested Structure** (10-15 slides):

1. Problem
2. Solution
3. Demo (video embed or live)
4. Technology (Stellar/Soroban)
5. Features
6. Use Cases
7. Traction
8. Roadmap
9. Team
10. Ask

### One-Pager

Single-page PDF summarizing Trivela:

- Value proposition
- Key features
- Technical architecture diagram
- Demo link + QR code
- Contact information

---

## Video Update Schedule

**Trigger for Update**:

- Major feature launch
- UI redesign
- New use case added
- Grant/conference deadline

**Process**:

1. Update script with new features
2. Record new footage
3. Edit and review
4. Upload and replace old video
5. Update embedded links
6. Announce update on social media

---

## Interactive Demo Feedback

Collect feedback via embedded form:

**Questions**:

1. How clear was the demo? (1-5 stars)
2. Did you understand Trivela's value? (Yes/No)
3. What feature interested you most? (Multiple choice)
4. What would make you use Trivela? (Open text)
5. Any confusion or blockers? (Open text)

**Feedback Loop**:

- Review weekly
- Identify common pain points
- Iterate on demo flow
- Update tooltips/copy

---

## Resources

### Stock Assets

- **Music**: [Epidemic Sound](https://www.epidemicsound.com/),
  [Audio Library](https://www.audiolibrary.com.co/)
- **Icons**: [Heroicons](https://heroicons.com/), [Lucide](https://lucide.dev/)
- **Footage**: [Unsplash](https://unsplash.com/), [Pexels](https://www.pexels.com/)

### Tutorials

- [OBS Studio Guide](https://obsproject.com/wiki/)
- [DaVinci Resolve Tutorial](https://www.blackmagicdesign.com/products/davinciresolve/training)
- [Video SEO Best Practices](https://backlinko.com/video-seo)

### Inspiration

- [Stripe Demo](https://stripe.com/demo)
- [Vercel Demo](https://vercel.com/templates)
- [Supabase Demo](https://supabase.com/docs/guides/getting-started/tutorials)

---

## Maintenance

- **Owner**: Marketing/DevRel team
- **Video review**: Quarterly or on major releases
- **Demo environment**: Check daily, update weekly
- **Last updated**: 2024-01-15
- **Next review**: 2024-04-15
