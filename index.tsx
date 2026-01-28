import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface PlannedPrompt {
  set: 1 | 2;
  text: string;
  caption: string;
}

interface GeneratedImage {
  id: number;
  url: string;
  prompt: string;
  caption: string;
  set: 1 | 2;
}

const ImageCard: React.FC<{ image: GeneratedImage; onClick: (img: GeneratedImage) => void }> = ({ image, onClick }) => (
  <div 
    className="group cursor-pointer"
    onClick={() => onClick(image)}
  >
    <div className="relative aspect-[3/4] overflow-hidden bg-neutral-900 border border-neutral-800 transition-all duration-300 group-hover:border-neutral-600">
      <img 
        src={image.url} 
        alt={image.caption} 
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur px-2 py-1 text-[10px] text-white uppercase tracking-wider">
        Enlarge
      </div>
    </div>
    <div className="mt-3 text-center">
      <p className="text-xs font-medium text-neutral-400 tracking-wide uppercase">{image.caption}</p>
    </div>
  </div>
);

const SkeletonCard = () => (
  <div className="aspect-[3/4] bg-neutral-900 border border-neutral-800 animate-pulse relative">
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-neutral-700 border-t-neutral-500 rounded-full animate-spin"></div>
    </div>
  </div>
);

const Lightbox: React.FC<{ image: GeneratedImage | null; onClose: () => void }> = ({ image, onClose }) => {
  if (!image) return null;
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-7xl max-h-screen w-full h-full flex flex-col items-center justify-center">
        <img 
          src={image.url} 
          alt={image.caption} 
          className="max-w-full max-h-[85vh] object-contain shadow-2xl border border-white/10" 
          onClick={(e) => e.stopPropagation()} 
        />
        <p className="mt-4 text-neutral-400 text-sm tracking-widest uppercase">{image.caption}</p>
        <button 
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
          onClick={onClose}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  
  // Analysis State
  const [faceShape, setFaceShape] = useState<string>('');
  const [hairstyle, setHairstyle] = useState<string>('');
  const [outfit, setOutfit] = useState<string>('');
  const [plannedPrompts, setPlannedPrompts] = useState<PlannedPrompt[]>([]);
  
  // Flow State
  const [status, setStatus] = useState<'upload' | 'analyzing' | 'review' | 'generating' | 'done'>('upload');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<boolean>(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset
    setGeneratedImages([]);
    setFaceShape('');
    setHairstyle('');
    setOutfit('');
    setError(null);
    setStatus('analyzing');
    abortControllerRef.current = false;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setOriginalImage(base64String);
      await analyzeImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    abortControllerRef.current = true; // Signal to ignore results
    setOriginalImage(null);
    setFaceShape('');
    setHairstyle('');
    setOutfit('');
    setPlannedPrompts([]);
    setGeneratedImages([]);
    setStatus('upload');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyzeImage = async (base64Image: string) => {
    try {
      const base64Data = base64Image.split(',')[1];
      const mimeType = base64Image.substring(base64Image.indexOf(':') + 1, base64Image.indexOf(';'));

      // Using gemini-2.5-flash for faster analysis response
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            {
              text: `Role: Advanced Realistic Portrait Photography Application.
              
              Task: Analyze the character features of the user-uploaded photo, extracting precise [face shape contour, facial feature proportions, and hairstyle characteristics].
              
              Output a JSON plan for a photoshoot with these strict requirements:
              
              1. Analysis Fields:
                 - "face_shape": Precise description of face shape contour.
                 - "hairstyle": Precise description of hairstyle characteristics (volume, length, color).
                 - "outfit": A highly realistic fashion outfit description based on the uploaded image style.
              
              2. Prompts Generation (4 images):
                 - "prompts": Array of 4 prompts.
              
              Constraints (Core Rules) for Prompts:
              - Face Shape & Hairstyle Lock: Strictly prohibited to change original face/hair.
              - Expression Management: Strictly prohibited to laugh or show teeth. Maintain a [cool, natural, relaxed, or subtle expression].
              - Extreme Realism: Strictly prohibited from cyberpunk style, AI-generated feel, or excessive skin smoothing. Keywords: Realistic texture, skin pores, natural lighting, 8k resolution, shot on Sony A7R IV.
              - Consistent Clothing: All four photos must feature the subject wearing the [exact same] realistic fashion outfit described in "outfit".
              
              Sets:
              - Prompt 1: Set 1 (Location A - Outdoor), Medium shot, front view.
              - Prompt 2: Set 1 (Location A - Outdoor), Close-up, side view.
              - Prompt 3: Set 2 (Location B - Indoor), Full-body shot (overhead/low-angle).
              - Prompt 4: Set 2 (Location B - Indoor), Shot from a looking-back angle.
              
              Schema:
              {
                "face_shape": "string",
                "hairstyle": "string",
                "outfit": "string",
                "prompts": [
                  { "set": 1, "text": "full detailed prompt including expression/camera constraints", "caption": "Set 1: Medium Shot - Front View" },
                  { "set": 1, "text": "full detailed prompt including expression/camera constraints", "caption": "Set 1: Close-up - Side View" },
                  { "set": 2, "text": "full detailed prompt including expression/camera constraints", "caption": "Set 2: Full-body - Low/High Angle" },
                  { "set": 2, "text": "full detailed prompt including expression/camera constraints", "caption": "Set 2: Looking-back Angle" }
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
              face_shape: { type: Type.STRING },
              hairstyle: { type: Type.STRING },
              outfit: { type: Type.STRING },
              prompts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    set: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                    caption: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      if (abortControllerRef.current) return;

      const result = JSON.parse(response.text || '{}');
      if (!result.face_shape) throw new Error("Failed to analyze image");

      setFaceShape(result.face_shape);
      setHairstyle(result.hairstyle);
      setOutfit(result.outfit);
      setPlannedPrompts(result.prompts);
      setStatus('review');

    } catch (e: any) {
      if (abortControllerRef.current) return;
      console.error(e);
      setError("Failed to analyze character. Please try a different photo.");
      setStatus('upload');
    }
  };

  const handleRun = async () => {
    if (!originalImage || plannedPrompts.length === 0) return;
    setStatus('generating');

    const base64Data = originalImage.split(',')[1];
    const mimeType = originalImage.substring(originalImage.indexOf(':') + 1, originalImage.indexOf(';'));

    try {
      const promises = plannedPrompts.map(async (plan, index) => {
        const genResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: `${plan.text} . Ensure exact facial likeness. Expression must be cool/subtle (NO TEETH/LAUGHING). Shot on Sony A7R IV, 85mm lens, photorealistic, 8k, highly detailed skin texture.` }
            ]
          }
        });

        let imageUrl = '';
        const parts = genResponse.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }

        if (imageUrl) {
          return {
            id: index,
            url: imageUrl,
            prompt: plan.text,
            caption: plan.caption,
            set: plan.set
          } as GeneratedImage;
        }
        return null;
      });

      const results = await Promise.all(promises);
      const validResults = results.filter((r): r is GeneratedImage => r !== null);
      setGeneratedImages(validResults);
      setStatus('done');
    } catch (e: any) {
      setError("Generation failed. Please try again.");
      setStatus('review');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-light selection:bg-neutral-700 selection:text-white">
      <Lightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
      
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-16 text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight text-white">
            Advanced Portrait Photography
          </h1>
          <p className="text-neutral-500 tracking-wide uppercase text-sm">Character Profile Edition</p>
        </header>

        {/* Workflow Container */}
        <main className="space-y-12">
          
          {/* Phase 1: Upload (Only show if not analyzing/reviewing/done) */}
          {status === 'upload' && (
            <div className="max-w-xl mx-auto">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative h-96 border border-dashed border-neutral-800 rounded-sm hover:border-neutral-600 transition-all cursor-pointer flex flex-col items-center justify-center bg-neutral-900/20 hover:bg-neutral-900/40"
              >
                <div className="w-16 h-16 mb-6 text-neutral-700 group-hover:text-neutral-500 transition-colors">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <span className="text-neutral-400 font-light tracking-wider">UPLOAD PORTRAIT</span>
                <span className="mt-2 text-xs text-neutral-600 uppercase">High Resolution JPG/PNG</span>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
              </div>
            </div>
          )}

          {/* Phase 2: Analysis & Review */}
          {(status === 'analyzing' || status === 'review' || status === 'generating' || status === 'done') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 animate-fade-in">
              
              {/* Left: Source Image & Controls */}
              <div className="lg:col-span-4 space-y-8">
                <div className="relative">
                  {originalImage && (
                    <img src={originalImage} alt="Source" className="w-full grayscale hover:grayscale-0 transition-all duration-700 border border-neutral-800" />
                  )}
                  {status === 'analyzing' && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center">
                      <div className="loader mb-4"></div>
                      <span className="text-xs tracking-widest uppercase">Analyzing Features</span>
                    </div>
                  )}
                </div>

                {/* Show controls container if not uploading */}
                <div className="space-y-6">
                    <div className="border-l-2 border-emerald-500 pl-4 py-1">
                      <h3 className="text-emerald-400 font-medium text-lg mb-4">
                        {status === 'analyzing' ? '📸 Analyzing Visual Features...' : '📸 Visual Feature Analysis Locked'}
                      </h3>
                      <div className="space-y-3 text-sm text-neutral-400 leading-relaxed">
                        <div>
                          <span className="text-neutral-500 uppercase text-xs block mb-0.5">Face Shape Characteristics:</span>
                          {status === 'analyzing' ? <div className="h-4 w-3/4 bg-neutral-800 animate-pulse rounded"></div> : faceShape}
                        </div>
                        <div>
                          <span className="text-neutral-500 uppercase text-xs block mb-0.5">Hairstyle Characteristics:</span>
                          {status === 'analyzing' ? <div className="h-4 w-1/2 bg-neutral-800 animate-pulse rounded"></div> : hairstyle}
                        </div>
                        <div>
                            <span className="text-neutral-500 uppercase text-xs block mb-0.5">Expression Setting:</span>
                            {status === 'analyzing' ? <div className="h-4 w-1/3 bg-neutral-800 animate-pulse rounded"></div> : "Naturally cool (no laughing allowed)"}
                        </div>
                        <div>
                            <span className="text-neutral-500 uppercase text-xs block mb-0.5">Outfit Preset for the Day:</span>
                            {status === 'analyzing' ? <div className="h-4 w-full bg-neutral-800 animate-pulse rounded"></div> : outfit}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-neutral-800">
                      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Please Operate:</p>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={handleReset}
                          // Enable delete during analyzing to cancel/reset
                          disabled={status === 'generating'}
                          className="px-6 py-3 border border-red-900/50 text-red-500/80 hover:bg-red-900/10 hover:text-red-400 transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
                        >
                          🔴 Delete
                        </button>
                        
                        {status === 'analyzing' && (
                           <div className="flex items-center justify-center gap-2 text-neutral-600 text-xs uppercase tracking-widest border border-neutral-800/50 bg-neutral-900/20">
                             Wait...
                           </div>
                        )}
                        
                        {status === 'review' && (
                          <button 
                            onClick={handleRun}
                            className="px-6 py-3 bg-emerald-900/20 border border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/30 transition-colors uppercase text-xs tracking-widest"
                          >
                            🟢 Run
                          </button>
                        )}
                        
                        {status === 'generating' && (
                            <div className="flex items-center justify-center gap-2 text-emerald-500 text-xs uppercase tracking-widest border border-transparent">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                              Processing...
                            </div>
                        )}
                        
                        {status === 'done' && (
                            <div className="flex items-center justify-center gap-2 text-neutral-500 text-xs uppercase tracking-widest border border-transparent">
                              Completed
                            </div>
                        )}
                      </div>
                    </div>
                </div>
                
                {error && <div className="text-red-400 text-xs border border-red-900/30 p-4 bg-red-900/10">{error}</div>}
              </div>

              {/* Right: Results */}
              <div className="lg:col-span-8 space-y-16">
                 {/* Set 1 */}
                 <section className={status === 'generating' || status === 'done' ? 'opacity-100 transition-opacity duration-1000' : 'opacity-30 blur-sm pointer-events-none'}>
                    <div className="flex items-baseline justify-between border-b border-neutral-800 pb-4 mb-8">
                       <h2 className="text-xl font-light text-white">SET 1</h2>
                       <span className="text-xs text-neutral-500 uppercase tracking-widest">Location A: Outdoor (Front/Side)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                        {status === 'generating' ? (
                          <>
                            <SkeletonCard />
                            <SkeletonCard />
                          </>
                        ) : generatedImages.filter(img => img.set === 1).length > 0 ? (
                          generatedImages.filter(img => img.set === 1).map(img => (
                            <ImageCard key={img.id} image={img} onClick={setLightboxImage} />
                          ))
                        ) : (
                          <div className="col-span-2 h-64 border border-dashed border-neutral-800 flex items-center justify-center text-neutral-700 text-xs uppercase tracking-widest">
                            Waiting for run command
                          </div>
                        )}
                    </div>
                 </section>

                 {/* Set 2 */}
                 <section className={status === 'generating' || status === 'done' ? 'opacity-100 transition-opacity duration-1000' : 'opacity-30 blur-sm pointer-events-none'}>
                    <div className="flex items-baseline justify-between border-b border-neutral-800 pb-4 mb-8">
                       <h2 className="text-xl font-light text-white">SET 2</h2>
                       <span className="text-xs text-neutral-500 uppercase tracking-widest">Location B: Indoor (Full/Back)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                         {status === 'generating' ? (
                          <>
                            <SkeletonCard />
                            <SkeletonCard />
                          </>
                        ) : generatedImages.filter(img => img.set === 2).length > 0 ? (
                          generatedImages.filter(img => img.set === 2).map(img => (
                            <ImageCard key={img.id} image={img} onClick={setLightboxImage} />
                          ))
                        ) : (
                          <div className="col-span-2 h-64 border border-dashed border-neutral-800 flex items-center justify-center text-neutral-700 text-xs uppercase tracking-widest">
                            Waiting for run command
                          </div>
                        )}
                    </div>
                 </section>

                 {status === 'done' && (
                    <div className="pt-8 border-t border-neutral-800 bg-[#0a0a0a]">
                      <h4 className="text-white text-sm font-medium mb-3">💡 Instructions:</h4>
                      <ol className="text-neutral-500 text-sm space-y-2 list-decimal list-inside">
                        <li><strong className="text-neutral-300">Zoom in to view:</strong> Click on the thumbnail image below to open a pop-up window to view the larger image and details.</li>
                        <li><strong className="text-neutral-300">Download the image:</strong> On the larger image, right-click and select 'Save image as'; on mobile devices, long-press the image to save it.</li>
                      </ol>
                    </div>
                 )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);