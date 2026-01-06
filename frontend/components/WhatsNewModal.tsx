"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { X, Sparkles, Loader2 } from "lucide-react";

interface WhatsNewModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
    const [content, setContent] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            fetch("/WHATS_NEW.md")
                .then((res) => res.text())
                .then((text) => {
                    setContent(text);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error("Failed to fetch WHATS_NEW.md", err);
                    setContent("# Error\nFailed to load content.");
                    setLoading(false);
                });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-gray-800 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                    <h2 className="text-2xl font-black flex items-center gap-3 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                        <Sparkles className="text-emerald-400" size={28} />
                        What's New
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-full transition-all text-gray-500 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                            <Loader2 className="animate-spin text-blue-500" size={40} />
                            <p className="text-sm font-medium tracking-wide">업데이트 소식을 불러오고 있습니다...</p>
                        </div>
                    ) : (
                        <div className="max-w-none">
                            <ReactMarkdown
                                components={{
                                    h1: ({ ...props }) => <h1 className="text-4xl font-black mb-8 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent" {...props} />,
                                    h2: ({ ...props }) => <h2 className="text-2xl font-bold mt-10 mb-4 border-l-4 border-emerald-500 pl-4 text-white" {...props} />,
                                    h3: ({ ...props }) => <h3 className="text-xl font-bold mt-8 mb-3 text-white" {...props} />,
                                    p: ({ ...props }) => <p className="text-gray-400 leading-relaxed text-lg mb-4" {...props} />,
                                    ul: ({ ...props }) => <ul className="list-disc list-inside space-y-2 mb-6" {...props} />,
                                    li: ({ ...props }) => <li className="text-gray-400 text-lg" {...props} />,
                                    strong: ({ ...props }) => <strong className="text-emerald-400 font-bold" {...props} />,
                                    hr: () => <hr className="border-gray-800 my-8" />,
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-950/50 text-center text-sm text-gray-500 font-medium border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="w-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                    >
                        확인했습니다
                    </button>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #374151;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #4b5563;
                }
            `}</style>
        </div>
    );
}
