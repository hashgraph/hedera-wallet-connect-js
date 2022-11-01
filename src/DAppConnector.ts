import {AccountId, LedgerId} from "@hashgraph/sdk";
import QRCodeModal from "@walletconnect/qrcode-modal";
import {SignClient} from "@walletconnect/sign-client";
import {PairingTypes, SessionTypes, SignClientTypes} from "@walletconnect/types";
import {Subject} from "rxjs";
import {Connector} from "./Connector.js";
import {getRequiredNamespaces} from "./Utils.js";
import {WCSigner} from "./WCSigner.js";

type WalletEvent = {
  name: string,
  data: any
}

export class DAppConnector extends Connector {
  private allowedEvents: string[] = [];
  public $events: Subject<WalletEvent> = new Subject<WalletEvent>();

  constructor(metadata?: SignClientTypes.Metadata) {
    super(metadata);
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

  async connect(ledgerId: LedgerId = LedgerId.MAINNET, pairing?: PairingTypes.Struct) {
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
        pairingTopic: pairing?.topic,
        requiredNamespaces
      });

      if (uri) {
        // @ts-ignore
        QRCodeModal.open(uri, () => {
          /*TODO: Handle close of the modal*/
        });
      }

      const session = await approval();
      this.ledgerId = ledgerId;
      await this.onSessionConnected(session);
    } finally {
      // @ts-ignore
      QRCodeModal.close();
    }
  }

  private async onSessionConnected(session: SessionTypes.Struct) {
    const allNamespaceAccounts = Object.values(session?.namespaces || {})
      .map(namespace => namespace.accounts.map(acc => acc.split(":")[2]))
      .flat();

    this.session = session;
    this.signers = allNamespaceAccounts.map(account => new WCSigner(
      AccountId.fromString(account),
      this.client,
      session,
      this.ledgerId
    ))
  }

  getSigners() {
    return this.signers;
  }
}
