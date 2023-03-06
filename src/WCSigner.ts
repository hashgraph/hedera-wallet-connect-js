/*-
 *
 * Hedera Wallet Connect
 *
 * Copyright (C) 2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

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
import {ISignClient} from "@walletconnect/types";
import {Buffer} from "buffer";
import {
  convertToSignerSignature,
  getChainByLedgerId,
  isEncodable,
  isTransaction,
  METHODS
} from "./Utils.js";
import { CatchAll, HWCError } from "./ErrorHelper.js";
import {DAppConnector} from "./DAppConnector.js";
import {
  catchError,
  defer,
  delay, filter,
  from,
  lastValueFrom,
  takeUntil, throwIfEmpty,
  timeout
} from "rxjs";

const handleSignerError = async (error: any, signer: Signer) => {
  try {
    const existingSession = await DAppConnector.instance.checkPersistedState();
    if (existingSession) {
      await DAppConnector.instance.onSessionConnected(existingSession);
    } else {
      const pairing = signer.client.pairing.getAll({active: true}).pop();
      await DAppConnector.instance.connect(signer.getLedgerId(), pairing?.topic);
    }
  } catch (e) {
    try {
      await DAppConnector.instance.disconnect();
    } finally {
      await DAppConnector.instance.connect(signer.getLedgerId())
    }
  }

  return true;
};

/**
 * Implements Hedera Signer interface.
 * https://hips.hedera.com/hip/hip-338
 */
@CatchAll(handleSignerError, {retry: true, retryDelay: 1000})
export class WCSigner implements Signer {
  constructor(
      private readonly accountId: AccountId,
      private readonly client: ISignClient,
      private readonly topic: string,
      private readonly ledgerId: LedgerId = LedgerId.MAINNET,
      private extensionMethods: string[] = []
  ) {
    this.extensionMethods
      .filter(method => !Object.values(METHODS).includes(method as any))
      .forEach(method => {
        this[method] = (...args: any[]) => this.extensionMethodCall(method, args);
      });
  }

  private wrappedRequest<T>(params): Promise<T> {
    const cancelWithPing$ = defer(() => this.client!.ping({topic: this.topic}))
      .pipe(
        delay(5000),
        timeout(10000),
        catchError(async () => true),
        filter(error => !!error)
      );
    return lastValueFrom<T>(
      from(this.client.request<T>(params))
        .pipe(
          takeUntil(cancelWithPing$),
          throwIfEmpty(() => new HWCError(403,"Wallet is closed or locked", {}))
        )
    );
  }

  getAccountId(): AccountId {
    return this.accountId;
  }

  async getAccountKey(): Promise<Key> {
    return this.wrappedRequest<Key>({
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
    return this.wrappedRequest<{[key: string]: (string | AccountId)}>({
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
    return this.wrappedRequest<string[]>({
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

  async sign(messages: Uint8Array[], signOptions?: Record<string, any>): Promise<SignerSignature[]> {
    const result = await this.wrappedRequest<SignerSignature[]>({
      topic: this.topic,
      request: {
        method: "sign",
        params: {
          accountId: this.accountId.toString(),
          messages: messages.map(message => Buffer.from(message).toString("base64")),
          signOptions
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    });

    return Promise.resolve(result.map(r => convertToSignerSignature(r)));
  }

  private async extensionMethodCall<T>(name, args: Record<any, any>): Promise<T> {
    const result = await this.wrappedRequest<T>({
      topic: this.topic,
      request: {
        method: name,
        params: {
          args,
          accountId: this.accountId.toString()
        }
      },
      chainId: getChainByLedgerId(this.ledgerId)
    })
    return Promise.resolve(result);
  }

  getAccountBalance(): Promise<AccountBalance> {
    return this.wrappedRequest<AccountBalance>({
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
    return this.wrappedRequest<AccountInfo>({
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
    return this.wrappedRequest<TransactionRecord[]>({
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
    const encodedTransaction = await this.wrappedRequest<string>({
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
    const result = await this.wrappedRequest<any>({
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
