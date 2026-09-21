import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Youtube, 
  BarChart3, 
  Tag, 
  TrendingUp, 
  Copy, 
  Check, 
  Loader2, 
  ExternalLink, 
  Info, 
  Users, 
  Play, 
  Video, 
  FileText, 
  Image as ImageIcon, 
  Sparkles,
  Milestone,
  Layers,
  DollarSign,
  Calendar,
  Target,
  ThumbsUp,
  Key,
  Compass,
  Lightbulb,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  generateRecommendations, 
  generateChannelDescription, 
  generateBannerPrompt, 
  analyzeDescription, 
  generateSuggestedTags, 
  generateGrowthRoadmap, 
  generateKeywordSuggestions,
  type GrowthRoadmap,
  type KeywordEngineResult,
  type KeywordSuggestionItem
} from './services/geminiService';
import { GoogleGenAI } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function safeFetchJson<T = any>(url: string): Promise<T> {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    let errorDetail = '';
    if (contentType.includes('application/json')) {
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error || errorJson.message || '';
      } catch {
        // ignore json parse error
      }
    } else {
      const errorText = await response.text();
      if (errorText.includes('The page could not be found') || response.status === 404) {
        errorDetail = 'API route not found (404). If running on Vercel, please make sure the project was redeployed with the backend API functions and that YOUTUBE_API_KEY is configured in Vercel Environment Variables.';
      } else if (errorText.includes('FUNCTION_INVOCATION_FAILED')) {
        errorDetail = 'Vercel Serverless Function Invocation Failed. Please make sure YOUTUBE_API_KEY is added to Vercel Project Settings > Environment Variables, and redeploy.';
      } else if (errorText) {
        errorDetail = errorText.slice(0, 160);
      }
    }
    throw new Error(errorDetail || `Request failed with status ${response.status} (${response.statusText})`);
  }

  if (!contentType.includes('application/json')) {
    const errorText = await response.text();
    if (errorText.includes('The page could not be found')) {
      throw new Error('API route not found. If deployed on Vercel, please ensure the api functions are deployed and YOUTUBE_API_KEY is configured.');
    }
    throw new Error(`Expected JSON response, but server returned: ${errorText.slice(0, 100)}`);
  }

  return response.json();
}

interface ChannelData {
  channel: {
    id: string;
    title: string;
    description: string;
    customUrl: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
    statistics: {
      viewCount: string;
      subscriberCount: string;
      videoCount: string;
    };
    keywords: string;
    topicCategories: string[];
    trailerId: string | null;
  };
  recentVideos: {
    id: string;
    title: string;
    tags: string[];
    publishedAt: string;
  }[];
  popularVideos: {
    id: string;
    title: string;
    tags: string[];
    thumbnails: {
      default: { url: string };
      medium: { url: string };
    };
    statistics: {
      viewCount: string;
    };
  }[];
  trendingVideos?: {
    id: string;
    title: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high?: { url: string };
    };
    statistics: {
      viewCount: string;
      likeCount: string;
    };
    channelTitle: string;
    categoryTitle: string;
  }[];
}

interface AIRecommendations {
  recommendedKeywords: string[];
  trendingKeywords: string[];
  seoStrategy: {
    titles: string;
    descriptions: string;
    tags: string;
    thumbnails: string;
  };
}

interface DescriptionAnalysis {
  foundKeywords: string[];
  suggestions: string[];
}

interface VideoData {
  id: string;
  title: string;
  description: string;
  thumbnails: {
    medium: { url: string };
    high: { url: string };
  };
  tags: string[];
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  publishedAt: string;
  channelTitle: string;
  channelId: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'channel' | 'video' | 'description' | 'banner' | 'about'>('channel');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChannelData | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [generatedDescription, setGeneratedDescription] = useState<string | null>(null);
  const [generatedBanner, setGeneratedBanner] = useState<string | null>(null);
  const [bannerNiche, setBannerNiche] = useState<string | null>(null);
  const [selectedNiche, setSelectedNiche] = useState<string>('');
  const [aiRecs, setAiRecs] = useState<AIRecommendations | null>(null);
  const [descAnalysis, setDescAnalysis] = useState<DescriptionAnalysis | null>(null);
  const [growthRoadmap, setGrowthRoadmap] = useState<GrowthRoadmap | null>(null);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [keywordEngineData, setKeywordEngineData] = useState<KeywordEngineResult | null>(null);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [keywordSearchQuery, setKeywordSearchQuery] = useState('');
  const [selectedFocusFilter, setSelectedFocusFilter] = useState('All');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const niches = [
    "Gaming", "Technology", "Cooking", "Vlog", "Education", 
    "Fitness", "Travel", "Beauty", "Music", "Business", 
    "Finance", "Comedy", "Lifestyle", "ASMR", "Art"
  ];

