# **Hedera Wallet Connect** 

This package is a messaging relay between decentralized applications and wallets in Hedera network based on Wallet Connect relays.

## Usage
Checked with Node version 18.9.0
### Installation
1. Install npm package `hedera-wallet-connect`;

### DApp section
1. Import `DAppConnector` from `hedera-wallet-connect` package:
`import {DAppConnector} from "hedera-wallet-connect";`
2. Create an instance of DAppConnector: `this.dAppConnector = new DAppConnector();`.
You can optionally pass application metadata to the constructor.
Metadata is a general WalletConnect metadata with provided structure:
`type Metadata = {
   name: string; // Name of your DApp
   description: string; // Description for your DApp
   url: string; // URL adress of your DApp
   icons: string[]; // Icons for displaying in connector
   }`
If not specified metadata will be automatically composed using website meta content. 
3. Execute `init` method on instance of DAppConnector. You can pass array of custom event names you would like to receive from Wallet (They will be sent by wallet only if supported).
`await this.dAppConnector.init(["someEventName"])`
4. In order to request connection to the Wallet run `connect` method. You can pass LedgerId to this method in order to select other than MAINNET Ledger.
`await this.dAppConnector.connect(LedgerId.TESTNET)`. If app is reloading calling `connect` method will try to resume existing session instead of opening new pairing window.
5. When connection is established you should request signers array by calling `getSigners` method.
`await this.dAppConnector.getSigners()`. This will return array of Signer (HIP-338) interfaces for all allowed by Wallet accounts.
Use them to execute methods on behalf of wallet account. 
You can also subscribe to the events sent by the connected Wallet. Use `events$` subscription provided by DAppConnector.
`this.dAppConnector.$events.subscribe(
   ({name, data}: {name: string, data: any}) => {
   console.log(`Event ${name}: ${JSON.stringify(data)}`);
   }
   )`

### Wallet section
1. Import `WalletConnector` from `hedera-wallet-connect` package:
   `import {WalletConnector} from "hedera-wallet-connect";`
2. Create an instance of WalletConnector: `this.walletConnector = new WalletConnector();`.
   You can optionally pass application metadata to the constructor.
   Metadata is a general WalletConnect metadata with provided structure:
   `type Metadata = {
   name: string; // Name of your DApp
   description: string; // Description for your DApp
   url: string; // URL adress of your DApp
   icons: string[]; // Icons for displaying in connector
   }`
   If not specified metadata will be automatically composed using website meta content.
   It's advisable to specify metadata in case of extension or hybrid app wallet.
3. Execute `init` method on instance of DAppConnector. You should pass callback method of your wallet as an argument. 
This callback will be executed as soon as proposal for connection will arrive from the DApp. As an argument for this callback you will get WalletConnect session proposal.
`type ProposalCallback = (proposal: SignClientTypes.EventArguments["session_proposal"]) => Promise<void>;`
`await this.walletConnector.init(proposalCallback)`
4. In order to connect to DApp just pass URI string to `pair` method of connector
   `this.walletConnector.pair(uri)`
5. After reviewing of current proposal you should approve or reject it by calling appropriate methods:
   `rejectSessionProposal(data: RejectParams)` or
   `approveSessionProposal<T extends Signer>(data: ApproveParams, signers: T[])`.
   When approving session except ApproveParams you should also provide Signer (HIP-338) implementations for all approved accounts.
6. Wallet can also send events to the dApp using method `sendEvent`. With name and payload:
   `await this.walletConnector.sendEvent(name, data);`

### Common section
1. You can check whether connector is initialized by checking initialized field:
`this.connector.initialized === true`
2. In order to disconnect call `disconnect` method.
`this.connector.disconnect()`


## Utils

Conversion between WC chainId and Hedera LedgerId is possible using methods:
`getChainByLedgerId: (ledgerId: LedgerId) => string;`
`getLedgerIdByChainId: (chainId: string) => string;`
