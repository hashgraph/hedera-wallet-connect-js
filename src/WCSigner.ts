import type {Signer} from '@hashgraph/sdk';
import {
  AccountBalance,
  AccountId,
  AccountInfo,
  Executable,
  Key,
  LedgerId,
  SignerSignature,
  Transaction,
  TransactionId,
  TransactionRecord, TransactionResponse
} from "@hashgraph/sdk";
import {ISignClient, SessionTypes} from "@walletconnect/types";
import {Buffer} from "buffer";
import {getChainByLedgerId, isEncodable, isTransaction} from "./Utils.js";

/**
 * Implements Hedera Signer interface.
 * https://hips.hedera.com/hip/hip-338
 */
export class WCSigner implements Signer {
  private readonly accountId: AccountId;
  private readonly ledgerId: LedgerId;
  private readonly client: ISignClient;
  private readonly topic: string;

  constructor(accountId: AccountId, client: ISignClient, session: SessionTypes.Struct, ledgerId: LedgerId = LedgerId.MAINNET) {
    this.accountId = accountId;
    this.client = client;
    this.topic = session.topic;
    this.ledgerId = ledgerId;
  }

  getAccountId(): AccountId {
    return this.accountId;
  }

  async getAccountKey(): Promise<Key> {
    return this.client.request<Key>({
      topic: this.topic,
      request: {
        method: "getAccountKey",
        params: {
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });
  }

  getLedgerId(): LedgerId {
    return this.ledgerId;
  }

  async getNetwork(): Promise<{[key: string]: (string | AccountId)}> {
    return this.client.request<{[key: string]: (string | AccountId)}>({
      topic: this.topic,
      request: {
        method: "getNetwork",
        params: {
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });
  }

  async getMirrorNetwork(): Promise<string[]> {
    return this.client.request<string[]>({
      topic: this.topic,
      request: {
        method: "getMirrorNetwork",
        params: {
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });
  }

  async sign(messages: Uint8Array[]): Promise<SignerSignature[]> {
    const result = await this.client.request<SignerSignature[]>({
      topic: this.topic,
      request: {
        method: "sign",
        params: {
          accountId: this.accountId.toString(),
          messages: messages.map(message => Buffer.from(message).toString("base64"))
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    })
    return Promise.resolve(result);
  }

  getAccountBalance(): Promise<AccountBalance> {
    return this.client.request<AccountBalance>({
      topic: this.topic,
      request: {
        method: "getAccountBalance",
        params: {
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });
  }

  getAccountInfo(): Promise<AccountInfo> {
    return this.client.request<AccountInfo>({
      topic: this.topic,
      request: {
        method: "getAccountInfo",
        params: {
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });
  }

  getAccountRecords(): Promise<TransactionRecord[]> {
    return this.client.request<TransactionRecord[]>({
      topic: this.topic,
      request: {
        method: "getAccountRecords",
        params: {
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });
  }

  async signTransaction<T extends Transaction>(transaction: T): Promise<T> {
    const encodedTransaction = await this.client.request<string>({
      topic: this.topic,
      request: {
        method: "signTransaction",
        params: {
          accountId: this.accountId.toString(),
          executable: Buffer.from(transaction.toBytes()).toString("base64")
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });

    return Transaction.fromBytes(Buffer.from(encodedTransaction, "base64")) as T;
  }

  async checkTransaction<T extends Transaction>(transaction: T): Promise<T> {
    const transactionId = transaction.transactionId;
    if (
      transactionId != null &&
      transactionId.accountId != null &&
      transactionId.accountId.compare(this.accountId) !== 0
    ) {
      throw new Error(
        "transaction's ID constructed with a different account ID"
      );
    }

    const nodeAccountIds = (
      transaction.nodeAccountIds != null ? transaction.nodeAccountIds : []
    ).map((nodeAccountId) => nodeAccountId.toString());
    const network = Object.values(await this.getNetwork()).map(
      (nodeAccountId) => nodeAccountId.toString()
    );

    if (
      !nodeAccountIds.reduce(
        (previous, current) => previous && network.includes(current),
        true
      )
    ) {
      throw new Error(
        "Transaction already set node account IDs to values not within the current network"
      );
    }

    return Promise.resolve(transaction);
  }

  async populateTransaction<T extends Transaction>(transaction: T): Promise<T> {
    transaction.setTransactionId(TransactionId.generate(this.accountId));
    const network = Object.values(await this.getNetwork()).map(
      (nodeAccountId) =>
        typeof nodeAccountId === "string"
          ? AccountId.fromString(nodeAccountId)
          : new AccountId(nodeAccountId)
    );
    transaction.setNodeAccountIds(network);
    return Promise.resolve(transaction);
  }

  async call<RequestT, ResponseT, OutputT>(request: Executable<RequestT, ResponseT, OutputT>): Promise<OutputT> {
    if (!isEncodable(request)) {
      throw new Error("Argument is not executable");
    }
    const isTransactionType = isTransaction(request);
    const result = await this.client.request<any>({
      topic: this.topic,
      request: {
        method: "call",
        params: {
          accountId: this.accountId.toString(),
          executable: Buffer.from(request.toBytes()).toString("base64"),
          isTransaction: isTransactionType
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    })

    if (result.error) {
      throw new Error(result.error);
    }

    if (!isTransactionType) {
      // @ts-ignore
      const responseTypeName = request.constructor.name.replace(/Query$/, "");
      const output = await import("@hashgraph/sdk").then((module: any) => module[responseTypeName]);
      const bytes = Buffer.from(result, "base64");
      return output.fromBytes(bytes);
    } else {
      return TransactionResponse.fromJSON(result) as unknown as OutputT;
    }
  }
}
