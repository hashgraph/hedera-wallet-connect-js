import {AccountId, LedgerId} from "@hashgraph/sdk";
import QRCodeModal from "@walletconnect/qrcode-modal";
import {SignClient} from "@walletconnect/sign-client";
import {SessionTypes, SignClientTypes} from "@walletconnect/types";
import {Subject} from "rxjs";
import {Connector} from "./Connector.js";
import {getLedgerIdByChainId, getRequiredNamespaces} from "./Utils.js";
import {WCSigner} from "./WCSigner.js";

type WalletEvent = {
  name: string,
  data: any
}

export type DAppMetadata = SignClientTypes.Metadata;

export class DAppConnector extends Connector {
  private allowedEvents: string[] = [];
  static instance: DAppConnector;
  public $events: Subject<WalletEvent> = new Subject<WalletEvent>();

  constructor(metadata?: DAppMetadata) {
    super(metadata);
    DAppConnector.instance = this;
  }

  async init(events: string[] = []) {
    this.allowedEvents = events;
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
      return;
    }

    try {
      const requiredNamespaces = getRequiredNamespaces(ledgerId);
      requiredNamespaces.hedera.events.push(...this.allowedEvents)
      const { uri, approval } = await this.client.connect({
        pairingTopic: activeTopic,
        requiredNamespaces
      });

      if (uri) {
        // @ts-ignore
        QRCodeModal.open(uri);
      }

      const session = await approval();
      await this.onSessionConnected(session);
    } finally {
      // @ts-ignore
      QRCodeModal.close();
    }
  }

  async prepareConnectURI(ledgerId: LedgerId = LedgerId.MAINNET, activeTopic?: string): Promise<{
    uri?: string;
    approval: () => Promise<SessionTypes.Struct>;
  }> {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }

    if (this.session) {
      return;
    }

    const requiredNamespaces = getRequiredNamespaces(ledgerId);
    requiredNamespaces.hedera.events.push(...this.allowedEvents);
    return this.client.connect({
      pairingTopic: activeTopic,
      requiredNamespaces
    });
  }

  async onSessionConnected(session: SessionTypes.Struct) {
    const allNamespaceAccounts = Object.values(session?.namespaces || {})
      .map(namespace => namespace.accounts.map(acc => {
        const [network, chainId, account] = acc.split(":");
        return {network: LedgerId.fromString(getLedgerIdByChainId(chainId)), account};
      }))
      .flat();

    this.session = session;
    this.signers = allNamespaceAccounts.map(({account, network}) => new WCSigner(
      AccountId.fromString(account),
      this.client,
      session.topic,
      network
    ))
  }

  getSigners() {
    return this.signers;
  }
}
