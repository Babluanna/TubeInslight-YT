import express from "express";
import { getChannelData, getVideoData } from "../src/server/youtube";

const app = express();
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

const handleChannel = async (req: any, res: any) => {
  try {
    const { handle, channelId } = req.query || {};
    const data = await getChannelData({
      handle: handle as string | undefined,
      channelId: channelId as string | undefined,
    });
    return res.json(data);
  } catch (error: any) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || "Failed to fetch channel data";
    return res.status(status).json({ error: message });
  }
};

const handleVideo = async (req: any, res: any) => {
  try {
    const { videoId } = req.query || {};
    const data = await getVideoData({
      videoId: videoId as string,
    });
    return res.json(data);
  } catch (error: any) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || "Failed to fetch video data";
    return res.status(status).json({ error: message });
  }
};

// Support both path prefixes in case Vercel rewrite preserves or strips `/api`
app.get("/api/youtube/channel", handleChannel);
app.get("/youtube/channel", handleChannel);
app.get("/api/youtube/video", handleVideo);
app.get("/youtube/video", handleVideo);

export default app;
