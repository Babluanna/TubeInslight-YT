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

    const { handle, channelId } = req.query || {};
    let targetChannelId = channelId;

    // If handle is provided, find the channel ID first
    if (handle && !targetChannelId) {
      const cleanHandle = String(handle).startsWith("@") ? String(handle) : `@${handle}`;
      try {
        const searchResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleanHandle)}&key=${apiKey}`
        );
        if (searchResponse.data.items && searchResponse.data.items.length > 0) {
          targetChannelId = searchResponse.data.items[0].id.channelId;
        } else {
          // Fallback search without @
          const rawSearch = await axios.get(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(String(handle).replace(/^@/, ""))}&key=${apiKey}`
          );
          if (rawSearch.data.items && rawSearch.data.items.length > 0) {
            targetChannelId = rawSearch.data.items[0].id.channelId;
          } else {
            return res.status(404).json({ error: `Channel "${handle}" could not be found on YouTube.` });
          }
        }
      } catch (searchErr: any) {
        const msg = searchErr.response?.data?.error?.message || searchErr.message;
        return res.status(searchErr.response?.status || 500).json({
          error: `YouTube Search Error: ${msg}. Check if your YOUTUBE_API_KEY has YouTube Data API v3 enabled in Google Cloud Console.`
        });
      }
    }

    if (!targetChannelId) {
      return res.status(400).json({ error: "Channel ID or Handle is required." });
    }

    // Fetch Channel Details
    let channel: any;
    try {
      const channelResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,topicDetails,contentDetails&id=${targetChannelId}&key=${apiKey}`
      );

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        return res.status(404).json({ error: "Channel details not found on YouTube." });
      }
      channel = channelResponse.data.items[0];
    } catch (chanErr: any) {
      const msg = chanErr.response?.data?.error?.message || chanErr.message;
      return res.status(chanErr.response?.status || 500).json({
        error: `YouTube API Error: ${msg}`
      });
    }

    // Fetch Recent Videos to get tags
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    let videoDetailsResponse: any = { data: { items: [] } };

    if (uploadsPlaylistId) {
      try {
        const videosResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${uploadsPlaylistId}&key=${apiKey}`
        );

        const videoIds = (videosResponse.data.items || [])
          .map((item: any) => item.contentDetails?.videoId)
          .filter(Boolean)
          .join(",");

        if (videoIds) {
          videoDetailsResponse = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
          );
        }
      } catch (vErr: any) {
        console.warn("Recent videos fetch failed:", vErr.message);
      }
    }

    // Fetch Popular Videos
    let popularVideoDetailsResponse: any = { data: { items: [] } };
    try {
      const popularVideosSearchResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${targetChannelId}&maxResults=5&order=viewCount&type=video&key=${apiKey}`
      );

      const popularVideoIds = (popularVideosSearchResponse.data.items || [])
        .map((v: any) => v.id?.videoId)
        .filter(Boolean)
        .join(",");

      if (popularVideoIds) {
        popularVideoDetailsResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${popularVideoIds}&key=${apiKey}`
        );
      }
    } catch (popErr: any) {
      console.warn("Popular videos fetch failed:", popErr.message);
    }

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
    let categoryTitle = "Science & Technology";

    try {
      const catResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&id=${mainCategoryId}&key=${apiKey}`
      );
      if (catResponse.data.items && catResponse.data.items.length > 0) {
        categoryTitle = catResponse.data.items[0].snippet.title;
      }

      const trendingResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&videoCategoryId=${mainCategoryId}&regionCode=US&maxResults=3&key=${apiKey}`
      );

      if (trendingResponse.data.items && trendingResponse.data.items.length > 0) {
        trendingVideos = trendingResponse.data.items.map((v: any) => ({
          id: v.id,
          title: v.snippet?.title,
          thumbnails: v.snippet?.thumbnails,
          statistics: {
            viewCount: v.statistics?.viewCount || "0",
            likeCount: v.statistics?.likeCount || "0",
          },
          channelTitle: v.snippet?.channelTitle,
          categoryTitle: categoryTitle,
        }));
      } else {
        const genericTrendingResponse = await axios.get(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=US&maxResults=3&key=${apiKey}`
        );
        if (genericTrendingResponse.data.items && genericTrendingResponse.data.items.length > 0) {
          trendingVideos = genericTrendingResponse.data.items.map((v: any) => ({
            id: v.id,
            title: v.snippet?.title,
            thumbnails: v.snippet?.thumbnails,
            statistics: {
              viewCount: v.statistics?.viewCount || "0",
              likeCount: v.statistics?.likeCount || "0",
            },
            channelTitle: v.snippet?.channelTitle,
            categoryTitle: `${categoryTitle} (Overall Fallback)`,
          }));
        }
      }
    } catch (trendingError: any) {
      console.warn("Trending fetch failed:", trendingError.message);
    }

    return res.status(200).json({
      channel: {
        id: channel.id,
        title: channel.snippet?.title || "",
        description: channel.snippet?.description || "",
        customUrl: channel.snippet?.customUrl || "",
        thumbnails: channel.snippet?.thumbnails || {},
        statistics: channel.statistics || {},
        keywords: channel.brandingSettings?.channel?.keywords || "",
        topicCategories: channel.topicDetails?.topicCategories || [],
        trailerId: channel.brandingSettings?.channel?.unsubscribedTrailer || null,
      },
      recentVideos: (videoDetailsResponse.data.items || []).map((v: any) => ({
        id: v.id,
        title: v.snippet?.title || "",
        tags: v.snippet?.tags || [],
        publishedAt: v.snippet?.publishedAt || "",
      })),
      popularVideos: (popularVideoDetailsResponse.data.items || []).map((v: any) => ({
        id: v.id,
        title: v.snippet?.title || "",
        tags: v.snippet?.tags || [],
        thumbnails: v.snippet?.thumbnails || {},
        statistics: v.statistics || {},
      })),
      trendingVideos,
    });
  } catch (error: any) {
    console.error("Vercel Function Error:", error);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || "Failed to process channel request";
    return res.status(status).json({ error: message });
  }
}
