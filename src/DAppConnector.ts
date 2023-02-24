import {AccountId, LedgerId} from "@hashgraph/sdk";
import QRCodeModal from "@walletconnect/qrcode-modal";
import {SignClient} from "@walletconnect/sign-client";
import {SessionTypes, SignClientTypes} from "@walletconnect/types";
import {Subject} from "rxjs";
import {Connector} from "./Connector.js";
import {
  getAccountLedgerPairsFromSession, getExtensionMethodsFromSession,
  getLedgerIDsFromSession,
  getRequiredNamespaces
} from "./Utils.js";
import {WCSigner} from "./WCSigner.js";
import {HWCError} from "./ErrorHelper.js";

type WalletEvent = {
  name: string,
  data: any
}

export type DAppMetadata = SignClientTypes.Metadata;

export class DAppConnector extends Connector {
  private allowedEvents: string[] = [];
  private extensionMethods: string[] = [];
  static instance: DAppConnector;
  public $events: Subject<WalletEvent> = new Subject<WalletEvent>();

  constructor(metadata?: DAppMetadata) {
    super(metadata);
    DAppConnector.instance = this;
  }

  async init(events: string[] = [], methods: string[] = []) {
    this.allowedEvents = events;
    this.extensionMethods = methods;
    try {
      this.isInitializing = true;
      this.client = await SignClient.init({
        relayUrl: "wss://relay.walletconnect.com",
        projectId: "ce06497abf4102004138a10edd29c921",
        metadata: this.dAppMetadata
      });
      this.subscribeToEvents();
      const existingSession = await this.checkPersistedState();
      if (existingSession) {
        await this.onSessionConnected(existingSession);
      }
    } finally {
      this.isInitializing = false;
    }
  }

  private subscribeToEvents() {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }

    this.client.on("session_update", ({ topic, params }) => {
      const { namespaces } = params;
      const session = this.client!.session.get(topic);
      const updatedSession = { ...session, namespaces };
      this.onSessionConnected(updatedSession);
    });
    this.client.on("session_event", ({topic, params}) => {
      if (params.chainId.includes("hedera:")) {
        this.$events.next(params.event);
      }
    });
  }

  async connect(ledgerId: LedgerId = LedgerId.MAINNET, activeTopic?: string) {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }

    if (this.session) {
      const sessionNetworks = getLedgerIDsFromSession(this.session).map(l => l.toString());
      if (sessionNetworks.includes(ledgerId.toString())) {
        return;
      }
    }

    return new Promise<void>(async (resolve, reject) => {
      try {
        const requiredNamespaces = getRequiredNamespaces(ledgerId);
        requiredNamespaces.hedera.events.push(...this.allowedEvents)
        const { uri, approval } = await this.client.connect({
          pairingTopic: activeTopic,
          requiredNamespaces
        });

        if (uri) {
          // @ts-ignore
          QRCodeModal.open(uri, () => {
            reject(new HWCError(402, "User rejected pairing", {}));
          });
        }

        const session = await approval();
        await this.onSessionConnected(session);
        resolve();
      } catch (e: any) {
        reject(e);
      } finally {
        // @ts-ignore
        QRCodeModal.close();
      }
    });
  }

  async prepareConnectURI(ledgerId: LedgerId = LedgerId.MAINNET, activeTopic?: string): Promise<{
    uri?: string;
    approval: () => Promise<SessionTypes.Struct>;
  }> {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }

    if (this.session) {
      const sessionNetworks = getLedgerIDsFromSession(this.session).map(l => l.toString());
      if (sessionNetworks.includes(ledgerId.toString())) {
        return;
      }
    }

    const requiredNamespaces = getRequiredNamespaces(ledgerId);
    requiredNamespaces.hedera.events.push(...this.allowedEvents);
    requiredNamespaces.hedera.methods.push(...this.extensionMethods);
    return this.client.connect({
      pairingTopic: activeTopic,
      requiredNamespaces
    });
  }

  async onSessionConnected(session: SessionTypes.Struct) {
    const allNamespaceAccounts = getAccountLedgerPairsFromSession(session);
    this.session = session;
    this.signers = allNamespaceAccounts.map(({account, network}) => new WCSigner(
      AccountId.fromString(account),
      this.client,
      session.topic,
      network,
      getExtensionMethodsFromSession(session)
    ))
  }

  getSigners() {
    return this.signers;
  }
}
