import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AssetMetadata {
  code: string;
  issuer: string;
  name?: string;
  desc?: string;
  image?: string;
  domain?: string;
  orgName?: string;
  decimals?: number;
}

export interface TrustlineStatus {
  exists: boolean;
  balance?: string;
  limit?: string;
  asset: AssetMetadata;
}

@Injectable()
export class AssetMetadataService {
  private readonly logger = new Logger(AssetMetadataService.name);
  private metadataCache = new Map<string, AssetMetadata>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Fetch asset metadata from SEP-41 or classic Stellar TOML
   */
  async fetchAssetMetadata(
    assetCode: string,
    assetIssuer: string,
  ): Promise<AssetMetadata> {
    const cacheKey = `${assetCode}:${assetIssuer}`;
    
    // Check cache
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey)!;
    }

    try {
      // Try SEP-41 first (newer standard)
      const metadata = await this.fetchSEP41Metadata(assetCode, assetIssuer);
      
      // Cache result
      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch metadata for ${assetCode}:${assetIssuer}: ${error.message}`,
      );
      
      // Return basic metadata
      const basicMetadata: AssetMetadata = {
        code: assetCode,
        issuer: assetIssuer,
      };
      this.metadataCache.set(cacheKey, basicMetadata);
      return basicMetadata;
    }
  }

  /**
   * Fetch SEP-41 metadata
   */
  private async fetchSEP41Metadata(
    assetCode: string,
    assetIssuer: string,
  ): Promise<AssetMetadata> {
    // SEP-41: Query Horizon for asset metadata
    const horizonUrl = this.configService.get('stellar.horizonUrl');
    const response = await fetch(
      `${horizonUrl}/accounts/${assetIssuer}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch account info: ${response.statusText}`);
    }

    const accountData = await response.json();
    const homeDomain = accountData.home_domain;

    if (!homeDomain) {
      return {
        code: assetCode,
        issuer: assetIssuer,
      };
    }

    // Fetch TOML file
    const tomlResponse = await fetch(`https://${homeDomain}/.well-known/stellar.toml`);
    if (!tomlResponse.ok) {
      return {
        code: assetCode,
        issuer: assetIssuer,
        domain: homeDomain,
      };
    }

    const tomlText = await tomlResponse.text();
    const metadata = this.parseTOMLForAsset(tomlText, assetCode);

    return {
      code: assetCode,
      issuer: assetIssuer,
      domain: homeDomain,
      ...metadata,
    };
  }

  /**
   * Parse TOML file for asset information
   */
  private parseTOMLForAsset(
    toml: string,
    assetCode: string,
  ): Partial<AssetMetadata> {
    const lines = toml.split('\n');
    let inAssetSection = false;
    const metadata: Partial<AssetMetadata> = {};

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if we're entering the correct asset section
      if (trimmed.startsWith('[[CURRENCIES]]')) {
        inAssetSection = true;
        continue;
      }

      if (inAssetSection) {
        // Check if this is the asset we're looking for
        if (trimmed.startsWith('code')) {
          const code = trimmed.split('=')[1]?.trim().replace(/['"]/g, '');
          if (code !== assetCode) {
            inAssetSection = false;
            continue;
          }
        }

        // Parse metadata fields
        if (trimmed.startsWith('name')) {
          metadata.name = trimmed.split('=')[1]?.trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('desc')) {
          metadata.desc = trimmed.split('=')[1]?.trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('image')) {
          metadata.image = trimmed.split('=')[1]?.trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('org_name')) {
          metadata.orgName = trimmed.split('=')[1]?.trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('display_decimals')) {
          metadata.decimals = parseInt(
            trimmed.split('=')[1]?.trim() || '7',
            10,
          );
        }

        // Exit section if we hit next asset
        if (trimmed.startsWith('[[')) {
          break;
        }
      }
    }

    return metadata;
  }

  /**
   * Check if account has trustline for asset
   */
  async checkTrustline(
    accountId: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<TrustlineStatus> {
    const horizonUrl = this.configService.get('stellar.horizonUrl');
    
    try {
      const response = await fetch(`${horizonUrl}/accounts/${accountId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch account: ${response.statusText}`);
      }

      const account = await response.json();
      const trustline = account.balances.find(
        (b: any) =>
          b.asset_code === assetCode && b.asset_issuer === assetIssuer,
      );

      const metadata = await this.fetchAssetMetadata(assetCode, assetIssuer);

      if (trustline) {
        return {
          exists: true,
          balance: trustline.balance,
          limit: trustline.limit,
          asset: metadata,
        };
      }

      return {
        exists: false,
        asset: metadata,
      };
    } catch (error) {
      this.logger.error(`Error checking trustline: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build trustline operation for asset
   */
  buildTrustlineOperation(assetCode: string, assetIssuer: string, limit?: string) {
    return {
      type: 'changeTrust',
      asset: {
        code: assetCode,
        issuer: assetIssuer,
      },
      limit: limit || '922337203685.4775807', // Max limit
    };
  }

  /**
   * Guide user through trustline setup
   */
  async guideTrustlineSetup(
    accountId: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<{
    needsTrustline: boolean;
    metadata: AssetMetadata;
    operation?: any;
  }> {
    const trustlineStatus = await this.checkTrustline(
      accountId,
      assetCode,
      assetIssuer,
    );

    if (trustlineStatus.exists) {
      return {
        needsTrustline: false,
        metadata: trustlineStatus.asset,
      };
    }

    // User needs to establish trustline
    const operation = this.buildTrustlineOperation(assetCode, assetIssuer);

    return {
      needsTrustline: true,
      metadata: trustlineStatus.asset,
      operation,
    };
  }
}
