import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum SigningErrorType {
  USER_REJECTED = 'user_rejected',
  TIMEOUT = 'timeout',
  NETWORK_MISMATCH = 'network_mismatch',
  ACCOUNT_SWITCHED = 'account_switched',
  WALLET_LOCKED = 'wallet_locked',
  UNKNOWN = 'unknown',
}

export interface SigningError {
  type: SigningErrorType;
  message: string;
  userMessage: string;
  recoverable: boolean;
}

export interface SigningOptions {
  timeout?: number;
  expectedNetwork?: string;
  expectedAccount?: string;
}

@Injectable()
export class WalletSigningService {
  private readonly logger = new Logger(WalletSigningService.name);
  private readonly DEFAULT_TIMEOUT = 120000; // 2 minutes

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validate network before attempting to sign
   */
  async validateNetwork(
    currentNetwork: string,
    expectedNetwork: string,
  ): Promise<SigningError | null> {
    if (currentNetwork !== expectedNetwork) {
      this.logger.warn(
        `Network mismatch: expected ${expectedNetwork}, got ${currentNetwork}`,
      );
      return {
        type: SigningErrorType.NETWORK_MISMATCH,
        message: `Network mismatch: expected ${expectedNetwork}, got ${currentNetwork}`,
        userMessage: `Please switch your wallet to the ${expectedNetwork} network and try again.`,
        recoverable: true,
      };
    }
    return null;
  }

  /**
   * Validate account hasn't switched mid-transaction
   */
  async validateAccount(
    currentAccount: string,
    expectedAccount: string,
  ): Promise<SigningError | null> {
    if (currentAccount !== expectedAccount) {
      this.logger.warn(
        `Account switched: expected ${expectedAccount}, got ${currentAccount}`,
      );
      return {
        type: SigningErrorType.ACCOUNT_SWITCHED,
        message: `Account switched during transaction`,
        userMessage: `Your wallet account has changed. Please switch back to ${expectedAccount} and try again.`,
        recoverable: true,
      };
    }
    return null;
  }

  /**
   * Handle signing errors and provide user-friendly messages
   */
  handleSigningError(error: any): SigningError {
    const errorMessage = error?.message || String(error);

    // User rejected
    if (
      errorMessage.includes('rejected') ||
      errorMessage.includes('denied') ||
      errorMessage.includes('cancelled')
    ) {
      return {
        type: SigningErrorType.USER_REJECTED,
        message: errorMessage,
        userMessage: 'Transaction was cancelled. You can try again when ready.',
        recoverable: true,
      };
    }

    // Timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return {
        type: SigningErrorType.TIMEOUT,
        message: errorMessage,
        userMessage:
          'Transaction signing timed out. Please check your wallet and try again.',
        recoverable: true,
      };
    }

    // Wallet locked
    if (errorMessage.includes('locked') || errorMessage.includes('unlock')) {
      return {
        type: SigningErrorType.WALLET_LOCKED,
        message: errorMessage,
        userMessage: 'Your wallet is locked. Please unlock it and try again.',
        recoverable: true,
      };
    }

    // Network mismatch
    if (errorMessage.includes('network')) {
      return {
        type: SigningErrorType.NETWORK_MISMATCH,
        message: errorMessage,
        userMessage:
          'Network mismatch detected. Please check your wallet network settings.',
        recoverable: true,
      };
    }

    // Unknown error
    this.logger.error(`Unknown signing error: ${errorMessage}`);
    return {
      type: SigningErrorType.UNKNOWN,
      message: errorMessage,
      userMessage:
        'An unexpected error occurred while signing. Please try again or contact support.',
      recoverable: false,
    };
  }

  /**
   * Wrap signing call with timeout and validation
   */
  async signWithTimeout<T>(
    signingFn: () => Promise<T>,
    options: SigningOptions = {},
  ): Promise<{ success: boolean; data?: T; error?: SigningError }> {
    const timeout = options.timeout || this.DEFAULT_TIMEOUT;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Transaction signing timed out')),
          timeout,
        ),
      );

      const result = await Promise.race([signingFn(), timeoutPromise]);

      return { success: true, data: result };
    } catch (error) {
      const signingError = this.handleSigningError(error);
      return { success: false, error: signingError };
    }
  }

  /**
   * Pre-sign validation checklist
   */
  async preSignValidation(
    currentNetwork: string,
    currentAccount: string,
    expectedNetwork: string,
    expectedAccount: string,
  ): Promise<SigningError | null> {
    // Check network
    const networkError = await this.validateNetwork(
      currentNetwork,
      expectedNetwork,
    );
    if (networkError) return networkError;

    // Check account
    const accountError = await this.validateAccount(
      currentAccount,
      expectedAccount,
    );
    if (accountError) return accountError;

    return null;
  }
}