  const extractHandleOrId = (input: string) => {
    if (activeTab === 'about') return null;
    if (activeTab === 'description' || activeTab === 'banner') return { channelName: input };
    
    if (activeTab === 'channel') {
      // Matches @handle, channel/ID, or full URL
      const handleMatch = input.match(/@([\w.-]+)/);
      if (handleMatch) return { handle: handleMatch[1] };

      const idMatch = input.match(/channel\/([\w-]+)/);
      if (idMatch) return { channelId: idMatch[1] };

      // If it's just a handle without @
      if (input.startsWith('@')) return { handle: input.slice(1) };
      
      // Default to search if it looks like a name
      if (input.length > 0 && !input.includes('/')) return { handle: input };
    } else {
      // Extract Video ID
      const videoIdMatch = input.match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
      if (videoIdMatch) return { videoId: videoIdMatch[1] };
      
      // If it's just the ID
      if (input.length === 11 && !input.includes('/')) return { videoId: input };
    }

    return null;
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    setVideoData(null);
    setGeneratedDescription(null);
    setGeneratedBanner(null);
    setBannerNiche(null);
    setAiRecs(null);
    setDescAnalysis(null);
    setGrowthRoadmap(null);
    setKeywordEngineData(null);
    setKeywordSearchQuery('');
    setSelectedFocusFilter('All');
    setSuggestedTags([]);

    const params = extractHandleOrId(url);
    if (!params) {
      setError(activeTab === 'channel' 
        ? 'Invalid YouTube URL or handle. Please use @handle or channel URL.' 
        : activeTab === 'video'
        ? 'Invalid YouTube Video URL or ID.'
        : 'Please enter a valid input.');
      setLoading(false);
      return;
    }

    try {
      if (activeTab === 'description') {
        const desc = await generateChannelDescription((params as any).channelName);
        setGeneratedDescription(desc);
      } else if (activeTab === 'banner') {
        const bannerInfo = await generateBannerPrompt((params as any).channelName, selectedNiche || undefined);
        if (bannerInfo) {
          setBannerNiche(bannerInfo.category);
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
              parts: [
                {
                  text: bannerInfo.imagePrompt,
                },
              ],
            },
            config: {
              imageConfig: {
                aspectRatio: "16:9",
              },
            },
          });
          
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              setGeneratedBanner(`data:image/png;base64,${part.inlineData.data}`);
              break;
            }
          }
        } else {
          throw new Error("Failed to analyze channel for banner.");
        }
      } else if (activeTab === 'channel') {
        const queryParams = new URLSearchParams();
        if ('handle' in params) queryParams.append('handle', params.handle);
        if ('channelId' in params) queryParams.append('channelId', params.channelId);

        const result = await safeFetchJson(`/api/youtube/channel?${queryParams.toString()}`);

        setData(result);
        const [recs, analysis, keywordEngine] = await Promise.all([
          generateRecommendations(result),
          analyzeDescription(result.channel.description),
          generateKeywordSuggestions(result)
        ]);
        setAiRecs(recs);
        setDescAnalysis(analysis);
        setKeywordEngineData(keywordEngine);
      } else {
        const result = await safeFetchJson(`/api/youtube/video?videoId=${(params as any).videoId}`);

        setVideoData(result);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestTags = async () => {
    if (!videoData) return;
    setIsSuggestingTags(true);
    try {
      const tags = await generateSuggestedTags(videoData);
      setSuggestedTags(tags);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const handleGenerateRoadmap = async () => {
    if (!data) return;
    setIsGeneratingRoadmap(true);
    try {
      const roadmap = await generateGrowthRoadmap(data);
      setGrowthRoadmap(roadmap);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingRoadmap(false);
    }
  };

  const handleGenerateKeywords = async () => {
    if (!data) return;
    setIsGeneratingKeywords(true);
    try {
      const result = await generateKeywordSuggestions(data);
      setKeywordEngineData(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatNumber = (num: string) => {
    const n = parseInt(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const calculateUploadFrequency = (videos: { publishedAt: string }[]) => {
    if (videos.length < 2) return 'N/A';
    
    const dates = videos.map(v => new Date(v.publishedAt).getTime()).sort((a, b) => b - a);
    const totalDays = (dates[0] - dates[dates.length - 1]) / (1000 * 60 * 60 * 24);
    const avgDaysBetween = totalDays / (videos.length - 1);

    if (avgDaysBetween < 1) {
      const perDay = Math.round(1 / avgDaysBetween);
      return `${perDay} video${perDay > 1 ? 's' : ''} / day`;
    }
    if (avgDaysBetween <= 1.5) return 'Daily';
    if (avgDaysBetween <= 3.5) return '2-3 times / week';
    if (avgDaysBetween <= 7.5) return 'Weekly';
    if (avgDaysBetween <= 15) return 'Bi-weekly';
    if (avgDaysBetween <= 31) return 'Monthly';
    
    return `${Math.round(avgDaysBetween / 30)} month${Math.round(avgDaysBetween / 30) > 1 ? 's' : ''} gap`;
  };

  // Extract keywords from the string (YouTube returns them as space-separated, sometimes quoted)
  const parseKeywords = (keywords: string) => {
    if (!keywords) return [];
    // Simple split by space, but handle quotes if necessary (basic version)
    return keywords.split(' ').filter(k => k.length > 0).map(k => k.replace(/"/g, ''));
  };

  const allTags = data ? Array.from(new Set([
    ...parseKeywords(data.channel.keywords),
    ...data.recentVideos.flatMap(v => v.tags)
  ])) : [];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-50 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <div className="bg-red-600 p-1.5 rounded-lg">
            <Youtube className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">TubeInsight</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-8">
        {/* Tab Switcher */}
        <div className="flex bg-white p-1 rounded-xl border border-black/5 mb-6 shadow-sm overflow-x-auto scrollbar-hide">
          <button
            onClick={() => { setActiveTab('channel'); setUrl(''); setError(null); setData(null); setVideoData(null); setGeneratedDescription(null); }}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'channel' ? "bg-red-600 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Users className="w-4 h-4" /> Channel
          </button>
          <button
            onClick={() => { setActiveTab('video'); setUrl(''); setError(null); setData(null); setVideoData(null); setGeneratedDescription(null); }}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'video' ? "bg-red-600 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Tag className="w-4 h-4" /> Tag Extractor
          </button>
          <button
            onClick={() => { setActiveTab('description'); setUrl(''); setError(null); setData(null); setVideoData(null); setGeneratedDescription(null); setGeneratedBanner(null); }}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'description' ? "bg-red-600 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <FileText className="w-4 h-4" /> Description
          </button>
          <button
            onClick={() => { setActiveTab('banner'); setUrl(''); setError(null); setData(null); setVideoData(null); setGeneratedDescription(null); setGeneratedBanner(null); }}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'banner' ? "bg-red-600 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <ImageIcon className="w-4 h-4" /> Banner
          </button>
          <button
            onClick={() => { setActiveTab('about'); setUrl(''); setError(null); setData(null); setVideoData(null); setGeneratedDescription(null); setGeneratedBanner(null); }}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'about' ? "bg-red-600 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Info className="w-4 h-4" /> About
          </button>
        </div>

        {/* Search Section */}
        {activeTab !== 'about' && (
          <section className="mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
              <h2 className="text-lg font-semibold mb-2">
                {activeTab === 'channel' ? 'Analyze Channel' : activeTab === 'video' ? 'Tag Extractor' : activeTab === 'description' ? 'Description Generator' : 'Banner Generator'}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {activeTab === 'channel' 
                  ? 'Enter a YouTube handle (e.g., @MrBeast) or channel URL.' 
                  : activeTab === 'video'
                  ? 'Paste a YouTube video link to extract its tags.'
                  : activeTab === 'description'
                  ? 'Enter your channel name to generate a professional description.'
                  : 'Enter your channel name to generate an AI-powered banner.'}
              </p>
              
              <div className="relative mb-4">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={activeTab === 'channel' ? "@handle or channel link" : activeTab === 'video' ? "Paste video link here" : "Enter Channel Name"}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                />
                {activeTab === 'description' ? (
                  <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                ) : activeTab === 'banner' ? (
                  <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                ) : (
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                )}
              </div>

              {activeTab === 'banner' && (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                    Select Niche (Optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {niches.map((niche) => (
                      <button
                        key={niche}
                        onClick={() => setSelectedNiche(selectedNiche === niche ? '' : niche)}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium rounded-full border transition-all",
                          selectedNiche === niche 
                            ? "bg-red-600 border-red-600 text-white shadow-sm" 
                            : "bg-white border-gray-200 text-gray-600 hover:border-red-200 hover:bg-red-50"
                        )}
                      >
                        {niche}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleAnalyze}
                disabled={loading || !url.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {activeTab === 'description' ? 'Generating...' : activeTab === 'banner' ? 'Creating Banner...' : 'Extracting...'}
                  </>
                ) : (
                  <>
                    {activeTab === 'channel' ? <BarChart3 className="w-5 h-5" /> : activeTab === 'video' ? <Tag className="w-5 h-5" /> : activeTab === 'description' ? <FileText className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                    {activeTab === 'channel' ? 'Analyze Channel' : activeTab === 'video' ? 'Extract Tags' : activeTab === 'description' ? 'Generate Description' : 'Generate Banner'}
                  </>
                )}
              </button>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100"
                >
                  {error}
                </motion.p>
              )}
            </div>
          </section>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'channel' && data && (
            <motion.div
              key="channel-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              {/* ... existing channel profile code ... */}
              {/* Channel Profile */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={data.channel.thumbnails.high.url}
                    alt={data.channel.title}
                    className="w-20 h-20 rounded-full border-2 border-gray-100"
                  />
                  <div>
                    <h3 className="text-xl font-bold">{data.channel.title}</h3>
                    <p className="text-gray-500 text-sm">{data.channel.customUrl}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={`https://youtube.com/${data.channel.customUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-red-600 flex items-center gap-1 hover:underline"
                      >
                        View Channel <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-gray-50">
                  <div className="text-center">
                    <div className="flex justify-center mb-1">
                      <Users className="w-4 h-4 text-gray-400" />
                    </div>
                    <p className="text-sm font-bold">{formatNumber(data.channel.statistics.subscriberCount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Subs</p>
                  </div>
                  <div className="text-center">
                    <div className="flex justify-center mb-1">
                      <Play className="w-4 h-4 text-gray-400" />
                    </div>
                    <p className="text-sm font-bold">{formatNumber(data.channel.statistics.viewCount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Views</p>
                  </div>
                  <div className="text-center">
                    <div className="flex justify-center mb-1">
                      <Video className="w-4 h-4 text-gray-400" />
                    </div>
                    <p className="text-sm font-bold">{formatNumber(data.channel.statistics.videoCount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Videos</p>
                  </div>
                  <div className="text-center">
                    <div className="flex justify-center mb-1">
                      <TrendingUp className="w-4 h-4 text-gray-400" />
                    </div>
                    <p className="text-sm font-bold">{calculateUploadFrequency(data.recentVideos)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Frequency</p>
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Description
                  </h4>
                  <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">
                    {data.channel.description || 'No description available.'}
                  </p>
                </div>
              </div>

              {/* Channel Trailer */}
              {data.channel.trailerId && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 overflow-hidden">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                    <Youtube className="w-5 h-5 text-red-600" /> Channel Trailer
                  </h3>
                  <div className="aspect-video rounded-xl overflow-hidden bg-gray-100">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${data.channel.trailerId}`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              )}

              {/* Keywords & Tags */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Tag className="w-5 h-5 text-red-600" /> Channel Keywords
                  </h3>
                  <button
                    onClick={() => copyToClipboard(allTags.join(', '), 'all-tags')}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {copied === 'all-tags' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {allTags.length > 0 ? (
                    allTags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs font-medium text-gray-600"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400 italic">No keywords found.</p>
                  )}
                </div>
              </div>

              {/* AI Insights */}
              {aiRecs && (
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 shadow-lg text-white">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5" /> AI Growth Insights
                  </h3>
                  
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-3">Recommended Keywords</h4>
                      <div className="flex flex-wrap gap-2">
                        {aiRecs.recommendedKeywords.map((kw, i) => (
                          <span key={i} className="px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg text-xs font-medium">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-3">Trending in Niche</h4>
                      <div className="flex flex-wrap gap-2">
                        {aiRecs.trendingKeywords.map((kw, i) => (
                          <span key={i} className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs font-medium flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10 space-y-4">
                      <h4 className="text-xs font-bold text-indigo-200 uppercase tracking-widest">SEO Strategy</h4>
                      
                      <div className="space-y-3">
                        <div>
                          <h5 className="text-[10px] font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> Video Titles
                          </h5>
                          <p className="text-sm text-indigo-50 leading-relaxed">{aiRecs.seoStrategy.titles}</p>
                        </div>

                        <div>
                          <h5 className="text-[10px] font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Descriptions
                          </h5>
                          <p className="text-sm text-indigo-50 leading-relaxed">{aiRecs.seoStrategy.descriptions}</p>
                        </div>

                        <div>
                          <h5 className="text-[10px] font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Video Tags
                          </h5>
                          <p className="text-sm text-indigo-50 leading-relaxed">{aiRecs.seoStrategy.tags}</p>
                        </div>

                        <div>
                          <h5 className="text-[10px] font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> Thumbnails
                          </h5>
                          <p className="text-sm text-indigo-50 leading-relaxed">{aiRecs.seoStrategy.thumbnails}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Keyword Suggestion Engine for New Channels */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
                        <Key className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Keyword Suggestion Engine
                      </h3>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full">
                        For New Channels
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      10–15 recommended keywords tailored for a new channel targeting this niche, with strategic reasoning connected to @{data.channel.title}'s content approach.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {keywordEngineData && keywordEngineData.suggestions.length > 0 && (
                      <button
                        onClick={() => {
                          const allKws = keywordEngineData.suggestions.map(s => s.keyword).join(', ');
                          copyToClipboard(allKws, 'all-engine-keywords');
                        }}
                        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 flex items-center gap-1.5 transition-colors"
                      >
                        {copied === 'all-engine-keywords' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-600" />
                            <span>Copied All ({keywordEngineData.suggestions.length})</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                            <span>Copy All Keywords</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={handleGenerateKeywords}
                      disabled={isGeneratingKeywords}
                      className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-amber-500/20"
                    >
                      {isGeneratingKeywords ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{keywordEngineData ? 'Regenerate' : 'Generate Suggestions'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {isGeneratingKeywords && !keywordEngineData && (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
                    <p className="text-sm font-semibold text-gray-700">Analyzing channel niche and extracting strategic keywords...</p>
                    <p className="text-xs text-gray-400 mt-1">Comparing search intent and competitor positioning</p>
                  </div>
                )}

                {keywordEngineData ? (
                  <div className="space-y-6">
                    {/* Strategy & Niche Overview Card */}
                    <div className="bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-yellow-50/60 rounded-xl p-4 sm:p-5 border border-amber-100/90">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider bg-amber-200/70 px-2 py-0.5 rounded">
                          Identified Niche
                        </span>
                        <span className="text-xs font-bold text-gray-900">
                          {keywordEngineData.detectedNiche}
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5 mt-2">
                        <Compass className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-950 leading-relaxed">
                          <span className="font-bold text-amber-900">Channel Strategy Takeaway: </span>
                          {keywordEngineData.channelStrategySummary}
                        </div>
                      </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search keyword or explanation..."
                          value={keywordSearchQuery}
                          onChange={(e) => setKeywordSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      {/* Filter Chips */}
                      {(() => {
                        const uniqueFocuses = ['All', ...Array.from(new Set(keywordEngineData.suggestions.map(s => s.targetFocus)))];
                        return (
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                            {uniqueFocuses.slice(0, 6).map((focus) => (
                              <button
                                key={focus}
                                onClick={() => setSelectedFocusFilter(focus)}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all",
                                  selectedFocusFilter === focus
                                    ? "bg-amber-500 text-white shadow-xs font-semibold"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                )}
                              >
                                {focus}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Suggestions List / Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {keywordEngineData.suggestions
                        .filter(s => {
                          const matchesSearch = s.keyword.toLowerCase().includes(keywordSearchQuery.toLowerCase()) ||
                                                s.explanation.toLowerCase().includes(keywordSearchQuery.toLowerCase());
                          const matchesFilter = selectedFocusFilter === 'All' || s.targetFocus === selectedFocusFilter;
                          return matchesSearch && matchesFilter;
                        })
                        .map((item, idx) => {
                          const cardId = `engine-kw-${idx}`;
                          return (
                            <div
                              key={idx}
                              className="group p-4 bg-gray-50/80 hover:bg-white rounded-xl border border-gray-100 hover:border-amber-200 hover:shadow-xs transition-all flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center text-[10px] font-bold">
                                      {idx + 1}
                                    </span>
                                    <span className="font-bold text-xs sm:text-sm text-gray-900 group-hover:text-amber-700 transition-colors">
                                      {item.keyword}
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => copyToClipboard(item.keyword, cardId)}
                                    title="Copy keyword"
                                    className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors shrink-0"
                                  >
                                    {copied === cardId ? (
                                      <Check className="w-3.5 h-3.5 text-green-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                                  <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-md text-[10px] font-semibold">
                                    {item.targetFocus}
                                  </span>
                                  <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-md text-[10px] font-semibold">
                                    {item.potential}
                                  </span>
                                </div>

                                <div className="p-2.5 bg-white group-hover:bg-amber-50/30 rounded-lg border border-gray-100 group-hover:border-amber-100/60 text-xs text-gray-600 leading-relaxed">
                                  <div className="flex items-start gap-1.5">
                                    <Compass className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                      <span className="font-semibold text-gray-700">Strategy Link: </span>
                                      {item.explanation}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  !isGeneratingKeywords && (
                    <div className="text-center py-10 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                      <Key className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <h4 className="text-sm font-bold text-gray-700 mb-1">Discover High-Opportunity Keywords</h4>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                        Generate 10–15 recommended keywords tailored for a new channel with specific explanations based on @{data.channel.title}'s content strategy.
                      </p>
                      <button
                        onClick={handleGenerateKeywords}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate 10-15 Recommended Keywords</span>
                      </button>
                    </div>
                  )
                )}
              </div>

              {/* Growth Roadmap */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-600" /> Channel Growth Roadmap
                  </h3>
                  {!growthRoadmap && (
                    <button
                      onClick={handleGenerateRoadmap}
                      disabled={isGeneratingRoadmap}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
                    >
                      {isGeneratingRoadmap ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" /> Generate Roadmap
                        </>
                      )}
                    </button>
                  )}
                </div>

                {growthRoadmap ? (
                  <div className="space-y-8">
                    {/* Milestones */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Milestone className="w-4 h-4 text-indigo-500" /> Key Milestones
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {growthRoadmap.milestones.map((m, i) => (
                          <div key={i} className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                              <Target className="w-4 h-4 text-indigo-600" />
                              <span className="text-sm font-bold text-indigo-900">{m.target}</span>
                            </div>
                            <p className="text-xs text-indigo-700 mb-2 leading-relaxed">{m.strategy}</p>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 uppercase">
                              <Calendar className="w-3 h-3" /> {m.timeframe}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Content Pillars */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" /> Content Pillars
                      </h4>
                      <div className="space-y-4">
                        {growthRoadmap.contentPillars.map((p, i) => (
                          <div key={i} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                            <h5 className="text-sm font-bold text-gray-900 mb-1">{p.pillar}</h5>
                            <p className="text-xs text-gray-600 mb-3 leading-relaxed">{p.description}</p>
                            <div className="flex flex-wrap gap-2">
                              {p.exampleTopics.map((topic, j) => (
                                <span key={j} className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-medium text-gray-500">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monetization */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-indigo-500" /> Monetization Strategies
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {growthRoadmap.monetizationStrategies.map((s, i) => (
                          <div key={i} className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                            <h5 className="text-sm font-bold text-emerald-900 mb-1 flex items-center gap-2">
                              <DollarSign className="w-4 h-4" /> {s.method}
                            </h5>
                            <p className="text-xs text-emerald-700 mb-2 leading-relaxed">{s.description}</p>
                            <div className="text-[10px] font-bold text-emerald-500 uppercase">
                              Requirement: {s.requirement}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                    <Target className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-sm text-gray-500 max-w-xs mx-auto">
                      Generate a personalized growth roadmap based on your channel's current performance and niche.
                    </p>
                  </div>
                )}
              </div>

              {/* Description Analysis */}
              {descAnalysis && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-red-600" /> Description Analysis
                  </h3>
                  
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Keywords Found</h4>
                      <div className="flex flex-wrap gap-2">
                        {descAnalysis.foundKeywords.length > 0 ? (
                          descAnalysis.foundKeywords.map((kw, i) => (
                            <span key={i} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-medium text-gray-600">
                              {kw}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-gray-400 italic">No specific SEO keywords identified.</p>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Suggestions for Improvement</h4>
                      <ul className="space-y-3">
                        {descAnalysis.suggestions.map((suggestion, i) => (
                          <li key={i} className="flex gap-3 text-sm text-gray-600 leading-relaxed">
                            <div className="flex-shrink-0 w-5 h-5 bg-red-50 rounded-full flex items-center justify-center text-[10px] font-bold text-red-600">
                              {i + 1}
                            </div>
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Trending Videos */}
              {data.trendingVideos && data.trendingVideos.length > 0 && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-red-600" /> Trending in {data.trendingVideos[0].categoryTitle}
                    </h3>
                    <span className="text-[10px] bg-red-50 text-red-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                      Region: US
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-5">
                    Current top performing videos in this niche to analyze and benchmark against.
                  </p>
                  <div className="space-y-4">
                    {data.trendingVideos.map((video) => (
                      <div key={video.id} className="p-3 bg-gray-50/50 border border-gray-100 rounded-xl hover:bg-gray-100 transition-all">
                        <a
                          href={`https://youtube.com/watch?v=${video.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex gap-4 group"
                        >
                          <div className="relative flex-shrink-0 w-28 h-16 bg-gray-100 rounded-lg overflow-hidden">
                            <img
                              src={video.thumbnails.medium?.url || video.thumbnails.default?.url}
                              alt={video.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors flex items-center justify-center">
                              <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          
                          <div className="flex-1 flex flex-col justify-between py-0.5">
                            <div>
                              <h4 className="text-xs font-bold line-clamp-2 leading-snug group-hover:text-red-600 transition-all text-gray-900">
                                {video.title}
                              </h4>
                              <p className="text-[10px] text-gray-500 mt-1 font-medium">
                                {video.channelTitle}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-semibold mt-1">
                              <span className="flex items-center gap-1">
                                <Play className="w-3 h-3 text-gray-400" /> {formatNumber(video.statistics.viewCount)} views
                              </span>
                              {video.statistics.likeCount !== "0" && (
                                <span className="flex items-center gap-1">
                                  <ThumbsUp className="w-3 h-3 text-gray-400" /> {formatNumber(video.statistics.likeCount)} likes
                                </span>
                              )}
                            </div>
                          </div>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular Videos */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Play className="w-5 h-5 text-red-600" /> Popular Content
                </h3>
                <div className="space-y-6">
                  {data.popularVideos.map((video) => (
                    <div key={video.id} className="space-y-2">
                      <a
                        href={`https://youtube.com/watch?v=${video.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-3 group"
                      >
                        <div className="relative flex-shrink-0">
                          <img
                            src={video.thumbnails.medium.url}
                            alt={video.title}
                            className="w-28 h-16 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors rounded-lg flex items-center justify-center">
                            <Play className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold line-clamp-2 group-hover:text-red-600 transition-colors">
                            {video.title}
                          </h4>
                          <p className="text-[10px] text-gray-400 mt-1 font-medium uppercase tracking-wider">
                            {formatNumber(video.statistics.viewCount)} views
                          </p>
                        </div>
                      </a>
                      {video.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-31">
                          {video.tags.slice(0, 5).map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-[10px] font-medium text-gray-500">
                              {tag}
                            </span>
                          ))}
                          {video.tags.length > 5 && (
                            <span className="text-[10px] text-gray-400 font-medium">+{video.tags.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Videos */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Video className="w-5 h-5 text-red-600" /> Recent Content
                </h3>
                <div className="space-y-6">
                  {data.recentVideos.slice(0, 5).map((video) => (
                    <div key={video.id} className="space-y-2">
                      <a
                        href={`https://youtube.com/watch?v=${video.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-3 group"
                      >
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold line-clamp-2 group-hover:text-red-600 transition-colors">
                            {video.title}
                          </h4>
                          <p className="text-[10px] text-gray-400 mt-1 font-medium uppercase tracking-wider">
                            {new Date(video.publishedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </a>
                      {video.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {video.tags.slice(0, 5).map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-50 border border-gray-100 rounded text-[10px] font-medium text-gray-500">
                              {tag}
                            </span>
                          ))}
                          {video.tags.length > 5 && (
                            <span className="text-[10px] text-gray-400 font-medium">+{video.tags.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'video' && videoData && (
            <motion.div
              key="video-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              {/* Video Profile */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="relative aspect-video rounded-xl overflow-hidden border border-gray-100">
                    <img
                      src={videoData.thumbnails.high.url}
                      alt={videoData.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                      <Play className="w-12 h-12 text-white drop-shadow-lg" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold leading-tight mb-1">{videoData.title}</h3>
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                      <Users className="w-3 h-3" /> {videoData.channelTitle}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 py-4 border-y border-gray-50">
                  <div className="text-center">
                    <p className="text-sm font-bold">{formatNumber(videoData.statistics.viewCount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold">{formatNumber(videoData.statistics.likeCount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Likes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold">{formatNumber(videoData.statistics.commentCount)}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Comments</p>
                  </div>
                </div>
              </div>

              {/* Video Tags */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Tag className="w-5 h-5 text-red-600" /> Video Tags
                  </h3>
                  <button
                    onClick={() => copyToClipboard(videoData.tags.join(', '), 'video-tags')}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {copied === 'video-tags' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {videoData.tags.length > 0 ? (
                    videoData.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-xs font-medium text-gray-600"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400 italic">No tags found for this video.</p>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" /> AI Suggested Tags
                    </h4>
                    {suggestedTags.length > 0 && (
                      <button
                        onClick={() => copyToClipboard(suggestedTags.join(', '), 'suggested-tags')}
                        className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        {copied === 'suggested-tags' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                      </button>
                    )}
                  </div>

                  {suggestedTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {suggestedTags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={handleSuggestTags}
                      disabled={isSuggestingTags}
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-indigo-200"
                    >
                      {isSuggestingTags ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Analyzing Content...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Suggest Better Tags
                        </>
                      )}
                    </button>
                  )}
                  <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
                    AI analyzes your video title and description to suggest context-aware tags that match search intent.
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <a
                  href={`https://youtube.com/watch?v=${videoData.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-red-600 flex items-center gap-2 hover:underline bg-red-50 px-6 py-3 rounded-xl border border-red-100"
                >
                  Watch on YouTube <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          )}

          {activeTab === 'description' && generatedDescription && (
            <motion.div
              key="description-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-600" /> Generated Description
                  </h3>
                  <button
                    onClick={() => copyToClipboard(generatedDescription, 'gen-desc')}
                    className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {copied === 'gen-desc' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {generatedDescription}
                  </p>
                </div>

                <p className="mt-4 text-[10px] text-gray-400 italic">
                  Tip: You can customize this description further in your YouTube Studio settings.
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'about' && (
            <motion.div
              key="about-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6 pb-12"
            >
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                    <Youtube className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold">TubeInsight</h2>
                </div>
                
                <p className="text-sm text-gray-600 leading-relaxed mb-6">
                  TubeInsight is a powerful mobile application designed to help creators and marketers analyze YouTube channels and discover the secrets behind their success.
                </p>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3">Main Features</h3>
                    <ul className="space-y-3">
                      {[
                        { icon: <Search className="w-4 h-4" />, text: "Instant Channel Analysis" },
                        { icon: <Tag className="w-4 h-4" />, text: "Tag & Keyword Extraction" },
                        { icon: <BarChart3 className="w-4 h-4" />, text: "Real-time Channel Statistics" },
                        { icon: <TrendingUp className="w-4 h-4" />, text: "AI-Powered SEO Insights" },
                        { icon: <FileText className="w-4 h-4" />, text: "Smart Description Generator" },
                        { icon: <Video className="w-4 h-4" />, text: "Upload Frequency Tracking" }
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                          <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                            {item.icon}
                          </div>
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3">Goal of the App</h3>
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                      <p className="text-sm text-red-900 leading-relaxed">
                        Help beginners who want to start a YouTube channel but do not know what keywords or settings to use. By pasting any YouTube channel link, they can learn how that channel is optimized and get keyword ideas for their own channel.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold">
                      Powered by Gemini 3 Flash Preview
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'banner' && generatedBanner && (
            <motion.div
              key="banner-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-red-600" /> AI Generated Banner
                  </h3>
                  <div className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-red-100">
                    {bannerNiche}
                  </div>
                </div>
                
                <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-gray-100 shadow-inner bg-gray-50">
                  <img
                    src={generatedBanner}
                    alt="Generated YouTube Banner"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end p-4">
                    <p className="text-white text-xs font-medium opacity-80">AI-generated concept for your channel</p>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <a
                    href={generatedBanner}
                    download="youtube-banner.png"
                    className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-black transition-colors"
                  >
                    <ImageIcon className="w-4 h-4" /> Download Banner
                  </a>
                </div>

                <p className="mt-4 text-[10px] text-gray-400 italic">
                  Note: This is an AI-generated concept based on your channel name and identified niche ({bannerNiche}).
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!data && !loading && (
          <div className="mt-12 text-center px-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Youtube className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold mb-2">Ready to analyze?</h3>
            <p className="text-sm text-gray-500">
              Paste a channel link above to uncover its keywords, tags, and growth strategy.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
