import { GoogleGenAI, Type } from "@google/genai";

export async function generateRecommendations(channelData: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    Analyze the following YouTube channel data and provide:
    1. A list of 10-15 recommended keywords for someone wanting to start a similar channel.
    2. A list of 5-8 trending keywords/topics in this specific niche.
    3. A detailed SEO strategy with actionable steps for:
       - Video Titles (how to optimize them for CTR and search)
       - Video Descriptions (best practices for SEO and engagement)
       - Video Tags (how to select and structure tags for maximum reach)
       - Thumbnail Best Practices (visual elements that work for this niche)

    Channel Title: ${channelData.channel.title}
    Description: ${channelData.channel.description}
    Existing Keywords: ${channelData.channel.keywords}
    Recent Video Tags: ${channelData.recentVideos.flatMap((v: any) => v.tags).join(", ")}

    Return the response in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            trendingKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            seoStrategy: {
              type: Type.OBJECT,
              properties: {
                titles: { type: Type.STRING },
                descriptions: { type: Type.STRING },
                tags: { type: Type.STRING },
                thumbnails: { type: Type.STRING }
              },
              required: ["titles", "descriptions", "tags", "thumbnails"]
            }
          },
          required: ["recommendedKeywords", "trendingKeywords", "seoStrategy"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}

export async function generateChannelDescription(channelName: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    Generate a professional, engaging, and SEO-friendly YouTube channel description for a new YouTuber.
    Channel Name: ${channelName}
    
    Requirements:
    1. Include relevant emojis to make it visually appealing.
    2. Start with a strong hook.
    3. Explain what the channel is about (make it generic but high-quality since we only have the name).
    4. Include a call to action (Subscribe).
    5. Add a "Contact/Socials" placeholder section.
    6. Keep it under 1000 characters.
    
    Return the description as a plain string.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate description. Please try again.";
  }
}

export async function analyzeDescription(description: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    Analyze the following YouTube channel description:
    "${description}"
    
    1. Identify the key SEO keywords already present in the description.
    2. Provide 3-5 specific suggestions for improvement to make it more engaging and SEO-friendly.
    3. If the description is too short or missing, suggest a template.
    
    Return the response in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foundKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["foundKeywords", "suggestions"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}

export async function generateBannerPrompt(channelName: string, selectedNiche?: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    Analyze the YouTube channel name "${channelName}"${selectedNiche ? ` and the selected niche "${selectedNiche}"` : ""}.
    1. ${selectedNiche ? `Use the selected niche "${selectedNiche}" as the primary category.` : "Identify the most likely category or niche for this channel."}
    2. Create a detailed, high-quality image generation prompt for a YouTube channel banner that reflects this niche.
    3. The banner should be professional, modern, and visually striking.
    4. Include the channel name "${channelName}" as a prominent, stylized text element in the center of the banner.
    5. Suggest a relevant tagline based on the niche (e.g., "Master Your Craft" or "New Videos Every Week") and describe its placement as a smaller text element below the channel name.
    6. Focus on the visual style, colors, and background elements that complement and frame the text elements perfectly.
    
    Return the response in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            imagePrompt: { type: Type.STRING }
          },
          required: ["category", "imagePrompt"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}

export async function generateSuggestedTags(videoData: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    Analyze the following YouTube video details and suggest 20 highly relevant, context-aware SEO tags.
    
    Your goal is to provide tags that go beyond simple keywords. Think about:
    1. Search Intent: What is the user actually looking for when they find this?
    2. Spoken Content: Infer the core topics and "spoken" message from the title and detailed description.
    3. Niche Relevance: Ensure tags are specific to the video's category.
    4. Variation: Include long-tail keywords and common variations.
    
    Video Title: ${videoData.title}
    Video Description: ${videoData.description}
    Existing Tags: ${videoData.tags.join(', ')}
    
    Return the tags as a JSON array of strings.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [];
  }
}

export interface GrowthRoadmap {
  milestones: {
    target: string;
    strategy: string;
    timeframe: string;
  }[];
  contentPillars: {
    pillar: string;
    description: string;
    exampleTopics: string[];
  }[];
  monetizationStrategies: {
    method: string;
    description: string;
    requirement: string;
  }[];
}

