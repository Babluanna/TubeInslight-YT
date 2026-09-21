import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to fetch YouTube Channel Data
  app.get("/api/youtube/channel", async (req, res) => {
    const { handle, channelId } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "YOUTUBE_API_KEY is not configured" });
    }

    try {
      let targetChannelId = channelId;

      // If handle is provided, find the channel ID first
      if (handle && !targetChannelId) {
        const searchResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handle}&key=${apiKey}`
        );
        if (searchResponse.data.items && searchResponse.data.items.length > 0) {
          targetChannelId = searchResponse.data.items[0].id.channelId;
        } else {
          return res.status(404).json({ error: "Channel not found" });
        }
      }

      if (!targetChannelId) {
        return res.status(400).json({ error: "Channel ID or Handle is required" });
      }

      // Fetch Channel Details
      const channelResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,topicDetails,contentDetails&id=${targetChannelId}&key=${apiKey}`
      );

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        return res.status(404).json({ error: "Channel details not found" });
      }

      const channel = channelResponse.data.items[0];

      // Fetch Recent Videos to get video tags
      const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
      const videosResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${uploadsPlaylistId}&key=${apiKey}`
      );

      const videoIds = videosResponse.data.items.map((item: any) => item.contentDetails.videoId).join(",");
      
      const videoDetailsResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
      );

      // Fetch Popular Videos
      const popularVideosSearchResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${targetChannelId}&maxResults=5&order=viewCount&type=video&key=${apiKey}`
      );

      const popularVideoIds = popularVideosSearchResponse.data.items.map((v: any) => v.id.videoId).join(",");
      const popularVideoDetailsResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${popularVideoIds}&key=${apiKey}`
      );

      // Determine main Category ID of the channel
      let mainCategoryId = "28"; // Default category ID (Science & Technology)
      const allVideos = [
        ...(popularVideoDetailsResponse.data.items || []),
        ...(videoDetailsResponse.data.items || [])
      ];
      
      if (allVideos.length > 0) {
        const categoryCounts: { [key: string]: number } = {};
        for (const video of allVideos) {
          const catId = video.snippet?.categoryId;
          if (catId) {
            categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
          }
        }
        
        let maxCount = 0;
        for (const catId of Object.keys(categoryCounts)) {
          if (categoryCounts[catId] > maxCount) {
            maxCount = categoryCounts[catId];
            mainCategoryId = catId;
          }
        }
      }

      let trendingVideos: any[] = [];
      let categoryTitle = "Science & Technology"; // Default name

      try {
        // Fetch Category Title
        const catResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&id=${mainCategoryId}&key=${apiKey}`
        );
        if (catResponse.data.items && catResponse.data.items.length > 0) {
          categoryTitle = catResponse.data.items[0].snippet.title;
        }

        // Fetch Top 3 Trending Videos for this Category (US as default region)
        const trendingResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&videoCategoryId=${mainCategoryId}&regionCode=US&maxResults=3&key=${apiKey}`
        );

        if (trendingResponse.data.items && trendingResponse.data.items.length > 0) {
          trendingVideos = trendingResponse.data.items.map((v: any) => ({
            id: v.id,
            title: v.snippet.title,
            thumbnails: v.snippet.thumbnails,
            statistics: {
              viewCount: v.statistics?.viewCount || "0",
              likeCount: v.statistics?.likeCount || "0",
            },
            channelTitle: v.snippet.channelTitle,
            categoryTitle: categoryTitle,
          }));
        } else {
          // If no category-specific trending videos are found, fetch overall trending as fallback
          const genericTrendingResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=US&maxResults=3&key=${apiKey}`
          );
          if (genericTrendingResponse.data.items && genericTrendingResponse.data.items.length > 0) {
            trendingVideos = genericTrendingResponse.data.items.map((v: any) => ({
              id: v.id,
              title: v.snippet.title,
              thumbnails: v.snippet.thumbnails,
              statistics: {
                viewCount: v.statistics?.viewCount || "0",
                likeCount: v.statistics?.likeCount || "0",
              },
              channelTitle: v.snippet.channelTitle,
              categoryTitle: `${categoryTitle} (Overall Fallback)`,
            }));
          }
        }
      } catch (trendingError: any) {
        console.error("Failed to fetch trending videos:", trendingError.message || trendingError);
      }

      res.json({
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          customUrl: channel.snippet.customUrl,
          thumbnails: channel.snippet.thumbnails,
          statistics: channel.statistics,
          keywords: channel.brandingSettings?.channel?.keywords || "",
          topicCategories: channel.topicDetails?.topicCategories || [],
          trailerId: channel.brandingSettings?.channel?.unsubscribedTrailer || null,
        },
        recentVideos: videoDetailsResponse.data.items.map((v: any) => ({
          id: v.id,
          title: v.snippet.title,
          tags: v.snippet.tags || [],
          publishedAt: v.snippet.publishedAt,
        })),
        popularVideos: popularVideoDetailsResponse.data.items.map((v: any) => ({
          id: v.id,
          title: v.snippet.title,
          tags: v.snippet.tags || [],
          thumbnails: v.snippet.thumbnails,
          statistics: v.statistics,
        })),
        trendingVideos,
      });
    } catch (error: any) {
      console.error("YouTube API Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch YouTube data" });
    }
  });

  // API Route to fetch single YouTube Video Data
  app.get("/api/youtube/video", async (req, res) => {
    const { videoId } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "YOUTUBE_API_KEY is not configured" });
    }

    if (!videoId) {
      return res.status(400).json({ error: "Video ID is required" });
    }

    try {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`
      );

      if (!response.data.items || response.data.items.length === 0) {
        return res.status(404).json({ error: "Video not found" });
      }

      const video = response.data.items[0];
      res.json({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnails: video.snippet.thumbnails,
        tags: video.snippet.tags || [],
        statistics: video.statistics,
        publishedAt: video.snippet.publishedAt,
        channelTitle: video.snippet.channelTitle,
        channelId: video.snippet.channelId,
      });
    } catch (error: any) {
      console.error("YouTube Video API Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch video data" });
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
