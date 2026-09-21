import axios from "axios";

export interface ChannelQueryParams {
  handle?: string;
  channelId?: string;
}

export async function getChannelData({ handle, channelId }: ChannelQueryParams) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "YOUTUBE_API_KEY is not configured in environment variables. Please add YOUTUBE_API_KEY to your Vercel Project Settings > Environment Variables."
    );
  }

  let targetChannelId = channelId;

  // If handle is provided, find the channel ID first
  if (handle && !targetChannelId) {
    const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
    try {
      const searchResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleanHandle)}&key=${apiKey}`
      );
      if (searchResponse.data.items && searchResponse.data.items.length > 0) {
        targetChannelId = searchResponse.data.items[0].id.channelId;
      } else {
        // Fallback: search without @ if with @ returned no items
        const rawSearch = await axios.get(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle.replace(/^@/, ""))}&key=${apiKey}`
        );
        if (rawSearch.data.items && rawSearch.data.items.length > 0) {
          targetChannelId = rawSearch.data.items[0].id.channelId;
        } else {
          throw new Error(`Channel "${handle}" could not be found on YouTube.`);
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message;
      throw new Error(`YouTube Channel Search Error: ${msg}`);
    }
  }

  if (!targetChannelId) {
    throw new Error("Channel ID or Handle is required.");
  }

  // Fetch Channel Details
  let channel: any;
  try {
    const channelResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings,topicDetails,contentDetails&id=${targetChannelId}&key=${apiKey}`
    );

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      throw new Error("Channel details not found on YouTube.");
    }
    channel = channelResponse.data.items[0];
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`Failed to load channel details: ${msg}`);
  }

  // Fetch Recent Videos to get tags & stats
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
    } catch (err: any) {
      console.warn("Could not load recent upload details:", err.response?.data || err.message);
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
  } catch (err: any) {
    console.warn("Could not load popular videos:", err.response?.data || err.message);
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
    console.warn("Failed to fetch trending videos:", trendingError.response?.data || trendingError.message);
  }

  return {
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
  };
}

export async function getVideoData({ videoId }: { videoId: string }) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "YOUTUBE_API_KEY is not configured in environment variables. Please add YOUTUBE_API_KEY to your Vercel Project Settings > Environment Variables."
    );
  }

  if (!videoId) {
    throw new Error("Video ID is required.");
  }

  try {
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(videoId)}&key=${apiKey}`
    );

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error("Video not found on YouTube.");
    }

    const video = response.data.items[0];
    return {
      id: video.id,
      title: video.snippet?.title || "",
      description: video.snippet?.description || "",
      thumbnails: video.snippet?.thumbnails || {},
      tags: video.snippet?.tags || [],
      statistics: video.statistics || {},
      publishedAt: video.snippet?.publishedAt || "",
      channelTitle: video.snippet?.channelTitle || "",
      channelId: video.snippet?.channelId || "",
    };
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`Failed to load video details: ${msg}`);
  }
}