export interface KeywordSuggestionItem {
  keyword: string;
  targetFocus: string;
  potential: string;
  explanation: string;
}

export interface KeywordEngineResult {
  detectedNiche: string;
  channelStrategySummary: string;
  suggestions: KeywordSuggestionItem[];
}

export async function generateKeywordSuggestions(channelData: any): Promise<KeywordEngineResult | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const prompt = `
    You are an expert YouTube SEO strategist and Growth Consultant.
    Analyze the following YouTube channel's niche, keywords, video titles, and tags:
    
    Channel Title: ${channelData.channel.title}
    Channel Custom URL / Handle: ${channelData.channel.customUrl || ""}
    Description: ${channelData.channel.description || "N/A"}
    Existing Channel Keywords: ${channelData.channel.keywords || "N/A"}
    Topic Categories: ${(channelData.channel.topicCategories || []).join(", ")}
    Recent Video Titles & Tags: ${channelData.recentVideos.map((v: any) => `"${v.title}" [Tags: ${(v.tags || []).slice(0, 5).join(", ")}]`).slice(0, 10).join("; ")}
    Popular Videos: ${channelData.popularVideos.map((v: any) => `"${v.title}" (${v.statistics?.viewCount || 0} views)`).slice(0, 5).join("; ")}

    Task:
    Act as a YouTube Keyword Suggestion Engine.
    1. Identify the channel's core niche and summarize the channel's underlying content & keyword strategy.
    2. Generate a list of 10 to 15 recommended keywords/keyphrases that a NEW or UPCOMING channel in this niche could target to gain traction, rank in search, and build an audience.
    3. For EACH suggestion:
       - keyword: The exact keyword or search phrase.
       - targetFocus: A brief category (e.g., "Beginner Guide", "High-Intent Problem Solver", "Long-Tail Niche Gap", "Trending Sub-Topic", "Comparative Review").
       - potential: A creator growth rating (e.g., "High Opportunity for New Creators", "Low Competition / Fast Rank", "High Evergreen Demand", "High Click-Through Potential").
       - explanation: A concise, insightful explanation of why this keyword is recommended, explicitly relating it back to the original channel's strategy and demonstrating how a new channel can apply it effectively.

    Return the response as a JSON object matching the requested schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedNiche: { type: Type.STRING },
            channelStrategySummary: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  keyword: { type: Type.STRING },
                  targetFocus: { type: Type.STRING },
                  potential: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["keyword", "targetFocus", "potential", "explanation"]
              }
            }
          },
          required: ["detectedNiche", "channelStrategySummary", "suggestions"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error in generateKeywordSuggestions:", error);
    return null;
  }
}

export async function generateGrowthRoadmap(channelData: any): Promise<GrowthRoadmap | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    Based on the following YouTube channel data, generate a comprehensive growth roadmap.
    
    Channel Title: ${channelData.channel.title}
    Description: ${channelData.channel.description}
    Subscribers: ${channelData.channel.statistics.subscriberCount}
    Total Views: ${channelData.channel.statistics.viewCount}
    Video Count: ${channelData.channel.statistics.videoCount}
    Keywords: ${channelData.channel.keywords}
    Topics: ${channelData.channel.topicCategories.join(', ')}
    
    The roadmap should include:
    1. Key Milestones: 3-4 specific subscriber or view targets with strategies to reach them.
    2. Content Pillars: 3 core themes the channel should focus on to build authority.
    3. Monetization Strategies: 3-4 ways to monetize the channel based on its niche and current size.
    
    Return the response as a JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            milestones: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  target: { type: Type.STRING },
                  strategy: { type: Type.STRING },
                  timeframe: { type: Type.STRING }
                },
                required: ["target", "strategy", "timeframe"]
              }
            },
            contentPillars: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pillar: { type: Type.STRING },
                  description: { type: Type.STRING },
                  exampleTopics: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["pillar", "description", "exampleTopics"]
              }
            },
            monetizationStrategies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  method: { type: Type.STRING },
                  description: { type: Type.STRING },
                  requirement: { type: Type.STRING }
                },
                required: ["method", "description", "requirement"]
              }
            }
          },
          required: ["milestones", "contentPillars", "monetizationStrategies"]
        }
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}
