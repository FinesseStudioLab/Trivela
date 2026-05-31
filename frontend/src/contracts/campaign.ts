import {
  Address,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
  rpc,
  Transaction,
} from '@stellar/stellar-sdk';

export interface ClientOptions {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  allowHttp?: boolean;
  publicKey?: string;
  signTransaction?: (tx: string, opts?: any) => Promise<{ signedTxXdr: string }>;
}

export class AssembledTransaction<T> {
  server: rpc.Server;
  tx: Transaction;
  signed?: Transaction;

  constructor(
    public options: ClientOptions,
    public method: string,
    public args: any[],
    public parseResult: (val: any) => T,
  ) {
    this.server = new rpc.Server(options.rpcUrl, { allowHttp: options.allowHttp });
    const sourcePublicKey = options.publicKey || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHB';
    const contract = new Contract(options.contractId);
    
    const dummyAccount = new rpc.Server.Account(sourcePublicKey, '0');
    this.tx = new TransactionBuilder(dummyAccount, {
      fee: BASE_FEE,
      networkPassphrase: options.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();
  }

  async simulate(): Promise<T> {
    const sim = await this.server.simulateTransaction(this.tx);
    if (sim.error) throw new Error(sim.error);
    if (!sim.result) throw new Error('Simulation returned no result');
    return this.parseResult(sim.result.retval);
  }

  async sign(): Promise<this> {
    if (!this.options.signTransaction) {
      throw new Error('No signTransaction function provided');
    }
    const sim = await this.server.simulateTransaction(this.tx);
    if (sim.error) throw new Error(sim.error);
    const preparedTx = rpc.assembleTransaction(this.tx, sim).build();
    
    const { signedTxXdr } = await this.options.signTransaction(preparedTx.toXDR());
    this.signed = TransactionBuilder.fromXDR(signedTxXdr, this.options.networkPassphrase);
    return this;
  }

  async send(): Promise<T> {
    if (!this.signed) {
      throw new Error('Transaction not signed. Call sign() first.');
    }
    const sendResult = await this.server.sendTransaction(this.signed);
    if (sendResult.status === 'ERROR') {
      throw new Error(sendResult.errorResult?.toString() || 'Transaction submission failed.');
    }

    let getResult;
    for (let i = 0; i < 40; i++) {
      getResult = await this.server.getTransaction(sendResult.hash);
      if (getResult.status !== 'NOT_FOUND') break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (!getResult || getResult.status === 'NOT_FOUND') {
      throw new Error('Transaction submitted but could not be confirmed in time.');
    }

    if (getResult.status === 'FAILED') {
      throw new Error('Transaction failed on-chain.');
    }

    return this.parseResult(getResult.returnValue);
  }

  async signAndSend(): Promise<T> {
    await this.sign();
    return this.send();
  }
}

export class Client {
  options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = options;
  }

  async initialize({ admin }: { admin: string }): Promise<AssembledTransaction<null>> {
    return new AssembledTransaction(
      this.options,
      'initialize',
      [nativeToScVal(Address.fromString(admin))],
      () => null
    );
  }

  async is_participant({ participant }: { participant: string }): Promise<AssembledTransaction<boolean>> {
    return new AssembledTransaction(
      this.options,
      'is_participant',
      [nativeToScVal(Address.fromString(participant))],
      (val) => scValToNative(val)
    );
  }

  async register({ participant, leaf, proof }: { participant: string; leaf: Uint8Array; proof: Uint8Array[] }): Promise<AssembledTransaction<boolean>> {
    return new AssembledTransaction(
      this.options,
      'register',
      [
        nativeToScVal(Address.fromString(participant)),
        nativeToScVal(leaf),
        nativeToScVal(proof)
      ],
      (val) => scValToNative(val)
    );
  }

  async deregister({ participant }: { participant: string }): Promise<AssembledTransaction<boolean>> {
    return new AssembledTransaction(
      this.options,
      'deregister',
      [nativeToScVal(Address.fromString(participant))],
      (val) => scValToNative(val)
    );
  }

  async admin_deregister({ admin, nonce, participant }: { admin: string; nonce: bigint; participant: string }): Promise<AssembledTransaction<boolean>> {
    return new AssembledTransaction(
      this.options,
      'admin_deregister',
      [
        nativeToScVal(Address.fromString(admin)),
        nativeToScVal(nonce, { type: 'u64' }),
        nativeToScVal(Address.fromString(participant))
      ],
      (val) => scValToNative(val)
    );
  }

  async set_active({ admin, nonce, active }: { admin: string; nonce: bigint; active: boolean }): Promise<AssembledTransaction<null>> {
    return new AssembledTransaction(
      this.options,
      'set_active',
      [
        nativeToScVal(Address.fromString(admin)),
        nativeToScVal(nonce, { type: 'u64' }),
        nativeToScVal(active)
      ],
      () => null
    );
  }

  async set_window({ admin, nonce, start, end }: { admin: string; nonce: bigint; start: bigint; end: bigint }): Promise<AssembledTransaction<null>> {
    return new AssembledTransaction(
      this.options,
      'set_window',
      [
        nativeToScVal(Address.fromString(admin)),
        nativeToScVal(nonce, { type: 'u64' }),
        nativeToScVal(start, { type: 'u64' }),
        nativeToScVal(end, { type: 'u64' })
      ],
      () => null
    );
  }

  async set_max_cap({ admin, nonce, max_cap }: { admin: string; nonce: bigint; max_cap: bigint }): Promise<AssembledTransaction<null>> {
    return new AssembledTransaction(
      this.options,
      'set_max_cap',
      [
        nativeToScVal(Address.fromString(admin)),
        nativeToScVal(nonce, { type: 'u64' }),
        nativeToScVal(max_cap, { type: 'u64' })
      ],
      () => null
    );
  }

  async set_merkle_root({ admin, nonce, root }: { admin: string; nonce: bigint; root: Uint8Array }): Promise<AssembledTransaction<null>> {
    return new AssembledTransaction(
      this.options,
      'set_merkle_root',
      [
        nativeToScVal(Address.fromString(admin)),
        nativeToScVal(nonce, { type: 'u64' }),
        nativeToScVal(root)
      ],
      () => null
    );
  }

  async admin_nonce(): Promise<AssembledTransaction<bigint>> {
    return new AssembledTransaction(
      this.options,
      'admin_nonce',
      [],
      (val) => scValToNative(val)
    );
  }

  async is_active(): Promise<AssembledTransaction<boolean>> {
    return new AssembledTransaction(
      this.options,
      'is_active',
      [],
      (val) => scValToNative(val)
    );
  }

  async get_window(): Promise<AssembledTransaction<[bigint, bigint]>> {
    return new AssembledTransaction(
      this.options,
      'get_window',
      [],
      (val) => scValToNative(val)
    );
  }

  async get_max_cap(): Promise<AssembledTransaction<bigint>> {
    return new AssembledTransaction(
      this.options,
      'get_max_cap',
      [],
      (val) => scValToNative(val)
    );
  }

  async get_merkle_root(): Promise<AssembledTransaction<Uint8Array | null>> {
    return new AssembledTransaction(
      this.options,
      'get_merkle_root',
      [],
      (val) => scValToNative(val)
    );
  }

  async get_participant_count(): Promise<AssembledTransaction<bigint>> {
    return new AssembledTransaction(
      this.options,
      'get_participant_count',
      [],
      (val) => scValToNative(val)
    );
  }
}
