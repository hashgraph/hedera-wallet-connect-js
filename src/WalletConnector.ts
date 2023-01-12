import {Query, Signer, SignerSignature, Transaction} from "@hashgraph/sdk";
import {formatJsonRpcError, formatJsonRpcResult} from "@json-rpc-tools/utils";
import {SignClient} from "@walletconnect/sign-client";
import {EngineTypes, PairingTypes, SessionTypes, SignClientTypes} from "@walletconnect/types";
import {getSdkError} from "@walletconnect/utils";
import {Connector} from "./Connector.js";
import ApproveParams = EngineTypes.ApproveParams;
import RejectParams = EngineTypes.RejectParams;

type ProposalCallback = (proposal: SignClientTypes.EventArguments["session_proposal"]) => Promise<void>;

export class WalletConnector extends Connector {
  public onProposalReceive: ProposalCallback;

  constructor(metadata?: SignClientTypes.Metadata) {
    super(metadata);
  }

  public async init(onProposalReceive: ProposalCallback) {
    this.onProposalReceive = onProposalReceive;
    try {
      this.isInitializing = true;
      this.client = await SignClient.init({
        relayUrl: "wss://relay.walletconnect.com",
        projectId: "ce06497abf4102004138a10edd29c921",
        metadata: this.dAppMetadata
      });
      this.subscribeToEvents();
      await this.checkPersistedState();
    } finally {
      this.isInitializing = false;
    }
  }

  public async pair(uri: string): Promise<PairingTypes.Struct> {
    if (!this.initialized) {
      throw new Error("WC not initialized");
    }

    return this.client.pair({uri});
  }

  private subscribeToEvents() {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }
    this.client.on("session_proposal", this.onSessionProposal.bind(this));
    this.client.on("session_request", this.onSessionRequest.bind(this));
    this.client.on("session_delete", this.destroySession.bind(this));
    this.client.on("session_expire", this.destroySession.bind(this));
  }

  private async destroySession(event: SignClientTypes.EventArguments["session_expire"] | SignClientTypes.EventArguments["session_delete"]) {
    this.session = null;
  }

  private async onSessionRequest(requestEvent: SignClientTypes.EventArguments["session_request"]) {
    const {id, topic, params} = requestEvent;
    const {request, chainId} = params;
    const accountId = request.params.accountId;
    const signer = this.signers.find(s => s.getAccountId().toString() === accountId);

    if (!signer) {
      const formattedResult = formatJsonRpcError(id, "Signer is not available anymore");
      await this.client.respond({
        topic,
        response: formattedResult
      });
      return;
    }

    try {
      let formattedResult;
      switch (request.method) {
        case "getLedgerId": {
          const result = await signer.getLedgerId();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "getAccountId": {
          const result = await signer.getAccountId();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "getAccountKey": {
          const result = await signer.getAccountKey();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "getNetwork": {
          const result = await signer.getNetwork();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "getMirrorNetwork": {
          const result = await signer.getMirrorNetwork();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "sign": {
          const signatures: SignerSignature[] = await signer.sign(request.params.messages)
          formattedResult = formatJsonRpcResult(id, signatures);
          break;
        }
        case "getAccountBalance": {
          const result = await signer.getAccountBalance();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "getAccountInfo": {
          const result = await signer.getAccountInfo();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "getAccountRecords": {
          const result = await signer.getAccountRecords();
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        case "signTransaction": {
          const transaction = await Transaction.fromBytes(Buffer.from(request.params.executable, "base64"))
          const signedTransaction = await signer.signTransaction(transaction);
          const encodedTransaction = Buffer.from(signedTransaction.toBytes()).toString("base64");
          formattedResult = formatJsonRpcResult(id, encodedTransaction);
          break;
        }
        case "checkTransaction": {
          const transaction = await Transaction.fromBytes(Buffer.from(request.params.executable, "base64"))
          const checkedTransaction = await signer.checkTransaction(transaction);
          const encodedTransaction = Buffer.from(checkedTransaction.toBytes()).toString("base64");
          formattedResult = formatJsonRpcResult(id, encodedTransaction);
          break;
        }
        case "populateTransaction": {
          const transaction = await Transaction.fromBytes(Buffer.from(request.params.executable, "base64"))
          const populatedTransaction = await signer.populateTransaction(transaction);
          const encodedTransaction = Buffer.from(populatedTransaction.toBytes()).toString("base64");
          formattedResult = formatJsonRpcResult(id, encodedTransaction);
          break;
        }
        case "call": {
          const encodedExecutable = request.params.executable;
          const isTransaction = request.params.isTransaction;
          const bytes = Buffer.from(encodedExecutable, "base64");
          let result;
          if (isTransaction) {
            const transaction = Transaction.fromBytes(bytes);
            result = (await signer.call(transaction)).toJSON();
          } else {
            const query = Query.fromBytes(bytes);
            const queryResult: any = await signer.call(query);
            result = Buffer.from(queryResult.toBytes()).toString("base64");
          }
          formattedResult = formatJsonRpcResult(id, result);
          break;
        }
        default:
          throw new Error(getSdkError("INVALID_METHOD").message);
      }
      await this.client.respond({
        topic,
        response: formattedResult
      });
    } catch (e: any) {
      const formattedResult = formatJsonRpcError(id, e);
      await this.client.respond({
        topic,
        response: formattedResult
      });
    }
  }

  private async onSessionProposal(proposal: SignClientTypes.EventArguments["session_proposal"]): Promise<void> {
    await this.onProposalReceive(proposal)
  }

  public async approveSessionProposal<T extends Signer>(data: ApproveParams, signers: T[]): Promise<SessionTypes.Struct> {
    const accountConfigs = Object.values(data.namespaces).flatMap(ns => ns.accounts.map(acc => {
      const [network, chainId, accountId] = acc.split(":");
      return {network, chainId, accountId};
    }));
    const signerAccounts = signers.map(signer => signer.getAccountId().toString());
    const hasValidSigners = accountConfigs.every(config => signerAccounts.includes(config.accountId));

    if (!hasValidSigners) {
      throw new Error("Required signers are missing");
    }

    this.signers = signers;
    const {acknowledged} = await this.client.approve(data);
    this.session = await acknowledged();
    return this.session;
  }

  public async rejectSessionProposal(data: RejectParams): Promise<void> {
    return this.client.reject(data);
  }

  public async sendEvent(name: string, data: any): Promise<void> {
    if (!this.session) {
      throw new Error("No connection session exist!");
    }

    const chainId = Object.values(this.session.namespaces)
      .flatMap(ns => ns.accounts.map(acc => acc.split(":").slice(0,2).join(":")))[0];
    const allowedEvents = Object.values(this.session.namespaces)
      .flatMap(ns => ns.events);
    if (allowedEvents.includes(name)) {
      await this.client.emit({topic: this.session.topic, chainId, event: {name, data}});
    }
  }
}
