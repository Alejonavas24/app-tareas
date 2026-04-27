import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { TimelineSnapshot } from "../domain/types";

export async function exportTimelineJson(snapshot: TimelineSnapshot): Promise<string> {
  const filename = `${snapshot.eventConfig.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_timeline.json`;
  const file = new File(Paths.document, filename);
  file.write(JSON.stringify(snapshot, null, 2));
  const uri = file.uri;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle: "Exportar timeline JSON",
    });
  }
  return uri;
}
