import SignClient from "@walletconnect/sign-client";
import {catchError, from, timeout} from "rxjs";
import {LedgerId, Signer} from "@hashgraph/sdk";
import {SessionTypes, SignClientTypes} from "@walletconnect/types";
import {getAppMetadata, getSdkError} from "@walletconnect/utils";

declare type Client = SignClient.default;

export class Connector {
  protected readonly dAppMetadata: SignClientTypes.Metadata;
  protected isInitializing: boolean = false;
  protected client: Client | null = null;
  protected session: SessionTypes.Struct | null = null;
  protected ledgerId: LedgerId = LedgerId.MAINNET;
  protected signers: Signer[] = [];

  protected constructor(metadata?: SignClientTypes.Metadata) {
    this.dAppMetadata = metadata || getAppMetadata();
  }

  protected async checkPersistedState() {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }

    if (this.session) {
      return;
    }

    if (this.client.session.length) {
      const sessionCheckPromises: Promise<SessionTypes.Struct | null>[] = this.client.session
        .getAll()
        .map((session: SessionTypes.Struct) => {
          return new Promise((resolve) =>
            from(this.client!.ping({ topic: session.topic }))
              .pipe(
                timeout(3000),
                catchError(async (err) => {
                  try {
                    await this.client!.disconnect({
                      topic: session.topic,
                      reason: { code: 0, message: "Ping was unsuccessful" }
                    });
                  } catch (e) {
                    console.log("Non existing session with topic:", session.topic)
                  }
                  resolve(null);
                })
              ).subscribe(() => {
              resolve(session);
            })
          );
        });
      const sessionCheckResults: (SessionTypes.Struct | null)[] = await Promise.all(sessionCheckPromises);

      return sessionCheckResults
        .find((s: SessionTypes.Struct | null) => !!s) || null;
    }

    return null;
  }


  async disconnect() {
    if (!this.client) {
      throw new Error("WC is not initialized");
    }
    if (!this.session) {
      throw new Error("Session is not connected");
    }
    await this.client.disconnect({
      topic: this.session.topic,
      reason: getSdkError("USER_DISCONNECTED")
    });
    this.reset();
  }

  private reset() {
    this.session = null;
    this.signers = [];
  }

  get initialized(): boolean {
    return !!this.client;
  }
}
