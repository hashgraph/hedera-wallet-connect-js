# Deprecation Notice

This library is being deprecated and will be superseded by a library implementing
[HIP-820](https://github.com/hashgraph/hedera-improvement-proposal/pull/820/files). The final
destination for the community supported and governed helper library implementing WalletConnect
will be `@hashgraph/walletconnect`.

There is an active discussion surrounding standardizing the "Integration of Wallet Connect 2.0
Protocol for Wallets and dApps on Hedera" via the
[HIP-820 discussion](https://github.com/hashgraph/hedera-improvement-proposal/discussions/819).

We will update the
[WalletConnect Spec PR](https://github.com/WalletConnect/walletconnect-specs/pull/117) based on
the results of
[HIP-820](https://github.com/hashgraph/hedera-improvement-proposal/pull/820/files).

Please join the discussion!

---


# **Hedera Wallet Connect** 

This package is a messaging relay between decentralized applications and wallets in Hedera network based on Wallet Connect relays.

Note: This is an initial contribution to a common wallet connect library for Hedera native wallets which is subject to change following community input.

## Getting started

### Installation

1. Install npm package `hedera-wallet-connect`;
```bash
npm install hedera-wallet-connect
```

### DApp section

1. Import `DAppConnector` from `hedera-wallet-connect` package:
```typescript
import {DAppConnector} from "hedera-wallet-connect";
```
2. Create an instance of DAppConnector: `this.dAppConnector = new DAppConnector();`.
You can optionally pass application metadata to the constructor.
Metadata is a general WalletConnect metadata with provided structure:
```typescript
type Metadata = {
   name: string; // Name of your DApp
   description: string; // Description for your DApp
   url: string; // URL adress of your DApp
   icons: string[]; // Icons for displaying in connector
   }
```
If not specified metadata will be automatically composed using website meta content. 
3. Execute `init` method on instance of DAppConnector. You can pass array of custom event names you would like to receive from Wallet (They will be sent by wallet only if supported).
```typescript
await this.dAppConnector.init(["someEventName"])
```
4. In order to request connection to the Wallet run `connect` method. You can pass LedgerId to this method in order to select other than MAINNET Ledger.
```typescript
await this.dAppConnector.connect(LedgerId.TESTNET)
```
If app is reloading calling `connect` method will try to resume existing session instead of opening new pairing window.
5. When connection is established you should request signers array by calling `getSigners` method.
```typescript
await this.dAppConnector.getSigners()
```
This will return array of Signer (HIP-338) interfaces for all allowed by Wallet accounts.
Use them to execute methods on behalf of wallet account. 
You can also subscribe to the events sent by the connected Wallet. Use `events$` subscription provided by DAppConnector.
```typescript
this.dAppConnector.$events.subscribe(
   ({name, data}: {name: string, data: any}) => {
    console.log(`Event ${name}: ${JSON.stringify(data)}`);
   })
```

### Wallet section
1. Import `WalletConnector` from `hedera-wallet-connect` package:
```typescript
import {WalletConnector} from "hedera-wallet-connect";
```
2. Create an instance of WalletConnector: 
```typescript
this.walletConnector = new WalletConnector();
```
   You can optionally pass application metadata to the constructor.
   Metadata is a general WalletConnect metadata with provided structure:
```typescript
type Metadata = {
  name: string; // Name of your DApp
  description: string; // Description for your DApp
  url: string; // URL adress of your DApp
  icons: string[]; // Icons for displaying in connector
}
```
   If not specified metadata will be automatically composed using website meta content.
   It's advisable to specify metadata in case of extension or hybrid app wallet.
3. Execute `init` method on instance of DAppConnector. You should pass callback method of your wallet as an argument. 
This callback will be executed as soon as proposal for connection will arrive from the DApp. As an argument for this callback you will get WalletConnect session proposal.
```typescript
type ProposalCallback = (proposal: SignClientTypes.EventArguments["session_proposal"]) => Promise<void>;
```
```typescript
await this.walletConnector.init(proposalCallback)
```
4. In order to connect to DApp just pass URI string to `pair` method of connector
```typescript
this.walletConnector.pair(uri)
```
5. After reviewing of current proposal you should approve or reject it by calling appropriate methods:
```typescript
rejectSessionProposal(data: RejectParams)
```
or
```typescript
approveSessionProposal<T extends Signer>(data: ApproveParams, signers: T[])
```
   When approving session except ApproveParams you should also provide Signer (HIP-338) implementations for all approved accounts.
6. Wallet can also send events to the dApp using method `sendEvent`. With name and payload:
```typescript
await this.walletConnector.sendEvent(name, data);
```

### Common section
1. You can check whether connector is initialized by checking initialized field:
```typescript
this.connector.initialized === true
```
2. In order to disconnect call `disconnect` method.
```typescript
this.connector.disconnect()
```


## Utils

Conversion between WC chainId and Hedera LedgerId is possible using methods:
```typescript
getChainByLedgerId: (ledgerId: LedgerId) => string;
getLedgerIdByChainId: (chainId: string) => string;
```

# Contributing

Contributions are welcome. Please see the
[contributing guide](https://github.com/hashgraph/.github/blob/main/CONTRIBUTING.md)
to see how you can get involved.

# Code of Conduct

This project is governed by the
[Contributor Covenant Code of Conduct](https://github.com/hashgraph/.github/blob/main/CODE_OF_CONDUCT.md). By
participating, you are expected to uphold this code of conduct. Please report unacceptable behavior
to [oss@hedera.com](mailto:oss@hedera.com).

# License

[Apache License 2.0](LICENSE)
