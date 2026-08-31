export const version = 15;
export const description = 'Add organizations, team members, and invitations';

export function up(db) {
  db.exec(`
    -- Organizations table
    CREATE TABLE IF NOT EXISTS organizations (
      id           TEXT    PRIMARY KEY,
      name         TEXT    NOT NULL,
      slug         TEXT    NOT NULL UNIQUE,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

    -- Team members table (links users to organizations with roles)
    CREATE TABLE IF NOT EXISTS organization_members (
      id              TEXT    PRIMARY KEY,
      organization_id TEXT    NOT NULL,
      user_email      TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
      joined_at       TEXT    NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      UNIQUE(organization_id, user_email)
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_organization_id ON organization_members(organization_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_user_email ON organization_members(user_email);
    CREATE INDEX IF NOT EXISTS idx_org_members_role ON organization_members(role);

    -- Team invitations table
    CREATE TABLE IF NOT EXISTS organization_invitations (
      id              TEXT    PRIMARY KEY,
      organization_id TEXT    NOT NULL,
      email           TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
      token           TEXT    NOT NULL UNIQUE,
      invited_by      TEXT    NOT NULL,
      invited_at      TEXT    NOT NULL,
      expires_at      TEXT    NOT NULL,
      accepted_at     TEXT,
      revoked_at      TEXT,
      status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'revoked', 'expired')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_org_invitations_organization_id ON organization_invitations(organization_id);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON organization_invitations(token);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON organization_invitations(status);
  `);
}
