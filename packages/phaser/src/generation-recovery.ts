import type { AiAssetGenerationSettings } from "@ai-game-assets/core";
import type { GeneratedDebugOption } from "./debug-client.js";

export type PendingDesignerOption = {
  option: GeneratedDebugOption;
  inheritAnimations: boolean;
  previewedVersionName?: string;
  tilesetAnimations?: Record<string, string[]>;
  tilesetAnimationSettings?: Record<string, AiAssetGenerationSettings>;
  animationOnlyKey?: string;
};

export type GenerationRecoveryRecord = {
  assetId: string;
  activeVersion: string;
  generated: GeneratedDebugOption[];
  pending?: PendingDesignerOption;
};

/** Keep image bytes in IndexedDB: three large sheets can exceed localStorage's quota. */
export class DesignerGenerationRecovery {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly scope: string, private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    return this.database ??= new Promise((resolve, reject) => {
      const request = this.factory.open("ai-game-assets-designer", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("generations", { keyPath: ["scope", "assetId"] });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Generation recovery storage is blocked by another tab."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = undefined; };
        resolve(db);
      };
    });
  }

  async read(): Promise<GenerationRecoveryRecord[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("generations", "readonly");
      const request = transaction.objectStore("generations").getAll();
      transaction.oncomplete = () => resolve(request.result
        .filter(record => record.scope === this.scope)
        .map(({ scope: _scope, ...record }) => record));
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async write(record: GenerationRecoveryRecord): Promise<void> {
    // Clone before awaiting the database so a later preview/edit cannot change
    // the pixels or metadata belonging to this write.
    const snapshot = structuredClone({ ...record, scope: this.scope });
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("generations", "readwrite");
      const store = transaction.objectStore("generations");
      if (snapshot.generated.length || snapshot.pending) store.put(snapshot);
      else store.delete([this.scope, snapshot.assetId]);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
