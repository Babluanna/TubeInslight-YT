import axios from "axios";

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "YOUTUBE_API_KEY is not configured in Vercel. Please add YOUTUBE_API_KEY in your Vercel Project Settings > Environment Variables, then redeploy."
      });
    }

    const { videoId } = req.query || {};

    if (!videoId) {
      return res.status(400).json({ error: "Video ID is required." });
    }

    try {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(String(videoId))}&key=${apiKey}`
      );

      if (!response.data.items || response.data.items.length === 0) {
        return res.status(404).json({ error: "Video not found on YouTube." });
      }

      const video = response.data.items[0];
      return res.status(200).json({
        id: video.id,
        title: video.snippet?.title || "",
        description: video.snippet?.description || "",
        thumbnails: video.snippet?.thumbnails || {},
        tags: video.snippet?.tags || [],
        statistics: video.statistics || {},
        publishedAt: video.snippet?.publishedAt || "",
        channelTitle: video.snippet?.channelTitle || "",
        channelId: video.snippet?.channelId || "",
      });
    } catch (apiErr: any) {
      const msg = apiErr.response?.data?.error?.message || apiErr.message;
      return res.status(apiErr.response?.status || 500).json({
        error: `YouTube API Error: ${msg}. Check if YOUTUBE_API_KEY is valid.`
      });
    }
  } catch (error: any) {
    console.error("Vercel Video Function Error:", error);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || "Failed to process video request";
    return res.status(status).json({ error: message });
  }
}
