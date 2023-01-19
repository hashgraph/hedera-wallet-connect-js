import { LedgerId, Transaction } from "@hashgraph/sdk";
import {ProposalTypes, SessionTypes} from "@walletconnect/types";

const chainsMap = new Map();
chainsMap.set(LedgerId.MAINNET.toString(), 295);
chainsMap.set(LedgerId.TESTNET.toString(), 296);
chainsMap.set(LedgerId.PREVIEWNET.toString(), 297);

export enum METHODS {
  SIGN_TRANSACTION = "signTransaction",
  CALL = "call",
  GET_ACCOUNT_BALANCE = "getAccountBalance",
  GET_ACCOUNT_INFO = "getAccountInfo",
  GET_LEDGER_ID = "getLedgerId",
  GET_ACCOUNT_ID = "getAccountId",
  GET_ACCOUNT_KEY = "getAccountKey",
  GET_NETWORK = "getNetwork",
  GET_MIRROR_NETWORK = "getMirrorNetwork",
  SIGN = "sign",
  GET_ACCOUNT_RECORDS = "getAccountRecords",
  CHECK_TRANSACTION = "checkTransaction",
  POPULATE_TRANSACTION = "populateTransaction"
}

export enum EVENTS {
  ACCOUNTS_CHANGED = "accountsChanged",
}

export const getChainByLedgerId = (ledgerId: LedgerId): string => {
  return `hedera:${chainsMap.get(ledgerId.toString())}`;
}

export const getLedgerIdByChainId = (chainId: string): string => {
  const ledgerIdsMap = Object.fromEntries(Array.from(chainsMap.entries()).map(a => a.reverse()));
  return ledgerIdsMap[parseInt(chainId)];
};

export const getRequiredNamespaces = (ledgerId: LedgerId): ProposalTypes.RequiredNamespaces => {
  return {
    hedera: {
      chains: [getChainByLedgerId(ledgerId)],
      methods: Object.values(METHODS),
      events: Object.values(EVENTS),
    }
  };
};

export const getLedgerIDsFromSession = (session: SessionTypes.Struct): LedgerId[] => {
  return Object.values(session?.namespaces || {})
    .flatMap(namespace => namespace.accounts.map(acc => {
      const [network, chainId, account] = acc.split(":");
      return LedgerId.fromString(getLedgerIdByChainId(chainId));
    }));
};
export const getAccountLedgerPairsFromSession = (session: SessionTypes.Struct): {network: LedgerId, account: string}[] => {
  return Object.values(session?.namespaces || {})
    .flatMap(namespace => namespace.accounts.map(acc => {
      const [network, chainId, account] = acc.split(":");
      return {network: LedgerId.fromString(getLedgerIdByChainId(chainId)), account};
    }));
};

type Encodable = {
  toBytes(): Uint8Array
}

export const isEncodable = (obj: any): obj is Encodable => {
  return ("toBytes" in obj) &&
    (typeof (obj as Encodable).toBytes === "function");
};

export const isTransaction = (obj: any): obj is Transaction => {
  if (obj instanceof Transaction) {
    return true;
  } else if ("transactionId" in obj && "sign" in obj) {
    return true;
  }
  return false;
};
