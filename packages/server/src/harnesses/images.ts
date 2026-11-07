import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import type { ImageProcessor } from "@earendil-works/pi-durable/tools";

let processor: Promise<ImageProcessor> | undefined;

/** Share the lazy, idle-expiring image worker across coding and read-only tools. */
export const workspaceImages: ImageProcessor = {
  async prepare(bytes, mimeType, limits) {
    processor ??= createNodePhotonImages().catch((error: unknown) => {
      processor = undefined;
      throw error;
    });
    return (await processor).prepare(bytes, mimeType, limits);
  },
};
