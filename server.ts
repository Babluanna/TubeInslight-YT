import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { getChannelData, getVideoData } from "./src/server/youtube";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to fetch YouTube Channel Data
  app.get("/api/youtube/channel", async (req, res) => {
    try {
      const { handle, channelId } = req.query;
      const data = await getChannelData({
        handle: handle as string | undefined,
        channelId: channelId as string | undefined,
      });
      res.json(data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.error?.message || error.message || "Failed to fetch YouTube channel data";
      res.status(status).json({ error: message });
    }
  });

  // API Route to fetch single YouTube Video Data
  app.get("/api/youtube/video", async (req, res) => {
    try {
      const { videoId } = req.query;
      const data = await getVideoData({ videoId: videoId as string });
      res.json(data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.error?.message || error.message || "Failed to fetch YouTube video data";
      res.status(status).json({ error: message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
