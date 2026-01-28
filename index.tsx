import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface GeneratedImage {
  id: number;
  url: string;
  prompt: string;
  set: 1 | 2;
}

const ImageCard = ({ image }: { image: GeneratedImage }) => (
  <div className="glass-panel p-3 rounded-xl overflow-hidden group hover:border-blue-400/50 transition-colors">
    <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-800 mb-3">
      <img src={image.url} alt="Generated" className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
    </div>
    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity">
      {image.prompt}
    </p>
  </div>
);

const SkeletonCard = () => (
  <div className="glass-panel p-3 rounded-xl">
    <div className="aspect-square rounded-lg bg-slate-700/50 animate-pulse mb-3"></div>
    <div className="h-2 bg-slate-700/50 rounded w-3/4 mb-2"></div>
    <div className="h-2 bg-slate-700/50 rounded w-1/2"></div>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <>
    <div className="border border-dashed border-slate-700 rounded-xl h-full min-h-[300px] flex items-center justify-center text-slate-600 bg-slate-800/20">
      {text}
    </div>
    <div className="border border-dashed border-slate-700 rounded-xl h-full min-h-[300px] flex items-center justify-center text-slate-600 bg-slate-800/20">
      {text}
    </div>
  </>
);

const App = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setGeneratedImages([]);
    setAnalysis('');
    setError(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setOriginalImage(base64String);
      await processImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64Image: string) => {
    try {
      setIsAnalyzing(true);
      
      // Extract pure base64 data (remove data:image/png;base64, prefix)
      const base64Data = base64Image.split(',')[1];
      const mimeType = base64Image.substring(base64Image.indexOf(':') + 1, base64Image.indexOf(';'));

      // Step 1: Analyze and Plan
      // We use gemini-3-flash-preview for reasoning and prompt generation
      const planResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            {
              text: `Analyze the composition, lighting, and camera angle of this image.
              
              Then, create 4 distinct image generation prompts based on your analysis to create new variations.
              
              Rules for prompts:
              1. Maintain the original composition and camera angle description in all prompts.
              2. Set 1 (Prompts 1 & 2): Change the SUBJECT (different character/person/style) and BACKGROUND (new location).
              3. Set 2 (Prompts 3 & 4): Create a completely DIFFERENT SUBJECT from Set 1, and a completely DIFFERENT BACKGROUND from Set 1 and original.
              4. Ensure high quality, photorealistic or highly detailed artistic style.
              
              Output pure JSON with this schema:
              {
                "analysis": "Concise analysis of composition, lighting, angle",
                "prompts": [
                  { "set": 1, "text": "Full prompt for image 1" },
                  { "set": 1, "text": "Full prompt for image 2" },
                  { "set": 2, "text": "Full prompt for image 3" },
                  { "set": 2, "text": "Full prompt for image 4" }
                ]
              }`
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              prompts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    set: { type: Type.INTEGER },
                    text: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const planText = planResponse.text;
      if (!planText) throw new Error("Failed to generate plan");
      
      const plan = JSON.parse(planText);
      setAnalysis(plan.analysis);
      setIsAnalyzing(false);
      setIsGenerating(true);

      // Step 2: Generate Images
      // We execute these in parallel for speed, using gemini-2.5-flash-image
      // We pass the original image to guide composition if possible, but strict subject changes
      // sometimes work better with just text if the model is too adherent to the original pixels.
      // However, "Remix" implies keeping structure. We will pass the image + prompt.

      const generationPromises = plan.prompts.map(async (item: any, index: number) => {
        try {
          // Using gemini-2.5-flash-image for generation/editing
          const genResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                },
                {
                  text: item.text
                }
              ]
            },
            config: {
              // No responseMimeType for image models usually
            }
          });

          // Extract image
          let imageUrl = '';
          for (const part of genResponse.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              break;
            }
          }

          if (imageUrl) {
            return {
              id: index,
              url: imageUrl,
              prompt: item.text,
              set: item.set
            } as GeneratedImage;
          }
          return null;
        } catch (err) {
          console.error("Generation failed for prompt", item.text, err);
          return null;
        }
      });

      const results = await Promise.all(generationPromises);
      const validResults = results.filter((r): r is GeneratedImage => r !== null);
      
      setGeneratedImages(validResults);
      setIsGenerating(false);

    } catch (e: any) {
      console.error(e);
      setError(e.message || "An unexpected error occurred");
      setIsAnalyzing(false);
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 mb-4">
          Remix Reality
        </h1>
        <p className="text-slate-400 text-lg">Upload an image. We'll analyze its composition and reimagine it in 4 ways.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & Analysis */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6 rounded-2xl shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-blue-300">1. Original Image</h2>
            
            {!originalImage ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-600 rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-slate-800/50 transition-all group"
              >
                <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-slate-400 font-medium">Click to Upload</span>
                <span className="text-xs text-slate-500 mt-2">JPG or PNG</span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                />
              </div>
            ) : (
              <div className="relative group">
                <img 
                  src={originalImage} 
                  alt="Original" 
                  className="w-full h-auto rounded-lg shadow-md" 
                />
                <button 
                  onClick={() => {
                    setOriginalImage(null);
                    setAnalysis('');
                    setGeneratedImages([]);
                  }}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {(isAnalyzing || analysis) && (
            <div className="glass-panel p-6 rounded-2xl shadow-xl animate-fade-in">
              <div className="flex items-center gap-3 mb-3">
                {isAnalyzing ? <div className="loader"></div> : <div className="w-2 h-2 rounded-full bg-green-400"></div>}
                <h2 className="text-xl font-semibold text-purple-300">2. Analysis</h2>
              </div>
              <div className="text-slate-300 leading-relaxed text-sm">
                 {isAnalyzing ? "Scanning composition, lighting, and angles..." : analysis}
              </div>
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-500/50 text-red-200 rounded-xl text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8 space-y-8">
          {/* Set 1 */}
          <section>
             <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-white">Set 1</h2>
                <span className="px-3 py-1 rounded-full bg-blue-900/50 border border-blue-500/30 text-blue-200 text-xs uppercase tracking-wider">
                  New Subject & Background
                </span>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isGenerating && generatedImages.length === 0 ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : (
                  generatedImages.filter(img => img.set === 1).map((img) => (
                    <ImageCard key={img.id} image={img} />
                  ))
                )}
                {!isGenerating && !originalImage && (
                  <EmptyState text="Upload an image to generate Set 1" />
                )}
             </div>
          </section>

          {/* Set 2 */}
          <section>
             <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-white">Set 2</h2>
                <span className="px-3 py-1 rounded-full bg-purple-900/50 border border-purple-500/30 text-purple-200 text-xs uppercase tracking-wider">
                  Distinct Theme
                </span>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isGenerating && generatedImages.length === 0 ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : (
                  generatedImages.filter(img => img.set === 2).map((img) => (
                    <ImageCard key={img.id} image={img} />
                  ))
                )}
                {!isGenerating && !originalImage && (
                  <EmptyState text="Upload an image to generate Set 2" />
                )}
             </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);