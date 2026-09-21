import { getChannelData } from "../../src/server/youtube";

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { handle, channelId } = req.query || {};
    const data = await getChannelData({
      handle: handle as string | undefined,
      channelId: channelId as string | undefined,
    });
    return res.status(200).json(data);
  } catch (error: any) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || "Failed to fetch channel data";
    return res.status(status).json({ error: message });
  }
}
